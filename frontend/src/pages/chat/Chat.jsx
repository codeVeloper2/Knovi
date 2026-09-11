import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

// ─────────────────────────────────────────────────────────────────
// Shared mobile header — hamburger/notification/profile ONLY (no back button)
// Always shows Peer Up logo, never partner name
// ─────────────────────────────────────────────────────────────────
function ChatMobileHeader() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const name  = profile?.displayName || user?.displayName || "";
  const photo = profile?.photoURL    || user?.photoURL    || "";
  const initial = name.trim()[0]?.toUpperCase() || "?";

  return (
    <div className="chat-mob-header">
      <div className="chat-mob-header-left">
        <button className="chat-mob-menu-btn" aria-label="Open menu"
          onClick={() => window.dispatchEvent(new CustomEvent("peerup:open-nav"))}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6"  x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span className="chat-mob-logo">
          Peer<span className="chat-mob-accent">Up</span>
        </span>
      </div>
      <div className="chat-mob-header-right">
        <button className="chat-mob-bell" aria-label="Notifications"
          onClick={() => navigate("/app/settings/notifications")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
        <button className="chat-mob-avatar" onClick={() => navigate("/app/settings")} aria-label="Profile">
          {photo
            ? <img src={photo} alt={name} referrerPolicy="no-referrer" />
            : <span>{initial}</span>
          }
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────
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
const VoiceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const PhoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 6.29 6.29l.95-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const VideoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);
const DotsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
  </svg>
);
const GoalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const TickIcon = () => (
  <svg width="15" height="10" viewBox="0 0 15 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 5l4 4 9-8"/>
  </svg>
);
const DoubleTickIcon = ({ read }) => (
  <svg width="18" height="10" viewBox="0 0 18 10" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    stroke={read ? "#53bdeb" : "currentColor"}>
    <path d="M1 5l3.5 3.5 7-7"/>
    <path d="M7 5l3.5 3.5 7-7"/>
  </svg>
);
const FileDocIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDateLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((nowMid - dMid) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}
function fmtConvTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((nowMid - dMid) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function getFileType(name) {
  if (!name) return "file";
  const ext = name.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg","bmp"].includes(ext)) return "image";
  if (["pdf"].includes(ext)) return "pdf";
  if (["mp4","mov","avi","webm","mkv"].includes(ext)) return "video";
  return "file";
}

// ─────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────
function Avatar({ url, name, size = 40, online = false }) {
  const initial = (name || "?").trim()[0].toUpperCase();
  return (
    <div style={{ position: "relative", flexShrink: 0, display: "inline-flex" }}>
      {url
        ? <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} referrerPolicy="no-referrer" />
        : <div className="cav" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initial}</div>
      }
      {online && <span className="cav-dot" style={{ width: size * 0.3, height: size * 0.3 }} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Coming Soon Modal
// ─────────────────────────────────────────────────────────────────
function ComingSoonModal({ feature, onClose }) {
  return (
    <div className="c-overlay" onClick={onClose}>
      <div className="c-modal" onClick={e => e.stopPropagation()}>
        <div className="c-modal-icon">{feature === "voice" ? "🎙️" : feature === "phone" ? "📞" : "🎥"}</div>
        <h2>{feature === "voice" ? "Voice Notes" : feature === "phone" ? "Voice Call" : "Video Call"}</h2>
        <p>Coming soon. Stay tuned!</p>
        <button type="button" className="btn btn-primary" style={{ width:"100%", marginTop:8 }} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Image Lightbox
// ─────────────────────────────────────────────────────────────────
function ImageLightbox({ url, name, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="c-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <button className="lightbox-close" onClick={onClose}><CloseIcon /></button>
      <a href={url} download={name} className="lightbox-dl" onClick={e => e.stopPropagation()} title="Download">
        <DownloadIcon />
      </a>
      <img src={url} alt={name || "Image"} className="lightbox-img" onClick={e => e.stopPropagation()} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// New Chat Modal
// ─────────────────────────────────────────────────────────────────
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
      .then(setConnections).catch(() => setConnections([]))
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
      alert("Couldn't start the chat. Please try again.");
    } finally { setStarting(false); }
  }

  return (
    <div className="c-overlay" onClick={onClose}>
      <div className="c-modal c-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="c-modal-head">
          <h2>New Chat</h2>
          <button type="button" className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>
        {!selected ? (
          <>
            <div className="chat-search-wrap" style={{ margin: "8px 0" }}>
              <SearchIcon />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search connections…" />
            </div>
            {loading && <p className="c-hint">Loading…</p>}
            <div className="c-user-list">
              {filtered.map(u => (
                <button key={u.partnerId} type="button" className="c-user-item" onClick={() => setSelected(u)}>
                  <Avatar url={u.photoURL} name={u.displayName} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="c-user-name">{u.displayName}</div>
                    <div className="c-user-sub">{u.grade || u.subject || ""}</div>
                  </div>
                  {u.isOnline && <span className="c-online-dot" />}
                </button>
              ))}
              {!loading && filtered.length === 0 && (
                <p className="c-hint">{connections.length === 0 ? "No connections yet. Accept a friend request to chat." : "No match found."}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="c-selected">
              <Avatar url={selected.photoURL} name={selected.displayName} size={40} />
              <div style={{ flex:1, minWidth:0 }}>
                <div className="c-user-name">{selected.displayName}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Change</button>
            </div>
            <div className="field" style={{ marginTop:16 }}>
              <label>Subject <span style={{ color:"var(--danger)" }}>*</span></label>
              <select value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="">Select a subject…</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginTop:12 }}>
              <label>Session goal <span style={{ color:"var(--text-dim)" }}>(optional)</span></label>
              <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Finish Chapter 5 problems" />
            </div>
            <div className="c-modal-actions">
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

// ─────────────────────────────────────────────────────────────────
// Reaction emoji list
// ─────────────────────────────────────────────────────────────────
const EMOJIS = ["👍","❤️","😂","😮","🙏","🔥"];

// Portal-based emoji picker — renders into document.body so it is never clipped
function EmojiPickerPortal({ anchor, onPick, onClose }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pickerW = 272; // approx width
    const pickerH = 56;
    const vw = window.innerWidth;

    let left = rect.left;
    // If picker would overflow right edge, align to right of anchor
    if (left + pickerW > vw - 8) left = rect.right - pickerW;
    if (left < 8) left = 8;

    // Place above bubble if not enough space below
    let top = rect.bottom + 8;
    if (top + pickerH > window.innerHeight - 8) top = rect.top - pickerH - 8;

    setPos({ top, left });
  }, [anchor]);

  // Close on outside click / touch
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target) &&
          anchor && !anchor.contains(e.target)) {
        onClose();
      }
    }
    const t = setTimeout(() => {
      document.addEventListener("mousedown", handler);
      document.addEventListener("touchstart", handler);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [anchor, onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={ref}
      className="emoji-picker-portal"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      {EMOJIS.map(em => (
        <button
          key={em}
          type="button"
          className="emoji-picker-btn"
          onPointerDown={e => { e.preventDefault(); onPick(em); onClose(); }}
        >
          {em}
        </button>
      ))}
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────
// Message Bubble
// ─────────────────────────────────────────────────────────────────
function MessageBubble({ msg, myId, partnerName, partnerUrl, onDelete, onReport, onReact, onReply }) {
  const mine = msg.senderId === myId;
  const [showPicker, setShowPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [swipeX, setSwipeX] = useState(0);

  const bubbleRef = useRef(null);
  const rowRef = useRef(null);
  const lastTapRef = useRef(0);

  const fileType = getFileType(msg.attachmentName);
  const isImage = fileType === "image";

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const h = e => {
      if (rowRef.current && !rowRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMenu]);

  // Double-tap → emoji picker (mobile)
  function handlePointerUp(e) {
    if (e.pointerType !== "touch") return;
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      e.preventDefault();
      setShowPicker(true);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }

  // Long-press → context menu (mobile)
  const longPressTimer = useRef(null);
  function handlePointerDown(e) {
    if (e.pointerType !== "touch") return;
    longPressTimer.current = setTimeout(() => {
      setShowMenu(true);
      if (navigator.vibrate) navigator.vibrate(40);
    }, 500);
  }
  function handlePointerLeave() { clearTimeout(longPressTimer.current); }

  // Swipe-right to reply
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipingRef = useRef(false);
  const repliedRef = useRef(false);

  function onTouchStart(e) {
    clearTimeout(longPressTimer.current);
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipingRef.current = false;
    repliedRef.current = false;
  }
  function onTouchMove(e) {
    clearTimeout(longPressTimer.current);
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (!swipingRef.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipingRef.current = true;
    }
    if (!swipingRef.current || dx <= 0) return;
    const capped = Math.min(Math.sqrt(dx * 20), 80);
    setSwipeX(capped);
    if (capped >= 60 && !repliedRef.current && navigator.vibrate) navigator.vibrate(30);
  }
  function onTouchEnd() {
    clearTimeout(longPressTimer.current);
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
      <div className={`cmr ${mine ? "cmr--mine" : "cmr--theirs"}`}>
        {!mine && <Avatar url={partnerUrl} name={partnerName} size={30} />}
        <div className="cb cb--deleted">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
          <em>This message was deleted</em>
        </div>
      </div>
    );
  }

  const reactions = msg.reactions || {};
  const hasReactions = Object.keys(reactions).length > 0;

  return (
    <div className={`cmr ${mine ? "cmr--mine" : "cmr--theirs"}`} ref={rowRef}>
      {!mine && <Avatar url={partnerUrl} name={partnerName} size={30} />}

      {/* Swipe reply arrow */}
      {swipeX >= 30 && (
        <div className="cmr-reply-arrow" style={{ opacity: Math.min(1, (swipeX - 30) / 30) }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
          </svg>
        </div>
      )}

      <div className="cb-wrap">
        {/* Bubble */}
        <div
          ref={bubbleRef}
          className={`cb ${mine ? "cb--mine" : "cb--theirs"} ${hasReactions ? "cb--has-reactions" : ""}`}
          style={swipeX > 0 ? { transform: `translateX(${mine ? -swipeX : swipeX}px)`, transition: "none" } : {}}
          onPointerUp={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerLeave}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Reply quote */}
          {msg.replyToSnapshot && (
            <div className="cb-quote">
              <div className="cb-quote-bar" />
              <div className="cb-quote-body">
                <span className="cb-quote-name">{msg.replyToSenderName || partnerName}</span>
                <span className="cb-quote-text">{msg.replyToSnapshot}</span>
              </div>
            </div>
          )}

          {/* Image attachment */}
          {msg.attachmentUrl && isImage && (
            <img
              src={msg.attachmentUrl}
              alt={msg.attachmentName || "image"}
              className="cb-img"
            />
          )}

          {/* File attachment */}
          {msg.attachmentUrl && !isImage && (
            <div className="cb-file">
              <FileDocIcon />
              <div className="cb-file-info">
                <span className="cb-file-name">{msg.attachmentName || "File"}</span>
                <span className="cb-file-ext">{(msg.attachmentName?.split(".").pop() || "FILE").toUpperCase()}</span>
              </div>
            </div>
          )}

          {/* Text */}
          {msg.body ? <span className="cb-text">{msg.body}</span> : null}

          {/* Meta: time + ticks */}
          <div className="cb-meta">
            <span className="cb-time">{fmtTime(msg.createdAt)}</span>
            {mine && (
              msg.failed ? <span className="cb-tick" title="Message not sent">⚠️</span>
              : msg.pending ? <span className="cb-tick"><ClockIcon /></span>
              : <span className="cb-tick">
                  {msg.isRead || msg.isDelivered
                    ? <DoubleTickIcon read={msg.isRead} />
                    : <TickIcon />}
                </span>
            )}
          </div>
        </div>

        {/* Reaction chips — below bubble, outside it so they don't affect bubble width */}
        {hasReactions && (
          <div className={`cb-reactions ${mine ? "cb-reactions--mine" : ""}`}>
            {Object.entries(reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                className={`cb-reaction ${Array.isArray(users) && users.includes(myId) ? "cb-reaction--me" : ""}`}
                onPointerDown={e => { e.preventDefault(); onReact(msg.id, emoji); }}
              >
                {emoji} <span>{Array.isArray(users) ? users.length : users}</span>
              </button>
            ))}
          </div>
        )}

        {/* Desktop hover actions */}
        <div className={`cb-actions ${mine ? "cb-actions--mine" : ""}`}>
          <button type="button" className="cb-act-btn" title="React"
            onClick={() => setShowPicker(v => !v)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>
          <button type="button" className="cb-act-btn" title="Reply"
            onClick={() => onReply(msg)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>
          <button type="button" className="cb-act-btn" title="More"
            onClick={() => setShowMenu(v => !v)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
            </svg>
          </button>
        </div>

        {/* Context menu */}
        {showMenu && (
          <div className={`cb-menu ${mine ? "cb-menu--mine" : ""}`}>
            <button type="button" onClick={() => { onReply(msg); setShowMenu(false); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
              </svg>
              Reply
            </button>
            {mine && (
              <button type="button" className="danger" onClick={() => { onDelete(msg.id); setShowMenu(false); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Delete
              </button>
            )}
            {!mine && (
              <button type="button" className="danger" onClick={() => { onReport(msg.id); setShowMenu(false); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                  <line x1="4" y1="22" x2="4" y2="15"/>
                </svg>
                Report
              </button>
            )}
          </div>
        )}
      </div>

      {/* Emoji picker portal */}
      {showPicker && (
        <EmojiPickerPortal
          anchor={bubbleRef.current}
          onPick={em => onReact(msg.id, em)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Conversation List
// ─────────────────────────────────────────────────────────────────
function ConversationList({ convs, activeId, onSelect, onNew }) {
  const [search, setSearch] = useState("");
  const filtered = convs.filter(c =>
    c.partner.displayName.toLowerCase().includes(search.toLowerCase()) ||
    c.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="cl">
      {/* Mobile-only top header with hamburger + notification + profile */}
      <ChatMobileHeader />

      {/* Header */}
      <div className="cl-head">
        <h2 className="cl-title">Chats</h2>
        <button type="button" className="cl-new-btn" onClick={onNew} title="New chat">
          <PlusIcon />
        </button>
      </div>

      {/* Search */}
      <div className="cl-search">
        <SearchIcon />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search chats…"
        />
      </div>

      {/* List */}
      <div className="cl-list">
        {filtered.length === 0 && (
          <div className="cl-empty">
            {convs.length === 0
              ? <><p>No chats yet.</p><p>Tap + to start one.</p></>
              : <p>No results for "{search}"</p>}
          </div>
        )}
        {filtered.map(c => {
          const preview = c.lastMessage
            ? c.lastMessage.deleted ? "🗑️ Message deleted"
              : c.lastMessage.body || (c.lastMessage.attachmentUrl ? "📎 File" : "No messages yet")
            : "No messages yet";
          return (
            <button
              key={c.id}
              type="button"
              className={`cl-item ${c.id === activeId ? "cl-item--active" : ""}`}
              onClick={() => onSelect(c)}
            >
              <div className="cl-item-av">
                <Avatar url={c.partner.photoURL} name={c.partner.displayName} size={50} online={c.partner.isOnline} />
                {c.unread > 0 && <span className="cl-badge">{c.unread > 99 ? "99+" : c.unread}</span>}
              </div>
              <div className="cl-item-body">
                <div className="cl-item-top">
                  <span className="cl-item-name">{c.partner.displayName}</span>
                  <span className={`cl-item-time ${c.unread > 0 ? "cl-item-time--unread" : ""}`}>
                    {fmtConvTime(c.lastMessageAt)}
                  </span>
                </div>
                <div className="cl-item-bottom">
                  <span className="cl-item-preview">{preview}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Study Room Notification
// ─────────────────────────────────────────────────────────────────
function StudyRoomNotif({ conv, notif, onJoin, onCancel }) {
  return (
    <div className="c-overlay" onClick={onCancel}>
      <div className="c-modal" onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 8 }}>Study Room Invitation</h3>
        <p><strong>{conv.partner.displayName}</strong> is in the study room!</p>
        {notif.goal && <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: 6 }}>{notif.goal}</p>}
        <div className="c-modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={onJoin}>Join</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Chat Room
// ─────────────────────────────────────────────────────────────────
function ChatRoom({ conv, myId, onGoalUpdate, onConvUpdate, onBack }) {
  const toast = useToast();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState("");
  const [sending, setSending]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stagedFile, setStagedFile] = useState(null);
  const [replyTo, setReplyTo]   = useState(null);
  const [typing, setTyping]     = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [editGoal, setEditGoal] = useState(false);
  const [goalText, setGoalText] = useState(conv.sessionGoal || "");
  const [comingSoon, setComingSoon] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [studyRoomNotif, setStudyRoomNotif] = useState(null);

  const bottomRef   = useRef(null);
  const wsRef       = useRef(null);
  const typingTimer = useRef(null);
  const fileRef     = useRef(null);
  const headerMenuRef = useRef(null);

  const partner = conv.partner;

  // Load messages
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessages([]);
    api.getMessages(conv.id).then(msgs => {
      if (!active) return;
      const byId = Object.fromEntries(msgs.map(m => [m.id, m]));
      const enriched = msgs.map(m => {
        if (!m.replyToId) return m;
        const q = byId[m.replyToId];
        return { ...m, replyToSenderName: q ? (q.senderId === myId ? "You" : partner.displayName) : null };
      });
      setMessages(enriched.filter(m => !m.hiddenForMe));
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    api.markRead(conv.id).catch(() => {});
    return () => { active = false; };
  }, [conv.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // WebSocket
  useEffect(() => {
    const ws = api.openChatSocket(conv.id, handleWsMsg, () => {});
    wsRef.current = ws;
    return () => { ws.close(); wsRef.current = null; };
  }, [conv.id]);

  // Close header menu on outside click
  useEffect(() => {
    if (!showHeaderMenu) return;
    const h = e => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) setShowHeaderMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showHeaderMenu]);

  function handleWsMsg(msg) {
    if (msg.type === "message") {
      setMessages(prev => {
        const temp = prev.find(m => m.pending && m.senderId === myId && m.body === msg.data.body);
        const without = prev.filter(m => !(m.pending && m.senderId === myId && m.body === msg.data.body));
        if (without.find(m => m.id === msg.data.id)) return without;
        return [...without, {
          ...msg.data,
          replyToSnapshot: msg.data.replyToSnapshot || temp?.replyToSnapshot || null,
          replyToSenderName: temp?.replyToSenderName || null,
        }];
      });
      api.markRead(conv.id).catch(() => {});
    } else if (msg.type === "typing") {
      if (msg.userId !== myId) {
        setTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 2000);
      }
    } else if (msg.type === "delivered") {
      const ids = new Set(msg.msgIds || []);
      setMessages(prev => prev.map(m => ids.has(m.id) ? { ...m, isDelivered: true } : m));
    } else if (msg.type === "read") {
      setMessages(prev => prev.map(m => m.senderId === myId ? { ...m, isDelivered: true, isRead: true } : m));
    } else if (msg.type === "deleted") {
      setMessages(prev => prev.map(m => m.id === msg.msgId ? { ...m, deleted: true, body: "", attachmentUrl: null } : m));
    } else if (msg.type === "reaction") {
      setMessages(prev => prev.map(m => m.id === msg.msgId ? { ...m, reactions: msg.reactions } : m));
    } else if (msg.type === "study_room_created") {
      if (msg.creatorId !== myId) setStudyRoomNotif({ roomId: msg.roomId, creatorId: msg.creatorId, goal: msg.goal });
    }
  }

  function sendTyping() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing" }));
    }
  }

  async function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body && !stagedFile) return;
    if (sending || uploading) return;

    if (stagedFile) {
      const sf = stagedFile;
      setStagedFile(null);
      if (sf.localUrl) URL.revokeObjectURL(sf.localUrl);
      const tempId = `pending-file-${Date.now()}`;
      setText("");
      setMessages(prev => [...prev, {
        id: tempId, senderId: myId, body, attachmentUrl: sf.localUrl,
        attachmentName: sf.name, createdAt: new Date().toISOString(),
        isDelivered: false, isRead: false, pending: true,
      }]);
      setUploading(true);
      try {
        const { url, name } = await api.uploadAttachment(conv.id, sf.file);
        const real = await api.sendMessageRest(conv.id, body, url, name);
        setMessages(prev => prev.filter(m => m.id !== tempId).concat(prev.find(m => m.id === real.id) ? [] : [real]));
        onConvUpdate(conv.id);
      } catch (err) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, failed: true } : m));
        toast.error("Couldn't upload the file. Please try again.");
      } finally { setUploading(false); }
      return;
    }

    setText("");
    const currentReply = replyTo;
    setReplyTo(null);
    setSending(true);
    const tempId = `pending-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, senderId: myId, body,
      createdAt: new Date().toISOString(),
      isDelivered: false, isRead: false, pending: true,
      replyToId: currentReply?.id || null,
      replyToSnapshot: currentReply?.body || null,
      replyToSenderName: currentReply?.senderName || null,
      reactions: {},
    }]);

    try {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "message", body, replyToId: currentReply?.id || null }));
      } else {
        const real = await api.sendMessageRest(conv.id, body, null, null, currentReply?.id || null);
        setMessages(prev => prev.filter(m => m.id !== tempId).concat(prev.find(m => m.id === real.id) ? [] : [real]));
      }
      onConvUpdate(conv.id);
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, failed: true } : m));
      toast.error("Couldn't send your message. Please try again.");
    } finally { setSending(false); }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const localUrl = URL.createObjectURL(file);
    setStagedFile({ file, localUrl, name: file.name, type: getFileType(file.name) });
  }

  async function reactMsg(msgId, emoji) {
    try {
      const { reactions } = await api.sendReaction(msgId, emoji);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m));
    } catch (err) { toast.error("Couldn't add reaction. Please try again."); }
  }

  async function deleteForMe(msgId) {
    setPendingDelete(null);
    setMessages(prev => prev.filter(m => m.id !== msgId));
    try { await api.deleteMessage(msgId, "me"); }
    catch (err) { toast.error("Couldn't delete message. Please try again."); }
  }

  async function deleteForEveryone(msgId) {
    setPendingDelete(null);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted: true, body: "", attachmentUrl: null } : m));
    try { await api.deleteMessage(msgId, "everyone"); }
    catch (err) {
      toast.error("Couldn't delete message. Please try again.");
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted: false } : m));
    }
  }

  async function reportMsg(msgId) {
    try { await api.reportMessage(msgId); toast.success("Message reported."); }
    catch { toast.error("Couldn't report message. Please try again."); }
  }

  async function saveGoal() {
    try {
      const res = await api.setGoal(conv.id, goalText);
      onGoalUpdate(conv.id, res.sessionGoal);
      setEditGoal(false);
    } catch { toast.error("Couldn't update goal. Please try again."); }
  }

  // Group messages by date
  const groups = [];
  let lastDate = "";
  for (const m of messages) {
    const d = new Date(m.createdAt).toLocaleDateString();
    if (d !== lastDate) {
      groups.push({ type: "date", label: fmtDateLabel(m.createdAt) });
      lastDate = d;
    }
    groups.push({ type: "msg", msg: m });
  }

  return (
    <div className="cr">
      {/* Mobile-only top header — hamburger + notification + profile (ALWAYS shows) */}
      <ChatMobileHeader />

      {/* ── Chat header (desktop + mobile second header) — back + partner + video/voice/menu ── */}
      <div className="cr-header">
        <button type="button" className="cr-back" onClick={onBack} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>

        <Avatar url={partner.photoURL} name={partner.displayName} size={38} online={partner.isOnline} />

        <div className="cr-header-info">
          <div className="cr-header-name">{partner.displayName}</div>
          <div className="cr-header-sub">
            {partner.isOnline
              ? <><span className="cr-online-dot" />Online</>
              : <span style={{ color: "var(--text-dim)" }}>Offline</span>
            }
            <span className="cr-sep">·</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            {conv.subject}
          </div>
        </div>

        <div className="cr-header-actions">
          <button type="button" className="icon-btn" title="Voice call" onClick={() => setComingSoon("phone")}>
            <PhoneIcon />
          </button>
          <button type="button" className="icon-btn" title="Video call" onClick={() => setComingSoon("video")}>
            <VideoIcon />
          </button>
          <div ref={headerMenuRef} style={{ position: "relative" }}>
            <button type="button" className="icon-btn" onClick={() => setShowHeaderMenu(v => !v)}>
              <DotsIcon />
            </button>
            {showHeaderMenu && (
              <div className="cr-header-menu">
                <button type="button" onClick={() => { setEditGoal(true); setShowHeaderMenu(false); }}>
                  <GoalIcon /> {conv.sessionGoal ? "Edit goal" : "Set goal"}
                </button>
                <button type="button" onClick={() => { setShowHeaderMenu(false); setComingSoon("Group Chat"); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  Add to Group
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Study notice ── */}
      {!noticeDismissed && (
        <div className="cr-notice">
          <InfoIcon />
          <span>This is a study space. Keep it respectful and on-topic.</span>
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => setNoticeDismissed(true)}>
            <CloseIcon />
          </button>
        </div>
      )}

      {/* ── Goal edit bar ── */}
      {editGoal && (
        <div className="cr-goal-bar">
          <GoalIcon />
          <input
            className="cr-goal-input"
            value={goalText}
            onChange={e => setGoalText(e.target.value)}
            placeholder="Set a session goal…"
            autoFocus
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={saveGoal}>Save</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditGoal(false); setGoalText(conv.sessionGoal || ""); }}>Cancel</button>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="cr-messages">
        {loading && (
          <div className="cr-loading">
            <span className="discover-spinner" /> Loading messages…
          </div>
        )}
        {groups.map((g, i) =>
          g.type === "date"
            ? <div key={`d${i}`} className="cr-date-pill"><span>{g.label}</span></div>
            : <MessageBubble
                key={g.msg.id}
                msg={g.msg}
                myId={myId}
                partnerName={partner.displayName}
                partnerUrl={partner.photoURL}
                onDelete={id => setPendingDelete(id)}
                onReport={reportMsg}
                onReact={reactMsg}
                onReply={m => setReplyTo({
                  id: m.id,
                  body: m.body || (m.attachmentName ? `📎 ${m.attachmentName}` : ""),
                  senderName: m.senderId === myId ? "You" : partner.displayName,
                })}
              />
        )}
        {typing && (
          <div className="cr-typing">
            <Avatar url={partner.photoURL} name={partner.displayName} size={26} />
            <div className="cr-typing-bubble">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <form className="cr-input-bar" onSubmit={send}>
        {/* Reply preview */}
        {replyTo && (
          <div className="cr-reply-strip">
            <div className="cr-reply-strip-accent" />
            <div className="cr-reply-strip-body">
              <span className="cr-reply-strip-name">{replyTo.senderName}</span>
              <span className="cr-reply-strip-text">{replyTo.body}</span>
            </div>
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setReplyTo(null)}>
              <CloseIcon />
            </button>
          </div>
        )}

        {/* Staged file preview */}
        {stagedFile && (
          <div className="cr-staged">
            {stagedFile.type === "image"
              ? <img src={stagedFile.localUrl} alt={stagedFile.name} className="cr-staged-thumb" />
              : <FileDocIcon />
            }
            <span className="cr-staged-name">{stagedFile.name}</span>
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => {
              if (stagedFile.localUrl) URL.revokeObjectURL(stagedFile.localUrl);
              setStagedFile(null);
            }}>
              <CloseIcon />
            </button>
          </div>
        )}

        <div className="cr-input-row">
          {/* Attach */}
          <button type="button" className="cr-tool-btn" onClick={() => fileRef.current?.click()} disabled={uploading || !!stagedFile}>
            <AttachIcon />
          </button>
          <input ref={fileRef} type="file" hidden onChange={handleFile}
            accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" />

          {/* Text input */}
          <input
            className="cr-input"
            value={text}
            onChange={e => { setText(e.target.value); sendTyping(); }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={stagedFile ? "Add a caption…" : "Message"}
            disabled={sending || uploading}
          />

          {/* Voice / Send */}
          {text.trim() || stagedFile ? (
            <button type="submit" className="cr-send-btn" disabled={sending || uploading}>
              <SendIcon />
            </button>
          ) : (
            <button type="button" className="cr-send-btn" onClick={() => setComingSoon("voice")}>
              <VoiceIcon />
            </button>
          )}
        </div>
      </form>

      {/* ── Modals ── */}
      {comingSoon && <ComingSoonModal feature={comingSoon} onClose={() => setComingSoon(null)} />}

      {lightbox && <ImageLightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />}

      {studyRoomNotif && (
        <StudyRoomNotif
          conv={conv}
          notif={studyRoomNotif}
          onJoin={() => { setStudyRoomNotif(null); navigate(`/app/rooms?convId=${conv.id}`); }}
          onCancel={() => setStudyRoomNotif(null)}
        />
      )}

      {/* Delete modal */}
      {pendingDelete && (
        <div className="c-overlay" onClick={() => setPendingDelete(null)}>
          <div className="c-modal" onClick={e => e.stopPropagation()}>
            <div className="c-modal-icon">🗑️</div>
            <h3>Delete message?</h3>
            <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 6 }}>
              Choose how you want to delete.
            </p>
            <div className="c-modal-actions" style={{ marginTop: 20, flexDirection: "column", gap: 8 }}>
              <button type="button" className="btn btn-danger" onClick={() => deleteForEveryone(pendingDelete)}>
                Delete for everyone
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => deleteForMe(pendingDelete)}>
                Delete for me
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────
function EmptyState({ onNew }) {
  return (
    <div className="cr-empty">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" style={{ color: "var(--navy-line)" }}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <h3>Select a chat</h3>
      <p>Your study conversations appear on the left.</p>
      <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={onNew}>New chat</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Chat Page
// ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const myId = parseInt(profile?.uid || user?.uid || "0", 10);

  const [convs, setConvs]         = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [showNew, setShowNew]     = useState(false);

  const loadConvs = useCallback(async () => {
    try { const data = await api.listConversations(); setConvs(data); }
    catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  function handleSelect(conv) {
    setActiveConv(conv);
    setConvs(prev => prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c));
  }
  function handleGoalUpdate(convId, goal) {
    setConvs(prev => prev.map(c => c.id === convId ? { ...c, sessionGoal: goal } : c));
    setActiveConv(prev => prev?.id === convId ? { ...prev, sessionGoal: goal } : prev);
  }
  function handleConvUpdate() {
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
    <div className={`chat-shell${activeConv ? " chat-shell--active" : ""}`}>
      <ConversationList
        convs={convs}
        activeId={activeConv?.id}
        onSelect={handleSelect}
        onNew={() => setShowNew(true)}
      />

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

      {showNew && <NewChatModal onClose={() => setShowNew(false)} onStart={handleStart} />}
    </div>
  );
}
