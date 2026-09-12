# Chat Feature Troubleshooting Guide

## The Problem
You see "Can't reach the server. Make sure the backend is running." when trying to send a message in the chat.

## Quick Fix Steps

### Step 1: Restart the Backend
The chat feature requires new database tables and routes. You MUST restart the backend to pick them up.

1. **Stop the backend** (press `Ctrl+C` in the terminal where `python run.py` is running)
2. Navigate to the backend folder:
   ```powershell
   cd c:\Users\izymo\Desktop\PeerUP\backend
   ```
3. **Activate the virtual environment**:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```
4. **Start the backend again**:
   ```powershell
   python run.py
   ```

Watch the startup logs. You should see:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### Step 2: Verify the Encryption Key
The chat uses AES-256-GCM encryption. Check your `backend/.env` file:

```env
CHAT_ENCRYPTION_KEY=your_64_character_hex_key_here
```

**The key MUST be exactly 64 hexadecimal characters (0-9, a-f).**

If it's missing or invalid, generate a new one:
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Then add it to `backend/.env`:
```env
CHAT_ENCRYPTION_KEY=<paste_the_64_char_key_here>
```

### Step 3: Check the Browser Console
1. Open your browser's Developer Tools (press `F12`)
2. Go to the **Console** tab
3. Look for error messages (they will be red)
4. Share those error messages to help diagnose the issue

### Step 4: Check the Backend Logs
Look at the terminal where the backend is running. After trying to send a message, you should see log lines like:
```
INFO:     127.0.0.1:xxxxx - "POST /api/chat/conversations/1/messages HTTP/1.1" 200 OK
```

If you see errors like:
- `500 Internal Server Error` - There's a Python error (see the full error in the terminal)
- `404 Not Found` - The route isn't registered (restart the backend)
- `400 Bad Request` - Invalid request data (check browser console)

---

## Common Issues & Solutions

### Issue: "ModuleNotFoundError: No module named 'cryptography'"
**Solution**: The encryption library isn't installed.
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install cryptography
```

### Issue: "Invalid key" or encryption errors
**Solution**: Your `CHAT_ENCRYPTION_KEY` is wrong. It must be exactly 64 hex characters.
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```
Put that output in `backend/.env`.

### Issue: "Conversation not found" or "403 Forbidden"
**Solution**: The conversation doesn't exist or you're not a participant. Create a new conversation first.

### Issue: WebSocket fails to connect
**Symptoms**: Messages send via REST but don't appear in real-time.

**Solution**: WebSockets require the backend to support them. Check:
1. Is the backend using `uvicorn`? (yes, it is in `run.py`)
2. Are you behind a proxy or firewall? (might block WebSockets)
3. Try sending via the REST fallback (it should still work)

### Issue: Messages don't appear after sending
**Check**:
1. Browser console for errors
2. Backend logs for HTTP status codes
3. Network tab in browser dev tools (F12 → Network) - look for the POST request to `/api/chat/conversations/{id}/messages`

---

## Verification Checklist

✅ **Backend is running** - Visit http://127.0.0.1:8000/docs (should show the API docs)
✅ **Chat routes exist** - In the API docs, search for "/chat" endpoints
✅ **Database tables created** - Backend logs should show no errors on startup
✅ **Encryption key set** - `backend/.env` has `CHAT_ENCRYPTION_KEY=...` (64 hex chars)
✅ **Frontend running** - http://localhost:5173 shows the app
✅ **Can login** - Authentication works
✅ **Can see chat page** - Navigate to Chat from the sidebar

---

## Testing the Chat Feature

### 1. Create a conversation
1. Click the **+ button** in the chat page (top left)
2. Search for a user
3. Select a subject
4. Click "Start chat"

### 2. Send a message
1. Type a message in the input box at the bottom
2. Press Enter or click the send button
3. The message should appear immediately

### 3. Check encryption
Messages are encrypted at rest. To verify:
1. Open a database viewer (like `psql` or pgAdmin)
2. Query the `messages` table:
   ```sql
   SELECT id, body FROM messages LIMIT 1;
   ```
3. The `body` column should contain base64-encoded ciphertext, NOT plaintext

---

## Still Not Working?

Share the following with me:

1. **Backend startup logs** (the first 20 lines after running `python run.py`)
2. **Backend error logs** (anything after you try to send a message)
3. **Browser console errors** (F12 → Console → copy the red error messages)
4. **Network tab errors** (F12 → Network → look for failed requests, copy the response)

---

## Database Schema

For reference, here's what the chat tables look like:

### `conversations` table
- `id` (BigInt, primary key)
- `user_a_id` (Int, FK to users) — always the lower user ID
- `user_b_id` (Int, FK to users) — always the higher user ID
- `subject` (String, e.g. "Mathematics")
- `session_goal` (Text, nullable)
- `created_at` (Timestamp)
- `last_message_at` (Timestamp, nullable)

### `messages` table
- `id` (BigInt, primary key)
- `conversation_id` (BigInt, FK to conversations, CASCADE)
- `sender_id` (Int, FK to users, CASCADE)
- `body` (Text) — **ENCRYPTED CIPHERTEXT**
- `attachment_url` (Text, nullable)
- `attachment_name` (String, nullable)
- `is_read` (Boolean, default false)
- `reported` (Boolean, default false)
- `created_at` (Timestamp)

Both tables have `ON DELETE CASCADE` on foreign keys, so deleting a user or conversation automatically cleans up related rows.
