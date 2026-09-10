# PeerUP

Peer learning app — React (Vite) frontend, FastAPI backend, Firebase Auth + Firestore.

## What this includes

- Email + password signup with verification
- Google one-click sign-in
- Forgot password via email
- Remember me (local vs session persistence)
- Password strength meter and show/hide toggle
- Human-readable auth errors
- Learning agreement on first login only
- Profile setup: name, grade, subjects, skill level, bio, photo

## 1. Firebase console

1. Create a Firebase project.
2. Enable **Authentication** → Email/Password and Google.
3. Enable **Firestore** and **Storage**.
4. Deploy or paste `firestore.rules` and `storage.rules`.
5. Project settings → copy the web app config into `frontend/.env`.
6. Project settings → Service accounts → generate a key, save as `backend/serviceAccountKey.json`.

## 2. Frontend

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

Fill `VITE_FIREBASE_*` in `frontend/.env`.

## 3. Backend

```bash
cd backend
copy .env.example .env
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Set `FIREBASE_STORAGE_BUCKET` to your bucket (usually `your-project.appspot.com`).

The API verifies Firebase ID tokens and stores profiles in `users/{uid}`.
