import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import "./Chat.css";

// ─── SVG Icon primitives ────────────────────────────────────────────────────
const Icon = ({ children, size = 20, stroke = "currentColor", fill = "none", vb = "0 0 24 24" }) => (
  <svg width={size} height={size} viewBox={vb} fill={fill} stroke={stroke}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const SearchIcon   = p => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon>;
const PlusIcon     = p => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>;
const BackIcon     = p => <Icon {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></Icon>;
const PhoneIcon    = p => <Icon {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 11.2 18.85 19.5 19.5 0 0 1 5.15 12.8 19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.07 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.12L8.05 9.9a16 16 0 0 0 6.05 6.05l1.26-1.26a2 2 0 0 1 2.12-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92z"/></Icon>;
const VideoIcon    = p => <Icon {...p}><path d="m23 7-7 5 7 5V7Z"/><rect x="1" y="5" width="15" height="14" rx="2"/></Icon>;
const MoreIcon     = p => <Icon {...p} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></Icon>;
const AttachIcon   = p => <Icon {...p}><path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.6 5.7l-9 9a2 2 0 1 1-2.8-2.8l8.5-8.5"/></Icon>;
const ImageIcon    = p => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></Icon>;
const SmileIcon    = p => <Icon {...p}><circle cx="12" cy="12" r="9.5"/><path d="M8 14.5s1.6 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/></Icon>;
const SendIcon     = p => <Icon {...p} fill="currentColor" stroke="none"><path d="M2.5 3.2 21.7 12 2.5 20.8 4.8 13 15 12 4.8 11 2.5 3.2Z"/></Icon>;
const FileIcon     = p => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></Icon>;
const CloseIcon    = p => <Icon {...p}><path d="M18 6 6 18M6 6l12 12"/></Icon>;
const ReplyIcon    = p => <Icon {...p}><path d="M9 17 4 12l5-5M4 12h9a7 7 0 0 1 7 7v1"/></Icon>;
const CopyIcon     = p => <Icon {...p}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></Icon>;
const TrashIcon    = p => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3M6 7l1 14h10l1-14"/></Icon>;
const InfoIcon     = p => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></Icon>;
const CheckIcon    = p => <Icon {...p}><path d="m4 12 5 5L20 6"/></Icon>;
const ForwardIcon  = p => <Icon {...p}><path d="M15 17l5-5-5-5M20 12H9a7 7 0 0 0-7 7v1"/></Icon>;
const DownloadIcon = p => <Icon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></Icon>;
const GoalIcon     = p => <Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></Icon>;

const DoubleCheckIcon = ({ read, size = 16 }) => (
  <Icon size={size} stroke={read ? "var(--accent)" : "var(--text-dim)"}><path d="m2 12 4 4L14 8"/><path d="m8 12 4 4 9-9"/></Icon>
);

const EMOJIS = ["👍","❤️","😂","😮","🙏","🔥","✨"];

// ─── Utility helpers ─────────────────────────────────────────────────────────
function timeLabel(v) {
  if (!v) return "";
  return new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(v) {
  const d = new Date(v), n = new Date();
  const diff = Math.round((
    new Date(n.getFullYear(), n.getMonth(), n.getDate()) -
    new Date(d.getFullYear(), d.getMonth(), d.getDate())
  ) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}
function listTime(v) {
  if (!v) return "";
  const d = new Date(v), n = new Date();
  if (d.toDateString() === n.toDateString()) return timeLabel(v);
  const days = Math.round((
    new Date(n.getFullYear(), n.getMonth(), n.getDate()) -
    new Date(d.getFullYear(), d.getMonth(), d.getDate())
  ) / 86400000);
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function fileKind(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext)) return "image";
  if (["mp4","mov","webm","avi","mkv"].includes(ext)) return "video";
  return "file";
}

// ─── Initials Avatar (no external images) ───────────────────────────────────
const AVATAR_GRADIENTS = [
  ["#5b6ef5","#6366f1"], // blue family
  ["#34d399","#10b981"], // teal
  ["#60a5fa","#3b82f6"], // accent blue
  ["#a78bfa","#7c3aed"], // purple
  ["#f59e0b","#d97706"], // gold
  ["#f87171","#ef4444"], // red
  ["#38bdf8","#0ea5e9"], // sky
  ["#4ade80","#22c55e"], // green
];
function nameToGradient(name = "") {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}
function getInitials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || "P").toUpperCase();
}

function Avatar({ person, size = 48 }) {
  const name = person?.displayName || person?.name || "Peer";
  const [g1, g2] = nameToGradient(name);
  const fs = Math.max(11, size * 0.38);
  return (
    <span className="cu-avatar" style={{ width: size, height: size, minWidth: size }}>
      <span className="cu-avatar-inner" style={{
        width: size, height: size, fontSize: fs,
        background: `linear-gradient(135deg, ${g1}, ${g2})`,
      }}>
        {getInitials(name)}
      </span>
    </span>
  );
}

// ─── New Chat modal ──────────────────────────────────────────────────────────
const SUBJECTS = ["Mathematics","Physics","Chemistry","Biology","English","Computer Science","Economics","Accounting","History"];

function NewChatModal({ onClose, onStarted }) {
  const toast = useToast();
  const [query, setQuery]     = useState("");
  const [users, setUsers]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [subject, setSubject] = useState("");
  const [goal, setGoal]       = useState("");
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    if (!query.trim()) { setUsers([]); return; }
    let live = true;
    const t = setTimeout(() => {
      api.searchChatUsers(query.trim())
        .then(d => { if (live) setUsers(Array.isArray(d) ? d : []); })
        .catch(() => { if (live) setUsers([]); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  async function start() {
    if (!selected || !subject || busy) return;
    setBusy(true);
    try {
      const id = selected.partnerId || selected.id || selected.uid;
      const conv = await api.startConversation(id, subject, goal.trim() || null);
      onStarted(conv);
    } catch { toast.error("Couldn't start the chat."); }
    finally { setBusy(false); }
  }

  return (
    <div className="cu-backdrop" onClick={onClose}>
      <div className="cu-modal" onClick={e => e.stopPropagation()}>
        <div className="cu-modal-head">
          <div>
            <span className="cu-kicker">NEW CONVERSATION</span>
            <h2>Start a chat</h2>
          </div>
          <button className="cu-icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>

        {!selected ? (
          <>
            <label className="cu-search large">
              <SearchIcon />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a study partner" />
            </label>
            <div className="cu-user-results">
              {!query && <p className="cu-muted">Search by name to find a study partner.</p>}
              {users.map(u => (
                <button key={u.partnerId || u.id || u.uid} className="cu-user-result" onClick={() => setSelected(u)}>
                  <Avatar person={u} size={42} />
                  <span><b>{u.displayName || u.name}</b><small>{u.grade || u.subject || "PeerUP learner"}</small></span>
                </button>
              ))}
              {query && !users.length && <p className="cu-muted">No matching users found.</p>}
            </div>
          </>
        ) : (
          <>
            <div className="cu-selected-user">
              <Avatar person={selected} size={44} />
              <div>
                <b>{selected.displayName || selected.name}</b>
                <button onClick={() => setSelected(null)}>Change</button>
              </div>
            </div>
            <label className="cu-field">
              <span>Subject</span>
              <select value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="">Select a subject</option>
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="cu-field">
              <span>Session goal <em>optional</em></span>
              <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Finish Chapter 5 problems" />
            </label>
            <div className="cu-modal-actions">
              <button className="cu-btn-secondary" onClick={onClose}>Cancel</button>
              <button className="cu-btn-primary" disabled={!subject || busy} onClick={start}>
                {busy ? "Starting…" : "Start chat"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Conversation List ───────────────────────────────────────────────────────
function ConversationList({ conversations, activeId, myId, onSelect, onNew }) {
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState("all");
  const unreadCount = conversations.reduce((n, c) => n + (c.unread || 0), 0);

  const list = useMemo(() => conversations.filter(c => {
    const q = query.trim().toLowerCase();
    const match = !q
      || c.partner?.displayName?.toLowerCase().includes(q)
      || c.subject?.toLowerCase().includes(q)
      || c.lastMessage?.body?.toLowerCase().includes(q);
    return match && (filter === "all" || (c.unread || 0) > 0);
  }), [conversations, query, filter]);

  return (
    <aside className="cu-list-pane">
      <header className="cu-list-header">
        <div className="cu-brand">
          <div className="cu-logo">P</div>
          <div>
            <h1>Chats</h1>
            <span>Study together</span>
          </div>
        </div>
        <button className="cu-icon-btn" onClick={onNew} aria-label="New chat"><PlusIcon /></button>
      </header>

      <label className="cu-search">
        <SearchIcon />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search chats…" />
        {query && <button onClick={() => setQuery("")}><CloseIcon size={15} /></button>}
      </label>

      <div className="cu-tabs">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
        <button className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>
          Unread
          {unreadCount > 0 && <i className="cu-tab-badge">{unreadCount > 9 ? "9+" : unreadCount}</i>}
        </button>
      </div>

      <div className="cu-list-title">
        <span>{filter === "all" ? "All chats" : "Unread"}</span>
        <span>{list.length}</span>
      </div>

      <div className="cu-list">
        {list.length === 0 ? (
          <div className="cu-list-empty">
            <div>💬</div>
            <b>{conversations.length ? "No matches" : "Your inbox is empty"}</b>
            <p>{conversations.length
              ? "Try another search or filter."
              : "Start a conversation with a study partner."
            }</p>
            <button className="cu-btn-primary" onClick={onNew}>Start a chat</button>
          </div>
        ) : list.map(c => {
          const last = c.lastMessage;
          const mine = last?.senderId === myId;
          const preview = last?.deleted
            ? "Message deleted"
            : last?.body || (last?.attachmentUrl ? "Sent an attachment" : "Start your study conversation");
          return (
            <button key={c.id} className={`cu-row${activeId === c.id ? " active" : ""}`} onClick={() => onSelect(c)}>
              <Avatar person={c.partner} size={52} />
              <div className="cu-row-main">
                <div className="cu-row-top">
                  <b>{c.partner?.displayName || "Peer"}</b>
                  <time className={c.unread ? "unread" : ""}>{listTime(last?.createdAt)}</time>
                </div>
                <div className="cu-row-bottom">
                  <span>{mine ? "You: " : ""}{preview}</span>
                  {(c.unread || 0) > 0 && <i className="cu-badge">{c.unread > 9 ? "9+" : c.unread}</i>}
                </div>
                {c.subject && <small className="cu-row-subject">{c.subject}</small>}
                {c.sessionGoal && (
                  <div className="cu-row-goal"><GoalIcon size={12} /> {c.sessionGoal}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <button className="cu-new-fab" onClick={onNew}><PlusIcon size={18} /> <span>New chat</span></button>
    </aside>
  );
}

// ─── Long-press / Context modal ───────────────────────────────────────────────
function MessageContextModal({ msg, mine, onClose, onReply, onCopy, onDelete, onReact }) {
  const text = msg.body || (msg.attachmentName ? `📎 ${msg.attachmentName}` : "");

  return (
    <div className="cu-ctx-backdrop" onClick={onClose}>
      {/* Preview bubble */}
      <div className={`cu-ctx-preview ${mine ? "mine" : "theirs"}`}>
        {text && <p>{text.length > 120 ? text.slice(0, 120) + "…" : text}</p>}
        {msg.attachmentName && !msg.body && (
          <span className="cu-ctx-preview-file"><FileIcon size={14} /> {msg.attachmentName}</span>
        )}
      </div>

      {/* Sheet */}
      <div className="cu-ctx-sheet" onClick={e => e.stopPropagation()}>
        {/* Emoji row */}
        <div className="cu-ctx-emojis">
          {EMOJIS.map(e => (
            <button key={e} className="cu-ctx-emoji" onClick={() => { onReact(msg.id, e); onClose(); }}>{e}</button>
          ))}
        </div>
        <div className="cu-ctx-divider" />
        {/* Actions */}
        <button className="cu-ctx-action" onClick={() => { onReply(msg); onClose(); }}>
          <ReplyIcon size={18} /> Reply
        </button>
        <button className="cu-ctx-action" onClick={() => { onCopy(msg); onClose(); }}>
          <CopyIcon size={18} /> Copy
        </button>
        <button className="cu-ctx-action" onClick={() => { onClose(); }}>
          <ForwardIcon size={18} /> Forward
        </button>
        {mine && (
          <>
            <div className="cu-ctx-divider" />
            <button className="cu-ctx-action danger" onClick={() => { onDelete(msg.id); onClose(); }}>
              <TrashIcon size={18} /> Delete
            </button>
          </>
        )}
        <div className="cu-ctx-divider" />
        <button className="cu-ctx-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────
function DeleteConfirm({ msgId, onCancel, onDelete }) {
  return (
    <div className="cu-backdrop" onClick={onCancel}>
      <div className="cu-modal cu-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="cu-modal-icon">🗑️</div>
        <h3>Delete message?</h3>
        <p>Choose how you want to remove this message.</p>
        <button className="cu-btn-danger" onClick={() => onDelete(msgId, "everyone")}>Delete for everyone</button>
        <button className="cu-btn-secondary" onClick={() => onDelete(msgId, "me")}>Delete for me</button>
        <button className="cu-btn-text" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────
function Lightbox({ url, name, onClose }) {
  async function save() {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name || "image";
      a.click();
    } catch { /* silent */ }
  }
  return (
    <div className="cu-lightbox" onClick={onClose}>
      <div className="cu-lightbox-bar" onClick={e => e.stopPropagation()}>
        <button className="cu-icon-btn" onClick={onClose}><CloseIcon /></button>
        <span>{name || "Image"}</span>
        <button className="cu-icon-btn" onClick={save}><DownloadIcon /></button>
      </div>
      <img src={url} alt={name || "Image"} onClick={e => e.stopPropagation()} />
    </div>
  );
}

// ─── Pending media bar ────────────────────────────────────────────────────────
function StagedMedia({ staged, onClear }) {
  return (
    <div className="cu-staged">
      <div className="cu-staged-thumb">
        {staged.kind === "image"
          ? <img src={staged.url} alt="preview" />
          : staged.kind === "video"
          ? <video src={staged.url} muted />
          : <FileIcon size={22} />
        }
      </div>
      <div className="cu-staged-info">
        <b>{staged.file.name}</b>
        <span>Ready to send · {(staged.file.size / 1024).toFixed(0)} KB</span>
      </div>
      <button className="cu-icon-btn" onClick={onClear}><CloseIcon size={15} /></button>
    </div>
  );
}

// ─── Single message bubble ────────────────────────────────────────────────────
function Message({ msg, mine, partner, myId, onReply, onReact, onDelete, onCopy, onImage }) {
  const [ctx, setCtx]   = useState(false);
  const [swipe, setSwipe] = useState(0);
  const startX  = useRef(0);
  const longRef = useRef(null);
  const kind = fileKind(msg.attachmentName || "");

  // Touch: long-press → context modal; swipe-right → reply
  function onTouchStart(e) {
    startX.current = e.touches[0].clientX;
    longRef.current = setTimeout(() => setCtx(true), 520);
  }
  function onTouchMove(e) {
    clearTimeout(longRef.current);
    const dx = e.touches[0].clientX - startX.current;
    if (dx > 0) setSwipe(Math.min(dx, 72));
  }
  function onTouchEnd() {
    clearTimeout(longRef.current);
    if (swipe > 50) onReply(msg);
    setSwipe(0);
  }

  if (msg.deleted) {
    return (
      <div className={`cu-message ${mine ? "mine" : "theirs"}`}>
        {!mine && <Avatar person={partner} size={28} />}
        <div className="cu-deleted">
          <TrashIcon size={13} />
          <em>This message was deleted</em>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`cu-message ${mine ? "mine" : "theirs"}`}>
        {!mine && <Avatar person={partner} size={28} />}
        <div
          className="cu-message-stack"
          style={{ transform: swipe ? `translateX(${swipe}px)` : undefined }}
        >
          {swipe > 20 && <div className="cu-reply-hint"><ReplyIcon size={14} /></div>}

          <div
            className={`cu-bubble ${mine ? "out" : "in"}`}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onContextMenu={e => { e.preventDefault(); setCtx(true); }}
          >
            {/* Reply quote */}
            {msg.replyToSnapshot && (
              <div className="cu-quote">
                <b>{msg.replyToSenderName || partner?.displayName || "Reply"}</b>
                <span>{msg.replyToSnapshot}</span>
              </div>
            )}

            {/* Attachment rendering */}
            {msg.attachmentUrl && kind === "image" && (
              <img
                className="cu-msg-image"
                src={msg.attachmentUrl}
                alt={msg.attachmentName || "Image"}
                onClick={() => onImage(msg.attachmentUrl, msg.attachmentName)}
              />
            )}
            {msg.attachmentUrl && kind === "video" && (
              <video className="cu-msg-video" src={msg.attachmentUrl} controls playsInline />
            )}
            {msg.attachmentUrl && kind === "file" && (
              <div className="cu-file-chip">
                <span className="cu-file-chip-icon"><FileIcon size={18} /></span>
                <div>
                  <b>{msg.attachmentName || "File"}</b>
                  <small>{(msg.attachmentName || "FILE").split(".").pop().toUpperCase()}</small>
                </div>
              </div>
            )}

            {/* Body text */}
            {msg.body && <p>{msg.body}</p>}

            {/* Meta row */}
            <div className="cu-meta">
              <time>{timeLabel(msg.createdAt)}</time>
              {mine && (
                msg.failed    ? <span className="cu-meta-fail">⚠</span>
                : msg.pending ? <span className="cu-meta-clock">⌛</span>
                : msg.isRead || msg.isDelivered
                  ? <DoubleCheckIcon read={msg.isRead} />
                  : <CheckIcon size={13} />
              )}
            </div>
          </div>

          {/* Reactions */}
          {Object.keys(msg.reactions || {}).length > 0 && (
            <div className={`cu-reactions ${mine ? "right" : "left"}`}>
              {Object.entries(msg.reactions).map(([emoji, users]) => (
                <button key={emoji} onClick={() => onReact(msg.id, emoji)}>
                  {emoji}<span>{Array.isArray(users) ? users.length : users}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {ctx && (
        <MessageContextModal
          msg={msg}
          mine={mine}
          onClose={() => setCtx(false)}
          onReply={onReply}
          onCopy={onCopy}
          onDelete={id => { setCtx(false); onDelete(id); }}
          onReact={onReact}
        />
      )}
    </>
  );
}

// ─── Chat Room ────────────────────────────────────────────────────────────────
function ChatRoom({ conversation, myId, onBack, onRefresh }) {
  const toast = useToast();
  const [messages, setMessages]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [text, setText]             = useState("");
  const [reply, setReply]           = useState(null);
  const [staged, setStaged]         = useState(null);
  const [typing, setTyping]         = useState(false);
  const [goalEditing, setGoalEditing] = useState(false);
  const [goal, setGoal]             = useState(conversation.sessionGoal || "");
  const [notice, setNotice]         = useState(true);
  const [imageView, setImageView]   = useState(null);   // { url, name }
  const [deleteId, setDeleteId]     = useState(null);
  const [comingSoon, setComingSoon] = useState(null);

  const bottomRef  = useRef(null);
  const socketRef  = useRef(null);
  const typingRef  = useRef(null);
  const fileRef    = useRef(null);
  const imageRef   = useRef(null);
  const partner    = conversation.partner;

  // Load messages
  useEffect(() => {
    let live = true;
    setLoading(true);
    api.getMessages(conversation.id)
      .then(data => {
        if (!live) return;
        const byId = Object.fromEntries(data.map(m => [m.id, m]));
        setMessages(data
          .filter(m => !m.hiddenForMe)
          .map(m => ({
            ...m,
            replyToSenderName: m.replyToId && byId[m.replyToId]
              ? (byId[m.replyToId].senderId === myId ? "You" : partner?.displayName)
              : m.replyToSenderName,
          }))
        );
      })
      .catch(() => toast.error("Couldn't load messages."))
      .finally(() => live && setLoading(false));
    api.markRead(conversation.id).catch(() => {});
    return () => { live = false; };
  }, [conversation.id]);

  // WebSocket
  useEffect(() => {
    const ws = api.openChatSocket(conversation.id, event => {
      if (event.type === "message") {
        setMessages(prev => {
          const pending = prev.find(m => m.pending && m.senderId === myId && m.body === event.data.body);
          const without = prev.filter(m => !(m.pending && m.senderId === myId && m.body === event.data.body));
          if (without.some(m => m.id === event.data.id)) return without;
          return [...without, {
            ...event.data,
            replyToSnapshot: event.data.replyToSnapshot || pending?.replyToSnapshot,
            replyToSenderName: pending?.replyToSenderName,
          }];
        });
        api.markRead(conversation.id).catch(() => {});
      }
      if (event.type === "typing" && event.userId !== myId) {
        setTyping(true);
        clearTimeout(typingRef.current);
        typingRef.current = setTimeout(() => setTyping(false), 1800);
      }
      if (event.type === "delivered") {
        const ids = new Set(event.msgIds || []);
        setMessages(prev => prev.map(m => ids.has(m.id) ? { ...m, isDelivered: true } : m));
      }
      if (event.type === "read") {
        setMessages(prev => prev.map(m => m.senderId === myId ? { ...m, isRead: true, isDelivered: true } : m));
      }
      if (event.type === "deleted") {
        setMessages(prev => prev.map(m => m.id === event.msgId ? { ...m, deleted: true, body: "", attachmentUrl: null } : m));
      }
      if (event.type === "reaction") {
        setMessages(prev => prev.map(m => m.id === event.msgId ? { ...m, reactions: event.reactions } : m));
      }
    }, () => {});
    socketRef.current = ws;
    return () => { ws.close(); socketRef.current = null; };
  }, [conversation.id, myId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth" });
  }, [messages, typing, loading]);

  function typingNow(value) {
    setText(value);
    if (socketRef.current?.readyState === WebSocket.OPEN)
      socketRef.current.send(JSON.stringify({ type: "typing" }));
  }

  function pickFile(e, forceImage = false) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    setStaged({ file, url, kind: forceImage ? "image" : fileKind(file.name) });
  }

  function clearStaged() {
    if (staged?.url) URL.revokeObjectURL(staged.url);
    setStaged(null);
  }

  async function send(e, bodyOverride = null) {
    e?.preventDefault();
    const body = bodyOverride ?? text.trim();
    if (!body && !staged) return;
    const currentReply = reply;
    setText(""); setReply(null);

    if (staged) {
      const item = staged; setStaged(null);
      const tempId = `upload-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempId, senderId: myId, body,
        attachmentUrl: item.url, attachmentName: item.file.name,
        createdAt: new Date().toISOString(), pending: true,
      }]);
      try {
        const uploaded = await api.uploadAttachment(conversation.id, item.file);
        const real = await api.sendMessageRest(conversation.id, body, uploaded.url, uploaded.name, currentReply?.id || null);
        setMessages(prev => prev.filter(m => m.id !== tempId).concat(real));
        if (item.url) URL.revokeObjectURL(item.url);
        onRefresh(conversation.id);
      } catch {
        if (item.url) URL.revokeObjectURL(item.url);
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, failed: true } : m));
        toast.error("Couldn't upload that file.");
      }
      return;
    }

    const tempId = `msg-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, senderId: myId, body,
      createdAt: new Date().toISOString(), pending: true,
      replyToSnapshot: currentReply?.body,
      replyToSenderName: currentReply?.senderName,
    }]);
    try {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "message", body, replyToId: currentReply?.id || null }));
      } else {
        const real = await api.sendMessageRest(conversation.id, body, null, null, currentReply?.id || null);
        setMessages(prev => prev.filter(m => m.id !== tempId).concat(real));
      }
      onRefresh(conversation.id);
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, failed: true } : m));
      toast.error("Couldn't send your message.");
    }
  }

  async function react(id, emoji) {
    try {
      const result = await api.sendReaction(id, emoji);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions: result.reactions } : m));
    } catch { toast.error("Couldn't add reaction."); }
  }

  async function deleteMessage(id, scope) {
    setDeleteId(null);
    if (scope === "me") {
      setMessages(prev => prev.filter(m => m.id !== id));
    } else {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, deleted: true, body: "", attachmentUrl: null } : m));
    }
    try { await api.deleteMessage(id, scope); }
    catch { toast.error("Couldn't delete the message."); }
  }

  async function copy(msg) {
    const value = msg.body || (msg.attachmentName ? `📎 ${msg.attachmentName}` : "");
    if (!value) return;
    try { await navigator.clipboard.writeText(value); toast.success("Copied."); }
    catch { toast.error("Couldn't copy."); }
  }

  async function saveGoal() {
    try {
      const result = await api.setGoal(conversation.id, goal.trim());
      setGoal(result.sessionGoal || "");
      setGoalEditing(false);
      onRefresh();
    } catch { toast.error("Couldn't update the goal."); }
  }

  // Group messages by day
  const grouped = [];
  let prevDay = "";
  for (const msg of messages) {
    const key = new Date(msg.createdAt).toDateString();
    if (key !== prevDay) {
      grouped.push({ type: "day", id: `day-${key}`, label: dayLabel(msg.createdAt) });
      prevDay = key;
    }
    grouped.push({ type: "message", msg });
  }

  return (
    <section className="cu-room">
      {/* Header */}
      <header className="cu-room-header">
        <button className="cu-icon-btn cu-back" onClick={onBack} aria-label="Back"><BackIcon /></button>
        <Avatar person={partner} size={40} />
        <div className="cu-room-user">
          <b>{partner?.displayName || "Peer"}</b>
          <span>{typing ? "typing…" : conversation.subject || "Study chat"}</span>
        </div>
        <div className="cu-room-actions">
          <button className="cu-icon-btn" onClick={() => setComingSoon("Voice call")}><PhoneIcon /></button>
          <button className="cu-icon-btn" onClick={() => setComingSoon("Video call")}><VideoIcon /></button>
          <button className="cu-icon-btn" onClick={() => setComingSoon("Info")}><MoreIcon /></button>
        </div>
      </header>

      {/* Study notice */}
      {notice && (
        <div className="cu-notice">
          <InfoIcon size={14} />
          <span>Study space — keep it respectful and on-topic.</span>
          <button onClick={() => setNotice(false)}><CloseIcon size={13} /></button>
        </div>
      )}

      {/* Goal banner */}
      {goalEditing ? (
        <div className="cu-goal-editor">
          <GoalIcon size={16} />
          <input autoFocus value={goal} onChange={e => setGoal(e.target.value)} placeholder="Set a session goal" />
          <button onClick={saveGoal}>Save</button>
          <button onClick={() => { setGoalEditing(false); setGoal(conversation.sessionGoal || ""); }}>Cancel</button>
        </div>
      ) : conversation.sessionGoal && (
        <button className="cu-goal-banner" onClick={() => setGoalEditing(true)}>
          <GoalIcon size={14} />
          <span>{conversation.sessionGoal}</span>
        </button>
      )}

      {/* Message list */}
      <div className="cu-messages">
        {loading ? (
          <div className="cu-loading-dots"><span /><span /><span /></div>
        ) : grouped.map(g =>
          g.type === "day"
            ? <div className="cu-day" key={g.id}><span>{g.label}</span></div>
            : (
              <Message
                key={g.msg.id}
                msg={g.msg}
                mine={g.msg.senderId === myId}
                partner={partner}
                myId={myId}
                onReply={m => setReply({
                  id: m.id,
                  body: m.body || (m.attachmentName ? `📎 ${m.attachmentName}` : "Attachment"),
                  senderName: m.senderId === myId ? "You" : partner?.displayName,
                })}
                onReact={react}
                onDelete={id => setDeleteId(id)}
                onCopy={copy}
                onImage={(url, name) => setImageView({ url, name })}
              />
            )
        )}
        {typing && (
          <div className="cu-typing">
            <Avatar person={partner} size={26} />
            <span className="cu-typing-dots"><i /><i /><i /></span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form className="cu-composer" onSubmit={send}>
        {reply && (
          <div className="cu-reply-bar">
            <div>
              <b>{reply.senderName}</b>
              <span>{reply.body}</span>
            </div>
            <button type="button" onClick={() => setReply(null)}><CloseIcon size={14} /></button>
          </div>
        )}
        {staged && <StagedMedia staged={staged} onClear={clearStaged} />}

        <div className="cu-composer-row">
          <button type="button" className="cu-composer-btn" onClick={() => fileRef.current?.click()} aria-label="Attach file">
            <AttachIcon />
          </button>
          <input ref={fileRef} type="file" hidden accept="*/*" onChange={e => pickFile(e, false)} />

          <button type="button" className="cu-composer-btn" onClick={() => imageRef.current?.click()} aria-label="Choose image or video">
            <ImageIcon />
          </button>
          <input ref={imageRef} type="file" hidden accept="image/*,video/*" onChange={e => pickFile(e, true)} />

          <div className="cu-input-wrap">
            <input
              value={text}
              onChange={e => typingNow(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={staged ? "Add a caption…" : "Message"}
            />
            <button type="button" className="cu-emoji-btn" onClick={() => setText(v => v + "😊")} aria-label="Emoji">
              <SmileIcon size={17} />
            </button>
          </div>

          <button
            type={text.trim() || staged ? "submit" : "button"}
            className="cu-send"
            onClick={e => { if (!text.trim() && !staged) { e.preventDefault(); send(e, "👍"); } }}
            aria-label="Send"
          >
            {text.trim() || staged ? <SendIcon size={19} /> : <span>👍</span>}
          </button>
        </div>
      </form>

      {/* Overlays */}
      {comingSoon && (
        <div className="cu-backdrop" onClick={() => setComingSoon(null)}>
          <div className="cu-modal cu-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="cu-modal-icon">{comingSoon === "Voice call" ? "📞" : comingSoon === "Video call" ? "🎥" : "ℹ️"}</div>
            <h3>{comingSoon}</h3>
            <p>This feature can be connected to the real service later.</p>
            <button className="cu-btn-primary" onClick={() => setComingSoon(null)}>Got it</button>
          </div>
        </div>
      )}
      {imageView && <Lightbox url={imageView.url} name={imageView.name} onClose={() => setImageView(null)} />}
      {deleteId  && <DeleteConfirm msgId={deleteId} onCancel={() => setDeleteId(null)} onDelete={deleteMessage} />}
    </section>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyRoom({ onNew }) {
  return (
    <section className="cu-empty-room">
      <div className="cu-empty-icon">💬</div>
      <h2>Select a chat</h2>
      <p>Your study conversations appear here.</p>
      <button className="cu-btn-primary" onClick={onNew}>Start a chat</button>
    </section>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function LoadingShell() {
  return (
    <div className="cu-shell cu-shell-loading">
      <aside className="cu-list-pane">
        <div className="cu-sk cu-sk-title" />
        <div className="cu-sk cu-sk-search" />
        {[1,2,3,4,5].map(i => (
          <div key={i} className="cu-sk-row">
            <div className="cu-sk cu-sk-avatar" />
            <div className="cu-sk-lines">
              <div className="cu-sk cu-sk-line-a" />
              <div className="cu-sk cu-sk-line-b" />
            </div>
          </div>
        ))}
      </aside>
      <section className="cu-empty-room">
        <div className="cu-spinner" />
      </section>
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { profile, user }       = useAuth();
  const { convId }              = useParams();
  const [conversations, setConversations] = useState([]);
  const [active, setActive]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [newChat, setNewChat]   = useState(false);
  const myId = parseInt(profile?.uid || user?.uid || "0", 10);

  async function refresh(selectId = null) {
    try {
      const data = await api.listConversations();
      setConversations(data);
      if (selectId) setActive(data.find(c => String(c.id) === String(selectId)) || null);
      return data;
    } catch { return []; }
  }

  useEffect(() => {
    let live = true;
    api.listConversations()
      .then(data => {
        if (!live) return;
        setConversations(data);
        if (convId) setActive(data.find(c => String(c.id) === String(convId)) || null);
      })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [convId]);

  useEffect(() => {
    document.body.classList.toggle("cu-chat-open", !!active);
    return () => document.body.classList.remove("cu-chat-open");
  }, [active]);

  if (loading) return <LoadingShell />;

  return (
    <div className={`cu-shell${active ? " has-room" : ""}`}>
      <ConversationList
        conversations={conversations}
        activeId={active?.id}
        myId={myId}
        onSelect={c => setActive(c)}
        onNew={() => setNewChat(true)}
      />
      {active
        ? <ChatRoom key={active.id} conversation={active} myId={myId} onBack={() => setActive(null)} onRefresh={refresh} />
        : <EmptyRoom onNew={() => setNewChat(true)} />
      }
      {newChat && (
        <NewChatModal
          onClose={() => setNewChat(false)}
          onStarted={async conv => { setNewChat(false); await refresh(conv.id); }}
        />
      )}
    </div>
  );
}
