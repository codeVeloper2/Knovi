# PeerUP — Project Reference

A concise single-file reference describing the current state of the project.
Last updated: September 2026.

---

## 1. What PeerUP is

A student-first learning community where students learn from AI and from each other.
Tagline: **Learn. Teach. Grow.**

Two pillars:
- **AI Learning** — a student works through a concept with an adaptive AI tutor
- **Peer Learning** — students connect, match on subjects, and chat to learn together

---

## 2. Tech stack

| Layer      | Tech |
|------------|------|
| Frontend   | React + Vite (JavaScript, `.jsx`), React Router, plain CSS |
| Backend    | FastAPI (Python), async SQLAlchemy 2.x, psycopg 3 (binary) |
| Database   | PostgreSQL hosted on Supabase |
| Storage    | Supabase Storage (`avatars` bucket — profile photos) |
| Auth       | Custom JWT issued by backend; Firebase used only to verify Google sign-in tokens |
| Email      | SMTP (Gmail) via Python `smtplib` |
| AI Primary | Google Gemini (via `google-genai` SDK) |
| AI Fallback| Groq |
| Frontend hosting | Cloudflare Pages |
| Backend hosting  | Railway |

---

## 3. Repository layout

```
PeerUP/
├─ backend/
│  ├─ app/
│  │  ├─ api/v1/
│  │  │  ├─ auth.py               # Authentication
│  │  │  ├─ profile.py            # User profile management
│  │  │  ├─ users.py              # User discovery/search
│  │  │  ├─ match.py              # Match request system
│  │  │  ├─ chat.py               # Real-time messaging (WebSocket)
│  │  │  ├─ learn.py              # Video tutorials and courses
│  │  │  ├─ curriculum.py         # Student read-only curriculum API
│  │  │  ├─ admin_curriculum.py   # Admin curriculum management
│  │  │  ├─ ai_learning.py        # AI Learning Session API (15 endpoints)
│  │  │  ├─ progress.py           # XP and achievements
│  │  │  ├─ notifications.py      # Notifications
│  │  │  └─ ai.py                 # Reserved (empty placeholder)
│  │  ├─ core/
│  │  │  ├─ config.py             # Settings / env vars
│  │  │  ├─ database.py           # Async SQLAlchemy session
│  │  │  ├─ security.py           # JWT auth dependency
│  │  │  └─ dependencies.py       # Shared FastAPI deps
│  │  ├─ models/
│  │  │  ├─ user.py               # User + profile
│  │  │  ├─ match.py              # Match requests
│  │  │  ├─ chat.py               # Conversations + messages
│  │  │  ├─ learn.py              # Video courses + tutorials
│  │  │  ├─ curriculum.py         # Subjects, topics, concepts, objectives, misconceptions
│  │  │  ├─ progress.py           # Badges + certificates
│  │  │  └─ ai_learning.py        # AI Learning Session tables (9 models)
│  │  ├─ schemas/
│  │  │  ├─ ai_learning.py        # AI Learning request/response schemas
│  │  │  ├─ auth.py               # Auth schemas
│  │  │  ├─ curriculum.py         # Curriculum schemas
│  │  │  └─ profile.py            # Profile schemas
│  │  └─ services/
│  │     ├─ ai_learning_service.py  # AI Learning business logic
│  │     ├─ ai_service.py           # Gemini → Groq fallback
│  │     ├─ auth_service.py
│  │     ├─ chat_service.py
│  │     ├─ learn_service.py
│  │     ├─ match_service.py
│  │     ├─ progress_service.py
│  │     ├─ email_service.py
│  │     ├─ storage_service.py
│  │     └─ ws_manager.py
│  ├─ migrations/
│  │  └─ 001_ai_learning_sessions.sql   # AI Learning tables (run once in Supabase)
│  ├─ seed_curriculum.sql               # Curriculum seed data (safe CTEs, no hardcoded IDs)
│  ├─ run.py
│  ├─ requirements.txt
│  └─ .env.example
└─ frontend/
   └─ src/
      ├─ pages/
      │  ├─ auth/          # Login, signup, password reset, email verify
      │  ├─ onboarding/    # Profile setup wizard
      │  ├─ dashboard/     # Home, Progress, Settings
      │  ├─ discover/      # Student discovery + match request
      │  ├─ match/         # Match requests inbox
      │  ├─ chat/          # Messaging (WebSocket)
      │  ├─ learn/         # AI Learning + video tutorials
      │  │  ├─ AILearnHome.jsx       # /app/learn/ai
      │  │  ├─ AISubjectPage.jsx     # /app/learn/ai/subject/:id
      │  │  ├─ AITopicPage.jsx       # /app/learn/ai/subject/:id/topic/:id
      │  │  ├─ AISessionSetup.jsx    # /app/learn/ai/.../concept/:id (knowledge + intent)
      │  │  ├─ AILearningRoom.jsx    # /app/learn/ai/session/:id (ONE continuous room)
      │  │  └─ ...                   # Video tutorial pages
      │  └─ admin/         # Admin curriculum tools
      ├─ components/       # DashboardLayout, auth guards, shared UI
      ├─ context/          # AuthContext, ToastContext
      ├─ hooks/            # useKeyboardShortcuts
      ├─ styles/
      │  └─ ai-learn.css   # AI Learning room styles
      ├─ api.js            # Fetch wrapper + all backend calls
      ├─ firebase.js       # Firebase client (Google sign-in only)
      └─ index.css         # All other styles
```

