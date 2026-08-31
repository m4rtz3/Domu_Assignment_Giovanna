# Domu Ops Copilot — Technical Operations Lead Take-Home

An MVP automating a slice of the day-to-day Technical Operations Lead workflow at Domu:
juggling call outcomes, QA triage, agent scripting and engineering requests across multiple
client accounts.

Full context on scope, decisions and what a production build would need: see
[`SCOPE_OF_WORK.md`](./SCOPE_OF_WORK.md).

## What's included

All 7 tasks from the challenge brief have a working tab, chosen to show range across
generation, data/analytics, classification, and deterministic rule-checking rather than depth
on just one:

| # | Task | How it's automated |
|---|------|---------------------|
| 1 | Turn a client's raw call script into a structured agent | An LLM generates a branching call flow + a ready-to-use voice agent system prompt (with required compliance disclosures). Can also transcribe an uploaded call recording (local speech-to-text, speaker-labeled) straight into the input field. |
| 2 | Pull & summarize call outcomes across all 7 clients | Pure aggregation (no LLM) over outcome data — filterable, expandable per-client detail, CSV export. |
| 3 | Review flagged calls and categorize what went wrong | An LLM *suggests* a category (wrong outcome / incorrect statement / dropped early); a human always makes the final call. |
| 4 | Diagnose poor objection handling & fix the agent's prompt | An LLM diagnoses the likely cause from the current prompt + a problem description, and proposes a revised prompt. |
| 5 | Turn a client request into an engineering ticket | An LLM drafts a structured, actionable ticket from an informal request; a mocked "send to tracker" step shows where it would go next. |
| 6 | Investigate a compliance concern & draft a response | An LLM flags risks and drafts an internal note — explicitly labeled throughout as a draft for human legal/compliance review, never as something to send as-is. |
| 7 | Confirm calling attempts respect permitted hours & holidays | A deterministic rules engine (no LLM) checks attempts against regional hour windows and a holiday calendar. |

## Project structure

```
domu_assignmente/
├── vercel.json                 # deploy config (Python API + static frontend on one Vercel project)
├── SCOPE_OF_WORK.md            # deliverable: engineering scope for the production build
├── DEFENSE_NOTES.md            # personal prep notes (PT-BR) for presenting this — not a deliverable
├── backend/
│   ├── requirements.txt
│   ├── requirements-local.txt  # optional: adds local speech-to-text (see below)
│   ├── .env.example
│   ├── pytest.ini
│   ├── api/
│   │   └── index.py            # Vercel serverless entrypoint (wraps app.main:app)
│   ├── app/
│   │   ├── main.py             # FastAPI app + router registration
│   │   ├── config.py           # env var loading
│   │   ├── llm.py              # LLM client wrapper: timeout, retry, graceful failure
│   │   ├── schemas.py          # Pydantic request/response models
│   │   ├── data/
│   │   │   ├── mock_calls.json       # 7 clients' call outcome data
│   │   │   ├── mock_flags.json       # sample QA-flagged calls
│   │   │   ├── call_attempts.json    # sample call attempts for Task 7
│   │   │   ├── calling_windows.json  # permitted-hour rules by region (illustrative)
│   │   │   └── holidays.json         # holiday calendar (illustrative)
│   │   └── routers/
│   │       ├── script_to_agent.py         # Task 1
│   │       ├── outcomes.py                # Task 2
│   │       ├── qa_review.py               # Task 3
│   │       ├── fix_objection_handling.py  # Task 4
│   │       ├── ticket.py                  # Task 5
│   │       ├── compliance_investigation.py # Task 6
│   │       ├── calling_compliance.py      # Task 7
│   │       └── transcribe.py              # optional: audio upload -> text (local speech-to-text)
│   └── tests/
│       ├── test_llm.py             # timeout / retry / failure behavior
│       ├── test_outcomes.py        # aggregation logic
│       └── test_script_to_agent.py # graceful degradation when LLM fails/returns bad output
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.tsx
        ├── api.ts               # fetch wrapper: client-side timeout + error handling
        ├── styles.css
        └── pages/
            ├── ScriptToAgent.tsx          # Task 1
            ├── Dashboard.tsx              # Task 2
            ├── QAReview.tsx               # Task 3
            ├── FixObjectionHandling.tsx   # Task 4
            ├── TicketGenerator.tsx        # Task 5
            ├── ComplianceInvestigation.tsx # Task 6
            └── CallingCompliance.tsx      # Task 7
```

