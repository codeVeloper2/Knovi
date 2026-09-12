# PeerUp

> **Learn from peers. Teach what you know. Grow together.**

PeerUp is a peer-to-peer learning platform where students find study partners based on the subjects they can teach and the subjects they need help with. Once connected, they study together inside the app using real-time collaborative tools — shared notes, a whiteboard, a Pomodoro timer, and more.

**Live app:** https://peerup.pages.dev
**GitHub:** https://github.com/codeVeloper2/peerUP

---

## What PeerUp Does

A student creates a profile listing the subjects they are good at and the subjects they need help with. PeerUp surfaces the most relevant study partners on the Discover page. When you find someone who can teach you a subject, you send them a match request for that specific subject. When they accept, a subject-locked chat room opens between you.

From inside that chat, either student can open a **Study Room** — a real-time collaborative workspace built specifically for learning together.

**The full journey:**

```
Discover → Send Match Request → Accept → Chat → Open Study Room → Study → Grow
```

---

## Features

### Authentication
- Email and password signup with email verification gate
- Google one-click sign-in via Firebase
- Forgot password and reset via email
- Remember me (local vs session persistence)
- Password strength indicator and show/hide toggle
- Human-readable error messages
- Learning agreement accepted on first login only

### Profile
- Profile setup: name, grade, university level, subjects taught, subjects needed, skill level per subject, bio, photo
- Privacy settings: toggle public profile visibility and direct message permissions
- Edit profile anytime from settings
- Subject and skill level management

### Discover
- Browse all public student profiles in a searchable, filterable directory
- Student cards showing subjects they teach and subjects they need help with
- Filter by subject, grade, level, and availability
- Sort by recommended, highest rated, most active, newest
- Profile preview panel without page navigation
- Available Now indicator

### Match Requests
- Send a match request for a specific subject
- Subject dropdown auto-populated from the overlap between both students' profiles
- Accept or decline incoming requests
- Accepted request creates a subject-locked chat room
- Connection/access system — students must be connected before chatting or opening study rooms

### Chat
- Subject-locked chat rooms labelled by subject and partner
- Real-time messaging via WebSockets
- Typing indicators
- Read receipts — single checkmark when sent, double checkmark when read
- Unread message badges
- File and image sharing
- Session goal pinned at the top of every chat
- Learning notice pinned on first open
- Report button on messages
- Group study rooms (up to 5 students)

### Study Room
- Opens from inside a chat room with a session goal prompt
- Partner receives a join notification
- Shared live notepad — both students type simultaneously with visible cursors
- Collaborative whiteboard powered by Excalidraw
- Study materials — upload and preview PDFs, images, and documents
- Quick Chat panel alongside the workspace
- Synchronized Pomodoro timer — 25 minutes focus, 5 minutes break
- Break screen overlay when timer ends
- Focus Mode — hides sidebar and chat, full-width workspace only
- End session confirmation modal
- Session summary — subject, duration, partner, goal
- Peer rating (1–5 stars) after every session
- XP awarded to both students on session completion
- Notes saved to both student profiles automatically

### Progress and Gamification
- XP system — earn points for sessions, ratings, and activity
- Level progression: Rising Learner → Study Buddy → Knowledge Seeker → Peer Scholar → Expert Mentor
- Study streak tracking
- Session history

### Learn
- Courses and tutorials section
- Student-created tutorial content
- Saved learning content

### Settings
- Profile settings
- Subject management
- Security settings (password change)
- Notification preferences
- Privacy controls

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, JavaScript |
| Routing | React Router |
| Styling | CSS, inline styles |
| Backend | Python, FastAPI |
| Database | PostgreSQL via Supabase |
| File Storage | Supabase Storage |
| Authentication | Firebase Auth (Google + Email/Password) |
| Real-time | WebSockets |
| ORM | SQLAlchemy |
| Migrations | Alembic |
| Whiteboard | Excalidraw |
| Frontend Hosting | Cloudflare Pages |
| Backend Hosting | Railway |

