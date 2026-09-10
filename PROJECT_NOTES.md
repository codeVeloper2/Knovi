# PeerUp — Project Record

A single-file reference you can hand to any AI (or your future self) to get full
context on this project fast. Last updated: 2026-09-08.

---

## 1. What PeerUp is

A student-first learning community where students find study partners, chat,
join study rooms, and track progress. Tagline: **Learn. Teach. Grow.**

## 2. Tech stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React + Vite (JavaScript, `.jsx`), React Router, plain CSS (`index.css`) |
| Backend   | FastAPI (Python), async SQLAlchemy 2.x, psycopg 3 (binary) |
| Database  | PostgreSQL, hosted on **Supabase** (pooler connection) |
| Storage   | **Supabase Storage** (public `avatars` bucket) — for profile photos |
| Auth      | Custom JWT issued by the backend; **Firebase** used ONLY to verify Google sign-in tokens |
| Email     | SMTP (Gmail) via Python `smtplib` |

## 3. Repository layout

```
PeerUP/
├─ backend/
│  ├─ app/
│  │  ├─ api/v1/        # route handlers: auth, profile, users, match, chat, ai
│  │  ├─ core/          # config.py, database.py, security.py, dependencies.py
│  │  ├─ models/        # SQLAlchemy models (user.py)
│  │  ├─ schemas/       # Pydantic request/response schemas (auth.py, profile.py)
│  │  ├─ services/      # business logic: auth_service, email_service,
│  │  │                 #   storage_service, match_service, ai_service
│  │  └─ main.py        # FastAPI app; mounts routers under /api
│  ├─ run.py            # dev entry point (see "Running" below)
│  ├─ requirements.txt
│  ├─ serviceAccountKey.json   # Firebase Admin creds (git-ignored)
│  └─ .env              # secrets/config (git-ignored)
└─ frontend/
   ├─ src/
   │  ├─ pages/         # auth/, onboarding/, dashboard/settings/, Dashboard, etc.
   │  ├─ components/    # DashboardLayout, ConfirmDialog, ShortcutsModal, Loader, Logo…
   │  ├─ context/       # AuthContext.jsx, ToastContext.jsx
   │  ├─ hooks/         # useKeyboardShortcuts.js
   │  ├─ api.js         # fetch wrapper + all backend calls
   │  ├─ shortcuts.js   # central keyboard-shortcut registry
   │  ├─ firebase.js    # Firebase client init (Google sign-in only)
   │  └─ index.css      # all styles
   ├─ public/           # favicon.svg, logo.svg
   └─ .env              # VITE_* config (git-ignored)
```

## 4. Running the project (Windows / PowerShell)

**Backend** (from `backend/`):
```powershell
.\.venv\Scripts\python.exe run.py
```
- Serves on `http://127.0.0.1:8000`, all routes under `/api`.
- IMPORTANT: use `run.py`, NOT `uvicorn app.main:app` directly. `run.py` forces a
  **SelectorEventLoop**, which psycopg's async mode needs on Windows (the default
  ProactorEventLoop breaks it).
- `.env` is read at startup only — restart after any `.env` change.

**Frontend** (from `frontend/`):
```powershell
npm run dev        # dev server at http://localhost:5173
npm run build      # production build (outputs to dist/)
```
- If `npm` is blocked by execution policy, build directly:
  `node node_modules/vite/bin/vite.js build`

## 5. Environment variables

### backend/.env
```
GOOGLE_APPLICATION_CREDENTIALS   # path to serviceAccountKey.json
FIREBASE_STORAGE_BUCKET          # legacy; Firebase Storage NO LONGER used for avatars
CORS_ORIGINS                     # comma-separated allowed origins

# Supabase Storage (avatar uploads)
SUPABASE_URL                     # auto-derived from DATABASE_URL if blank
SUPABASE_SERVICE_KEY             # service_role key — SERVER-SIDE ONLY, never in frontend
SUPABASE_AVATAR_BUCKET=avatars

DATABASE_URL                     # Supabase Postgres URI (URL-encode special chars in pw)

JWT_SECRET / JWT_ALGORITHM / ACCESS_TOKEN_EXPIRE_MINUTES / EMAIL_TOKEN_EXPIRE_MINUTES

# Email (Gmail SMTP) — emails only send when SMTP_HOST + SMTP_FROM are set;
# otherwise the app runs in "dev mode" and shows codes on screen.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail address>
SMTP_PASSWORD=<Gmail APP PASSWORD, not the login password>
SMTP_FROM=<gmail address>
SMTP_FROM_NAME=PeerUp
SMTP_USE_TLS=true
```

### frontend/.env
```
VITE_API_URL=http://127.0.0.1:8000
VITE_FIREBASE_*      # Firebase client config (Google sign-in)
```

## 6. Auth model (how sign-in works)

- **Email/password**: backend creates the user, hashes the password (bcrypt),
  emails a 6-digit verification code; the backend issues a JWT on success.
- **Google**: frontend does the Firebase popup, sends the Firebase ID token to
  `POST /api/auth/google`; the backend verifies it and issues its own JWT.
- The JWT is stored client-side (`localStorage`/`sessionStorage`, key
  `peerup_token`) and sent as `Authorization: Bearer <token>`.
- A user row has `provider` = "password" | "google" and `hasPassword` (bool).

## 7. Key backend endpoints (all under /api)

