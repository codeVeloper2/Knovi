/**
 * Shared utilities for Learning Session pages.
 */

/** Stage order used for the progress bar */
export const STAGES = ["learn", "explain", "verify", "practice", "challenge", "check"];

export const STAGE_LABELS = {
  learn:     "Learn",
  explain:   "Explain",
  verify:    "Verify",
  practice:  "Practice",
  challenge: "Challenge",
  check:     "Check",
  completed: "Done",
};

export const STAGE_ICONS = {
  learn:     "📖",
  explain:   "💬",
  verify:    "🤖",
  practice:  "✏️",
  challenge: "🏆",
  check:     "✅",
};

/** Map activity.type → route segment */
export const ACTIVITY_TYPE_TO_ROUTE = {
  learn:     "learn",
  explain:   "explain",
  practice:  "practice",
  challenge: "challenge",
  check:     "check",
};

/** Pick the first activity of a given type from the topic's activities list */
export function pickActivity(topic, type) {
  if (!topic?.activities) return null;
  return topic.activities.find((a) => a.type === type) ?? null;
}

/** Pick all questions for a given activity type (by matching activity) */
export function pickQuestions(topic, type) {
  if (!topic?.activities || !topic?.questions) return [];
  const act = pickActivity(topic, type);
  if (!act) {
    // Fall back to all questions if no activity matches
    return topic.questions.filter((q) => q.difficulty !== "advanced");
  }
  const q = topic.questions.filter((q) => q.activityId === act.id);
  return q.length ? q : topic.questions;
}

/** Estimate session duration in minutes */
export function estimateDuration(activitiesCount) {
  return Math.max(15, (activitiesCount ?? 0) * 7);
}

/** Format minutes as "X min" or "1 hr Xmin" */
export function fmtDuration(mins) {
  if (!mins) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Extract YouTube video ID from a URL */
export function ytVideoId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
