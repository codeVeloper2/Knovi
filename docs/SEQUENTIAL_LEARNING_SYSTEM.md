# Sequential Learning System

> **7-Stage Mastery Pipeline with Peer-to-Peer Verification**

## 🎯 Overview

The Sequential Learning System is a complete end-to-end learning pipeline where students master concepts through 7 strictly ordered stages, culminating in peer-to-peer verification. The backend maintains authority over all progression — the frontend cannot skip stages or bypass requirements.

This system combines AI-powered personalized instruction, automated assessment, and social verification to ensure true mastery before progression.

---

## 📊 The Complete Learning Flow

```
Subject → Topic → Concept List (with lock states)
                     ↓
            ┌────────┴────────┐
            │  CONCEPT LEARN  │
            └────────┬────────┘
                     ↓
    ┌────────────────┴────────────────┐
    │  SEQUENTIAL LEARNING PIPELINE   │
    └────────────────┬────────────────┘
                     ↓
         1. LESSON (AI-generated)
                     ↓
         2. CHECKPOINT (from lesson)
            ↓ pass        ↓ fail
            │        RETEACH → new checkpoint
            ↓
         3. EXPLAIN IT (student writes)
                     ↓
         4. AI VERIFICATION
            ↓ pass        ↓ fail
            │        retry explanation
            ↓
         5. ASK AI (Q&A, curriculum-bound)
                     ↓
         6. CHALLENGE (find peer at same stage)
            ↓                  ↓
    ┌───────┴──────┐    ┌─────┴──────┐
    │    LOBBY     │    │   5 AI     │
    │ both ready   │ →  │ QUESTIONS  │
    └──────────────┘    └─────┬──────┘
                              ↓
                    ┌─────────┴─────────┐
                    │  PEER EXCHANGE    │
                    │ (ask each other)  │
                    └─────────┬─────────┘
                              ↓
                    ┌─────────┴─────────┐
                    │  AI EVALUATION    │
                    └─────────┬─────────┘
              pass ←──────────┴──────────→ fail
                ↓                          ↓
         7. VERIFIED ✓              reset to checkpoint
       (next concept unlocked)      (reteach loop)
```

---

## 🔍 The 7 Stages Explained

### Stage 1: Lesson
**What happens:**
- AI generates a personalized lesson based on the concept's key points and curriculum context
- Content is saved to `lesson_content` field for later checkpoint generation
- Student reads and studies the material
- "Complete Lesson" button advances to Checkpoint

**Backend:**
- `POST /api/v1/concepts/{id}/generate-lesson` — calls Google Gemini
- `POST /api/v1/concepts/{id}/complete-lesson` — advances stage

**Frontend:**
- `ConceptLearnPage` → Lesson tab
- Displays AI-generated content
- Shows loading state during generation

---

### Stage 2: Checkpoint
**What happens:**
- AI generates 3 multiple-choice questions **directly from the saved lesson content**
- Student answers the questions
- If pass (2/3 or better): advance to Explain It
- If fail: trigger reteaching flow with simpler explanation
- After reteaching, new checkpoint is generated

**Backend:**
- `POST /api/v1/concepts/{id}/generate-checkpoint` — requires `lesson_content` exists (400 if missing)
- `POST /api/v1/concepts/{id}/submit-checkpoint` — evaluates answers
- `POST /api/v1/concepts/{id}/generate-reteaching` — creates simpler lesson for failed points

**Frontend:**
- `ConceptLearnPage` → Checkpoint tab
- Shows 3 MCQs with radio buttons
- Displays results with correct/incorrect highlighting
- Reteach flow with regenerate checkpoint button

**Critical Rule:** Checkpoint questions MUST be generated from `lesson_content` — this ensures assessment matches what was taught.

---

### Stage 3: Explain It
**What happens:**
- Student writes their own explanation of the concept in their own words
- Submitted to AI for verification
- This stage ensures students can articulate understanding, not just recognize correct answers

**Backend:**
- `POST /api/v1/concepts/{id}/submit-explanation` — sends to AI verification

**Frontend:**
- `ConceptLearnPage` → Explain It tab
- Large textarea for student input
- Character count and guidance

---

### Stage 4: AI Verification
**What happens:**
- AI analyzes the student's explanation for conceptual understanding
- **Does NOT judge grammar, spelling, or English quality**
- Identifies:
  - ✅ Correct points covered
  - ⚠️ Missing key concepts
  - ❌ Incorrect understandings
