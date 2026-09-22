# Mobile Learning Room rebuild

Updated `frontend/src/styles/ai-room.css` with a final mobile-first override layer.

## What changed
- Conversation is now the visual priority with readable 13.5–14px body text.
- Header is compact but touch-friendly, with clearer Plan/Tools controls.
- Progress/context bar is simplified for narrow screens.
- Message cards have larger tap targets, better spacing, and clearer user/tutor separation.
- Composer is treated as a persistent bottom input with safe-area support.
- Quick actions scroll horizontally instead of wrapping into a cramped row.
- Practice/quiz cards use mobile-friendly sizing and full-width submit actions.
- Plan and Tools become proper slide-in drawers with larger controls.
- Added safe-area and very-small-screen adjustments.
- The new rules are appended after the existing mobile rules so they take precedence without changing desktop behavior.

## Validation
The source was edited successfully. A local Vite production build could not be run in this environment because the uploaded project does not include installed npm dependencies (`vite` is not installed).
