import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

// ── Study Room Join Notification ──────────────────────────────────
function StudyRoomJoinNotification({ conv, notification, onJoin, onCancel }) {
  return (
    <div className="chat-study-notification-overlay" onClick={onCancel}>
      <div className="chat-study-notification" onClick={e => e.stopPropagation()}>
        <div className="chat-study-notification-header">
          <h3>Study Room Invitation</h3>
        </div>
        <div className="chat-study-notification-body">
          <p>
            <strong>{conv.partner.displayName}</strong> is in the study room!
          </p>
          {notification.goal && (
            <div className="chat-study-notification-goal">
              <GoalIcon />
              <span>{notification.goal}</span>
            </div>
          )}
        </div>
        <div className="chat-study-notification-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onJoin}>
            Join Study Room
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2 21 23 12 2 3v7l15 2-15 2z"/>
  </svg>
);
const AttachIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>
);
const EmojiIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
);
const VoiceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const PhoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 6.29 6.29l.95-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const VideoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);
const DotsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
  </svg>
);
const GoalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="chat-clock-spin">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const TickIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);
const DoubleTickIcon = () => (
  <svg width="22" height="16" viewBox="0 0 26 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M2 7l4 4 8-8"/><path d="M10 7l4 4 8-8"/>
  </svg>
);
const FileDocIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const ExternalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);
const ReportIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
  </svg>
);
const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  // Compare by calendar date (midnight boundaries), not raw ms
  const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((nowMid - dMid) / 86400000);
  if (dayDiff === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function fileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileType(name) {
  if (!name) return "file";
  const ext = name.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg","bmp"].includes(ext)) return "image";
  if (["pdf"].includes(ext)) return "pdf";
  if (["mp4","mov","avi","webm","mkv"].includes(ext)) return "video";
  if (["mp3","ogg","wav","m4a"].includes(ext)) return "audio";
  return "file";
}

function Avatar({ url, name, size = 40, online = false }) {
  const initials = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div style={{ position: "relative", flexShrink: 0, display: "inline-flex" }}>
      {url
        ? <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} referrerPolicy="no-referrer" />
        : <div className="chat-avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials}</div>
      }
      {online && <span className="chat-online-dot" style={{ width: size * 0.28, height: size * 0.28, bottom: 1, right: 1 }} />}
    </div>
  );
}