- If pass: unlocks Ask AI and sets `challenge_eligible = true`
- If fail: student revises explanation

**Backend:**
- Part of `/api/v1/concepts/{id}/submit-explanation`
- Returns structured feedback with points categorized
- Sets `challenge_eligible` flag on pass

**Frontend:**
- `ConceptLearnPage` → AI Verification tab
- Shows feedback in three sections (correct/missing/incorrect)
- Retry button if failed

---

### Stage 5: Ask AI
**What happens:**
- Curriculum-bound Q&A assistant
- Student can ask follow-up questions about the concept
- AI responses stay within curriculum boundaries
- Non-blocking stage — students can ask questions anytime after reaching this stage

**Backend:**
- `POST /api/v1/concepts/{id}/ask-ai` — curriculum-aware chat

**Frontend:**
- `ConceptLearnPage` → Ask AI tab
- Chat interface with message history
- Prompt suggestions

---

### Stage 6: Challenge
**What happens:**
- Student finds a peer at the same concept/stage
- Both enter a lobby and mark themselves ready
- System generates 5 AI questions about the concept
- Both students answer independently (no peeking)
- Peer exchange phase: each asks the other 1 question
- AI evaluates answers with hints available
- Final AI evaluation determines pass/fail
- **Pass:** both students marked `verified`, next concept unlocks
- **Fail:** reset to checkpoint for reteach loop (not permanently blocked)

**Backend:**
- **11 endpoints** at `/api/v1/challenge/...`
- Matching algorithm finds same concept + stage
- Session state machine: `waiting` → `lobby` → `questions` → `peer_exchange` → `evaluating` → `completed`/`failed`
- Heartbeat system keeps sessions alive
- Partner disconnect → session cancelled gracefully

**Frontend:**
- Four dedicated pages:
  1. `ChallengeFindPartnerPage` — matchmaking with timer
  2. `ChallengeLobbyPage` — both participants ready up
  3. `ChallengeSessionPage` — questions, peer exchange, evaluation
  4. `ChallengeCompletePage` — results and next steps

---

### Stage 7: Verified
**What happens:**
- Concept is marked as mastered
- Next concept in the topic unlocks
- Progress bar updates
- XP awarded (future enhancement)

**Backend:**
- `POST /api/v1/concepts/{id}/verify-concept` — marks `verified = true`
- Topic concepts endpoint returns updated lock states

**Frontend:**
- `TopicConceptsPage` shows green checkmark
- Next concept becomes clickable

---

## 🗄️ Database Schema

### Table: `concept_progress`
Tracks each student's journey through a concept.

**Key Fields:**
```sql
user_id              UUID    -- student
concept_id           UUID    -- which concept
current_stage        TEXT    -- lesson | checkpoint | explain | ai_verification | ask_ai | challenge | verified
lesson_content       JSONB   -- saved AI-generated lesson
checkpoint_attempts  JSONB[] -- [{score, questions, answers, timestamp}]
reteaching_content   JSONB   -- simpler lesson after failure
student_explanation  TEXT    -- student's written explanation
ai_verification_result JSONB -- {correct, missing, incorrect points}
challenge_eligible   BOOLEAN -- unlocked after AI verification passes
verified             BOOLEAN -- mastery flag
```

**Migration:** `backend/migrations/001_concept_progress.sql`

---

### Table: `challenge_sessions`
Tracks peer-to-peer challenge sessions.

**Key Fields:**
```sql
id                   UUID    -- session ID
concept_id           UUID    -- which concept
initiator_id         UUID    -- student who started
partner_id           UUID    -- matched student
status               TEXT    -- waiting | lobby | questions | peer_exchange | evaluating | completed | failed | cancelled
questions            JSONB[] -- 5 AI-generated questions
initiator_answers    JSONB   -- independent answers
partner_answers      JSONB   -- independent answers
peer_exchanges       JSONB[] -- [{asker, question, answer, evaluated, feedback}]
initiator_passed     BOOLEAN -- final result
partner_passed       BOOLEAN -- final result
```

**Migration:** `backend/migrations/002_challenge_sessions.sql`

---

## 🔧 Backend API Reference

### Concept Learning API (`/api/v1/concepts/{id}/...`)

