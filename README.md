# Personal Interviewer Pro

Voice-based AI interview practice for job candidates. Paste a job description,
choose the interview language, speak with a real-time AI interviewer, and receive
an evidence-based performance report with strengths, gaps, quotes, and a two-week
practice plan.

> **Public repository status:** this repository is source code for study,
> portfolio, and local use. There is no official hosted public demo. If you host
> it for other users, move provider calls behind a backend/proxy before accepting
> external traffic.

## Highlights

- **Multi-provider pipeline:** choose Google Gemini, OpenAI, Anthropic, or
  OpenRouter independently for the Researcher, Planner, Interviewer, and Analyst
  roles.
- **Real-time voice interview:** Gemini Live or OpenAI Realtime runs the spoken
  interview with live transcription and barge-in.
- **Interface language switcher:** the app UI and in-app manual can be switched
  between English and Portuguese from the header.
- **Independent interview/report languages:** practice in English and read the
  report in Portuguese, or keep both in the same language.
- **Custom interviewer prompt:** add quick instructions or edit the full prompt
  template from Settings.
- **Cost visibility:** text costs use provider token counts when available; voice
  costs are estimated from audio duration.

## Running Locally

Prerequisite: Node.js 20 or newer.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. Then open **Settings -> API keys** and paste
only the provider keys you plan to use. Keys are stored in this browser's
`localStorage`.

| Provider | Used for | Where to get a key |
| --- | --- | --- |
| Gemini | Gemini Live voice and text agents | aistudio.google.com/apikey |
| OpenAI | GPT text models and Realtime voice | platform.openai.com/api-keys |
| Anthropic | High-quality planning and analysis | console.anthropic.com |
| OpenRouter | One key for many text models | openrouter.ai/keys |

The default quality-focused setup uses Anthropic for text agents and Gemini for
voice. For the simplest start, configure Gemini and switch the text roles to
Gemini models in **Settings -> Models**.

## Project Structure

```text
src/
  agents/            Researcher, Planner, and Analyst orchestration
  components/        Setup, live interview, settings, manual, and report UI
  config/            Model catalog and prompts
  i18n.ts            English/Portuguese interface copy
  providers/         Gemini, OpenAI, Anthropic, and OpenRouter text calls
  services/          Cost calculation helpers
  voice/             Gemini Live, OpenAI Realtime, and browser audio helpers
  store.ts           Persisted settings
```

## Security And Privacy Notes

- This app sends provider calls directly from the browser. That is suitable for
  personal/local use; production deployments should use a backend/proxy.
- The OpenAI Realtime browser flow should use ephemeral server-generated
  credentials in production.
- Job descriptions, resumes, audio, transcripts, and reports are sent to the
  providers selected by the user. Avoid pasting confidential material, trade
  secrets, or sensitive personal data.
- Configure provider-side spend limits and key restrictions.
- `package.json` intentionally keeps `"private": true` to prevent accidental npm
  publication. The GitHub repository can still be public.

## Quality Checks

```bash
npm run lint
npm run build
npm audit --omit=dev
```