---

## 4. Running the project (Windows / PowerShell)

**Backend** (from `backend/`):
```powershell
.\.venv\Scripts\python.exe run.py
```
- Serves on `http://127.0.0.1:8000`, all routes under `/api`.
- Use `run.py`, NOT `uvicorn app.main:app` directly.
  `run.py` forces `SelectorEventLoop` which psycopg async mode requires on Windows.
- Restart after any `.env` change.

**Frontend** (from `frontend/`):
```powershell
npm run dev        # dev server at http://localhost:5173
npm run build      # production build → dist/
```

---

## 5. Environment variables

### backend/.env
```
DATABASE_URL=                    # Supabase PostgreSQL URI
JWT_SECRET=                      # Generate: python -c "import secrets;print(secrets.token_hex(32))"
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
EMAIL_TOKEN_EXPIRE_MINUTES=1440

GOOGLE_APPLICATION_CREDENTIALS_JSON=   # Firebase Admin (Google sign-in)
GOOGLE_APPLICATION_CREDENTIALS=        # Local path alt.
FIREBASE_STORAGE_BUCKET=               # Legacy; not used for storage

SUPABASE_URL=                    # Auto-derived from DATABASE_URL if blank
SUPABASE_SERVICE_KEY=            # service_role key — server-side only
SUPABASE_AVATAR_BUCKET=avatars

CHAT_ENCRYPTION_KEY=             # AES-256-GCM; generate with secrets.token_hex(32)

CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
FRONTEND_URL=http://localhost:5173

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=                   # Gmail App Password, not login password
SMTP_FROM=
SMTP_FROM_NAME=PeerUP
SMTP_USE_TLS=true

GEMINI_API_KEY=                  # https://aistudio.google.com/app/apikey
GEMINI_MODEL=gemini-2.0-flash
GROQ_API_KEY=                    # https://console.groq.com
GROQ_MODEL=llama-3.3-70b-versatile
AI_REQUEST_TIMEOUT=60
```

### frontend/.env
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

## 6. AI Learning System

The new AI Learning System replaces the old 7-stage sequential pipeline.

Architecture:
- **Database** — defines WHAT the student should learn (subjects, topics, concepts, objectives, misconceptions)
- **Gemini** — decides HOW to teach it (strategy, depth, style)
- **Backend** — authoritative for all state transitions, timers, evaluation, and persistence

### State machine
```
created → teaching → studying → retrieval → [practice | reteaching] → completed
         abandoned at any point
```

### Key design decisions
- `teaching → completed` is blocked — must pass through retrieval
- `complete_session` requires `retrieval | practice | reteaching` state
- Study timer is server-authoritative: client must wait ≥20% of allocated time
- Teaching content is hidden from all API responses during `retrieval` and `practice` states
- Attempt tracking: best score per question, not raw average
- Adaptive reteaching: always a different strategy than previously used
- Intent (teach_me, quiz_me, explain_simply, etc.) changes the AI prompt directive
- Identified misconceptions from evaluation are passed to reteach AI prompt

### Session flow
```
Create session (subject + topic + concept + familiarity + intent)
→ Generate teaching content (Gemini, strategy based on intent)
→ Start study period (server records started_at + expected_end_at)
→ Study period expires (server validates elapsed time)
→ Session → retrieval state (teaching content hidden in APIs)
→ Generate retrieval questions (grounded in teaching snapshot)
→ Student answers → AI evaluates (strong/partial/weak + misconception)
→ Strong: continue/practice
→ Weak/partial: adaptive reteach (different strategy, misconception-targeted)
→ Practice questions
→ Generate session summary (best-per-question scoring)
→ completed
```