| Endpoint | Method | Stage | Description |
|----------|--------|-------|-------------|
| `/progress` | GET | any | Fetch current progress (creates at `lesson` if none exists) |
| `/generate-lesson` | POST | lesson | AI generates lesson → saves to `lesson_content` |
| `/complete-lesson` | POST | lesson | Advance to `checkpoint` |
| `/generate-checkpoint` | POST | checkpoint | Generate 3 MCQs from `lesson_content` |
| `/submit-checkpoint` | POST | checkpoint | Evaluate answers → pass or reteach |
| `/generate-reteaching` | POST | checkpoint | Create simpler lesson for missed points |
| `/submit-explanation` | POST | explain | AI verifies student explanation |
| `/ask-ai` | POST | ask_ai+ | Curriculum-bound Q&A |
| `/verify-concept` | POST | challenge+ | Mark concept verified |
| `/challenge-failed` | POST | challenge+ | Reset to checkpoint |
| `/history` | GET | any | Full learning history |
| `/topic/{id}/concepts` | GET | any | All concepts with lock/progress states |

**Authorization:**
- Every endpoint checks `current_stage` and rejects access to future stages (403 Forbidden)
- Challenge requires `challenge_eligible = True`
- Checkpoint generation requires `lesson_content` exists (400 Bad Request)

---

### Challenge API (`/api/v1/challenge/...`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/find` | POST | Find/create waiting session for concept |
| `/{id}` | GET | Poll session state (heartbeat) |
| `/{id}/ready` | POST | Mark ready in lobby |
| `/{id}/generate-questions` | POST | AI generates 5 questions |
| `/{id}/submit-answers` | POST | Submit independent answers |
| `/{id}/ask-peer` | POST | Ask partner a question |
| `/{id}/answer-peer` | POST | Answer partner's question |
| `/{id}/request-hint` | POST | Get AI hint |
| `/{id}/evaluate` | POST | Final AI evaluation |
| `/{id}/cancel` | POST | Leave session |
| `/{id}/heartbeat` | POST | Keep-alive |

---

## 🎨 Frontend Architecture

### Page Structure

```
/app/learn                           → SubjectsPage
/app/learn/topics/:topicId          → TopicConceptsPage
/app/learn/concept/:conceptId       → ConceptLearnPage (7-stage tabs)
/app/challenge/find/:conceptId      → ChallengeFindPartnerPage
/app/challenge/lobby/:sessionId     → ChallengeLobbyPage
/app/challenge/session/:sessionId   → ChallengeSessionPage
/app/challenge/complete/:sessionId  → ChallengeCompletePage
```

---

### ConceptLearnPage (Master Page)

**Responsibilities:**
- Fetches progress on mount
- Dynamically derives tab lock states from `current_stage`
- Renders stage-specific UI components
- Handles stage transitions
- Polls progress during long AI operations

**Tab Locking Logic:**
```javascript
const canAccessStage = (stage) => {
  const stageOrder = ['lesson', 'checkpoint', 'explain', 'ai_verification', 'ask_ai', 'challenge', 'verified'];
  const currentIndex = stageOrder.indexOf(progress.currentStage);
  const targetIndex = stageOrder.indexOf(stage);
  
  if (stage === 'challenge') {
    return progress.challengeEligible;
  }
  
  return targetIndex <= currentIndex;
};
```

**Stage Components:**
1. **LessonStage** — display lesson, generate button, complete button
2. **CheckpointStage** — MCQs, results, reteach flow
3. **ExplainItStage** — textarea, submit, retry
4. **AIVerificationStage** — feedback display
5. **AskAIStage** — chat interface
6. **ChallengeStage** — CTA to find partner

---

### Challenge Flow Pages

**ChallengeFindPartnerPage:**
- Calls `/challenge/find` → creates/joins session
- Shows "Looking for partner..." with timer
- Polls every 4s for partner match
- Redirects to lobby when matched

**ChallengeLobbyPage:**
- Shows both participants
- Ready buttons for each
- Both ready → auto-advance to session

**ChallengeSessionPage:**
- **Questions phase:** Both answer 5 AI questions independently
- **Peer exchange:** Each asks 1 question, AI evaluates answers
- **Evaluating:** Spinner while AI computes result
- Auto-advances through phases via polling

**ChallengeCompletePage:**
- **Pass:** Trophy, "Concept Verified ✓", link to next concept
- **Fail:** Gaps shown, "Review and Try Again", triggers `/challenge-failed`

---

## ✅ Current Status

