# Knovi — Learn. Connect. Grow.

Peer learning for students: curriculum-aware AI tutoring, peer discovery, real-time chat, and 1-v-1 quiz battles.

## Live Demo

* **Live app:** https://knovi.pages.dev
* **GitHub:** https://github.com/codeVeloper2/Knovi

## What Knovi Does

Knovi is a full-stack student learning platform. After signup (email/password or Google) and a short onboarding flow (profile, subjects, privacy, learning agreement), you land on a dashboard with Home, Discover, Chat, Challenge, Learn, Progress, and Settings.

The core product is **KnoAI Learning**: you browse a curriculum hierarchy (subject → topic → concept), set how familiar you are and what you want (e.g. teach me, quiz me), then open a learning room. The backend runs a fixed session lifecycle—teach, timed study, lock teaching content, retrieval questions grounded in what was taught, evaluation, optional reteach with a different strategy, practice, and summary. State transitions and timers are enforced on the server, not only in the UI.

Alongside AI learning, you can **discover other students** by subject overlap, send match requests, **chat** in real time (WebSockets, read receipts, reactions), and start **quiz battles**—against another student (matchmaking or direct) or against an AI opponent—on shared curriculum objectives. Progress tracks XP, levels, streaks, badges, and certificates. Operators with `role=admin` can manage curriculum subjects and topics. Product feedback and AI-response flagging are emailed to the team when SMTP is configured.

## Features

### Authentication

* Email/password signup and login with JWT sessions from the FastAPI backend
* Google sign-in verified via Firebase Admin
* Email verification and password-reset codes (SMTP when configured; otherwise links may be returned in API responses for local dev)
* Guest routes for landing, login, signup, forgot password; protected routes for the app shell

### Profile & Onboarding

* Multi-step onboarding: personal details, learning profile, privacy, learning agreement
* Profile update, avatar upload (Supabase Storage), privacy toggles, change password, delete account
* Settings pages: profile, learning profile, security, notifications preferences
* Public **Privacy Policy** and **Terms of Service** pages

### Discover & Matching

* Discover feed ranks students by learning overlap and relationship state
* Subject filters; view another student’s profile panel
* Send / accept match requests for a subject
* Privacy controls for public vs limited profile and direct messages

### Chat

* Conversations between matched peers
* Real-time messaging over WebSockets
* Read receipts, reactions, message delete, optional attachments
* Messages encrypted at rest (AES-GCM with a server chat key)
* Report flow for abuse
* In-app notifications list

### AI-Powered Learning

* Curriculum browse: subjects → topics → concepts (student-facing curriculum API)
* Session setup: familiarity, intent, then create a learning session
* **AI Learning Room** UI: learning plan sidebar, conversation, quick actions, save explanation, TTS read-aloud, flag AI response, leave/end session with confirmation
* Server-driven phases: prepare/teach → study timer → lock teaching → questions → answers → practice complete → reteach → summary → abandon/complete
* Teaching strategies vary by familiarity/intent; reteach uses a different strategy when understanding is weak/partial
* Retrieval questions intended to be grounded in what was taught in that session
* Math rendering with KaTeX; optional **live graph plot steps** for Math/Physics teaching content (structured plot plan + frontend player)
* Idle nudge endpoint; integrity event endpoint
* Challenge entry from a finished learning context (challenge AI from the room when context is ready)
* Excalidraw is available as a dependency for whiteboard-style use in the learn surface where wired

### Challenge System

* Create challenges, accept/decline, prepare for battle
* Matchmaking join / status / leave
* Challenge against **AI** opponent (`POST /challenges/ai`)
* Live battle flow with countdown, timed questions, reveal windows (server-configured durations)
* WebSocket channel for battle runtime
* Challenge list and detail views on the frontend

### Progress & Gamification

* Progress dashboard: XP ladder and level names, activity streak tracking
* Badges and certificates endpoints and UI surfaces
* Home dashboard overview of learning activity

### Admin Curriculum Management

* Admin-only routes (`role=admin`) for curriculum management
* Subjects and topics pages (list/detail); placeholder sections for concepts, objectives, misconceptions, activities, questions, resources, users, and system where not fully built out yet