| Method | Path                     | Purpose |
|--------|--------------------------|---------|
| POST   | /auth/signup             | create account, email verification code |
| POST   | /auth/login              | email+password login → JWT |
| POST   | /auth/google             | exchange Firebase token → JWT |
| POST   | /auth/verify-email       | confirm 6-digit code |
| POST   | /auth/forgot-password    | send reset code |
| POST   | /auth/reset-password     | reset with code |
| GET    | /me                      | current user |
| PUT    | /me/profile              | update profile |
| POST   | /me/avatar               | upload avatar (multipart) → Supabase, returns photoURL |
| POST   | /me/change-password      | change password (verifies current) |
| DELETE | /me                      | delete account (verifies password) |

## 8. Feature notes / decisions made

### Avatar upload (Supabase Storage)
- Was originally Firebase Storage, but Firebase Storage now requires the paid
  **Blaze** plan → switched to **Supabase Storage** (free, no card).
- Uploads go server-side via `storage_service.upload_avatar` using the
  service_role key (httpx REST call). Bucket `avatars` must be **public**.
- Stored at `avatars/<user_id>/<uuid>.<ext>`; returns a public URL.
- The `/me/avatar` route runs the blocking upload in a **threadpool**
  (`run_in_threadpool`) so it doesn't freeze the async event loop — this was the
  fix for uploads timing out / "couldn't reach the server" on Windows.

### Emails (`services/email_service.py`)
- Templates: verification code, password reset, activity/security alerts
  (password/name/photo change), and **account deleted**. All share a branded
  header + footer with an educational blurb.
- Logo in emails: hosted PNG at a public Supabase URL
  (`avatars/assets/peerup-logo.png`) referenced via `<img>`. Do NOT use `data:`
  URIs (Gmail strips them) or SVG (email clients don't render SVG).
- `smtp_configured()` gates all sending; if false, the app shows codes on screen
  ("dev mode") instead of emailing.
- Activity emails only fire on password change + display-name/photo change (not
  on every profile save, to avoid spam), and only for already-set-up profiles.
- All email sends are **best-effort / non-fatal** — a mail failure never blocks
  the underlying action.

### Delete account
- Flow (in Settings → Security "danger zone"): enter password → type `DELETE` →
  confirmation modal → deletes.
- Backend `auth_service.delete_account`: verifies password (skipped for
  Google-only accounts with no password), deletes the `users` row, then
  **best-effort** deletes the user's avatar files from Supabase Storage
  (`storage_service.delete_user_avatars`) and sends the "account deleted" email.
- FUTURE: when tables referencing `users.id` are added (messages, matches,
  progress…), give those FKs `ondelete="CASCADE"` so a user delete auto-removes
  all related rows.

### Keyboard shortcuts (`frontend/src/shortcuts.js`)
- Central registry drives the handler, sidebar pills, and the help modal (open
  with `?`).
- Handler uses capture-phase + `preventDefault`/`stopPropagation` to override the
  browser.
- Main nav: Ctrl+H Home, Ctrl+D Discover, Ctrl+E Chat, **Ctrl+O** Study Rooms,
  Ctrl+L Learn, Ctrl+U Progress, Ctrl+S Settings.
  (Study Rooms uses Ctrl+O, NOT Ctrl+R, so browser reload still works.)
- Settings sub-nav: Ctrl+1 Profile, Ctrl+2 Subjects, Ctrl+3 Security,
  Ctrl+4 Notifications. Ctrl+M = back to menu.
- Actions: Ctrl+B toggle sidebar, `/` focus search, `?` shortcuts help.

### UI components
- `ConfirmDialog.jsx` — reusable confirmation modal (title/message/danger/loading),
  used for logout and delete account.
- Topbar avatar is a button that navigates to `/app/settings` (profile).
- `Loader.jsx` — branded full-screen spinner for loading states.

### Request schemas are STRICT (`extra="forbid"`)
- All request bodies inherit `StrictModel` (`app/schemas/base.py`), which sets
  Pydantic `extra="forbid"`. Unknown fields → a clear **422** naming the field,
  instead of being silently dropped.
- Why: a frontend field that a schema forgot to declare used to just vanish
  (this hid a bug where `language` never saved). Strict mode surfaces such
  frontend/backend contract mismatches immediately.
- CONSEQUENCE: when you add a field to a form/request, you MUST add it to the
  matching schema too — otherwise that request 422s. (Response models like
  `TokenResponse` stay on plain `BaseModel`; only request bodies are strict.)

## 9. Verification workflow (how changes are checked)

- Backend: `python -c "import compileall; compileall.compile_dir('app')"` and/or
  import `app.main` to catch import errors. (A `<prefix>` warning on Windows is
  harmless.)
- Frontend: `vite build` should transform all modules with no errors.
- Temp files/build output are cleaned up after checks.

## 10. Known TODO / housekeeping

- Rotate the Gmail **App Password** if it was ever exposed; keep it only in
  `backend/.env` (never in frontend).
- `FIREBASE_STORAGE_BUCKET` in `.env` is now unused (Firebase Storage dropped) —
  safe to remove.
- Many dashboard pages (Discover, Chat, Rooms, Learn) are still placeholders.
- No test suite yet.
- When adding related tables, use `ON DELETE CASCADE` (see Delete account note).

---

*This file is documentation only — it changes no behavior. Update it as the
project evolves so it stays a reliable single source of truth.*