### ✅ Completed
- Full backend API (12 concept + 11 challenge endpoints)
- Database migrations written
- Stage authorization on all endpoints
- Checkpoint generation from saved lesson
- Reteaching loop after failure
- AI verification (concept-focused, not grammar)
- Challenge matching algorithm
- Lobby with both-ready requirement
- 5-question independent answering
- Peer exchange with AI evaluation
- Concept verification unlocks next concept
- Challenge failure resets to checkpoint (not permanent)
- Frontend pages and routing
- Dark theme UI
- Frontend builds with 0 errors
- Backend logic tested (11/11 passing)

### ⚠️ Pending
- Database migrations need to be run in Supabase
- Need to populate test curriculum data
- Manual end-to-end testing with live database
- Error recovery UX improvements (AI timeout → retry)
- Challenge history page not implemented

---

## 🚀 Setup Instructions

### Step 1: Run Database Migrations

Open your **Supabase SQL Editor** and execute:

**Migration 1:** `backend/migrations/001_concept_progress.sql`
**Migration 2:** `backend/migrations/002_challenge_sessions.sql`

Both use `CREATE TABLE IF NOT EXISTS` — safe to run multiple times.

**Verify:**
```sql
SELECT * FROM concept_progress LIMIT 1;
SELECT * FROM challenge_sessions LIMIT 1;
```

---

### Step 2: Configure Environment Variables

Update `backend/.env`:
```bash
GEMINI_API_KEY=your_actual_key_here
GEMINI_MODEL=gemini-1.5-flash
AI_REQUEST_TIMEOUT=60
```

Get your Gemini API key from: https://aistudio.google.com/app/apikey

---

### Step 3: Add Test Curriculum Data

Use the admin curriculum pages (`/app/admin/curriculum`) to:

1. **Create a Subject** (e.g., "Mathematics")
2. **Create a Topic** (e.g., "Algebra Basics")
3. **Create Concepts** with `key_points`:

Example concept:
```
Name: Linear Equations
Key Points: [
  "An equation is a mathematical statement showing two expressions are equal",
  "Linear equations have variables with exponent 1",
  "Solving means finding the value that makes the equation true",
  "Use inverse operations to isolate the variable"
]
```

---

### Step 4: Test the Complete Flow

**As Student 1:**
1. Navigate to `/app/learn`
2. Click subject → topic → first concept
3. Generate lesson → read → complete
4. Generate checkpoint → answer questions
5. Submit explanation → verify understanding
6. Click "Find Challenge Partner"

**As Student 2 (different browser/account):**
1. Navigate to the same concept
2. Complete lesson, checkpoint, explanation stages
3. Click "Find Challenge Partner"

**Both students:**
1. Wait for match → enter lobby
2. Both click "Ready"
3. Answer 5 questions independently
4. Peer exchange: ask each other questions
5. Wait for AI evaluation
6. See results → pass or fail

---

## 🔒 Security and Authorization

### Backend-Enforced Rules

1. **Stage progression is backend-authoritative** — frontend polls `/progress`, cannot skip
2. **Checkpoint requires saved lesson** — returns 400 if `lesson_content` is null
3. **Challenge requires eligibility flag** — not just `current_stage`
4. **Future stage access blocked** — returns 403 if attempting to skip stages
5. **Challenge failure is recoverable** — resets to checkpoint, not permanent block
6. **Next concept locks** — requires previous concept `verified = true`

### Frontend Lock States

```javascript
// Derived from backend progress, not local state
const lockStates = {
  lesson: progress.currentStage === 'lesson' || progress.verified,
  checkpoint: ['checkpoint', 'explain', 'ai_verification', 'ask_ai', 'challenge', 'verified'].includes(progress.currentStage),
  explain: ['explain', 'ai_verification', 'ask_ai', 'challenge', 'verified'].includes(progress.currentStage),
  ai_verification: ['ai_verification', 'ask_ai', 'challenge', 'verified'].includes(progress.currentStage),
  ask_ai: ['ask_ai', 'challenge', 'verified'].includes(progress.currentStage),
  challenge: progress.challengeEligible,
  verified: progress.verified
};
```

---

## 🤖 AI Integration

### Google Gemini API

**Model:** `gemini-1.5-flash` (configurable via env)

**Use Cases:**
1. **Lesson Generation** — personalized content based on concept key points
2. **Checkpoint Generation** — 3 MCQs from lesson content
3. **Reteaching Generation** — simpler explanation for failed points
4. **Explanation Verification** — concept understanding analysis
5. **Ask AI Q&A** — curriculum-bound assistance
6. **Challenge Question Generation** — 5 peer assessment questions
7. **Peer Answer Evaluation** — evaluate responses with hints
8. **Final Evaluation** — pass/fail decision with gap analysis