### Tutorials & Courses (Learn tab)

* Browse/enroll courses, lesson progress
* Tutorials list/detail, create tutorial, video/thumbnail upload
* Saved items, comments and likes, my learning, study sessions listing
* AI Learn home is the primary path for KnoAI; course/tutorial features share the Learn area

### Product feedback

* Floating feedback control on main app tabs (not on the full-screen learning room)
* Flag control on AI messages in the learning room (session context + student/AI text)
* `POST /api/feedback` emails the team when SMTP is configured

### Marketing / landing

* Public landing page with product walkthrough section (“How Knovi Works”) and non-interactive demos
* Legal pages linked from the product

## Tech Stack

### Frontend

* React 19, React Router 7, Vite 6
* Firebase JS SDK (client Google auth + storage helpers)
* KaTeX (math), DOMPurify, Lucide icons, react-confetti
* @excalidraw/excalidraw
* Custom CSS (no separate UI framework)

### Backend

* Python 3.11, FastAPI, Uvicorn
* SQLAlchemy (async) + asyncpg / PostgreSQL
* Pydantic schemas, SlowAPI rate limiting
* PyJWT, passlib/bcrypt-related auth utilities as used in auth service
* Firebase Admin (Google token verification)
* Google GenAI client (Gemini) with Groq fallback
* WebSockets for chat and challenge runtime
* SMTP email delivery when configured

### Database & hosting

* **Supabase** PostgreSQL (primary data store; curriculum, users, sessions, chat, challenges, progress)
* **Supabase Storage** for avatars (and learn media uploads where configured)
* **Cloudflare Pages** — frontend (`knovi.pages.dev`)
* **Railway** — backend API (`railway.toml`, Nixpacks, health check `/api/health`)

### AI providers

* **Primary:** Google Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL`)
* **Fallback:** Groq (`GROQ_API_KEY`, `GROQ_MODEL`)
* Shared helper `call_with_fallback` used by learning, challenges, and related AI features

### Deployment

* Frontend: static build via Vite, env `VITE_API_URL` pointing at the API
* Backend: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

## Project Structure

```
Knovi/
├── README.md
├── .gitignore
├── railway.toml
├── backend/
│   ├── .env.example
│   ├── Procfile
│   ├── requirements.txt
│   ├── runtime.txt
│   ├── run.py
│   ├── pytest.ini
│   ├── tests/
│   └── app/
│       ├── main.py
│       ├── core/          # config, database, security, dependencies
│       ├── api/v1/        # auth, profile, users, chat, learn, ai_learning,
│       │                  # challenge, curriculum, admin_curriculum,
│       │                  # progress, notifications, learning_profile, feedback, ai
│       ├── models/
│       ├── schemas/
│       └── services/      # auth, AI, learning, chat, discover, challenge,
│                          # graph_plotting, email, storage, progress, …
├── frontend/
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── public/            # favicon.svg, knovi-mark.svg, knoai-logo.svg, …
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── firebase.js
│       ├── components/    # layout, routes, feedback, logos, modals, …
│       ├── context/
│       ├── hooks/
│       ├── pages/         # landing, auth, onboarding, dashboard, discover,
│       │                  # chat, challenge, learn (AI room + tutorials),
│       │                  # legal, admin
│       └── styles/
```

## How to Run Locally

### Backend

```bash
cd backend
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, CHAT_ENCRYPTION_KEY, AI keys, etc.
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env
# Fill in Firebase config and VITE_API_URL=http://127.0.0.1:8000
npm install
npm run dev
```

Open the Vite URL (typically http://localhost:5173). API health: `GET http://127.0.0.1:8000/api/health`.

## Environment Variables

