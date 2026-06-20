# Personal Interviewer Pro User Manual

Personal Interviewer Pro helps you practice job interviews by voice. You paste a
job description, choose the setup, speak with an AI interviewer, and receive a
performance report based on what was actually said in the transcript.

The in-app manual is available in both English and Portuguese. Use the language
switcher in the app header to change the whole interface and manual.

## 1. How It Works

The app runs a small AI pipeline:

- **Researcher:** reads the job description and optional resume to infer company
  culture, values, and likely interview style.
- **Planner:** creates a timed adaptive interview plan.
- **Interviewer:** conducts the spoken interview in real time using Gemini Live
  or OpenAI Realtime.
- **Analyst:** audits the transcript and writes a report with scores, evidence,
  quotes, and a practice plan.

## 2. API Keys

The app does not include built-in provider credentials. You use your own API keys
from the providers you choose:

- Google Gemini: `aistudio.google.com/apikey`
- OpenAI: `platform.openai.com/api-keys`
- Anthropic: `console.anthropic.com`
- OpenRouter: `openrouter.ai/keys`

Keys are stored only in this browser's `localStorage` and are sent directly to
the selected providers. Never share your keys, and configure spend limits in each
provider account.

## 3. Choosing A Setup

- **Simplest:** Google Gemini only. Gemini can run the voice interview and can
  power the text agents if selected in Settings.
- **Quality default:** Gemini for voice plus Anthropic for stronger preparation
  and analysis.
- **Optional:** OpenAI Realtime is especially strong for English voice. OpenRouter
  is useful for routing text roles through many models with one key.

Voice interviews require Gemini Live or OpenAI Realtime. OpenRouter alone does
not run the spoken part.

## 4. Preparing An Interview

On the setup screen:

1. Choose the role area and interview type.
2. Paste the full job description. This is the most important input.
3. Optionally paste your resume. It personalizes questions, but the Analyst only
   scores what you actually said.
4. Choose interview language, report language, voice, duration, stress mode, and
   scoring weights.

Your draft is saved locally in the browser.

## 5. During The Interview

The live screen shows the timer, estimated cost, microphone controls, pause
button, end button, and live transcript.

Pause mode stops microphone sending, suspends audio playback, freezes the timer,
and opens a note area. Resume continues the interview context.

## 6. Report

The report includes:

- Overall weighted score.
- Strengths and gaps with transcript evidence.
- Key moments.
- Competency breakdown.
- Question-level feedback.
- A two-week training plan.
- The full transcript.

If report generation fails, the interview transcript is kept so you can retry or
copy it.

## 7. Privacy And Security

Job descriptions, resumes, audio, transcripts, and reports are sent to the
providers selected for the session. Do not paste confidential documents, trade
secrets, production credentials, or sensitive personal data.

This repository is source code for study, portfolio, and local use. There is no
official hosted public demo. A hosted multi-user deployment should use a
backend/proxy, rate limits, quotas, and temporary credentials for real-time voice.
