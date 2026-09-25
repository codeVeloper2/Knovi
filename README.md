# Knovi

**Learn. Connect. Grow.**

Knovi is a peer-learning platform for students. It combines an adaptive AI tutor (curriculum-aware teaching, retrieval practice, and reteaching) with peer discovery, real-time chat, and 1-v-1 AI quiz battles — so you can learn a concept deeply *and* find someone else who is working on the same thing.

**Live app:** https://peerup.pages.dev  
**GitHub:** https://github.com/codeVeloper2/Knovi

---

## The problem

Learning is rarely linear. You might understand most of a concept and still miss one key idea. Generic resources either restart from zero or assume you already know the part you are missing. And when you are stuck late at night, finding another student who can help is hard.

Knovi is built around two complementary modes:

1. **AI learning** — an adaptive tutor that teaches, hides the explanation, tests retrieval, evaluates understanding, and reteaches with a *different* strategy when you struggle  
2. **Peer learning** — discover students by subject overlap, match, chat, and challenge each other on concepts you have both studied

---

## What the system actually does

### 1. Authentication & onboarding

- Email/password accounts with JWT sessions issued by the FastAPI backend  
- Google sign-in verified through Firebase Admin (Firebase is for auth verification, not the primary app database)  
- Email verification and password reset flows  
- Onboarding wizard: personal info, learning profile (strengths, struggles, preferences), privacy settings (public profile / direct messages), and a short learning agreement  
- Public **Privacy Policy** (`/privacy`) and **Terms of Service** (`/terms`) pages

### 2. AI Learning (core product)

Students pick a **subject → topic → concept** from the curriculum, set familiarity and intent (e.g. teach me, quiz me, give examples), then enter a server-driven learning room.

**Session lifecycle (enforced on the backend):**

| Phase | What happens |
|--------|----------------|
| **Teaching** | Gemini explains the concept using a strategy matched to familiarity + intent |
| **Studying** | Server-managed study timer; when it ends, teaching content is locked |
| **Retrieval** | Questions grounded in *what was actually taught* (not generic trivia) |
| **Evaluation** | Structured scoring: correctness, understanding level (strong / partial / weak), misconceptions |
| **Reteaching** | If weak/partial: a *new* teaching strategy (analogy, worked example, simpler steps, etc.) — not a repeat of the same explanation |
| **Practice / completed** | Further practice and a session summary with strengths, gaps, and next-step recommendations |

Important product rules implemented in code:

- State transitions are **server-authoritative** — the client cannot skip teaching → completed  
- Study timers are validated against **server time**  
- Teaching content is **stripped from API responses** during retrieval/practice (not only hidden in the UI)  
- Scoring uses **best-per-question** across attempts  
- Session ownership is checked on every endpoint  

Progress and mastery signals are stored for later recommendations and for challenge matchmaking (shared objectives both students have been taught).

### 3. Curriculum

- Hierarchical **subjects → topics → concepts / objectives** stored in PostgreSQL  
- Student-facing curriculum browse for AI learning setup  
- **Admin curriculum management** (subjects, topics, objectives) for operators with `role=admin`  
- Curriculum is used both for tutoring context and for intersecting objectives when building quiz battles

### 4. Peer discovery

- Profiles include grade, subjects you can teach, and subjects you need help with  
- **Discover** ranks other students by learning overlap and relationship state  
- Send / accept match requests for a subject  
- Privacy controls: public vs limited profile, allow/deny direct messages  

### 5. Chat

- Conversations between matched peers  
- Real-time messaging over **WebSockets**  
- Read receipts, reactions, message delete, optional attachments  
- Messages encrypted at rest (AES-GCM with a server chat key)  
- Report flow for abuse  

### 6. AI Quiz Battle (challenges)

1-v-1 challenges between students who are already connected:

- Backend intersects curriculum objectives covered in each student's AI-learning teaching snapshots  
- Builds a challenge blueprint, generates questions with Gemini, validates them (schema + checks), and **freezes** the set in PostgreSQL  
- Live battle: countdown, timed questions, server-side scoring, answer privacy until reveal  
- State, timing, reconnect behaviour, and completion are **server-authoritative** — Gemini is not used to reconstruct past questions mid-battle  

### 7. Learn hub (tutorials & study materials)

Separate from the AI room, the Learn section supports:

- Browse and view **tutorials** (including video upload)  
- Create / manage your own tutorials  
- Save items, comments, study sessions, learning path / my-learning views  
- Course-style listing and enrollment hooks where enabled  

### 8. Home, progress & settings

- Dashboard home with entry points into learning and peers  
- Progress views driven by learning activity  
- Settings: profile, learning profile, security, notification preferences  

### 9. Notifications

In-app notification APIs for match activity and related events (surfaced in the shell UI).

---

## AI Learning flow (summary)

```
Subject → Topic → Concept
        ↓
Familiarity + Intent
        ↓
Teaching (strategy chosen by AI)
        ↓
Study timer (server-managed; content locks)
        ↓
Retrieval (questions from what was taught)
        ↓
Evaluation (strong / partial / weak + misconceptions)
        ↓
   ┌──── strong ────┐              ┌──── weak / partial ────┐
   ↓                ↓              ↓                        ↓
Practice /      Summary      Different strategy      Practice again
continue                      adaptive reteach
        ↓
Session summary + progress saved
```