**Prompt Engineering:**
- All prompts include curriculum context and concept key points
- Checkpoint prompts explicitly reference saved lesson content
- Verification prompts ignore grammar/spelling, focus on concepts
- Challenge prompts ensure questions test deep understanding

**Service Layer:** `backend/app/services/ai_service.py`

---

## 📈 Future Enhancements

### High Priority
- [ ] Challenge history page with past sessions
- [ ] Better error recovery (AI timeout → retry button)
- [ ] Loading skeletons during AI generation
- [ ] Progress analytics dashboard

### Medium Priority
- [ ] XP integration with challenge completion
- [ ] Leaderboards for concept mastery
- [ ] Badges for verified concepts
- [ ] Study time tracking per concept

### Low Priority
- [ ] Student-created study guides
- [ ] Concept notes and highlights
- [ ] Challenge replays
- [ ] Export learning history

---

## 🎓 Pedagogical Design Principles

### Why 7 Stages?

1. **Lesson** — introduces content (passive learning)
2. **Checkpoint** — tests recognition (active recall)
3. **Explain It** — requires articulation (Feynman technique)
4. **AI Verification** — ensures understanding (formative assessment)
5. **Ask AI** — fills gaps (curiosity-driven learning)
6. **Challenge** — peer verification (social learning, accountability)
7. **Verified** — mastery confirmation (progression gating)

### Why Peer Verification?

- **Accountability** — harder to fake understanding with a peer
- **Social Learning** — teaching reinforces learning
- **Real-world Practice** — explaining to others is a critical skill
- **Motivation** — collaboration makes learning less isolating
- **Authenticity** — AI can be gamed, peers less so

### Why Reteaching Loops?

- **Mastery-based** — students don't proceed until ready
- **Adaptive** — system responds to individual struggles
- **Growth Mindset** — failure is learning, not punishment
- **Reduced Cognitive Load** — reteaching simplifies to focus on gaps

---

## 📝 Testing Checklist

### Backend Tests
- [x] Concept progress creation
- [x] Stage authorization
- [x] Checkpoint generation requires lesson
- [x] Reteaching triggers on failure
- [x] AI verification sets challenge_eligible
- [x] Challenge matching logic
- [x] Session state transitions
- [x] Both-ready requirement
- [x] Peer exchange validation
- [x] Final evaluation logic
- [x] Concept unlock after verification

### Frontend Tests (Manual)
- [ ] Lesson generation displays content
- [ ] Complete lesson advances to checkpoint
- [ ] Checkpoint shows 3 questions
- [ ] Submit checkpoint shows results
- [ ] Reteach flow generates new checkpoint
- [ ] Explanation submission triggers verification
- [ ] AI verification displays categorized feedback
- [ ] Ask AI chat works
- [ ] Challenge find shows waiting state
- [ ] Lobby requires both ready
- [ ] Questions phase prevents peeking
- [ ] Peer exchange allows Q&A
- [ ] Evaluation shows pass/fail
- [ ] Verified concept unlocks next
- [ ] Failed challenge resets to checkpoint

---

## 🛠️ Troubleshooting

### "Checkpoint generation failed: lesson_content is null"
**Cause:** Trying to generate checkpoint before completing lesson stage.
**Fix:** Ensure lesson was generated AND marked complete before accessing checkpoint.

### "Cannot access challenge: not eligible"
**Cause:** Trying to access challenge before passing AI verification.
**Fix:** Complete lesson → checkpoint → explain → AI verification stages first.

### "Challenge session cancelled"
**Cause:** Partner disconnected or session expired.
**Fix:** Normal behavior — return to find partner page. Not counted as failure.

### AI requests timing out
**Cause:** Gemini API delay or rate limiting.
**Fix:** Check `AI_REQUEST_TIMEOUT` in .env, verify API key is valid, check usage quotas.

### Next concept not unlocking
**Cause:** Previous concept not marked `verified = true`.
**Fix:** Complete full challenge flow until verified stage is reached.

---

## 📚 Related Documentation

- [Main README](../README.md) — Full project overview
- [Project Notes](./PROJECT_NOTES.md) — Development history
- [Study Room Enhancements](./STUDY_ROOM_ENHANCEMENTS.md) — Collaborative features
- [Chat Troubleshooting](./CHAT_TROUBLESHOOTING.md) — Messaging system

---

*Built as part of PeerUP — a peer-to-peer learning platform for FirstCommit 2026 Hackathon*
