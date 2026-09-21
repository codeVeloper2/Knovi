# AI Quiz Battle — Backend Architecture

PeerUP AI Quiz Battle is a server-authoritative 1-v-1 assessment between two already-connected students. The MVP supports only one mode: an AI-generated multiple-choice battle anchored to a shared curriculum concept.

## Architecture

```text
Student A AI learning evidence ─┐
                                ├─> deterministic shared context
Student B AI learning evidence ─┘        │
                                          ▼
Curriculum concept + objective set -> Challenge Blueprint
                                          │
                                          ▼
                         Gemini question generation
                                          │
                                  Groq automatic fallback
                                          │
                                          ▼
                     Pydantic + curriculum + logic validation
                                          │
                                    (retry on failure)
                                          │
                                          ▼
                      frozen challenge_questions snapshots
                                          │
                                          ▼
                 database-locked battle state + WebSocket events
                                          │
                         answers -> reveal -> next question
                                          │
                                          ▼
                         final results + practice evidence
                                          │
                           TopicProgress / AI observations
```

The existing `app.services.ai_service.call_with_fallback()` remains the AI provider boundary. No separate provider client was introduced for challenges.

## Shared learning context

At challenge creation time the backend selects one deterministic, meaningful AI learning session per student for the requested concept. It prefers completed sessions, then the most recently updated session that has persisted teaching material.

The exact objective boundary is:

```text
student A objective IDs
∩ student B objective IDs
∩ topic curriculum objective IDs
```

An empty intersection rejects preparation. The backend never asks the model to invent curriculum coverage.

To make this possible, `ai_session_teaching.objective_ids` stores the objective IDs actually addressed by focused AI teaching. The orientation step does not count as objective coverage.

Only structured teaching snapshots, retrieval performance, misconceptions, weak areas, and session summaries are supplied to the challenge generator. Private profile notes and unrelated chat history are not sent.

## Challenge Blueprint

A deterministic backend blueprint contains:

- subject/topic/concept IDs
- question count
- shared curriculum objectives
- focus areas derived from persisted evidence
- deterministic easy/medium/hard distribution
- internal per-student evidence references

The blueprint is persisted in challenge metadata for auditability. It is not client-controlled.

## Question generation and validation

Question generation requires strict JSON and is parsed with Pydantic models.

Validation occurs in three layers:

1. Pydantic structure validation.
2. Deterministic validation: objective IDs, A-D options, duplicate detection, exact count, contiguous numbering, and difficulty distribution.
3. Independent AI validation for objective alignment, answer defensibility, ambiguity, scope, and material duplication.

A failed candidate is regenerated up to the configured retry limit. A battle never starts with an unvalidated question set.

## Frozen question snapshots

Once validated, each question is stored in `challenge_questions`. The historical battle never calls Gemini again to reconstruct a question. Refreshes, reconnects, state reads, and reviews use the persisted snapshot.

## State machine

```text
PENDING
  -> ACCEPTED
  -> PREPARING
  -> WAITING
  -> COUNTDOWN
  -> QUESTION_ACTIVE
  -> WAITING_FOR_OPPONENT
  -> QUESTION_REVEAL
  -> NEXT_QUESTION
  -> QUESTION_ACTIVE
  -> ...
  -> COMPLETED

PENDING -> DECLINED
PENDING/ACCEPTED/WAITING/active -> EXPIRED when stale
PREPARING -> ACCEPTED after a preparation timeout
```

State transitions are enforced by the service layer. The database row is locked (`SELECT ... FOR UPDATE`) for every participant-facing state mutation.

## Timing

Configured defaults:

| Setting | Default |
|---|---:|
| Questions | 5 |
| Minimum questions | 3 |
| Maximum questions | 10 |
| Countdown | 3s |
| Question window | 30s |
| Reveal window | 4s |
| Pending expiration | 24h |
| Accepted/preparation waiting | 30m |
| Battle lifetime | 2h |
| Disconnect grace | 90s |
| AI retries | 3 |

