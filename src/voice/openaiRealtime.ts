import { b64Decode, b64Encode, floatTo16BitPcmBytes, MicCapture, PcmPlayer } from './audio'
import type { VoiceCallbacks, VoiceSession, VoiceSessionOptions } from './types'

// Voice session through OpenAI Realtime API (direct browser WebSocket).
// PCM16 mono 24kHz audio in both directions; candidate transcript via
// input_audio_transcription and interviewer transcript via audio_transcript.
//
// Note: authentication uses the "openai-insecure-api-key" subprotocol.
// Suitable for personal/local use; production should use ephemeral backend tokens.
export async function startOpenAiRealtime(
  opts: VoiceSessionOptions,
  cb: VoiceCallbacks,
): Promise<VoiceSession> {
  const mic = new MicCapture()
  const player = new PcmPlayer(24000)
  let closed = false
  let endRequested = false
  let opened = false

  const ws = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(opts.model)}`,
    ['realtime', `openai-insecure-api-key.${opts.apiKey}`, 'openai-beta.realtime-v1'],
  )

  const send = (obj: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  }

  ws.onopen = () => {
    if (closed) return
    // GA Realtime API structure (gpt-realtime): audio config is nested under
    // audio.input/output and output_modalities, replacing older flat fields.
    send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: opts.systemInstruction,
        output_modalities: ['audio'],
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            turn_detection: { type: 'semantic_vad' },
            transcription: { model: 'whisper-1' },
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: opts.voiceName,
          },
        },
        tools: [
          {
            type: 'function',
            name: 'end_interview',
            description:
              'Must be called immediately after the interviewer says goodbye and the interview is finished, to close the session.',
            parameters: { type: 'object', properties: {} },
          },
        ],
      },
    })
    // Ask the interviewer to open the conversation.
    send({ type: 'response.create' })

    opened = true
    cb.onOpen()
    void mic.start(24000, (chunk, durationSec) => {
      cb.onAudioSeconds(durationSec, 0)
      let sum = 0
      for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
      cb.onAudioLevel(Math.sqrt(sum / chunk.length))
      send({ type: 'input_audio_buffer.append', audio: b64Encode(floatTo16BitPcmBytes(chunk)) })
    }).catch((e: unknown) => cb.onError(e instanceof Error ? e.message : 'Could not access the microphone'))
  }

  ws.onmessage = (event) => {
    if (closed) return
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(String(event.data))
    } catch {
      return
    }
    const type = String(msg.type ?? '')

    // Interviewer audio (event names vary between beta/GA API versions).
    if (type === 'response.audio.delta' || type === 'response.output_audio.delta') {
      const bytes = b64Decode(String(msg.delta ?? ''))
      cb.onAudioSeconds(0, bytes.length / 2 / 24000)
      player.playPcm16(bytes)
      return
    }

    // Interviewer transcript (full turn).
    if (type === 'response.audio_transcript.done' || type === 'response.output_audio_transcript.done') {
      const text = String(msg.transcript ?? '').trim()
      if (text) cb.onTranscript('interviewer', text)
      return
    }

    // Candidate transcript.
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const text = String(msg.transcript ?? '').trim()
      if (text) cb.onTranscript('candidate', text)
      return
    }

    // Barge-in: user started speaking while model audio was playing.
    if (type === 'input_audio_buffer.speech_started') {
      player.interrupt()
      return
    }

    // Closing tool call.
    if (type === 'response.function_call_arguments.done' && msg.name === 'end_interview' && !endRequested) {
      endRequested = true
      cb.onEndRequested(player.remainingSeconds())
      return
    }
    if (type === 'response.done' && !endRequested) {
      const output = (msg.response as { output?: Array<{ type?: string; name?: string }> } | undefined)?.output ?? []
      if (output.some((o) => o.type === 'function_call' && o.name === 'end_interview')) {
        endRequested = true
        cb.onEndRequested(player.remainingSeconds())
      }
      return
    }

    if (type === 'error') {
      const err = msg.error as { message?: string } | undefined
      cb.onError(err?.message ?? 'OpenAI Realtime API error')
    }
  }

  ws.onerror = () => {
    if (!closed && !opened) cb.onError('Could not connect to the OpenAI Realtime API. Check the OpenAI key.')
  }
  ws.onclose = () => {
    if (!closed) cb.onClose()
  }

  return {
    setMuted: (muted) => { mic.muted = muted },
    setPaused: (paused) => {
      mic.muted = paused
      if (paused) player.pause()
      else player.resume()
    },
    stop: () => {
      closed = true
      mic.stop()
      player.close()
      try { ws.close() } catch { /* already closed */ }
    },
  }
}
