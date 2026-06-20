import { GoogleGenAI, Modality, Type, type LiveServerMessage, type Session } from '@google/genai'
import { b64Decode, b64Encode, floatTo16BitPcmBytes, MicCapture, PcmPlayer } from './audio'
import type { VoiceCallbacks, VoiceSession, VoiceSessionOptions } from './types'

// Voice session through Gemini Live API.
// Captures mic at 16kHz, plays responses at 24kHz, and records transcripts
// from both sides (inputAudioTranscription + outputAudioTranscription).
export async function startGeminiLive(
  opts: VoiceSessionOptions,
  cb: VoiceCallbacks,
): Promise<VoiceSession> {
  // v1beta covers current Live models (native audio 12-2025, 3.1 flash live),
  // including both-side transcription and function calling. v1alpha is only
  // needed for affective dialog / proactive audio, which this app does not use.
  const ai = new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { apiVersion: 'v1beta' } })
  const mic = new MicCapture()
  const player = new PcmPlayer(24000)
  let closed = false
  let endRequested = false
  let kickoffSent = false
  let reconnecting = false
  let suppressNextClose = false
  let session: Session | null = null
  let sessionPromise: Promise<Session> | null = null
  let resumeHandle: string | undefined

  // Transcript fragments accumulated until the end of each turn.
  let pendingInterviewer = ''
  let pendingCandidate = ''

  const flushTranscripts = () => {
    if (pendingInterviewer.trim()) cb.onTranscript('interviewer', pendingInterviewer.trim())
    if (pendingCandidate.trim()) cb.onTranscript('candidate', pendingCandidate.trim())
    pendingInterviewer = ''
    pendingCandidate = ''
  }

  const startMic = () => {
    void mic.start(16000, (chunk, durationSec) => {
      cb.onAudioSeconds(durationSec, 0)
      let sum = 0
      for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
      cb.onAudioLevel(Math.sqrt(sum / chunk.length))
      if (!session || reconnecting) return
      const data = b64Encode(floatTo16BitPcmBytes(chunk))
      try {
        session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } })
      } catch {
        // Dropped frame during a connection swap or transient error.
      }
    }).catch((e: unknown) => cb.onError(e instanceof Error ? e.message : 'Could not access the microphone'))
  }

  const reconnectAfterGoAway = (timeLeft?: string) => {
    if (closed || reconnecting || endRequested) return
    if (!resumeHandle) {
      cb.onError('Gemini is about to close the connection and has not sent a resume handle yet. End and restart the interview.')
      return
    }

    console.info('[voice] Gemini Live GoAway received; reconnecting before abort.', timeLeft ? `timeLeft=${timeLeft}` : '')
    reconnecting = true
    suppressNextClose = true
    flushTranscripts()

    const oldSession = session
    session = null
    try { oldSession?.close() } catch { /* connection already closing */ }
    connectSession().catch((e: unknown) =>
      cb.onError(e instanceof Error ? e.message : 'Could not resume the Gemini Live session'),
    )
  }

  const connectSession = async () => {
    let connectingPromise: Promise<Session> | null = null
    connectingPromise = ai.live.connect({
      model: opts.model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voiceName } },
          languageCode: opts.language,
        },
        systemInstruction: opts.systemInstruction,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // 'transparent' is not supported in the Developer API (Vertex/Enterprise only).
        // The SDK throws if it is sent. Omit it; handle-based resume already works.
        sessionResumption: { handle: resumeHandle },
        contextWindowCompression: { slidingWindow: {} },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'end_interview',
                description:
                  'Must be called immediately after the interviewer says goodbye and the interview is finished, to close the session.',
                parameters: { type: Type.OBJECT, properties: {} },
              },
            ],
          },
        ],
      },
      callbacks: {
        onopen: () => {
          if (closed) return
          console.info('[voice] Gemini Live connected:', opts.model, resumeHandle ? '(resumed)' : '')
          cb.onOpen()

          if (!kickoffSent) {
            kickoffSent = true
            // Kickoff: ask the interviewer to start (Gemini does not speak without input).
            connectingPromise
              ?.then((s) => s.sendClientContent({
                turns: [{
                  role: 'user',
                  parts: [{ text: opts.language === 'en-US' ? '(The candidate has joined. Greet them and start the interview.)' : '(O candidato entrou. Cumprimente-o e inicie a entrevista.)' }],
                }],
                turnComplete: true,
              }))
              .catch((e: unknown) => console.warn('[voice] kickoff failed:', e))

            startMic()
          }
        },
        onmessage: (message: LiveServerMessage) => {
          if (closed) return

          const resumptionUpdate = message.sessionResumptionUpdate
          if (resumptionUpdate?.resumable && resumptionUpdate.newHandle) {
            resumeHandle = resumptionUpdate.newHandle
          }

          if (message.goAway) {
            reconnectAfterGoAway(message.goAway.timeLeft)
            return
          }

          const content = message.serverContent

          // Interviewer audio.
          const inline = content?.modelTurn?.parts?.find((p) => p.inlineData?.data)?.inlineData
          if (inline?.data) {
            const bytes = b64Decode(inline.data)
            cb.onAudioSeconds(0, bytes.length / 2 / 24000)
            player.playPcm16(bytes)
          }

          // Transcripts (interviewer = output, candidate = input).
          if (content?.outputTranscription?.text) pendingInterviewer += content.outputTranscription.text
          if (content?.inputTranscription?.text) pendingCandidate += content.inputTranscription.text
          if (content?.turnComplete) flushTranscripts()

          // Barge-in: user interrupted the model.
          if (content?.interrupted) player.interrupt()

          // Closing tool call.
          if (message.toolCall?.functionCalls?.some((c) => c.name === 'end_interview') && !endRequested) {
            endRequested = true
            flushTranscripts()
            cb.onEndRequested(player.remainingSeconds())
          }
        },
        onerror: (e: ErrorEvent) => {
          console.error('[voice] Gemini Live error:', e)
          if (!closed && !reconnecting) cb.onError(e.message || 'Gemini Live connection error (see the browser console)')
        },
        onclose: (e: CloseEvent) => {
          console.warn('[voice] Gemini Live closed · code', e?.code, '· reason:', e?.reason || '(empty)')
          if (suppressNextClose) {
            suppressNextClose = false
            return
          }

          // Stop the microphone immediately; otherwise each frame tries to send to
          // a dead socket and creates a "WebSocket is already in CLOSING or CLOSED" loop.
          mic.stop()
          session = null
          if (!closed) {
            if (!endRequested && e?.reason) {
              cb.onError(`Gemini closed the session: ${e.reason}${e.code ? ` (code ${e.code})` : ''}`)
            }
            cb.onClose()
          }
        },
      },
    })

    sessionPromise = connectingPromise
    const nextSession = await connectingPromise
    if (closed) {
      try { nextSession.close() } catch { /* already closed */ }
      return
    }
    session = nextSession
    reconnecting = false
  }

  connectSession().catch((e: unknown) =>
    cb.onError(e instanceof Error ? e.message : 'Could not connect to Gemini Live'),
  )

  return {
    setMuted: (muted) => { mic.muted = muted },
    setPaused: (paused) => {
      // Stop sending mic audio and suspend playback; the WebSocket session remains
      // alive with context preserved. If it drops while paused, handle resume reconnects.
      mic.muted = paused
      if (paused) player.pause()
      else player.resume()
    },
    stop: () => {
      closed = true
      flushTranscripts()
      mic.stop()
      player.close()
      try { session?.close() } catch { /* already closed */ }
      session = null
      sessionPromise?.then((s) => s.close()).catch(() => {})
    },
  }
}