// ── Coming Soon modal ─────────────────────────────────────────────
function ComingSoonModal({ feature, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="chat-coming-soon-modal" onClick={e => e.stopPropagation()}>
        <div className="chat-coming-soon-icon">
          {feature === "voice" ? "🎙️" : feature === "phone" ? "📞" : "🎥"}
        </div>
        <h2>{feature === "voice" ? "Voice Notes" : feature === "phone" ? "Voice Call" : "Video Call"}</h2>
        <p>This feature is coming soon. Stay tuned for updates!</p>
        <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

// ── Document Viewer Modal ─────────────────────────────────────────
function DocViewerModal({ url, name, onClose }) {
  const ext = (name?.split(".").pop() || "FILE").toUpperCase();

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="doc-viewer-overlay" onClick={onClose}>
      <div className="doc-viewer-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="doc-viewer-header">
          <button className="doc-viewer-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <span className="doc-viewer-title">{name || "Attachment"}</span>
          <a href={url} download={name} className="doc-viewer-download-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          </a>
        </div>

        {/* Preview area */}
        <div className="doc-viewer-body">
          <div className="doc-viewer-preview-box">
            {/* No-preview illustration */}
            <svg width="72" height="88" viewBox="0 0 72 88" fill="none" className="doc-viewer-file-svg">
              <rect x="4" y="4" width="52" height="64" rx="4" fill="#1e2a38" stroke="#2e3d52" strokeWidth="2"/>
              <path d="M44 4v16h16" stroke="#2e3d52" strokeWidth="2" fill="none"/>
              <rect x="14" y="28" width="32" height="3" rx="1.5" fill="#2e3d52"/>
              <rect x="14" y="36" width="24" height="3" rx="1.5" fill="#2e3d52"/>
              <rect x="14" y="44" width="28" height="3" rx="1.5" fill="#2e3d52"/>
              <rect x="20" y="14" width="14" height="10" rx="2" fill="#2e3d52"/>
              <path d="M20 22 l4-4 3 3 2-2 3 3v2H20z" fill="#3a4d63"/>
              <circle cx="28" cy="17" r="2" fill="#3a4d63"/>
            </svg>
            <p className="doc-viewer-no-preview">No preview available</p>
            <p className="doc-viewer-file-meta">{ext}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Image Lightbox ────────────────────────────────────────────────
function ImageLightbox({ url, name, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="img-lightbox-overlay" onClick={onClose}>
      <button className="img-lightbox-close" onClick={onClose} title="Close">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <a href={url} download={name} className="img-lightbox-download" title="Download" onClick={e => e.stopPropagation()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </a>
      <img
        src={url}
        alt={name || "Image"}
        className="img-lightbox-img"
        onClick={e => e.stopPropagation()}
      />
      {name && <div className="img-lightbox-caption">{name}</div>}
    </div>
  );
}

// ── File Viewer Panel ─────────────────────────────────────────────
function FileViewerPanel({ file, sender, onClose }) {
  const { url, name, type } = file;
  const isImage = type === "image";
  const isPdf = type === "pdf";
  const isVideo = type === "video";
  const fileExt = name?.split(".").pop().toUpperCase() || "FILE";

  return (
    <div className="chat-file-panel">
      <div className="chat-file-panel-header">
        <span className="chat-file-panel-title">Shared File</span>
        <button type="button" className="chat-icon-btn" onClick={onClose}><CloseIcon /></button>
      </div>

      {/* File info row */}
      <div className="chat-file-panel-info-row">
        <div className={`chat-file-icon-lg ${isImage ? "img" : isPdf ? "pdf" : ""}`}>
          {isImage ? "🖼️" : isPdf ? "📄" : isVideo ? "🎬" : "📎"}
        </div>
        <div className="chat-file-panel-meta">
          <div className="chat-file-panel-name">{name || "Attachment"}</div>
          <div className="chat-file-panel-ext">{fileExt}</div>
        </div>
        <a href={url} download={name} className="chat-icon-btn" title="Download">
          <DownloadIcon />
        </a>
      </div>

      {/* Preview */}
      <div className="chat-file-panel-preview">
        {isImage && (
          <img src={url} alt={name} className="chat-file-preview-img" />
        )}
        {isVideo && (
          <video src={url} controls className="chat-file-preview-video" />
        )}
        {!isImage && !isVideo && (
          <div className="chat-file-preview-placeholder">
            <div className="chat-file-preview-icon">
              {isPdf ? "📄" : "📎"}
            </div>
            <div className="chat-file-preview-label">{name}</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="chat-file-panel-actions">
        <a href={url} download={name} className="btn btn-primary btn-full" style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <DownloadIcon /> Download
        </a>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-full" style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <ExternalIcon /> Open in new tab
        </a>
      </div>

      {/* File metadata */}
      <div className="chat-file-panel-details">
        <h4>File Info</h4>
        <div className="chat-file-detail-row">
          <span className="chat-file-detail-label">File type</span>
          <span className="chat-file-detail-value">{fileExt}</span>
        </div>
        {sender && (
          <div className="chat-file-detail-row">
            <span className="chat-file-detail-label">Shared by</span>
            <span className="chat-file-detail-value">{sender}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── New chat modal ────────────────────────────────────────────────
const SUBJECTS = [
  "Mathematics","Physics","Chemistry","Biology","English","History",
  "Geography","Computer Science","Economics","Accounting","Literature",
  "French","Spanish","Music","Art","Physical Education","Further Math",
];

function NewChatModal({ onClose, onStart }) {
  const [query, setQuery] = useState("");
  const [connections, setConnections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.getAcceptedMatchPartners()
      .then(setConnections)
      .catch(() => setConnections([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = connections.filter(u =>
    !query.trim() || u.displayName.toLowerCase().includes(query.toLowerCase())
  );

  async function start() {
    if (!selected || !subject) return;
    setStarting(true);
    try {
      const conv = await api.startConversation(selected.partnerId, subject, goal.trim() || null);
      onStart(conv);
    } catch (err) {
      alert(err?.message || "Could not start chat.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="chat-new-modal" onClick={e => e.stopPropagation()}>
        <div className="chat-new-head">
          <h2>Start a new chat</h2>
          <button type="button" className="sc-close" onClick={onClose}><CloseIcon /></button>
        </div>
        {!selected ? (
          <>
            <p className="chat-new-hint">Choose a connection to chat with</p>
            <div className="chat-search-wrap">
              <SearchIcon />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter connections…" />
            </div>
            {loading && <p className="chat-new-hint">Loading connections…</p>}
            <div className="chat-user-list">
              {filtered.map(u => (
                <button key={u.partnerId} type="button" className="chat-user-item" onClick={() => setSelected(u)}>
                  <Avatar url={u.photoURL} name={u.displayName} size={38} />
                  <div style={{ flex: 1 }}>
                    <div className="chat-user-name">{u.displayName}</div>
                    <div className="chat-user-grade">{u.grade || u.subject}</div>
                  </div>
                  {u.isOnline && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green, #22c55e)", flexShrink: 0 }} />}
                </button>
              ))}
              {!loading && filtered.length === 0 && (
                <p className="chat-new-hint">
                  {connections.length === 0
                    ? "No connections yet. Accept a friend request to start chatting."
                    : "No connections match your filter."}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="chat-selected-user">
              <Avatar url={selected.photoURL} name={selected.displayName} size={42} />
              <div>
                <div className="chat-user-name">{selected.displayName}</div>
                <div className="chat-user-grade">{selected.grade || selected.subject}</div>
              </div>
              <button type="button" className="btn-ghost chat-deselect" onClick={() => setSelected(null)}>Change</button>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label>Subject <span style={{ color: "var(--danger)" }}>*</span></label>
              <select value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="">Select a subject…</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Session goal <span style={{ color: "var(--text-dim)" }}>(optional)</span></label>
              <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Finish Chapter 5 problems" />
            </div>
            <div className="chat-new-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={start} disabled={!subject || starting}>
                {starting ? "Starting…" : "Start chat"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Conversation list (left panel) ────────────────────────────────
function ConversationList({ convs, activeId, onSelect, onNew }) {
  const [search, setSearch] = useState("");
  const filtered = convs.filter(c =>
    c.partner.displayName.toLowerCase().includes(search.toLowerCase()) ||
    c.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="chat-left">
      <div className="chat-left-head">
        <h2 className="chat-left-title">Chats</h2>
        <button type="button" className="chat-new-btn" onClick={onNew} title="New chat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>

      <div className="chat-search-wrap chat-search-small">
        <SearchIcon />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats…" />
      </div>

      <div className="chat-conv-list">
        {filtered.length === 0 && (
          <div className="chat-empty-list">
            {convs.length === 0
              ? <><p>No chats yet.</p><p>Start a new one with the + button above.</p></>
              : <p>No results for "{search}"</p>}
          </div>
        )}
        {filtered.map(c => (
          <button key={c.id} type="button"
            className={`chat-conv-item ${c.id === activeId ? "active" : ""}`}
            onClick={() => onSelect(c)}>
            <div className="chat-conv-avatar">
              <Avatar url={c.partner.photoURL} name={c.partner.displayName} size={46} online={c.partner.isOnline} />
              {c.unread > 0 && <span className="chat-badge">{c.unread > 9 ? "9+" : c.unread}</span>}
            </div>
            <div className="chat-conv-info">
              <div className="chat-conv-top">
                <span className="chat-conv-name">{c.partner.displayName}</span>
                <span className="chat-conv-time">{fmtDate(c.lastMessageAt)}</span>
              </div>
              <div className="chat-conv-subject">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                {c.subject}
              </div>
              <div className="chat-conv-preview">
                {c.lastMessage
                  ? c.lastMessage.deleted
                    ? "🗑️ Message deleted"
                    : c.lastMessage.body || (c.lastMessage.attachmentUrl ? "📎 File" : "No messages yet")
                  : "No messages yet"}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Message Bubble ────────────────────────────────────────────────
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "🔥"];

// Mobile emoji picker — full-width bottom sheet
function MobileEmojiPicker({ msgId, mine, onReact, onClose }) {
  useEffect(() => {
    const handler = () => onClose();
    const t = setTimeout(() => document.addEventListener("touchstart", handler), 100);
    return () => { clearTimeout(t); document.removeEventListener("touchstart", handler); };
  }, [onClose]);

  return (
    <div className="chat-mobile-emoji-sheet" onClick={e => e.stopPropagation()}>
      <div className="chat-mobile-emoji-row">
        {REACTION_EMOJIS.map(e => (
          <button key={e} type="button" className="chat-mobile-emoji-btn"
            onTouchEnd={ev => { ev.preventDefault(); onReact(msgId, e); onClose(); }}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg, myId, senderName, senderUrl, onReport, onFileClick, onDelete, onReact, onReply }) {
  const mine = msg.senderId === myId;
  const [menu, setMenu] = useState(false);
  const [emojiBar, setEmojiBar] = useState(false);
  const [mobileEmoji, setMobileEmoji] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const fileType = getFileType(msg.attachmentName);
  const isImage = fileType === "image";

  const rowRef = useRef(null);
  const bubbleRef = useRef(null);

  // Close desktop menus when clicking outside
  useEffect(() => {
    if (!menu && !emojiBar) return;
    const handler = (e) => {
      if (rowRef.current && !rowRef.current.contains(e.target)) {
        setMenu(false); setEmojiBar(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menu, emojiBar]);

  // Double-tap to react (mobile)
  const lastTapRef = useRef(0);
  function handleTap(e) {
    if (window.matchMedia("(hover: none)").matches) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        e.preventDefault();
        setMobileEmoji(v => !v);
        setMenu(false);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  }

  // Swipe-right to reply (mobile)
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipingRef = useRef(false);
  const repliedRef = useRef(false);

  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipingRef.current = false;
    repliedRef.current = false;
  }

  function onTouchMove(e) {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (!swipingRef.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipingRef.current = true;
    }
    if (!swipingRef.current) return;
    if (dx > 0) {
      const capped = Math.min(Math.sqrt(dx * 18), 90);
      setSwipeX(capped);
      if (capped >= 60 && !repliedRef.current && navigator.vibrate) {
        navigator.vibrate(30);
      }
    }
  }

  function onTouchEnd() {
    if (swipeX >= 60 && !repliedRef.current) {
      repliedRef.current = true;
      onReply(msg);
    }
    setSwipeX(0);
    swipingRef.current = false;
  }

  // Deleted tombstone
  if (msg.deleted) {
    return (
      <div className={`chat-msg-row ${mine ? "mine" : "theirs"}`}>
        {!mine && <Avatar url={senderUrl} name={senderName} size={32} />}
        <div className="chat-bubble-wrap">
          <div className="chat-bubble chat-bubble-deleted">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            <span>This message was deleted</span>
          </div>
        </div>
      </div>
    );
  }

  const reactions = msg.reactions || {};
  const showReplyHint = swipeX >= 40;

  return (
    <div className={`chat-msg-row ${mine ? "mine" : "theirs"}`} ref={rowRef}>
      {!mine && <Avatar url={senderUrl} name={senderName} size={32} />}

      {showReplyHint && (
        <div className={`chat-swipe-reply-icon ${mine ? "mine" : ""}`}
          style={{ opacity: Math.min(1, (swipeX - 40) / 20) }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
          </svg>
        </div>
      )}

      <div className="chat-bubble-wrap" ref={bubbleRef}>
        <div
          className={`chat-bubble ${mine ? "bubble-mine" : "bubble-theirs"}`}
          style={swipeX > 0 ? { transform: `translateX(${mine ? -swipeX : swipeX}px)`, transition: "none" } : {}}
          onClick={handleTap}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {msg.replyToSnapshot && (
            <div className="chat-reply-quote">
              <div className="chat-reply-quote-bar" />
              <div className="chat-reply-quote-content">
                <span className="chat-reply-quote-name">{msg.replyToSenderName || senderName}</span>
                <span className="chat-reply-quote-text">{msg.replyToSnapshot}</span>
              </div>
            </div>
          )}

          {msg.attachmentUrl ? (
            isImage ? (
              <div className="chat-img-attachment"
                onClick={() => onFileClick({ url: msg.attachmentUrl, name: msg.attachmentName, type: "image" }, senderName)}>
                <img src={msg.attachmentUrl} alt={msg.attachmentName || "Image"} className="chat-bubble-img" />
                <div className="chat-img-overlay">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
              </div>
            ) : (
              <div className="chat-file-card"
                onClick={() => onFileClick({ url: msg.attachmentUrl, name: msg.attachmentName, type: fileType }, senderName)}>
                <div className={`chat-file-card-icon ${fileType}`}><FileDocIcon /></div>
                <div className="chat-file-card-info">
                  <div className="chat-file-card-name">{msg.attachmentName || "Attachment"}</div>
                  <div className="chat-file-card-ext">{(msg.attachmentName?.split(".").pop() || "FILE").toUpperCase()}</div>
                </div>
                <div className="chat-file-card-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </div>
            )
          ) : null}

          {msg.body ? <span className="chat-bubble-text">{msg.body}</span> : null}

          <div className="chat-bubble-meta">
            <span>{fmtTime(msg.createdAt)}</span>
            {mine && (
              msg.failed
                ? <span className="chat-tick sent" title="Failed">⚠️</span>
                : msg.pending
                  ? <span className="chat-tick pending"><ClockIcon /></span>
                  : <span className={`chat-tick ${msg.isRead ? "read" : msg.isDelivered ? "delivered" : "sent"}`}>
                      {msg.isRead || msg.isDelivered ? <DoubleTickIcon /> : <TickIcon />}
                    </span>
            )}
          </div>
        </div>

        {Object.keys(reactions).length > 0 && (
          <div className={`chat-reactions ${mine ? "mine" : ""}`}>
            {Object.entries(reactions).map(([emoji, users]) => (
              <button key={emoji} type="button"
                className={`chat-reaction-chip ${users.includes(myId) ? "reacted" : ""}`}
                onClick={() => onReact(msg.id, emoji)}>
                {emoji} <span>{users.length}</span>
              </button>
            ))}
          </div>
        )}

        <div className={`chat-msg-actions ${mine ? "mine" : "theirs"}`}>
          <button type="button" className="chat-action-btn" title="React"
            onClick={() => { setEmojiBar(v => !v); setMenu(false); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>
          {!mine && (
            <button type="button" className="chat-action-btn" title="Reply"
              onClick={() => { onReply(msg); setMenu(false); setEmojiBar(false); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
              </svg>
            </button>
          )}
          <button type="button" className="chat-action-btn" title="More"
            onClick={() => { setMenu(v => !v); setEmojiBar(false); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
            </svg>
          </button>
        </div>

        {emojiBar && (
          <div className={`chat-emoji-bar ${mine ? "mine" : ""}`}>
            {REACTION_EMOJIS.map(e => (
              <button key={e} type="button" className="chat-emoji-pick"
                onClick={() => { onReact(msg.id, e); setEmojiBar(false); }}>
                {e}
              </button>
            ))}
          </div>
        )}

        {menu && (
          <div className={`chat-msg-menu ${mine ? "mine" : ""}`}>
            {!mine && (
              <button type="button" onClick={() => { onReply(msg); setMenu(false); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                </svg>
                Reply
              </button>
            )}
            {mine && (
              <button type="button" className="danger" onClick={() => { onDelete(msg.id); setMenu(false); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Delete
              </button>
            )}
            {!mine && (
              <button type="button" className="danger" onClick={() => { onReport(msg.id); setMenu(false); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                  <line x1="4" y1="22" x2="4" y2="15"/>
                </svg>
                Report
              </button>
            )}
          </div>
        )}
      </div>

      {mobileEmoji && (
        <MobileEmojiPicker
          msgId={msg.id}
          mine={mine}
          onReact={onReact}
          onClose={() => setMobileEmoji(false)}
        />
      )}
    </div>
  );
}

// ── Chat Room ─────────────────────────────────────────────────────
function ChatRoom({ conv, myId, onGoalUpdate, onConvUpdate, onBack }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stagedFile, setStagedFile] = useState(null); // { file, url, name, type } — preview before send
  const [replyTo, setReplyTo] = useState(null);       // { id, body } — message being replied to
  const [typing, setTyping] = useState(false);
  const [editGoal, setEditGoal] = useState(false);
  const [goalText, setGoalText] = useState(conv.sessionGoal || "");
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [comingSoon, setComingSoon] = useState(null); // "phone"|"video"|"voice"
  const [viewerFile, setViewerFile] = useState(null); // { url, name, type, sender }
  const [lightbox, setLightbox] = useState(null);     // { url, name } for full-screen image
  const [docViewer, setDocViewer] = useState(null);   // { url, name } for doc modal
  const [pendingDelete, setPendingDelete] = useState(null); // msgId waiting for delete confirm
  const [showMenu, setShowMenu] = useState(false);    // Three-dot menu
  const [studyRoomNotification, setStudyRoomNotification] = useState(null); // { roomId, creatorId, goal }

  // (No longer using localStorage for hidden messages — server-side via hidden_for column)
  const bottomRef = useRef(null);
  const wsRef = useRef(null);
  const typingTimer = useRef(null);
  const fileRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessages([]);
    api.getMessages(conv.id).then(msgs => {
      if (!active) return;
      // Enrich with replyToSenderName using the loaded messages list
      const byId = Object.fromEntries(msgs.map(m => [m.id, m]));
      const enriched = msgs.map(m => {
        if (!m.replyToId) return m;
        const quoted = byId[m.replyToId];
        const senderName = quoted
          ? (quoted.senderId === myId ? "You" : partner.displayName)
          : null;
        return { ...m, replyToSenderName: senderName };
      });
      // Filter out messages the current user hid for themselves (server-side hidden_for)
      setMessages(enriched.filter(m => !m.hiddenForMe));
      setLoading(false);
    }).catch(() => setLoading(false));
    api.markRead(conv.id).catch(() => {});
    return () => { active = false; };
  }, [conv.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ws = api.openChatSocket(conv.id, handleWsMessage, () => {});
    wsRef.current = ws;
    return () => { ws.close(); wsRef.current = null; };
  }, [conv.id]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  function handleWsMessage(msg) {
    if (msg.type === "message") {
      setMessages(prev => {
        const temp = prev.find(m => m.pending && m.senderId === myId && m.body === msg.data.body);
        const withoutTemp = prev.filter(m =>
          !(m.pending && m.senderId === myId && m.body === msg.data.body)
        );
        if (withoutTemp.find(m => m.id === msg.data.id)) return withoutTemp;
        const realMsg = {
          ...msg.data,
          replyToSnapshot: msg.data.replyToSnapshot || temp?.replyToSnapshot || null,
          replyToSenderName: temp?.replyToSenderName || null,
        };
        return [...withoutTemp, realMsg];
      });
      api.markRead(conv.id).catch(() => {});
    } else if (msg.type === "typing") {
      if (msg.userId !== myId) {
        setTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 2000);
      }
    } else if (msg.type === "delivered") {
      // Partner came online — mark those messages as delivered (2 grey ticks)
      const ids = new Set(msg.msgIds || []);
      setMessages(prev => prev.map(m =>
        ids.has(m.id) ? { ...m, isDelivered: true } : m
      ));
    } else if (msg.type === "read") {
      // Partner opened the chat — all our messages get blue ticks
      setMessages(prev => prev.map(m =>
        m.senderId === myId ? { ...m, isDelivered: true, isRead: true } : m
      ));
    } else if (msg.type === "deleted") {
      setMessages(prev => prev.map(m =>
        m.id === msg.msgId ? { ...m, deleted: true, body: "", attachmentUrl: null } : m
      ));
    } else if (msg.type === "reaction") {
      setMessages(prev => prev.map(m =>
        m.id === msg.msgId ? { ...m, reactions: msg.reactions } : m
      ));
    } else if (msg.type === "study_room_created") {
      // Partner created a study room — show notification
      if (msg.creatorId !== myId) {
        setStudyRoomNotification({
          roomId: msg.roomId,
          creatorId: msg.creatorId,
          goal: msg.goal,
        });
      }
    }
  }

  // Open the delete confirmation modal
  function deleteMsg(msgId) {
    setPendingDelete(msgId);
  }

  // "Delete for me" — server-side: appends current user to hidden_for column
  async function deleteForMe(msgId) {
    setPendingDelete(null);
    setMessages(prev => prev.filter(m => m.id !== msgId));
    try {
      await api.deleteMessage(msgId, "me");
    } catch (err) {
      toast.error(err.message || "Couldn't delete message.");
      // Restore message list on failure
      api.getMessages(conv.id).then(msgs => {
        setMessages(msgs.filter(m => !m.hiddenForMe));
      }).catch(() => {});
    }
  }

  // "Delete for everyone" — soft-delete on server, broadcasts to partner
  async function deleteForEveryone(msgId) {
    setPendingDelete(null);
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, deleted: true, body: "", attachmentUrl: null } : m
    ));
    try {
      await api.deleteMessage(msgId, "everyone");
    } catch (err) {
      toast.error(err.message || "Couldn't delete message.");
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted: false } : m));
    }
  }

  async function reactMsg(msgId, emoji) {
    try {
      const { reactions } = await api.sendReaction(msgId, emoji);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m));
    } catch (err) {
      toast.error(err.message || "Couldn't add reaction.");
    }
  }

  function sendTyping() {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: "typing" }));
  }

  async function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body && !stagedFile) return;
    if (sending || uploading) return;

    // ── Staged file send ──
    if (stagedFile) {
      const sf = stagedFile;
      setStagedFile(null);
      if (sf.localUrl) URL.revokeObjectURL(sf.localUrl);

      // Show optimistic message immediately with clock
      const tempId = `pending-file-${Date.now()}`;
      const tempMsg = {
        id: tempId,
        senderId: myId,
        body,
        attachmentUrl: sf.localUrl,  // local blob url for instant preview
        attachmentName: sf.name,
        createdAt: new Date().toISOString(),
        isDelivered: false,
        isRead: false,
        pending: true,
      };
      setText("");
      setMessages(prev => [...prev, tempMsg]);

      setUploading(true);
      try {
        const { url, name } = await api.uploadAttachment(conv.id, sf.file);
        const msg = await api.sendMessageRest(conv.id, body, url, name);
        // Replace temp with real message
        setMessages(prev => prev
          .filter(m => m.id !== tempId)
          .concat(prev.find(m => m.id === msg.id) ? [] : [msg])
        );
        onConvUpdate(conv.id);
      } catch (err) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, failed: true } : m));
        toast.error(err.message || "File upload failed.");
      } finally { setUploading(false); }
      return;
    }

    // ── Text-only send ──
    setText("");
    setReplyTo(null);
    setSending(true);

    // Optimistic message: show instantly with pending state
    const tempId = `pending-${Date.now()}`;
    const tempMsg = {
      id: tempId,
      senderId: myId,
      body,
      createdAt: new Date().toISOString(),
      isDelivered: false,
      isRead: false,
      pending: true,
      replyToId: replyTo?.id || null,
      replyToSnapshot: replyTo?.body || null,
      replyToSenderName: replyTo?.senderName || null,
      reactions: {},
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "message", body, replyToId: replyTo?.id || null }));
      } else {
        const msg = await api.sendMessageRest(conv.id, body, null, null, replyTo?.id || null);
        setMessages(prev => prev
          .filter(m => m.id !== tempId)
          .concat(prev.find(m => m.id === msg.id) ? [] : [msg])
        );
      }
      onConvUpdate(conv.id);
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, failed: true } : m));
      toast.error(err.message);
    } finally { setSending(false); }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    // Stage the file for preview — upload happens on send
    const localUrl = URL.createObjectURL(file);
    const fileType = getFileType(file.name);
    setStagedFile({ file, localUrl, name: file.name, type: fileType });
  }

  function removeStagedFile() {
    if (stagedFile?.localUrl) URL.revokeObjectURL(stagedFile.localUrl);
    setStagedFile(null);
  }

  async function report(msgId) {
    try {
      await api.reportMessage(msgId);
      toast.success("Message reported. Our team will review it.");
    } catch { toast.error("Couldn't report the message."); }
  }

  async function saveGoal() {
    try {
      const res = await api.setGoal(conv.id, goalText);
      onGoalUpdate(conv.id, res.sessionGoal);
      setEditGoal(false);
    } catch { toast.error("Couldn't update session goal."); }
  }

  const partner = conv.partner;

  const groups = [];
  let lastDate = "";
  for (const m of messages) {
    const d = new Date(m.createdAt).toLocaleDateString();
    if (d !== lastDate) { groups.push({ type: "date", label: fmtDate(m.createdAt) }); lastDate = d; }
    groups.push({ type: "msg", msg: m });
  }

  return (
    <div className={`chat-right ${viewerFile ? "has-panel" : ""}`}>
      {/* ── Header ── */}
      <div className="chat-room-header">
        <button type="button" className="chat-back-btn" onClick={onBack} aria-label="Back to chats">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="chat-room-header-info">
          <Avatar url={partner.photoURL} name={partner.displayName} size={40} online={partner.isOnline} />
          <div className="chat-room-header-text">
            <div className="chat-room-title">{partner.displayName}</div>
            <div className="chat-room-sub">
              {partner.isOnline
                ? <><span className="chat-header-online-dot" />Online</>
                : <span style={{ color: "var(--text-dim)" }}>Offline</span>
              }
              <span className="chat-header-sep">·</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              {conv.subject}
            </div>
          </div>
        </div>

        {/* ── Session goal (middle section) ── */}
        <div className="chat-header-goal">
          <GoalIcon />
          {editGoal ? (
            <>
              <input className="chat-goal-input" value={goalText} onChange={e => setGoalText(e.target.value)} placeholder="Set a session goal…" autoFocus />
              <button type="button" className="chat-goal-save" onClick={saveGoal}>Save</button>
              <button type="button" className="chat-goal-cancel" onClick={() => { setEditGoal(false); setGoalText(conv.sessionGoal || ""); }}>Cancel</button>
            </>
          ) : (
            <>
              <span className="chat-header-goal-text">
                {conv.sessionGoal ? conv.sessionGoal : <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>No goal set</span>}
              </span>
              <button type="button" className="chat-goal-edit" onClick={() => setEditGoal(true)}>
                {conv.sessionGoal ? "Edit" : "Set goal"}
              </button>
            </>
          )}
        </div>

        <div className="chat-room-header-actions">
          <button type="button" className="chat-icon-btn" title="Voice call" onClick={() => setComingSoon("phone")}><PhoneIcon /></button>
          <button type="button" className="chat-icon-btn" title="Video call" onClick={() => setComingSoon("video")}><VideoIcon /></button>
          <div className="chat-menu-wrapper" ref={menuRef}>
            <button type="button" className="chat-icon-btn" title="More options" onClick={() => setShowMenu(!showMenu)}>
              <DotsIcon />
            </button>
            {showMenu && (
              <div className="chat-header-menu">
                <button type="button" onClick={() => { setShowMenu(false); setComingSoon("Group Chat"); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  Add to Group
                </button>
                <button type="button" onClick={() => { setShowMenu(false); setComingSoon("Block User"); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                  </svg>
                  Block User
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Pinned notice ── */}
      {!noticeDismissed && (
        <div className="chat-pinned-notice">
          <InfoIcon />
          <span>This is a study space. Keep it respectful and on-topic.</span>
          <button type="button" className="chat-notice-dismiss" onClick={() => setNoticeDismissed(true)}>
            <CloseIcon />
          </button>
        </div>
      )}

      {/* ── Chat body: messages + input (fixed mobile layout) ── */}
      <div className="chat-body">
        {/* ── Messages ── */}
        <div className="chat-messages">
        {loading && <div className="chat-msg-loading"><span className="discover-spinner" /> Loading messages…</div>}
        {groups.map((g, i) =>
          g.type === "date"
            ? <div key={`d${i}`} className="chat-date-divider"><span>{g.label}</span></div>
            : <MessageBubble
                key={g.msg.id}
                msg={g.msg}
                myId={myId}
                senderName={partner.displayName}
                senderUrl={partner.photoURL}
                onReport={report}
                onDelete={deleteMsg}
                onReact={reactMsg}
                onReply={(m) => setReplyTo({
                  id: m.id,
                  body: m.body || (m.attachmentName ? `📎 ${m.attachmentName}` : ""),
                  senderName: m.senderId === myId ? "You" : partner.displayName,
                })}
                onFileClick={(file, sender) => {
                  if (file.type === "image") {
                    setLightbox({ url: file.url, name: file.name });
                  } else {
                    setDocViewer({ url: file.url, name: file.name });
                  }
                }}
              />
        )}
        {typing && (
          <div className="chat-typing">
            <Avatar url={partner.photoURL} name={partner.displayName} size={28} />
            <div className="chat-typing-bubble">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <form className="chat-input-bar" onSubmit={send}>

        {/* ── Reply preview ── */}
        {replyTo && (
          <div className="chat-reply-bar">
            <div className="chat-reply-bar-accent" />
            <div className="chat-reply-bar-text">
              <span className="chat-reply-bar-label">Replying to {replyTo.senderName}</span>
              <span className="chat-reply-bar-body">{replyTo.body}</span>
            </div>
            <button type="button" className="chat-reply-bar-close" onClick={() => setReplyTo(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── Staged file preview ── */}
        {stagedFile && (
          <div className="chat-staged-file">
            <div className="chat-staged-file-icon">
              {stagedFile.type === "image"
                ? <img src={stagedFile.localUrl} alt={stagedFile.name} className="chat-staged-thumb" />
                : <FileDocIcon />
              }
            </div>
            <div className="chat-staged-file-info">
              <div className="chat-staged-file-name">{stagedFile.name}</div>
              <div className="chat-staged-file-ext">{stagedFile.name.split(".").pop().toUpperCase()}</div>
            </div>
            <button type="button" className="chat-staged-remove" onClick={removeStagedFile} title="Remove">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        <div className="chat-input-row">
          <div className="chat-input-pill">
            <button type="button" className="chat-tool-btn" title="Attach file" onClick={() => fileRef.current?.click()} disabled={uploading || !!stagedFile}>
              <AttachIcon />
            </button>
            <input ref={fileRef} type="file" hidden onChange={handleFile} accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" />

            <input
              className="chat-input"
              value={text}
              onChange={e => { setText(e.target.value); sendTyping(); }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={stagedFile ? "Add a caption…" : "Type a message..."}
              disabled={sending || uploading}
            />

            <button type="button" className="chat-tool-btn" title="Voice note" onClick={() => setComingSoon("voice")}>
              <VoiceIcon />
            </button>
          </div>

          <button type="submit" className="chat-send-btn" disabled={(!text.trim() && !stagedFile) || sending || uploading}>
            <SendIcon />
          </button>
        </div>
      </form>
      </div>
      {/* ── End of chat-body ── */}

      {/* ── Coming soon modal ── */}
      {comingSoon && <ComingSoonModal feature={comingSoon} onClose={() => setComingSoon(null)} />}

      {/* ── Study Room Join Notification ── */}
      {studyRoomNotification && (
        <StudyRoomJoinNotification
          conv={conv}
          notification={studyRoomNotification}
          onJoin={() => {
            setStudyRoomNotification(null);
            navigate(`/app/rooms?convId=${conv.id}`);
          }}
          onCancel={() => setStudyRoomNotification(null)}
        />
      )}

      {/* ── Image lightbox ── */}
      {lightbox && <ImageLightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />}

      {/* ── Document viewer modal ── */}
      {docViewer && <DocViewerModal url={docViewer.url} name={docViewer.name} onClose={() => setDocViewer(null)} />}

      {/* ── Delete confirmation modal ── */}
      {pendingDelete && (
        <div className="sc-overlay" onClick={() => setPendingDelete(null)}>
          <div className="delete-msg-modal" onClick={e => e.stopPropagation()}>
            <div className="delete-msg-modal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </div>
            <h3>Delete message?</h3>
            <p>Choose how you want to delete this message.</p>
            <div className="delete-msg-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-outline-danger" onClick={() => deleteForMe(pendingDelete)}>
                Delete for me
              </button>
              <button type="button" className="btn btn-danger" onClick={() => deleteForEveryone(pendingDelete)}>
                Delete for everyone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────
function EmptyState({ onNew }) {
  return (
    <div className="chat-empty-right">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" style={{ color: "var(--navy-line)" }}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <h3>Select a chat to start messaging</h3>
      <p>Your study conversations appear on the left. Start a new one anytime.</p>
      <button type="button" className="btn btn-primary" style={{ marginTop: 8, width: "auto", padding: "10px 24px" }} onClick={onNew}>
        New chat
      </button>
    </div>
  );
}

// ── Main Chat page ────────────────────────────────────────────────
export default function ChatPage() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const myId = parseInt(profile?.uid || user?.uid || "0", 10);

  const [convs, setConvs] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [viewerFile, setViewerFile] = useState(null);

  const loadConvs = useCallback(async () => {
    try {
      const data = await api.listConversations();
      setConvs(data);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  function handleSelect(conv) {
    setActiveConv(conv);
    setViewerFile(null);
    setConvs(prev => prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c));
  }

  function handleGoalUpdate(convId, goal) {
    setConvs(prev => prev.map(c => c.id === convId ? { ...c, sessionGoal: goal } : c));
    setActiveConv(prev => prev?.id === convId ? { ...prev, sessionGoal: goal } : prev);
  }

  function handleConvUpdate(convId) {
    api.listConversations().then(setConvs).catch(() => {});
  }

  async function handleStart(conv) {
    setShowNew(false);
    await loadConvs();
    setActiveConv(conv);
  }

  if (loading) {
    return (
      <div className="chat-shell">
        <div className="chat-loading"><span className="discover-spinner" /> Loading chats…</div>
      </div>
    );
  }

  return (
    <div className={`chat-shell${activeConv ? " chat-shell--has-active" : ""}`}>
      <ConversationList convs={convs} activeId={activeConv?.id} onSelect={handleSelect} onNew={() => setShowNew(true)} />

      {activeConv
        ? <ChatRoom
            key={activeConv.id}
            conv={activeConv}
            myId={myId}
            onGoalUpdate={handleGoalUpdate}
            onConvUpdate={handleConvUpdate}
            onBack={() => setActiveConv(null)}
          />
        : <EmptyState onNew={() => setShowNew(true)} />
      }

      {/* File viewer panel — sits outside ChatRoom so it can overlay the full right side */}
      {viewerFile && (
        <FileViewerPanel
          file={viewerFile}
          sender={viewerFile.sender}
          onClose={() => setViewerFile(null)}
        />
      )}

      {showNew && <NewChatModal onClose={() => setShowNew(false)} onStart={handleStart} />}
    </div>
  );
}
