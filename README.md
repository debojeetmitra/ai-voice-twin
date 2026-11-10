# AI Voice Twin — Debojeet Mitra

A voice-and-text interview chatbot that speaks as **Debojeet Mitra** for the 100x AI Agent Team assessment.

Open the app, tap the microphone (or type), and ask interview questions. No account and no visitor API key.

## Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Lucide icons
- **Backend:** Next.js Route Handlers (`/api/chat`, `/api/status`)
- **Model:** Google Gemini (Flash family, configurable). Falls back to a prepared first-person persona if the key is missing or the API fails
- **Voice in:** Browser Speech Recognition / Web Speech API
- **Voice out:** Browser Speech Synthesis
- **Host:** Vercel

## Local development

```bash
npm install
cp .env.example .env.local
# put GEMINI_API_KEY in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without `GEMINI_API_KEY` the UI still works. Replies come from the prepared persona and are labeled **Prepared persona · not a live model**.

## Environment variables (server only)

Configure these in `.env.local` and in the Vercel project settings. Never use a `NEXT_PUBLIC_` prefix for secrets.

| Name | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes for live answers | Google AI Studio API key |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.5-flash`, then tries other Flash models |

## API

`POST /api/chat`

```json
{
  "messages": [{ "role": "user", "content": "What's your superpower?" }],
  "interviewMode": false
}
```

The key is read only on the server. The browser never sends or stores it.

## Deploy

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Add `GEMINI_API_KEY` in Vercel → Settings → Environment Variables.
4. Deploy.

## Product notes

- First-person answers grounded in Debojeet’s stated background. No invented jobs, awards, or stories.
- Session conversation memory, suggested questions, mute / stop / replay, interview mode, rate limiting, and graceful fallbacks.
- Chrome and Edge have the best microphone support. Other browsers can use text input.
