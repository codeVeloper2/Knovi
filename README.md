# PeerUP

**Learn. Teach. Grow.**

PeerUP is a peer-learning platform where students can learn any concept with an adaptive AI tutor, and connect with other students who are learning the same things. It combines AI-powered personalised instruction with a social peer-discovery system — because sometimes you also just need someone else who gets it.

**Live app:** https://peerup.pages.dev
**GitHub:** https://github.com/codeVeloper2/peerUP

---

## The Problem

Learning is rarely a straight line. A student might understand three quarters of a concept and completely miss one key part. Standard resources either start from scratch or assume you already know the part you're missing. And when you're stuck at 11pm, finding someone who can help right now is hard.

PeerUP addresses this by letting students:

1. Work through concepts with an AI tutor that adapts to how much they already know and responds to where they actually get stuck
2. Find other students to learn with — people who know what you're trying to learn, or need help with what you can teach

---

## What PeerUP Does

### AI Learning

The core learning experience. A student picks a subject, topic, and concept, then tells the AI how familiar they are with it and what they want to do — teach me from scratch, quiz me, give me examples, go deeper. The AI adapts.

The system goes through five distinct phases inside a single learning room:

1. **Teaching** — Gemini explains the concept using a strategy matched to the student's familiarity and intent
2. **Study** — A timer runs while the student reads the explanation. When time ends, the explanation is locked away
3. **Retrieval** — Questions generated from what was actually taught (not generic knowledge). The student has to recall without the explanation visible
4. **Evaluation** — AI evaluates the answer and identifies understanding level (strong / partial / weak) and any misconceptions
5. **Summary** — Session summary with strengths, gaps, and a recommendation for what to do next

If the student struggles, the AI doesn't repeat the same explanation. It picks a completely different teaching strategy — an analogy, a worked example, a real-world context, a step-by-step breakdown — and addresses the specific misconception that was detected.

### Peer Learning

Students build profiles listing what subjects they can teach and what they need help with. PeerUP surfaces relevant people on the Discover page. You send a match request for a specific subject, they accept, and a chat opens between you. From there you can study together.

---

## AI Learning Flow

```
Subject → Topic → Concept
         ↓
Current Knowledge  (new / seen before / know basics / know well / need specific help)
         ↓
Learning Intent    (teach me / explain simply / give examples / go deeper / quiz me / broaden)
         ↓
AI Teaching        (strategy chosen by AI based on familiarity + intent)
         ↓
Study Timer        (server-managed; teaching content hidden when timer ends)
         ↓
Retrieval          (questions grounded in what was taught, not generic)
         ↓
AI Evaluation      (strong / partial / weak + misconception detection)
         ↓
    Strong understanding          Weak or partial understanding
         ↓                                  ↓
  Practice / continue         Misconception identified
                              Different teaching strategy chosen
                              Adaptive reteaching
                                  ↓
                              Practice questions
                                  ↓
                              Evaluation
         ↓
Session Summary (what you learned, strengths, gaps, recommended next step)
         ↓
Progress saved
```

The explanation is intentionally made inaccessible once the study timer ends. The student has to answer from memory, not by scrolling back up. This is deliberate — retrieval practice with the answer hidden is how long-term retention actually works.

---

## Key AI Capabilities

- **Gemini** is the primary AI provider. **Groq** is the automatic fallback if Gemini fails
- Teaching strategy is selected based on session intent and what strategies have already been used — the AI never repeats the same approach in a reteaching round
- Student intent is wired directly into the AI prompt, not just stored as metadata — "quiz me" changes the AI's actual behaviour from the first message
- Evaluation returns structured output: correctness, score, understanding level, detected misconception, and whether reteaching is needed
- Score calculations use best-per-question: if a student answers a question wrong on attempt 1 (30/100) and correct on attempt 2 (90/100), the question scores 90, not 60
- The backend enforces all state transitions — the client cannot skip the timer, skip retrieval, or mark a session complete without passing through the learning phases

The AI is not perfect. The surrounding system is designed to be robust when AI outputs are malformed, delayed, or unavailable.

---

## Peer Learning

- Students create profiles with subjects they can teach and subjects they want help with
- The Discover page shows other students with useful profile previews
- Match requests are subject-specific — you request to learn a particular subject from a specific person
- Accepted requests open a subject-locked chat room
- Real-time messaging via WebSockets, with typing indicators, read receipts, and file sharing
- Group study (up to 5 students)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, JavaScript / JSX |
| Routing | React Router |
| Styling | CSS (index.css + ai-learn.css) |
| Backend | Python, FastAPI |
| ORM | SQLAlchemy 2.x (async) |
| Database | PostgreSQL via Supabase |
| File Storage | Supabase Storage |
| Authentication | Custom JWT + Firebase (Google sign-in verification only) |
| Real-time | WebSockets |
| AI Primary | Google Gemini (`google-genai` SDK) |
| AI Fallback | Groq |
| Email | SMTP via Gmail |
| Frontend Hosting | Cloudflare Pages |
| Backend Hosting | Railway |

---

## Architecture

```
Browser (React + Vite)
         │
         │ HTTP / WebSocket
         ▼
FastAPI Backend  (/api/*)
         │
    ┌────┴────┐
    │         │
AI Learning   Social / Chat
 Service       Services
    │
    ├── Gemini (primary)
    └── Groq   (fallback)
         │
    PostgreSQL / Supabase
```

