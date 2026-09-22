# PeerUP Learning Room — corrected implementation

Implemented in this repo:

1. **Compulsory quiz scope is current-task only.** Quiz generation uses the selected Learning Plan task, its objective IDs, and the persisted teaching snapshot. Future Learning Plan tasks are explicitly listed as forbidden assessment scope.
2. **Quiz scope second-pass validator.** Generated questions are independently checked by an assessment-scope validator; if a question leaks future/untaught material, the quiz is regenerated with a stricter scope.
3. **Task completion is server-persistent.** Passing the compulsory quiz creates a persisted transition prompt but does not complete the task yet. Only the learner's explicit confirmation records `taskCompleted` and advances the server cursor. Learning state is derived from canonical session messages and returned as `learningState` (`currentTaskIndex`, completed task indexes, transition state). Refresh no longer resets completed tasks.
4. **Task transition is explicit.** After a passed compulsory quiz, UPRAD asks whether the explanation makes sense and whether the learner is ready for the next Learning Plan task. The UI provides explicit buttons for moving forward or asking for another explanation.
5. **Transition recovery is server-safe.** The next-task cursor is persisted when the learner confirms. If the browser closes before the next teaching request completes, the room can recover and teach the persisted current task on refresh.
6. **Practice completion is an AI/Tutor message.** The learner never appears as the sender of the practice-complete transition message.
7. **AI responses can be split into up to 3 natural chat messages.** Long responses prefer paragraph/sentence boundaries. The frontend reveals split chunks sequentially rather than dumping all bubbles simultaneously. Each chunk is persisted.
8. **Tutor voice toggle is visible and persistent.** The Learning Room has a clear `Tutor voice: On/Off` control. Speech uses browser TTS, prefers Microsoft/Google/natural English voices when available, uses a tutor-friendly rate, queues split messages, and does not replay old messages after refresh.
9. **Idle tutor nudges.** If the learner has not replied for about 45 seconds, UPRAD sends a gentle nudge. A second nudge follows after about 60 more seconds. It then stops. Nudges are persisted as AI messages and do not run during practice or while the AI is working.
10. **Reteach transition.** If the learner declines the next-task transition, the tutor stays on the current task and invokes adaptive reteaching rather than advancing.
11. **No new database migration is required.** Existing session-message JSON metadata stores the learning-room cursor and transition state.

Validation:
- Backend `python -m compileall -q backend/app` passes.
- Frontend `npm ci` could not complete in this environment because dependency installation exceeded the execution timeout, so the Vite production build still needs to be run in the user's normal development environment.