All timing values are backend configuration (`CHALLENGE_*` environment variables). Client timers are display-only.

## Answer privacy

Before reveal, a participant receives only whether their own answer has been submitted. Correctness, the correct answer, explanation, and opponent answer remain server-side.

After both answers exist or the question deadline is reached, the server emits `question_reveal` containing both answer states, correctness, explanation, and revealed scores.

Every participant/question has one answer row. Timeout is represented as `answer = NULL`, `timed_out = true`.

## Scoring

MVP scoring is one point for a correct answer and zero for an incorrect or timed-out answer. Response time is stored for analytics but does not affect points.

Final accuracy is:

```text
correct answers / revealed questions × 100
```

A completed battle contributes practice evidence to `topic_progress`; it does not directly set concept mastery or `understanding_score`.

## Disconnect / reconnect

WebSockets are managed by an in-process room manager only for event delivery. Database state remains authoritative.

Reconnect flow:

1. authenticate the access JWT
2. verify the user is a participant
3. reconnect to the room
4. return the current server state
5. continue the same frozen question set and timers

A temporary disconnect does not immediately forfeit the battle. After the configured grace period, the server lazily expires stale active battles.

The runtime scheduler is a convenience that wakes the server for countdown/deadline/reveal transitions. After a process restart, the next API/WS request reconstructs state from persisted timestamps.

## WebSocket endpoint

```text
GET /api/challenges/ws/{challenge_id}?token=<access-jwt>
```

Client events:

- `ready`
- `answer`
- `reconnect`
- `heartbeat`

Server events:

- `challenge_state`
- `player_ready`
- `countdown`
- `question_started`
- `answer_ack`
- `answer_submitted`
- `question_reveal`
- `next_question`
- `opponent_disconnected`
- `opponent_reconnected`
- `challenge_completed`
- `challenge_expired`
- `challenge_updated`
- `error`

## HTTP API

```text
POST /api/challenges
GET  /api/challenges
GET  /api/challenges/{id}
POST /api/challenges/{id}/accept
POST /api/challenges/{id}/decline
POST /api/challenges/{id}/prepare
POST /api/challenges/{id}/start
POST /api/challenges/{id}/questions/{question_id}/answer
GET  /api/challenges/{id}/results
GET  /api/challenges/{id}/review
```

All responses use Pydantic response contracts.

## Security model

Every challenge route verifies the authenticated user is either challenger or opponent. Additional checks ensure:

- only the intended opponent accepts/declines
- the challenge concept and curriculum hierarchy are valid
- both users have the selected learning sessions
- the source sessions belong to the correct users
- source sessions are tied to the requested concept/topic/subject
- answer options are valid and current
- the question is the active server question
- duplicate submissions are rejected
- clients cannot send `is_correct`, score, server time, or current question state
- WebSocket access is authenticated before the socket is registered

A PostgreSQL partial unique index prevents two simultaneous live battles for the same unordered student pair and concept.

## Database migration

This repository does not contain an Alembic environment or version table. Its actual documented deployment model is numbered SQL migrations executed against Supabase/PostgreSQL. `backend/migrations/002_ai_quiz_battle.sql` adds the challenge tables and the AI-teaching objective coverage column.

The migration uses PostgreSQL constraints and indexes for the same invariants enforced by the SQLAlchemy models.

## Observability

Structured log records are emitted for creation, acceptance, preparation, generation/validation failures, countdown/start, answers, reveal, disconnect/reconnect, completion, and expiration. Raw tokens, API keys, and private learner profile data are not logged.

## Tests

`backend/tests/test_challenge_backend.py` covers deterministic state transitions, objective intersection, validation, difficulty distribution, answer privacy, result scoring, and core model constraints. Full database/WebSocket integration tests should run in the deployment CI environment against PostgreSQL because the current execution environment has no database and cannot install external Python packages.
