# PeerUP Learning Room implementation

Implemented in `peerUP-main`:

1. Compulsory quiz is scoped to the current Learning Plan task and current teaching snapshot.
2. Future Learning Plan tasks are explicitly excluded from current-task quiz generation.
3. Current Learning Plan state (current task, completed tasks, transition waiting) persists through existing session-message metadata; no DB migration required.
4. After a passed compulsory quiz, the tutor restores the conversation and asks whether the learner is ready to move to the next task.
5. The learner can choose to continue or ask for the current task to be explained again.
6. Advancing to the next task is server-controlled and teaches that task before it becomes active.
7. Final-task advancement generates the existing session summary and completes the session.
8. AI chat responses can be returned/persisted as 1–3 natural message chunks.
9. Long teaching and reteaching messages are also split into at most 3 persisted messages.
10. Tutor read-aloud toggle uses browser speech synthesis, remembers the preference, and selects the best available English natural/Google/Microsoft-style voice when available.
11. Idle tutor nudges are persisted: first after ~45s, second after ~105s, then stop.
12. Idle nudges do not run during quizzes, study timer, completed sessions, or while the tutor is working/awaiting task transition.

Validation:
- Python backend source passed `python -m compileall -q backend/app`.
- Frontend dependency installation/build could not be completed in the container because `npm ci` exceeded the execution timeout.
- Full backend runtime tests remain blocked in this environment by the repository's existing missing `firebase_admin` dependency.
