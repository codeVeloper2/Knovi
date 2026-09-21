# AI Quiz Battle Backend — Operations Notes

## Cancellation

The `cancelled` state remains part of the server state machine, but the current MVP intentionally has **no user-facing cancellation HTTP endpoint**. No new cancellation API is introduced by this hardening pass.

## Connection semantics

Challenge eligibility currently relies on an existing PeerUP `Conversation` between the two students. `Conversation` is a private 1-to-1 study conversation; it is not a separate friendship/connection acceptance primitive. The backend does not invent a new friendship table or matching system. If PeerUP later adds an explicit connection primitive, challenge eligibility should migrate to that primitive.

## Timer restart safety

Challenge timestamps are persisted in PostgreSQL. Every participant-facing state read/reconnect rechecks those timestamps under a row lock before returning state, so a process restart does not reset a battle or its frozen questions.

The runtime wakeup tasks are process-local convenience tasks. The current MVP therefore assumes a single application instance for automatic WebSocket event delivery and timer wakeups. A later multi-worker deployment needs a shared event bus/pub/sub mechanism and a durable scheduler; this pass does not introduce a second runtime system.

## Progress integration

Completed battles use the existing `progress_service` and `topic_progress` model. A battle can update practice evidence (`practice_score`, `sessions_completed`, `needs_review`, `last_studied_at`) but does not overwrite `understanding_score`. Completed battles also use the existing activity/streak and badge services. No competing challenge-specific progress store is created.