### Database tables (run 001_ai_learning_sessions.sql first)
```
ai_learning_sessions
ai_session_messages
ai_session_teaching
ai_session_study_periods
ai_session_questions
ai_session_answers
ai_session_teaching_attempts
ai_session_integrity_events
ai_session_summaries
```

---

## 7. Auth model

- **Email/password**: backend creates user, hashes password (bcrypt), emails 6-digit code; issues JWT on success.
- **Google**: frontend Firebase popup → Firebase ID token → `POST /api/auth/google` → backend verifies → JWT.
- JWT stored as `peerup_token` in `localStorage` / `sessionStorage`. Sent as `Authorization: Bearer <token>`.
- `provider` = `"password"` or `"google"`.

---

## 8. Key design notes

### Request schemas are strict (`extra="forbid"`)
All request bodies use `StrictModel`. Unknown fields → clear 422. When you add a frontend field, add it to the Pydantic schema or the request will fail.

### Avatar upload (Supabase Storage)
Originally Firebase Storage (now requires Blaze plan) → switched to Supabase Storage (free). Uploads are server-side via `storage_service.upload_avatar` in a threadpool to avoid blocking async loop.

### Emails (best-effort)
`smtp_configured()` gates all sends. If unconfigured, app works in "dev mode" — verification codes print to the API response instead of being emailed. Email failures never block the underlying action.

### Windows async requirement
Use `run.py` to start backend. It sets `SelectorEventLoop` before importing FastAPI. `psycopg` async driver breaks on Windows with `ProactorEventLoop` (the default).

### Chat encryption
Messages encrypted with AES-256-GCM using `CHAT_ENCRYPTION_KEY`. Generate with `secrets.token_hex(32)`.

### Keyboard shortcuts
Central registry in `shortcuts.js`. Main nav: Ctrl+H Home, Ctrl+D Discover, Ctrl+E Chat, Ctrl+L Learn, Ctrl+U Progress. Settings: Ctrl+1–4. Ctrl+B toggle sidebar, `/` focus search, `?` shortcuts modal.

---

## 9. Verification workflow

Backend:
```powershell
cd backend
.\.venv\Scripts\python.exe -c "import ast; ast.parse(open('app/services/ai_learning_service.py').read()); print('OK')"
```

Frontend:
```powershell
cd frontend
npm run build    # must exit 0 with no errors
```

---

## 10. Known housekeeping

- `FIREBASE_STORAGE_BUCKET` in `.env` is unused (Firebase Storage dropped) — safe to remove.
- `backend/app/api/v1/ai.py` is an empty placeholder router (registered but has no routes) — harmless.
- Progress page integration for AI session scores is designed but not yet wired into the Progress dashboard UI.
- No automated test suite for the AI Learning System (manual end-to-end testing only).
- When adding tables referencing `users.id`, use `ON DELETE CASCADE`.

---

*Update this file as the project evolves.*

---

## 9. AI Quiz Battle (backend)

AI Quiz Battle is implemented as a server-authoritative 1-v-1 challenge between students who already have a PeerUP conversation. The challenge is limited to a shared curriculum concept and is grounded in persisted AI-learning evidence from both students.

Key files:
- `backend/app/api/v1/challenge.py` — HTTP + WebSocket API
- `backend/app/services/challenge_service.py` — lifecycle, timing, scoring, privacy, progress integration
- `backend/app/services/challenge_ai_service.py` — shared context, blueprint, generation, validation
- `backend/app/services/challenge_ws_manager.py` — in-process event delivery
- `backend/app/services/challenge_runtime.py` — server timer wakeups
- `backend/app/models/challenge.py` — challenge/session/question/answer/result models
- `backend/app/schemas/challenge.py` — API/AI/WS contracts
- `backend/migrations/002_ai_quiz_battle.sql` — PostgreSQL migration
- `docs/AI_QUIZ_BATTLE.md` — technical architecture reference

The current repository has no friendship/match table; an existing 1:1 `Conversation` is therefore the eligibility primitive. This can be replaced by a dedicated connection model later without changing the battle state machine or scoring logic.

Questions are generated once, validated, and frozen. The client cannot determine correctness, score, timers, reveal state, current question, or final results. Challenge outcomes feed existing topic practice progress and append separate AI learning observations without overwriting user-entered profile data.