---

## Project Structure

```
PeerUP/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # Route handlers (auth, profile, users, match, chat, rooms, ai, learn, progress)
│   │   ├── core/            # Config, security, database, dependencies
│   │   ├── models/          # SQLAlchemy database models
│   │   ├── schemas/         # Pydantic request and response schemas
│   │   └── services/        # Business logic (auth, chat, match, room, email, storage, AI)
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   └── src/
│       ├── pages/           # auth, onboarding, dashboard, discover, match, chat, study, learn
│       ├── components/      # Shared UI components
│       ├── context/         # Auth and Toast context providers
│       └── hooks/           # Custom React hooks
├── docs/                    # Development notes and migration scripts
└── README.md
```

---

## Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.11+
- A Firebase project with Authentication and Storage enabled
- A Supabase project with a PostgreSQL database

### Firebase Setup
1. Create a Firebase project
2. Enable Authentication — Email/Password and Google
3. Enable Storage
4. Copy the web app config values into `frontend/.env`
5. Go to Project Settings → Service Accounts → Generate a new private key
6. Save the downloaded file as `backend/serviceAccountKey.json` (never commit this file)

### Frontend Setup
```bash
cd frontend
cp .env.example .env
# Fill in your Firebase config values in .env
npm install
npm run dev
```

### Backend Setup
```bash
cd backend
cp .env.example .env
# Fill in your Supabase DATABASE_URL, Firebase credentials, and other values
python -m venv .venv
source .venv/bin/activate        # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head              # Run database migrations
uvicorn app.main:app --reload --port 8000
```

### Environment Variables

**frontend/.env**
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_URL=http://localhost:8000
```

**backend/.env**
```
DATABASE_URL=
FIREBASE_STORAGE_BUCKET=
GOOGLE_APPLICATION_CREDENTIALS_JSON=
SECRET_KEY=
EMAIL_HOST=
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASSWORD=
```

---

## AI Usage Disclosure

This project was built with significant assistance from AI tools. We are disclosing this as required by the hackathon rules.

**AI tools used:**
- **Claude (Anthropic)** — used throughout the project for planning, architecture decisions, feature design, code generation, debugging, and writing prompts for other AI tools. Claude Code was used directly in the development environment for implementing features.
- **Kiro AI** — used for implementing specific features including the Discover page, Chat system, Match Request system, and Study Room based on prompts we wrote.
- **ChatGPT** — used for UI design guidance and generating design references for the Study Room interface.
- **Grok** — used for research and alternative approaches during development.

**Our role:**
- All product decisions, feature design, and architecture were decided by us
- We wrote and refined all prompts given to AI tools
- We reviewed, tested, and debugged all generated code
- We understand how the application works and can explain every part of it
- The overall product vision, user experience design, and development direction are entirely ours

AI tools assisted our learning and accelerated development — they did not replace our understanding or decision-making.

---

## Credits and External Resources

- [Firebase](https://firebase.google.com) — Authentication and storage
- [Supabase](https://supabase.com) — PostgreSQL database hosting
- [Excalidraw](https://excalidraw.com) — Collaborative whiteboard component
- [FastAPI](https://fastapi.tiangolo.com) — Python web framework
- [SQLAlchemy](https://sqlalchemy.org) — Python ORM
- [Alembic](https://alembic.sqlalchemy.org) — Database migrations
- [Vite](https://vitejs.dev) — Frontend build tool
- [React Router](https://reactrouter.com) — Client-side routing
- [Cloudflare Pages](https://pages.cloudflare.com) — Frontend hosting
- [Railway](https://railway.app) — Backend hosting

---

## Team

- **Babalola Ezekiel (Izy moni)** — Solo developer. Responsible for all product design, frontend development, backend development, database architecture, real-time systems, UI/UX design, and project direction. Built entirely alone as a first hackathon project.

---

*Built for the FirstCommit 2026 Hackathon — Beginner's Paradise track*
