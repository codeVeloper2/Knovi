const API_BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "peerup_token";

// ── Token storage ────────────────────────────────────────────
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(token, remember = true) {
  clearToken();
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

// Safely parse JSON that may contain raw LaTeX backslash sequences
// (e.g. \times, \neq, \sqrt) which are invalid JSON escape characters.
async function safeJson(res) {
  const text = await res.text().catch(() => "{}");
  try {
    return JSON.parse(text);
  } catch {
    // Replace invalid backslash escapes: any \X that isn't a valid JSON
    // escape (\", \\, \/, \b, \f, \n, \r, \t, \uXXXX) → \\X
    const sanitized = text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    try { return JSON.parse(sanitized); } catch { return {}; }
  }
}

// ── Core request helper ──────────────────────────────────────
async function request(path, { method = "GET", body, auth = false, timeoutMs = 60000 } = {}) {
  const token = auth ? getToken() : "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("Connection timed out. Please check your internet and try again.");
    }
    throw new Error("Can't connect right now. Please check your internet connection.");
  }
  clearTimeout(timer);

  const data = await safeJson(res);
  if (!res.ok) {
    const detail = data.detail;
    let message;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail) && detail.length > 0) {
      // Pydantic 422: [{msg, loc, type, ...}]
      message = detail[0]?.msg || "Validation error";
    } else {
      message = data.message || "Something went wrong. Please try again.";
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Generic HTTP helpers (authenticated) ──────────────────────
export function get(path) {
  return request(path, { auth: true });
}
export function post(path, body = {}) {
  return request(path, { method: "POST", body, auth: true });
}
export function put(path, body = {}) {
  return request(path, { method: "PUT", body, auth: true });
}
export function patch(path, body = {}) {
  return request(path, { method: "PATCH", body, auth: true });
}
export function del(path, body = {}) {
  return request(path, { method: "DELETE", body, auth: true });
}

// ── Auth ─────────────────────────────────────────────────────
export function signup(email, password, fullName) {
  return request("/api/auth/signup", { method: "POST", body: { email, password, fullName } });
}
export function login(email, password) {
  return request("/api/auth/login", { method: "POST", body: { email, password } });
}
export function verifyEmailCode(email, code) {
  return request("/api/auth/verify-email", { method: "POST", body: { email, code } });
}
export function resendVerification(email) {
  return request("/api/auth/resend-verification", { method: "POST", body: { email } });
}
export function requestPasswordReset(email) {
  return request("/api/auth/forgot-password", { method: "POST", body: { email } });
}
export function verifyResetCode(email, code) {
  return request("/api/auth/verify-reset-code", { method: "POST", body: { email, code } });
}
export function resetPassword(email, code, password) {
  return request("/api/auth/reset-password", { method: "POST", body: { email, code, password } });
}
export function googleLogin(idToken) {
  return request("/api/auth/google", { method: "POST", body: { idToken } });
}

// ── Profile (authenticated) ──────────────────────────────────
export function fetchMe() {
  return request("/api/me", { auth: true });
}

// Multipart upload — can't use the JSON `request` helper.
export async function uploadAvatar(file) {
  const form = new FormData();
  form.append("file", file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(`${API_BASE}/api/me/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` }, // no Content-Type; browser sets multipart boundary
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(err.name === "AbortError" ? "Photo upload timed out. Please try again." : "Couldn't upload your photo. Please check your connection.");
  }
  clearTimeout(timer);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.detail || data.message || "Photo upload failed.");
    e.status = res.status;
    throw e;
  }
  return data; // { photoURL }
}
export function acceptAgreement() {
  return request("/api/me/agreement", { method: "POST", auth: true });
}
export function saveProfile(profile) {
  return request("/api/me/profile", { method: "PUT", body: profile, auth: true });
}
export function changePassword(currentPassword, newPassword) {
  return request("/api/me/change-password", { method: "POST", body: { currentPassword, newPassword }, auth: true });
}
export function deleteAccount(password) {
  return request("/api/me", { method: "DELETE", body: { password }, auth: true });
}
export function updatePrivacy(isPublic, allowDirectMessage) {
  return request("/api/me/privacy", {
    method: "PATCH", body: { isPublic, allowDirectMessage }, auth: true,
  });
}

// Fire-and-forget — never throw, never block the caller.
export function setOnline() {
  request("/api/me/presence", { method: "POST", auth: true }).catch(() => {});
}
export function setOffline() {
  // Use sendBeacon so this fires even when the tab is closing.
  const token = getToken();
  if (!token) return;
  const url = `${API_BASE}/api/me/presence`;
  // sendBeacon doesn't support custom headers; use a keepalive fetch instead.
  fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => {});
}