**AI providers:** Google **Gemini** (primary) with **Groq** as automatic fallback when Gemini fails.

---

## Tech stack

| Layer | Technology |
|--------|------------|
| Frontend | React 19, Vite, JavaScript / JSX |
| Routing | React Router 7 |
| Styling | CSS (`index.css` + feature styles under `src/styles/`) |
| Backend | Python, FastAPI |
| ORM | SQLAlchemy 2.x (async) |
| Database | PostgreSQL (Supabase) |
| File storage | Supabase Storage (avatars, tutorial media) |
| Auth | Backend JWT + Firebase Admin (Google sign-in verification) |
| Real-time | WebSockets (chat + challenge) |
| AI | Google Gemini (`google-genai`), Groq fallback |
| Math UI | KaTeX |
| Frontend host | Cloudflare Pages |
| Backend host | Railway |

---

## Architecture

```
Browser (React + Vite)
        │  HTTP + WebSocket
        ▼
FastAPI  (/api/*)
        │
   ┌────┼────────────────────────┐
   │    │                        │
AI Learning   Peer / Chat /    Curriculum
 + Challenge   Notifications    + Admin
   │
   ├── Gemini (primary)
   └── Groq   (fallback)
        │
 PostgreSQL + Supabase Storage
```

The backend is the source of truth for session state, timers, teaching visibility, challenge scoring, and authz.

---

## Project structure

```
peerUP/   (repo root; product name: Knovi)
├── backend/
│   ├── app/
│   │   ├── api/v1/          # auth, profile, users/discover, chat, learn,
│   │   │                    # curriculum, admin curriculum, ai_learning,
│   │   │                    # learning_profile, challenge, notifications, progress
│   │   ├── core/            # config, database, security, dependencies
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/        # AI learning, challenge runtime, chat, discover, …
│   ├── .env.example
│   ├── Procfile
│   ├── requirements.txt
│   ├── run.py
│   └── runtime.txt
├── frontend/
│   ├── public/              # favicon, logo marks
│   ├── src/
│   │   ├── pages/
│   │   │   ├── auth/        # login, signup, welcome, verify, reset
│   │   │   ├── onboarding/
│   │   │   ├── legal/       # Privacy + Terms
│   │   │   ├── learn/       # AI room + tutorials hub
│   │   │   ├── discover/
│   │   │   ├── chat/
│   │   │   ├── challenge/
│   │   │   ├── dashboard/   # home, progress, settings
│   │   │   └── admin/       # curriculum admin
│   │   ├── components/
│   │   ├── context/
│   │   ├── styles/
│   │   ├── App.jsx
│   │   └── api.js
│   ├── package.json
│   └── vite.config.js
├── docs/
│   ├── migrations/          # SQL already applied on Supabase (reference)
│   └── tests/               # backend tests kept for reference
├── railway.toml
└── README.md
```

---

## Local development

### Prerequisites

- Node.js 18+  
- Python 3.11+  
- Supabase project (PostgreSQL + Storage)  
- Firebase project (Email/Password + Google)  
- Gemini API key ([Google AI Studio](https://aistudio.google.com/app/apikey))  
- Optional: Groq API key  

### Database

Apply the SQL under `docs/migrations/` in order on your Supabase project (these migrations are already run in production; keep them as documentation of schema history).

### Backend

```bash
cd backend
cp .env.example .env
# Fill DATABASE_URL, JWT_SECRET, Firebase credentials, CHAT_ENCRYPTION_KEY, Gemini/Groq keys

python -m venv .venv
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
# or: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env
# Set VITE_API_URL and VITE_FIREBASE_* values

npm install
npm run dev
```

### Deploy notes

- Frontend: Cloudflare Pages (static Vite build)  
- Backend: Railway (`railway.toml` runs `uvicorn app.main:app`)  
- Health check: `GET /api/health`  

---

## AI assistance disclosure

This project was built with substantial help from AI coding tools:

- **Kiro AI** — primary development environment (implementation, debugging, architecture)  
- **Claude (Anthropic)** — planning and feature design  
- **ChatGPT** — UI design references  

**Our role:** product decisions, prompt design, review, testing, and ownership of how the system behaves. AI accelerated delivery; it did not replace understanding of the architecture.

---

## Credits

- [Firebase](https://firebase.google.com) — Authentication  
- [Supabase](https://supabase.com) — PostgreSQL and file storage  
- [FastAPI](https://fastapi.tiangolo.com) — API framework  
- [SQLAlchemy](https://sqlalchemy.org) — ORM  
- [Vite](https://vitejs.dev) / [React](https://react.dev) — frontend  
- [Google Gemini](https://ai.google.dev) — primary AI  
- [Groq](https://groq.com) — AI fallback  
- [Cloudflare Pages](https://pages.cloudflare.com) — frontend hosting  
- [Railway](https://railway.app) — backend hosting  

---

## Team

**Babalola Ezekiel (Izy moni)** — Solo developer. Product design, frontend, backend, database, real-time systems, UI/UX, and overall direction. Built as a first hackathon project.

---

*Built for the FirstCommit 2026 Hackathon — Beginner's Paradise track*