The backend is the authority for everything that matters:

- **Session state transitions** are enforced server-side. The client cannot skip from teaching to completed without going through retrieval
- **Study timers** are validated against server time. Clients cannot finish a timer early
- **Teaching content** is stripped from API responses when the session is in retrieval or practice state — not just hidden in the UI
- **Answer scoring** uses best-per-question logic
- **Session ownership** is verified on every endpoint — users cannot read or modify another user's session

---

## Project Structure

```
PeerUP/
├── backend/
│   ├── app/
│   │   ├── api/v1/               # Route handlers (15 AI learning endpoints)
│   │   ├── core/                 # Config, database, security
│   │   ├── models/               # SQLAlchemy models (9 AI learning tables)
│   │   ├── schemas/              # Pydantic schemas
│   │   └── services/             # Business logic + AI service
│   ├── migrations/
│   │   └── 001_ai_learning_sessions.sql
│   ├── seed_curriculum.sql       # Safe curriculum seed (CTE-based, no hardcoded IDs)
│   ├── requirements.txt
│   ├── run.py
│   └── .env.example
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── learn/            # AI Learning pages + video tutorials
│       │   ├── auth/
│       │   ├── dashboard/
│       │   ├── discover/
│       │   ├── chat/
│       │   └── admin/
│       ├── components/           # DashboardLayout, route guards, shared UI
│       ├── styles/
│       │   └── ai-learn.css
│       └── api.js                # All backend API calls
├── docs/
│   ├── PROJECT_NOTES.md          # Developer reference
│   ├── CHAT_READ_RECEIPTS.md
│   └── CHAT_TROUBLESHOOTING.md
└── README.md
```

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- A Supabase project with PostgreSQL
- A Firebase project with Authentication enabled (Email/Password + Google)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- Optionally a Groq API key from [Groq Console](https://console.groq.com)

### Database Setup

Run `backend/migrations/001_ai_learning_sessions.sql` in your Supabase SQL editor to create the AI learning tables.

To seed curriculum content, run `backend/seed_curriculum.sql` after the migration. It uses CTEs with RETURNING clauses — safe to run on any sequence state after clearing the curriculum tables.

### Backend

```powershell
cd backend
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, Firebase credentials, Gemini key

python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Start the server
.\.venv\Scripts\python.exe run.py
```

> **Windows note:** Always use `run.py`, not `uvicorn app.main:app` directly. `run.py` sets the `SelectorEventLoop` that psycopg's async driver requires on Windows.

### Frontend

```powershell
cd frontend
cp .env.example .env
# Fill in VITE_API_URL and your Firebase config values

npm install
npm run dev
```

### Environment Variables

**backend/.env** (see `.env.example` for all options):

```
DATABASE_URL=             # Supabase PostgreSQL URI
JWT_SECRET=               # python -c "import secrets;print(secrets.token_hex(32))"
GEMINI_API_KEY=           # from aistudio.google.com
GROQ_API_KEY=             # optional fallback
GOOGLE_APPLICATION_CREDENTIALS_JSON=  # Firebase Admin service account JSON
SUPABASE_SERVICE_KEY=     # service_role key from Supabase dashboard
CHAT_ENCRYPTION_KEY=      # python -c "import secrets;print(secrets.token_hex(32))"
```

**frontend/.env**:

```
VITE_API_URL=http://127.0.0.1:8000
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

---

## AI Usage Disclosure

This project was built with significant assistance from AI tools. This is disclosed as required by the hackathon rules.

**AI tools used:**

- **Kiro AI** — used as the primary development environment throughout the project. Feature implementation, debugging, architecture decisions, and code generation were all done with Kiro
- **Claude (Anthropic)** — used for planning, architecture decisions, and feature design prompts
- **ChatGPT** — used for UI design guidance and design references

**Our role:**

- All product decisions, feature design, and architecture are ours
- We wrote and refined all prompts given to AI tools
- We reviewed, tested, and debugged all generated code
- We understand how the application works and can explain every part of it
- The product vision and user experience design are entirely ours

AI tools accelerated development — they did not replace understanding or decision-making.

---

## Credits

- [Firebase](https://firebase.google.com) — Authentication
- [Supabase](https://supabase.com) — PostgreSQL hosting and file storage
- [FastAPI](https://fastapi.tiangolo.com) — Python web framework
- [SQLAlchemy](https://sqlalchemy.org) — Python ORM
- [Vite](https://vitejs.dev) — Frontend build tool
- [React Router](https://reactrouter.com) — Client-side routing
- [Google Gemini](https://ai.google.dev) — Primary AI provider
- [Groq](https://groq.com) — AI fallback provider
- [Cloudflare Pages](https://pages.cloudflare.com) — Frontend hosting
- [Railway](https://railway.app) — Backend hosting

---

## Team

**Babalola Ezekiel (Izy moni)** — Solo developer. Product design, frontend, backend, database, real-time systems, UI/UX, and overall direction. Built entirely alone as a first hackathon project.

---

*Built for the FirstCommit 2026 Hackathon — Beginner's Paradise track*