// ── Discover ─────────────────────────────────────────────────────

/**
 * General Discover — all profile-complete users with optional filters.
 * Backward-compatible: results now also include { relationship, learningOverlap, challengeEligible }.
 */
export function discoverUsers(level, availability, sort) {
  const params = new URLSearchParams();
  if (level && level !== "All Levels") params.set("level", level);
  if (availability) params.set("availability", availability);
  if (sort) params.set("sort", sort);
  return request(`/api/users/discover?${params}`, { auth: true });
}

/**
 * Learning Peers — students with meaningful learning overlap to the current user.
 * Returns up to 20 results sorted by overlap score.
 * Each result is flat: normal user fields plus relationship, learningOverlap,
 * and challengeEligible.
 *
 * @param {object} opts
 * @param {string} [opts.level]        - Grade filter e.g. "Year 10"
 * @param {string} [opts.availability] - "online" | "all"
 * @param {string} [opts.overlapType]  - "concept"|"topic"|"subject"|"all"
 */
export function discoverLearningPeers({ level, availability, overlapType } = {}) {
  const params = new URLSearchParams({ section: "learning_peers" });
  if (level && level !== "All Levels") params.set("level", level);
  if (availability && availability !== "all") params.set("availability", availability);
  if (overlapType) params.set("overlap_type", overlapType);
  return request(`/api/users/discover?${params}`, { auth: true });
}