## Prerequisites

- Python 3.11+ (tested on 3.13)
- Node.js 18+
- An Anthropic API key — see "Getting an API key" below if you don't have one yet.

## Getting an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in / create an account.
2. Go to **Settings → API Keys** and click **Create Key**.
3. Copy the key (`sk-ant-...`) — it's only shown once.
4. Add a small amount of billing credit under **Settings → Billing** (a few dollars easily
   covers testing this project).
5. Never commit this key. It goes in `backend/.env` (git-ignored) locally, and as a Vercel
   environment variable in production — never in code.

## Local setup

Open two terminals — one for the backend, one for the frontend.

**Backend:**

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Open `backend/.env` and paste your real `ANTHROPIC_API_KEY` in place of the placeholder.

> **No working API key yet?** Set `LLM_MOCK_MODE=true` in `backend/.env`. Every AI-dependent
> endpoint then returns a realistic canned response instead of calling the LLM — no key, no
> cost, no network dependency. The UI clearly labels these responses ("LLM_MOCK_MODE is on...")
> so it's never mistaken for a real generation. Useful while waiting on Anthropic account
> verification, or just to iterate on the frontend without burning API credits.

```bash
uvicorn app.main:app --reload --port 8000
```

The API is now at `http://127.0.0.1:8000` (interactive docs at `/docs`).

**Frontend** (new terminal):

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — the dev server proxies `/api/*` calls to the backend
automatically (see `vite.config.ts`).

## Optional: transcribing call recordings locally

The Script → Agent screen can transcribe an uploaded audio file (e.g. a real call recording)
straight into the script field, using [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
running entirely on your machine — no API key, no cost.

It's not installed by default: its dependencies (~120MB) are too large for the Vercel deploy,
and the model would have to re-download on every serverless cold start anyway. To use it locally:

```bash
cd backend
venv\Scripts\activate
pip install -r requirements-local.txt
```

The first upload downloads the model (~150MB, one-time) and takes a bit longer; after that, a
~3-4 minute call recording transcribes in under a minute on a normal laptop CPU. Without this
installed, the upload option still shows in the UI but returns a clear "not available, run
locally" message instead of crashing — the rest of the app is unaffected either way.

## Running tests

```bash
cd backend
venv\Scripts\activate
pytest -v
```

11 tests cover: the LLM wrapper's timeout/retry/failure behavior (mocked, no real API calls),
the outcomes aggregation math, and that AI-dependent endpoints degrade gracefully instead of
crashing when the LLM is unavailable or returns something unparseable.

## Deploying to Vercel

This repo deploys as a single Vercel project: the Python backend runs as a serverless
function, the React frontend as a static build, both routed by `vercel.json`.

```bash
npm install -g vercel
vercel login
vercel link
```

In the Vercel dashboard for the project, go to **Settings → Environment Variables** and add:

- `ANTHROPIC_API_KEY` = your real key
- `ANTHROPIC_MODEL` = `claude-sonnet-5` (optional, this is already the default)

Then deploy:

```bash
vercel --prod
```

Vercel prints the production URL when it finishes — that's the link to share.

## Known limitations of the MVP

These are deliberate cuts for a proof-of-concept, not oversights — all called out with
proposed fixes in `SCOPE_OF_WORK.md`:

- Call outcome, QA flag, and calling-attempt data is static mock JSON, not pulled from a real
  call platform.
- The permitted-calling-hour windows and holiday calendar (Task 7) are illustrative demo data,
  not verified legal guidance — labeled as such in the UI.
- Task 6's output is explicitly a draft for a human compliance/legal reviewer — never
  something to send to a client, customer, or regulator as-is.
- No auth — anyone with the URL can use every feature.
- No persistence — generated tickets/agents/QA categorizations aren't saved anywhere; refreshing
  the page loses them.
- Serverless functions are fine for these request/response endpoints, but Domu's real product
  needs long-lived low-latency connections for live voice calls, which this architecture
  wouldn't serve well.
