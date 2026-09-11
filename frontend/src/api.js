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

// ── Core request helper ──────────────────────────────────────
async function request(path, { method = "GET", body, auth = false, timeoutMs = 20000 } = {}) {
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

  const data = await res.json().catch(() => ({}));
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
export function discoverUsers(mode, subject, level, availability, sort) {
  const params = new URLSearchParams();
  if (mode) params.set("mode", mode);
  if (subject && subject !== "All Subjects") params.set("subject", subject);
  if (level && level !== "All Levels") params.set("level", level);
  if (availability) params.set("availability", availability);
  if (sort) params.set("sort", sort);
  return request(`/api/users/discover?${params}`, { auth: true });
}

// ── Match requests ───────────────────────────────────────────────
export function sendMatchRequest(receiverId, mode, subject, message) {
  return request("/api/match/requests", {
    method: "POST",
    body: { receiverId, mode, subject, message: message || null },
    auth: true,
  });
}
export function listMatchRequests(direction = "incoming", status = "pending") {
  return request(`/api/match/requests?direction=${direction}&status=${status}`, { auth: true });
}
export function respondMatchRequest(reqId, action) {
  return request(`/api/match/requests/${reqId}`, {
    method: "PATCH",
    body: { action },
    auth: true,
  });
}
export function getPendingRequestCount() {
  return request("/api/match/requests/count", { auth: true });
}
export function getAcceptedMatchPartners() {
  return request("/api/match/accepted-partners", { auth: true });
}
export function getPendingStudyInvitationCount() {
  return request("/api/rooms/pending/count", { auth: true });
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

// ── Study Rooms ───────────────────────────────────────────────────────────
export function createRoom(conversationId, goal, role, subject) {
  return request("/api/rooms", { method: "POST", body: { conversationId, goal, role, subject }, auth: true });
}
export function getActiveRoom(conversationId) {
  return request(`/api/rooms/active?conversationId=${conversationId}`, { auth: true });
}
export function getRecentRooms() {
  return request("/api/rooms/recent", { auth: true });
}
export function deleteRoom(roomId) {
  return request(`/api/rooms/${roomId}`, { method: "DELETE", auth: true });
}
export function getRoom(roomId) {
  return request(`/api/rooms/${roomId}`, { auth: true });
}
export function joinRoom(roomId) {
  return request(`/api/rooms/${roomId}/join`, { method: "POST", auth: true });
}
export function endRoom(roomId, rating = null) {
  return request(`/api/rooms/${roomId}/end`, { method: "POST", body: { rating }, auth: true });
}
export function updateRoomNotes(roomId, notes) {
  return request(`/api/rooms/${roomId}/notes`, { method: "PATCH", body: { notes }, auth: true });
}
export function updateWhiteboard(roomId, strokes) {
  return request(`/api/rooms/${roomId}/whiteboard`, { method: "PATCH", body: { strokes }, auth: true });
}
export function addMaterialLink(roomId, name, url) {
  return request(`/api/rooms/${roomId}/materials/link`, { method: "POST", body: { name, url }, auth: true });
}
export function deleteMaterial(roomId, materialId) {
  return request(`/api/rooms/${roomId}/materials/${materialId}`, { method: "DELETE", auth: true });
}
export async function uploadRoomMaterial(roomId, file) {
  const form = new FormData();
  form.append("file", file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let res;
  try {
    res = await fetch(`${API_BASE}/api/rooms/${roomId}/materials/upload`, {
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
export function openRoomSocket(roomId, onMessage, onClose) {
  const wsBase = (API_BASE || "").replace(/^http/, "ws") || `ws://${window.location.host}`;
  const token = getToken();
  const ws = new WebSocket(`${wsBase}/api/rooms/ws/${roomId}?token=${token}`);
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore */ } };
  ws.onclose = onClose || (() => {});
  return ws;
}
export function getPendingStudyInvitations() {
  return request("/api/rooms/pending", { auth: true });
}
export function declineStudyInvitation(roomId) {
  return request(`/api/rooms/${roomId}/decline`, { method: "POST", auth: true });
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