// ── Chat ─────────────────────────────────────────────────────────
export function listConversations() {
  return request("/api/chat/conversations", { auth: true });
}
export function startConversation(partnerId, subject, sessionGoal = null) {
  return request("/api/chat/conversations", {
    method: "POST", body: { partnerId, subject, sessionGoal }, auth: true,
  });
}
export function getMessages(convId, beforeId = null, limit = 50) {
  const params = new URLSearchParams({ limit });
  if (beforeId) params.set("before_id", beforeId);
  return request(`/api/chat/conversations/${convId}/messages?${params}`, { auth: true });
}
export function sendMessageRest(convId, body, attachmentUrl = null, attachmentName = null, replyToId = null) {
  return request(`/api/chat/conversations/${convId}/messages`, {
    method: "POST", body: { body, attachmentUrl, attachmentName, replyToId }, auth: true,
  });
}
export function markRead(convId) {
  return request(`/api/chat/conversations/${convId}/read`, { method: "PATCH", auth: true });
}
export function setGoal(convId, goal) {
  return request(`/api/chat/conversations/${convId}/goal`, {
    method: "POST", body: { goal }, auth: true,
  });
}
export function reportMessage(msgId) {
  return request(`/api/chat/messages/${msgId}/report`, { method: "POST", auth: true });
}
export function deleteMessage(msgId, scope = "everyone") {
  return request(`/api/chat/messages/${msgId}?scope=${scope}`, { method: "DELETE", auth: true });
}
export function sendReaction(msgId, emoji) {
  return request(`/api/chat/messages/${msgId}/react`, {
    method: "POST", body: { emoji }, auth: true,
  });
}
export function searchChatUsers(q) {
  return request(`/api/chat/users/search?q=${encodeURIComponent(q)}`, { auth: true });
}
export async function uploadAttachment(convId, file) {
  const form = new FormData();
  form.append("file", file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let res;
  try {
    res = await fetch(`${API_BASE}/api/chat/conversations/${convId}/attachment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(err.name === "AbortError" ? "Upload timed out. Please try again." : "Couldn't upload. Please check your connection.");
  }
  clearTimeout(timer);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.detail || "Upload failed."); e.status = res.status; throw e; }
  return data;
}

/** Open an authenticated WebSocket to a conversation.
 *  Returns the WebSocket instance. Caller sets .onmessage / .onclose. */
export function openChatSocket(convId, onMessage, onClose) {
  const wsBase = (API_BASE || "").replace(/^http/, "ws") || `ws://${window.location.host}`;
  const token = getToken();
  const ws = new WebSocket(`${wsBase}/api/chat/ws/${convId}?token=${token}`);
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore */ } };
  ws.onclose = onClose || (() => {});
  return ws;
}

// ── Learn ─────────────────────────────────────────────────────────────────
export function getLearnHome() {
  return request("/api/learn/home", { auth: true });
}
export function listCourses({ subject, enrolled, saved, search } = {}) {
  const p = new URLSearchParams();
  if (subject && subject !== "All") p.set("subject", subject);
  if (enrolled) p.set("enrolled", "true");
  if (saved)    p.set("saved", "true");
  if (search)   p.set("search", search);
  return request(`/api/learn/courses?${p}`, { auth: true });
}
export function getCourse(courseId) {
  return request(`/api/learn/courses/${courseId}`, { auth: true });
}
export function enrollCourse(courseId) {
  return request(`/api/learn/courses/${courseId}/enroll`, { method: "POST", auth: true });
}
export function saveVideoProgress(lessonId, tutorialId, positionSeconds, durationSeconds) {
  return request("/api/learn/progress", {
    method: "POST",
    body: { lessonId, tutorialId, positionSeconds, durationSeconds },
    auth: true,
  });
}
export function listTutorials({ subject, sort, mine, search } = {}) {
  const p = new URLSearchParams();
  if (subject && subject !== "All") p.set("subject", subject);
  if (sort)   p.set("sort", sort);
  if (mine)   p.set("mine", "true");
  if (search) p.set("search", search);
  return request(`/api/learn/tutorials?${p}`, { auth: true });
}
export function getTutorial(tutorialId) {
  return request(`/api/learn/tutorials/${tutorialId}`, { auth: true });
}
export function createTutorial(body) {
  return request("/api/learn/tutorials", { method: "POST", body, auth: true });
}
export async function uploadLearnVideo(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/learn/upload/video`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Couldn't upload video. Please try again.");
  return data;
}
export async function uploadLearnThumbnail(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/learn/upload/thumbnail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Couldn't upload thumbnail. Please try again.");
  return data;
}
export function toggleSaved(contentType, contentId) {
  return request("/api/learn/saved", { method: "POST", body: { contentType, contentId }, auth: true });
}
export function getSaved() {
  return request("/api/learn/saved", { auth: true });
}
export function getLearnComments(contentType, contentId) {
  return request(`/api/learn/comments?contentType=${contentType}&contentId=${contentId}`, { auth: true });
}
export function postLearnComment(contentType, contentId, body, parentId = null) {
  return request("/api/learn/comments", { method: "POST", body: { contentType, contentId, body, parentId }, auth: true });
}
export function likeLearnComment(commentId) {
  return request(`/api/learn/comments/${commentId}/like`, { method: "POST", auth: true });
}
export function getMyLearning() {
  return request("/api/learn/my-learning", { auth: true });
}

// ── Progress ──────────────────────────────────────────────────────────────
export function getProgress() {
  return request("/api/progress", { auth: true });
}
export function getProgressBadges() {
  return request("/api/progress/badges", { auth: true });
}
export function getProgressCertificates() {
  return request("/api/progress/certificates", { auth: true });
}

// ── Notifications ─────────────────────────────────────────────────────────
export function getNotifications() {
  return request("/api/notifications", { auth: true });
}

// ── Curriculum Admin API ─────────────────────────────────────────────────────
// All calls require an admin JWT (the server enforces role=admin).

// Dashboard
export const adminGetDashboard  = ()        => request("/api/admin/dashboard",       { auth: true });

// Subjects
export const adminGetSubjects   = ()            => request("/api/admin/subjects",           { auth: true });
export const adminGetSubject    = (id)          => request(`/api/admin/subjects/${id}`,     { auth: true });
export const adminCreateSubject = (body)        => request("/api/admin/subjects",           { method: "POST", body, auth: true });
export const adminUpdateSubject = (id, body)    => request(`/api/admin/subjects/${id}`,     { method: "PATCH", body, auth: true });
export const adminDeleteSubject = (id)          => request(`/api/admin/subjects/${id}`,     { method: "DELETE", auth: true });

// Topics
export const adminGetTopics     = (subjectId)   =>
  request(`/api/admin/topics${subjectId ? `?subject_id=${subjectId}` : ""}`, { auth: true });
export const adminGetAllTopics  = ()            => request("/api/admin/topics",              { auth: true });
export const adminCreateTopic   = (body)        => request("/api/admin/topics",              { method: "POST", body, auth: true });
export const adminGetTopic      = (id)          => request(`/api/admin/topics/${id}`,        { auth: true });
export const adminUpdateTopic   = (id, body)    => request(`/api/admin/topics/${id}`,        { method: "PATCH", body, auth: true });
export const adminDeleteTopic   = (id)          => request(`/api/admin/topics/${id}`,        { method: "DELETE", auth: true });

// Child resources (objectives, concepts, misconceptions, activities, questions, resources)
const _child = (topicId, type) => `/api/admin/topics/${topicId}/${type}`;

export const adminGetObjectives   = (tid)           => request(_child(tid, "objectives"),    { auth: true });
export const adminAddObjective    = (tid, body)     => request(_child(tid, "objectives"),    { method: "POST", body, auth: true });
export const adminUpdateObjective = (tid, id, body) => request(`${_child(tid, "objectives")}/${id}`, { method: "PATCH", body, auth: true });
export const adminDeleteObjective = (tid, id)       => request(`${_child(tid, "objectives")}/${id}`, { method: "DELETE", auth: true });

export const adminGetConcepts     = (tid)           => request(_child(tid, "concepts"),      { auth: true });
export const adminAddConcept      = (tid, body)     => request(_child(tid, "concepts"),      { method: "POST", body, auth: true });
export const adminUpdateConcept   = (tid, id, body) => request(`${_child(tid, "concepts")}/${id}`, { method: "PATCH", body, auth: true });
export const adminDeleteConcept   = (tid, id)       => request(`${_child(tid, "concepts")}/${id}`, { method: "DELETE", auth: true });

export const adminGetMisconceptions   = (tid)           => request(_child(tid, "misconceptions"), { auth: true });
export const adminAddMisconception    = (tid, body)     => request(_child(tid, "misconceptions"), { method: "POST", body, auth: true });
export const adminUpdateMisconception = (tid, id, body) => request(`${_child(tid, "misconceptions")}/${id}`, { method: "PATCH", body, auth: true });
export const adminDeleteMisconception = (tid, id)       => request(`${_child(tid, "misconceptions")}/${id}`, { method: "DELETE", auth: true });

export const adminGetActivities   = (tid)           => request(_child(tid, "activities"),    { auth: true });
export const adminAddActivity     = (tid, body)     => request(_child(tid, "activities"),    { method: "POST", body, auth: true });
export const adminUpdateActivity  = (tid, id, body) => request(`${_child(tid, "activities")}/${id}`, { method: "PATCH", body, auth: true });
export const adminDeleteActivity  = (tid, id)       => request(`${_child(tid, "activities")}/${id}`, { method: "DELETE", auth: true });

export const adminGetQuestions    = (tid)           => request(_child(tid, "questions"),     { auth: true });
export const adminAddQuestion     = (tid, body)     => request(_child(tid, "questions"),     { method: "POST", body, auth: true });
export const adminUpdateQuestion  = (tid, id, body) => request(`${_child(tid, "questions")}/${id}`, { method: "PATCH", body, auth: true });
export const adminDeleteQuestion  = (tid, id)       => request(`${_child(tid, "questions")}/${id}`, { method: "DELETE", auth: true });

export const adminGetResources    = (tid)           => request(_child(tid, "resources"),     { auth: true });
export const adminAddResource     = (tid, body)     => request(_child(tid, "resources"),     { method: "POST", body, auth: true });
export const adminUpdateResource  = (tid, id, body) => request(`${_child(tid, "resources")}/${id}`, { method: "PATCH", body, auth: true });
export const adminDeleteResource  = (tid, id)       => request(`${_child(tid, "resources")}/${id}`, { method: "DELETE", auth: true });

// User role management
export const adminMakeAdmin   = (userId) => request(`/api/admin/users/${userId}/make-admin`,   { method: "POST", auth: true });
export const adminMakeStudent = (userId) => request(`/api/admin/users/${userId}/make-student`, { method: "POST", auth: true });

// ── Student Curriculum API (read-only) ───────────────────────────────────────
// Authenticated students reading curriculum content.

export const getSubjects           = (classLevel) => request(`/api/subjects${classLevel ? `?class_level=${encodeURIComponent(classLevel)}` : ""}`, { auth: true });
export const getSubject            = (id)       => request(`/api/subjects/${id}`,                    { auth: true });
export const getSubjectTopics      = (id)       => request(`/api/subjects/${id}/topics`,             { auth: true });
export const getTopics             = (subjectId) => request(`/api/subjects/${subjectId}/topics`, { auth: true });
export const getConcepts           = (topicId)   => request(`/api/topics/${topicId}/concepts`, { auth: true });
export const getConcept            = (conceptId) => request(`/api/concepts/${conceptId}`, { auth: true });
export const getTopic              = (id)       => request(`/api/topics/${id}`,                      { auth: true });
export const getTopicObjectives    = (id)       => request(`/api/topics/${id}/objectives`,           { auth: true });
export const getTopicConcepts      = (id)       => request(`/api/topics/${id}/concepts`,             { auth: true });
export const getTopicActivities    = (id)       => request(`/api/topics/${id}/activities`,           { auth: true });
export const getTopicQuestions     = (id)       => request(`/api/topics/${id}/questions`,            { auth: true });
export const getTopicResources     = (id)       => request(`/api/topics/${id}/resources`,            { auth: true });
export const getTopicLearningContent = (id)     => request(`/api/topics/${id}/learning-content`,     { auth: true });

// ── (Old solo/sync/concept-pipeline/challenge API calls removed in clean reset) ──
// New AI Learning Session API calls will be added here when the new system is built.


// ══════════════════════════════════════════════════════════════
// AI LEARNING SESSIONS
// ══════════════════════════════════════════════════════════════

export function createLearningSession(subjectId, topicId, conceptId, familiarity, intent, studentNote = null, customIntentText = null) {
  return post("/api/learning/sessions", {
    subject_id: subjectId,
    topic_id: topicId,
    concept_id: conceptId,
    student_familiarity: familiarity,
    student_note: studentNote,
    intent,
    custom_intent_text: customIntentText,
  });
}

// ── AI Learning (frontend-facing wrappers) ───────────────────────────────────

/** List sessions — optionally filtered by status / subjectId. */
export function getAISessions(opts = {}) {
  return listLearningSessions(opts);
}

/** Get a single session with server-side explanation hiding applied. */
export function getAISession(sessionId) {
  return getLearningSession(sessionId);
}

/**
 * Create a new AI learning session.
 * Maps frontend field names to the exact backend schema:
 *   subjectId         → subject_id
 *   topicId           → topic_id
 *   conceptId         → concept_id
 *   familiarity       → student_familiarity  (must be one of FAMILIARITY_OPTIONS)
 *   intent            → intent               (must be one of INTENT_OPTIONS)
 *   studentNote       → student_note
 *   customIntentText  → custom_intent_text
 */
export function createAISession({
  subjectId,
  topicId,
  conceptId,
  familiarity,
  intent = "teach_me",
  studentNote = null,
  customIntentText = null,
}) {
  return post("/api/learning/sessions", {
    subject_id:         subjectId,
    topic_id:           topicId,
    concept_id:         conceptId,
    student_familiarity: familiarity,
    intent,
    student_note:       studentNote || null,
    custom_intent_text: customIntentText || null,
  });
}

/** GET /learning/sessions/{id}/messages — filtered by server based on session state. */
export function getSessionMessages(sessionId) {
  return get(`/api/learning/sessions/${sessionId}/messages`);
}

/** Abandon a session (early exit, not a successful completion). */
export function abandonAISession(sessionId) {
  return abandonLearningSession(sessionId);
}

/**
 * Complete a session.
 * Guard: server requires session to be in retrieval/practice/reteaching first.
 * Use abandonAISession() for early exits.
 */
export function completeAISession(sessionId) {
  return completeLearningSession(sessionId);
}

/**
 * Request adaptive reteaching.
 * reason is optional — if omitted the backend uses 'student_struggled'.
 */
export function generateAdaptiveReteach(sessionId, reason = null) {
  return requestReteach(sessionId, reason);
}

export function getLearningSession(sessionId) {
  return get(`/api/learning/sessions/${sessionId}`);
}

export function listLearningSessions({ status, subjectId, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (subjectId) params.set("subject_id", subjectId);
  params.set("limit", limit);
  params.set("offset", offset);
  return get(`/api/learning/sessions?${params}`);
}

export function abandonLearningSession(sessionId) {
  return post(`/api/learning/sessions/${sessionId}/abandon`);
}

export function completeLearningSession(sessionId) {
  return post(`/api/learning/sessions/${sessionId}/complete`);
}

export function teachConcept(sessionId, taskIndex = null) {
  return post(`/api/learning/sessions/${sessionId}/teach`, taskIndex == null ? {} : { task_index: taskIndex });
}

export function prepareAISession(sessionId) {
  return post(`/api/learning/sessions/${sessionId}/prepare`);
}

export function sendStudentMessage(sessionId, content) {
  return post(`/api/learning/sessions/${sessionId}/message`, { content });
}

export function advanceLearningTask(sessionId) {
  return post(`/api/learning/sessions/${sessionId}/advance-task`);
}

export function recordLearningIdleNudge(sessionId, level = 1) {
  return post(`/api/learning/sessions/${sessionId}/idle-nudge?level=${level}`);
}

export function startStudyPeriod(sessionId, durationSeconds = 300, taskIndex = null) {
  return post(`/api/learning/sessions/${sessionId}/study/start`, {
    duration_seconds: durationSeconds,
    ...(taskIndex == null ? {} : { task_index: taskIndex }),
  });
}

export function finishStudyPeriod(sessionId, studyPeriodId) {
  return post(`/api/learning/sessions/${sessionId}/study/finish`, { study_period_id: studyPeriodId });
}

export function generateRetrievalQuestions(sessionId, count = 3, taskIndex = null) {
  const suffix = taskIndex == null ? "" : `&task_index=${taskIndex}`;
  return post(`/api/learning/sessions/${sessionId}/questions?count=${count}${suffix}`);
}

export function submitAnswer(sessionId, questionId, studentAnswer, responseTimeSeconds = null) {
  return post(`/api/learning/sessions/${sessionId}/answers`, {
    question_id: questionId,
    student_answer: studentAnswer,
    response_time_seconds: responseTimeSeconds,
  });
}

export function completePracticeRun(sessionId, questionIds) {
  return post(`/api/learning/sessions/${sessionId}/practice/complete`, questionIds);
}

export function requestReteach(sessionId, reason = null) {
  return post(`/api/learning/sessions/${sessionId}/reteach`, { reason });
}

export function generateSessionSummary(sessionId) {
  return post(`/api/learning/sessions/${sessionId}/summary`);
}

export function recordIntegrityEvent(sessionId, eventType, meta = null) {
  return post(`/api/learning/sessions/${sessionId}/integrity`, {
    event_type: eventType,
    meta,
  });
}

// ══════════════════════════════════════════════════════════════
// AI LEARNING PROFILE
// ══════════════════════════════════════════════════════════════

/** Fetch the current student's AI learning profile (creates empty one if new). */
export function getLearningProfile() {
  return request("/api/learning/profile", { auth: true });
}

/**
 * Create or update the student-reported learning profile.
 * @param {{ strengths, struggles, learningPreferences, learningBehavior, personalNote }} profile
 */
export function saveLearningProfile(profile) {
  return request("/api/learning/profile", {
    method: "PUT",
    body: profile,
    auth: true,
  });
}

// ── AI Quiz Battle ──────────────────────────────────────────────────────────
export function listChallenges(limit = 30) {
  return get(`/api/challenges?limit=${encodeURIComponent(limit)}`);
}

export function getChallenge(challengeId) {
  return get(`/api/challenges/${challengeId}`);
}

export function createChallenge({ opponentId, subjectId, topicId, conceptId, questionCount = 5 }) {
  return post("/api/challenges", {
    opponent_id: Number(opponentId),
    subject_id: Number(subjectId),
    topic_id: Number(topicId),
    concept_id: Number(conceptId),
    question_count: Number(questionCount),
  });
}

export function acceptChallenge(challengeId) {
  return post(`/api/challenges/${challengeId}/accept`);
}

export function declineChallenge(challengeId) {
  return post(`/api/challenges/${challengeId}/decline`);
}

export function prepareChallenge(challengeId) {
  return post(`/api/challenges/${challengeId}/prepare`);
}

export function startChallenge(challengeId) {
  return post(`/api/challenges/${challengeId}/start`);
}

export function answerChallenge(challengeId, questionId, answer) {
  return post(`/api/challenges/${challengeId}/questions/${questionId}/answer`, { answer });
}

export function getChallengeResults(challengeId) {
  return get(`/api/challenges/${challengeId}/results`);
}

export function getChallengeReview(challengeId) {
  return get(`/api/challenges/${challengeId}/review`);
}

export function openChallengeSocket(challengeId, handlers = {}) {
  const wsBase = (API_BASE || "").replace(/^http/, "ws") || `ws://${window.location.host}`;
  const token = getToken();
  const ws = new WebSocket(`${wsBase}/api/challenges/ws/${challengeId}?token=${encodeURIComponent(token)}`);
  ws.onopen = () => handlers.onOpen?.(ws);
  ws.onmessage = event => {
    try { handlers.onMessage?.(JSON.parse(event.data)); } catch { /* ignore malformed server events */ }
  };
  ws.onerror = event => handlers.onError?.(event);
  ws.onclose = event => handlers.onClose?.(event);
  return ws;
}