### Backend (`backend/.env.example` + keys read in `config.py`)

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | PostgreSQL URI (Supabase pooler or local) |
| `JWT_SECRET` | Yes | Session signing |
| `JWT_ALGORITHM` | Optional | Default `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Optional | Default `1440` |
| `EMAIL_TOKEN_EXPIRE_MINUTES` | Optional | Default `1440` |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | For Google login in prod | Full service account JSON as one line |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local Google login | Path to service account file |
| `FIREBASE_STORAGE_BUCKET` | Optional | Firebase storage bucket name |
| `SUPABASE_URL` | Optional | Derived from DB URL if blank |
| `SUPABASE_SERVICE_KEY` | For avatar/media uploads | Server-side only |
| `SUPABASE_AVATAR_BUCKET` | Optional | Default `avatars` |
| `CHAT_ENCRYPTION_KEY` | Yes for chat at rest | 32-byte hex |
| `GEMINI_API_KEY` | Yes for AI features | Primary LLM |
| `GEMINI_MODEL` | Optional | Default in config |
| `GROQ_API_KEY` | Optional | Fallback LLM |
| `GROQ_MODEL` | Optional | Default in config |
| `CORS_ORIGINS` | Yes in deploy | Comma-separated origins |
| `FRONTEND_URL` | Recommended | Links in emails |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Optional | Email verification, reset, feedback |
| `SMTP_FROM_NAME` / `SMTP_USE_TLS` | Optional | Defaults in config |
| `FEEDBACK_TO_EMAIL` | Optional | Defaults to team inbox in feedback route |
| `CHALLENGE_*` | Optional | Quiz battle timings and limits (see `.env.example`) |

### Frontend (`frontend/.env.example`)

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_URL` | Yes | Backend base URL |
| `VITE_FIREBASE_API_KEY` | For Google sign-in | Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | For Google sign-in | |
| `VITE_FIREBASE_PROJECT_ID` | For Google sign-in | |
| `VITE_FIREBASE_STORAGE_BUCKET` | Optional | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Optional | |
| `VITE_FIREBASE_APP_ID` | For Google sign-in | |

Do not commit real `.env` files or service account JSON.

## AI Usage Disclosure

This project used AI tools significantly during development:

* **Kiro AI** — implementing major features including the AI learning system, challenge system, discover page, and chat
* **Claude (Anthropic)** — architecture planning, prompt writing, code review, and feature design decisions
* **ChatGPT** — UI design references and interface planning
* **Grok** — specific implementation tasks (cleanup, landing demos, graph plotting integration, feedback, UI polish)

All product decisions, feature design, architecture choices, and development direction were made by the developer. AI tools accelerated development and assisted with implementation. The developer understands how the application works and can explain every part of it.

## Credits and External Resources

### npm (`frontend/package.json`)

* **react / react-dom** — UI
* **react-router-dom** — routing
* **vite / @vitejs/plugin-react** — build and dev server
* **firebase** — client Google auth and storage helpers
* **katex** — math rendering in the learning room
* **dompurify** — HTML sanitization where used
* **lucide-react** — icons
* **react-confetti** — celebration UI
* **@excalidraw/excalidraw** — drawing/whiteboard component

### Python (`backend/requirements.txt`)

* **fastapi / uvicorn** — HTTP API and ASGI server
* **sqlalchemy / asyncpg** — async ORM and PostgreSQL driver
* **pydantic** — request/response models
* **python-jose / PyJWT** (as pinned) — JWT handling
* **passlib / bcrypt** (as pinned) — password hashing
* **firebase-admin** — verify Google ID tokens
* **google-genai** — Gemini API
* **groq** — Groq API fallback
* **slowapi** — rate limiting
* **httpx / aiofiles / python-multipart** — HTTP client, files, form uploads
* Other transitive packages as resolved by pip from `requirements.txt`

### Services

* **Firebase Authentication** — Google sign-in identity
* **Firebase / Supabase Storage** — avatars and uploaded learn media (as configured)
* **Supabase PostgreSQL** — primary application database
* **Google Gemini API** — primary model for teaching, evaluation, challenges
* **Groq API** — fallback model
* **SMTP** (e.g. Gmail app password) — verification, password reset, feedback mail
* **Cloudflare Pages** — frontend hosting
* **Railway** — backend hosting

## Team

Built solo by **Babalola Ezekiel (codeVeloper)** — one developer, built entirely alone as a first hackathon project.
