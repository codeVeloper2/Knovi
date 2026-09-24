import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, Video, PenLine, ArrowLeft, Phone, Info, Plus, Image as ImageIcon, Mic, Smile, Send, FileText, X, Copy, Reply, Forward, Trash2, UserRoundX, Download, CheckCheck, BellOff } from "lucide-react";
import * as api from "../../api";
import { useAuth } from "../../context/AuthContext";
import "./Chat.css";

// Must match backend ALLOWED set in chat_service.toggle_reaction
const EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "🔥"];

const GRADIENTS = [
  ["#5b6ef5", "#6366f1"],
  ["#34d399", "#10b981"],
  ["#60a5fa", "#3b82f6"],
  ["#a78bfa", "#6366f1"],
  ["#f59e0b", "#60a5fa"],
  ["#f87171", "#5b6ef5"],
  ["#38bdf8", "#6366f1"],
  ["#34d399", "#5b6ef5"],
];

function hashName(name = "") {
  return [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
}
function initials(name = "Peer") {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : p[0]?.[0] || "P").toUpperCase();
}
function avatarStyle(name) {
  const [a, b] = GRADIENTS[Math.abs(hashName(name)) % GRADIENTS.length];
  return { background: `linear-gradient(135deg, ${a}, ${b})` };
}
function Avatar({ name, photoURL = "", size = 52, online = false, className = "" }) {
  return (
    <span className={`pu-avatar-wrap ${className}`}>
      {photoURL ? (
        <img
          className="pu-avatar pu-avatar-photo"
          src={photoURL}
          alt={`${name || "Peer"} profile`}
          style={{ width: size, height: size }}
          onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling.style.display = "grid"; }}
        />
      ) : null}
      <span className="pu-avatar pu-avatar-fallback" style={{ ...avatarStyle(name), width: size, height: size, fontSize: Math.max(12, size * .36), display: photoURL ? "none" : "grid" }}>{initials(name)}</span>
      {online && <span className="pu-online-dot" />}
    </span>
  );
}

function formatTime(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function formatListTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function mapChat(raw) {
  return {
    id: String(raw.id),
    name: raw.partner?.displayName || "Peer",
    photoURL: raw.partner?.photoURL || raw.partner?.photoUrl || "",
    online: !!raw.partner?.isOnline,
    verified: false,
    lastMessage: raw.lastMessage?.attachmentUrl
      ? `📎 ${raw.lastMessage.attachmentName || "Attachment"}`
      : (raw.lastMessage?.body || ""),
    time: formatListTime(raw.lastMessageAt || raw.lastMessage?.createdAt),
    unread: Number(raw.unread || 0),
    muted: false,
    partnerId: raw.partnerId,
    subject: raw.subject || "",
  };
}
/** Backend user serialize uses `uid` (string of numeric id). Accept both. */
function resolveMyId(user) {
  if (!user) return null;
  return user.uid ?? user.id ?? null;
}

function mapMessage(raw, myId, partnerName) {
  const isImage = !!raw.attachmentUrl && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(raw.attachmentUrl);
  // Compare as strings so "12" === 12 never fails
  const isMine =
    myId != null &&
    raw.senderId != null &&
    String(raw.senderId) === String(myId);
  return {
    ...raw,
    id: raw.id ?? raw.messageId,
    text: raw.body || raw.text || "",
    outgoing: isMine,
    time: formatTime(raw.createdAt || raw.time),
    status: raw.isRead ? "read" : raw.isDelivered ? "delivered" : "sent",
    type: raw.attachmentUrl
      ? isImage
        ? "image"
        : "document"
      : raw.type,
    imageUrl: isImage ? raw.attachmentUrl : raw.imageUrl,
    fileName: raw.attachmentName || raw.fileName || undefined,
    fileMeta: raw.attachmentName
      ? fileExt(raw.attachmentName)
      : raw.fileMeta,
    replyToId: raw.replyToId || null,
    replyTo: raw.replyToId
      ? {
          text: raw.replyToSnapshot || "Message",
          outgoing: false,
          name: "Reply",
        }
      : raw.replyTo || null,
    senderName: isMine ? "You" : partnerName,
    // Prefer a single display reaction (first key); keep full map for future
    reaction: Object.keys(raw.reactions || {})[0] || null,
    reactions: raw.reactions || {},
  };
}

function messagePreview(msg) {
  if (!msg) return "";
  if (msg.deleted) return "This message was deleted";
  if (msg.type === "image") return msg.text || "📷 Photo";
  if (msg.type === "document") return `📄 ${msg.fileName || "Document"}`;
  return msg.text || "";
}
function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fileExt(name = "") {
  const e = name.split(".").pop();
  return e ? e.toUpperCase() : "FILE";
}

function MessageBubble({ msg, first, last, onLongPress, onReplyDrag, onImage, onReply, onCopy, onReact, onDelete, onScrollToMsg }) {
  // Touch / drag state (mobile)
  const timer = useRef(null);
  const start = useRef(null);
  const dragging = useRef(false);
  const [dragY, setDragY] = useState(0);
  const [draggingUi, setDraggingUi] = useState(false);
  // Hover emoji picker state (desktop)
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef(null);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!emojiOpen) return;
    const handler = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emojiOpen]);

  // ── Touch handlers (mobile only) ──────────────────────────────────────────
  const begin = (e) => {
    if (e.type === "mousedown") return; // desktop uses hover bar
    const p = e.touches?.[0];
    if (!p) return;
    start.current = { x: p.clientX, y: p.clientY, time: Date.now() };
    timer.current = setTimeout(() => onLongPress(msg), 500);
  };
  const move = (e) => {
    if (!start.current) return;
    const p = e.touches?.[0];
    if (!p) return;
    const dx = p.clientX - start.current.x;
    const dy = p.clientY - start.current.y;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) clearTimeout(timer.current);
    if (Math.abs(dy) >= 24 && Math.abs(dy) > Math.abs(dx) * 1.3) {
      dragging.current = true;
      setDraggingUi(true);
      setDragY(Math.max(-80, Math.min(80, dy)));
      if (e.cancelable) e.preventDefault();
    }
  };
  const end = (e) => {
    clearTimeout(timer.current);
    if (!start.current) return;
    const p = e.changedTouches?.[0];
    if (!p) return;
    const dy = p.clientY - start.current.y;
    const dx = p.clientX - start.current.x;
    const elapsed = Date.now() - start.current.time;
    if (dragging.current && Math.abs(dy) >= 52 && Math.abs(dy) > Math.abs(dx) * 1.2) onReplyDrag(msg);
    else if (!dragging.current && elapsed < 400 && msg.type === "image" && msg.imageUrl) onImage(msg);
    start.current = null;
    dragging.current = false;
    setDraggingUi(false);
    setDragY(0);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const bubbleClass = ["pu-bubble", msg.type === "image" || msg.type === "document" ? "media" : "", msg.deleted ? "deleted" : "", last ? "last-in-group" : "", msg._landing ? "is-landing" : ""].filter(Boolean).join(" ");
  const rowClass = ["pu-message-row", msg.outgoing ? "outgoing" : "incoming", last ? "last-in-group" : "", draggingUi ? "dragging" : "", emojiOpen ? "active-picker" : ""].filter(Boolean).join(" ");

  return (
    <div className={rowClass} data-msg-id={msg.id}>
      {!msg.outgoing && <Avatar name={msg.senderName || "Peer"} photoURL={msg.senderPhotoURL} size={28} className="pu-msg-avatar" />}
      {/* pu-msg-wrapper: hover target on desktop — the padding-bottom creates the flicker-free bridge */}
      <div className={`pu-msg-wrapper ${msg.outgoing ? "sent" : "received"}`}>
        <div className="pu-msg-stack">
          <div className="pu-reply-drag-hint"><Reply size={14} /></div>
          <div
            className={bubbleClass}
            style={{ transform: `translateY(${dragY}px)` }}
            onTouchStart={begin} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => { if (msg.type === "image" && msg.imageUrl && e.detail === 1) onImage(msg); }}
          >
            {msg.replyTo && <div className="pu-bubble-reply" onClick={(e) => { e.stopPropagation(); onScrollToMsg && onScrollToMsg(msg.replyToId); }} style={{ cursor: "pointer" }}><span>{msg.replyTo.name}</span><small>{msg.replyTo.text}</small></div>}
            {msg.deleted ? <span>This message was deleted</span> : msg.type === "image" ? (
              <div className="pu-image-wrap">
                <img src={msg.imageUrl} alt={msg.text || "Photo"} className="pu-message-image" />
                {msg.text && <div className="pu-media-caption">{msg.text}</div>}
              </div>
            ) : msg.type === "document" ? (
              <div className="pu-doc">
                <span className="pu-doc-icon"><FileText size={19} /></span>
                <span className="pu-doc-info"><b>{msg.fileName || "Document"}</b><small>{msg.fileMeta || "FILE"}</small></span>
              </div>
            ) : msg.isVoice ? <span>🎙️ Voice message</span> : <span>{msg.text}</span>}
          </div>
          {msg.reaction && <span className="pu-reaction">{msg.reaction}</span>}
          <div className="pu-msg-meta"><span>{msg.time}</span>{msg.outgoing && <span className={`pu-ticks ${msg.status === "read" ? "read" : ""}`}><CheckCheck size={13} /></span>}</div>
        </div>

        {/* ── Hover Action Bar (desktop only via CSS) ── */}
        {!msg.deleted && (
          <div className="pu-hover-bar" ref={emojiOpen ? emojiRef : null}>
            <button className="pu-hbar-btn" title="Reply" onClick={() => onReply(msg)}>
              <Reply size={15} />
            </button>
            <button className="pu-hbar-btn" title="Copy" onClick={() => onCopy(msg)}>
              <Copy size={15} />
            </button>
            <div className="pu-hbar-emoji-wrap" ref={emojiRef}>
              <button className="pu-hbar-btn" title="React" onClick={() => setEmojiOpen(v => !v)}>
                <Smile size={15} />
              </button>
              {emojiOpen && (
                <div className={`pu-hbar-emoji-picker ${msg.outgoing ? "sent" : "received"}`}>
                  {EMOJIS.map(e => (
                    <button key={e} className="pu-hbar-emoji-opt" onClick={() => { onReact(msg, e); setEmojiOpen(false); }}>{e}</button>
                  ))}
                </div>
              )}
            </div>
            <button className="pu-hbar-btn" title="Forward" onClick={() => {}}>
              <Forward size={15} />
            </button>
            {msg.outgoing && (
              <button className="pu-hbar-btn danger" title="Delete" onClick={() => onDelete(msg)}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatListSkeleton() {
  return (
    <div className="pu-chat-skeleton" aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <div className="pu-chat-skeleton-item" key={i}>
          <span className="pu-skeleton pu-skeleton-avatar" />
          <span className="pu-chat-skeleton-meta">
            <span className="pu-chat-skeleton-top"><span className="pu-skeleton pu-skeleton-name" /><span className="pu-skeleton pu-skeleton-time" /></span>
            <span className="pu-skeleton pu-skeleton-preview" />
          </span>
        </div>
      ))}
    </div>
  );
}

function MessageSkeleton({ outgoing = false, wide = false }) {
  return (
    <div className={`pu-message-skeleton-row ${outgoing ? "outgoing" : "incoming"}`} aria-hidden="true">
      {!outgoing && <span className="pu-skeleton pu-message-skeleton-avatar" />}
      <span className={`pu-skeleton pu-message-skeleton-bubble ${wide ? "wide" : ""}`} />
    </div>
  );
}

function MessageListSkeleton() {
  return (
    <div className="pu-message-skeleton-list" aria-hidden="true">
      <div className="pu-skeleton pu-message-skeleton-day" />
      <MessageSkeleton />
      <MessageSkeleton outgoing wide />
      <MessageSkeleton />
      <MessageSkeleton outgoing />
      <MessageSkeleton />
      <MessageSkeleton outgoing wide />
    </div>
  );
}

export default function Chat() {
  const { convId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [screen, setScreen] = useState(convId || null);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [pending, setPending] = useState(null);
  const [modal, setModal] = useState(null);
  const [deleteType, setDeleteType] = useState(null);
  const [deleteMsg, setDeleteMsg] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const imageInput = useRef(null);
  const fileInput = useRef(null);
  const messagesRef = useRef(null);

  const scrollToMsg = (msgId) => {
    if (!msgId || !messagesRef.current) return;
    const el = messagesRef.current.querySelector(`[data-msg-id="${msgId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("pu-msg-highlight");
    setTimeout(() => el.classList.remove("pu-msg-highlight"), 1400);
  };

  const currentChat = chats.find(c => c.id === String(screen)) || null;
  const unreadCount = chats.reduce((sum, c) => sum + (c.unread || 0), 0);
  const list = useMemo(() => chats.filter(c => {
    const q = query.trim().toLowerCase();
    const matches = !q || c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q);
    return matches && (tab === "all" || c.unread > 0);
  }), [chats, query, tab]);

  const refreshChats = async () => {
    try {
      const rows = await api.listConversations();
      setChats((rows || []).map(mapChat));
    } catch (err) {
      setLoadError(err.message || "Couldn't load chats.");
    } finally {
      setLoading(false);
    }
  };
  const myId = resolveMyId(user);

  const loadMessages = async (id) => {
    if (!id) return;
    setMessagesLoading(true);
    try {
      const rows = await api.getMessages(id);
      const partner = chats.find(c => c.id === String(id))?.name || "Peer";
      setMessages((rows || []).map(m => mapMessage(m, myId, partner)));
      await api.markRead(id).catch(() => {});
      setChats(prev => prev.map(c => c.id === String(id) ? { ...c, unread: 0 } : c));
    } catch (err) {
      setLoadError(err.message || "Couldn't load messages.");
    } finally {
      setMessagesLoading(false);
    }
  };
  useEffect(() => { refreshChats(); }, []);
  useEffect(() => { const timer = setInterval(refreshChats, 10000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (convId) setScreen(convId); }, [convId]);
  useEffect(() => {
    if (!screen) return;
    loadMessages(screen);
    const ws = api.openChatSocket(screen, event => {
      if (event.type === "message" && event.data) {
        const partner = chats.find(c => c.id === String(screen))?.name || "Peer";
        const mapped = mapMessage(event.data, myId, partner);
        setMessages(prev => {
          // Already have this exact id
          if (prev.some(m => String(m.id) === String(mapped.id))) return prev;
          // Replace our optimistic bubble (same outgoing text / attachment) instead of duplicating
          const optIdx = prev.findIndex(
            m =>
              m._optimistic &&
              m.outgoing &&
              (m.text || "") === (mapped.text || "") &&
              (m.type || "") === (mapped.type || "")
          );
          if (optIdx >= 0) {
            const next = [...prev];
            next[optIdx] = mapped;
            return next;
          }
          return [...prev, mapped];
        });
        refreshChats();
      } else if (event.type === "deleted") {
        setMessages(prev => prev.map(m => String(m.id) === String(event.msgId) ? { ...m, deleted: true, text: "This message was deleted", type: undefined, imageUrl: undefined, reaction: null } : m));
      } else if (event.type === "reaction") {
        const reaction = Object.keys(event.reactions || {})[0] || null;
        setMessages(prev => prev.map(m => String(m.id) === String(event.msgId) ? { ...m, reaction, reactions: event.reactions || {} } : m));
      } else if (event.type === "read") {
        setMessages(prev => prev.map(m => m.outgoing ? { ...m, status: "read" } : m));
      }
    });
    return () => ws.close();
  }, [screen, myId]);
  useEffect(() => {
    requestAnimationFrame(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; });
  }, [screen, messages.length]);

  const openChat = async (id) => {
    setScreen(String(id));
    navigate(`/app/chat/${id}`, { replace: true });
    setReplyTo(null); setPending(null); setModal(null);
  };
  const closeChat = () => {
    setScreen(null); navigate("/app/chat", { replace: true });
    setReplyTo(null); setPending(null); setModal(null);
  };

  const playSendFlight = (text) => new Promise((resolve) => {
    const composer = document.querySelector(".pu-composer");
    const endEl = document.querySelector(`.pu-message-row.outgoing[data-msg-id^="temp-"] .pu-bubble`);
    if (!composer || !endEl) {
      resolve();
      return;
    }
    const composerRect = composer.getBoundingClientRect();
    const endRect = endEl.getBoundingClientRect();
    const startW = Math.min(72, endRect.width || 72);
    const startH = 34;
    const startX = composerRect.right - startW - 18;
    const startY = composerRect.top + 6;
    const layer = document.createElement("div");
    layer.className = "pu-flight-layer";
    const bubble = document.createElement("div");
    bubble.className = "pu-flight-bubble";
    bubble.innerHTML = `<span class="pu-flight-text"></span>`;
    bubble.querySelector(".pu-flight-text").textContent = text;
    layer.appendChild(bubble);
    document.body.appendChild(layer);
    Object.assign(bubble.style, {
      left: "0px",
      top: "0px",
      width: startW + "px",
      minHeight: startH + "px",
      opacity: "0.9",
      transform: `translate(${startX}px, ${startY}px) scale(0.9)`,
    });
    bubble.getBoundingClientRect();
    const duration = 500;
    const ease = "cubic-bezier(0.22, 0.9, 0.28, 1)";
    bubble.classList.add("is-flying");
    bubble.style.transition = [
      `transform ${duration}ms ${ease}`,
      `width ${duration}ms ${ease}`,
      `min-height ${duration}ms ${ease}`,
      `opacity ${duration * 0.7}ms ease`,
    ].join(", ");
    requestAnimationFrame(() => {
      bubble.style.transform = `translate(${endRect.left}px, ${endRect.top}px) scale(1)`;
      bubble.style.width = endRect.width + "px";
      bubble.style.minHeight = endRect.height + "px";
      bubble.style.opacity = "1";
    });
    setTimeout(() => {
      layer.remove();
      resolve();
    }, duration + 40);
  });

  const send = async () => {
    if (!screen) return;
    // Empty send → thumbs-up (same as reference UI)
    let text = input.trim();
    if (!text && !pending) text = "👍";

    // Optimistic message — appears instantly on the right
    const tempId = `temp-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic = {
      id: tempId,
      text: text || "",
      body: text || "",
      outgoing: true,
      time: formatTime(nowIso),
      createdAt: nowIso,
      status: "sent",
      type: pending?.type,
      imageUrl: pending?.type === "image" ? pending.imageUrl : undefined,
      fileName: pending?.fileName,
      fileMeta: pending?.fileMeta,
      replyTo: replyTo
        ? {
            text: messagePreview(replyTo),
            outgoing: !!replyTo.outgoing,
            name: replyTo.outgoing ? "You" : (currentChat?.name || "Peer"),
          }
        : null,
      senderName: "You",
      senderId: myId,
      _optimistic: true,
    };

    const savedInput = text;
    const savedPending = pending;
    const savedReply = replyTo;
    const useFlight = !savedPending && !!savedInput;
    if (useFlight) optimistic._landing = true;
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setPending(null);
    setReplyTo(null);

    if (useFlight) {
      // Wait a frame so the placeholder is laid out, then fly the bubble up.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await playSendFlight(savedInput);
      setMessages((prev) =>
        prev.map((m) => (String(m.id) === tempId ? { ...m, _landing: false } : m))
      );
    }

    // Update chat list preview immediately
    setChats((prev) =>
      prev.map((c) =>
        c.id === String(screen)
          ? {
              ...c,
              lastMessage: savedPending?.type === "image"
                ? (text ? `📷 ${text}` : "📷 Photo")
                : savedPending?.type === "document"
                  ? `📄 ${savedPending.fileName || "Document"}`
                  : text,
              time: formatListTime(nowIso),
            }
          : c
      )
    );

    try {
      let attachmentUrl = null;
      let attachmentName = null;
      if (savedPending?.file) {
        const uploaded = await api.uploadAttachment(screen, savedPending.file);
        attachmentUrl = uploaded.url;
        attachmentName = uploaded.name || savedPending.file.name;
      }
      if (!savedInput && !attachmentUrl) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }
      const created = await api.sendMessageRest(
        screen,
        savedInput,
        attachmentUrl,
        attachmentName,
        savedReply?.id || null
      );
      // Replace temp bubble with real server message (still outgoing / right side)
      const partner = currentChat?.name || "Peer";
      const mapped = mapMessage(created || {}, myId, partner);
      // Defensive: ensure right side if senderId ever mismatches shape
      if (myId != null && created?.senderId != null && String(created.senderId) === String(myId)) {
        mapped.outgoing = true;
      } else if (myId != null) {
        mapped.outgoing = true;
      }
      mapped.status = mapped.status || "delivered";
      if (!mapped.text && savedInput) mapped.text = savedInput;
      if (savedPending?.type === "image" && !mapped.imageUrl && attachmentUrl) {
        mapped.type = "image";
        mapped.imageUrl = attachmentUrl;
      }
      setMessages((prev) =>
        prev.map((m) => (String(m.id) === tempId ? { ...mapped, id: mapped.id || created?.id || tempId } : m))
      );
      // Revoke blob URL after a short delay so the optimistic image still paints
      if (savedPending?.imageUrl?.startsWith("blob:")) {
        setTimeout(() => URL.revokeObjectURL(savedPending.imageUrl), 30000);
      }
      await refreshChats();
    } catch (err) {
      // Roll back optimistic bubble
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(savedInput);
      if (savedPending) setPending(savedPending);
      if (savedReply) setReplyTo(savedReply);
      setLoadError(err.message || "Couldn't send message.");
    }
  };

  const openDelete = () => {
    if (modal?.msg) {
      setDeleteMsg(modal.msg);
      setModal(null);
    }
  };
  const pickImage = (e) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setPending({ type: "image", imageUrl: URL.createObjectURL(file), fileName: file.name, file });
  };
  const pickFile = (e) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    if (file.type.startsWith("image/")) setPending({ type: "image", imageUrl: URL.createObjectURL(file), fileName: file.name, file });
    else setPending({ type: "document", fileName: file.name, fileMeta: `${fileExt(file.name)} · ${fileSize(file.size)}`, file });
  };
  const removePending = () => {
    if (pending?.imageUrl) URL.revokeObjectURL(pending.imageUrl);
    setPending(null);
  };
  const performDelete = async () => {
    if (!deleteMsg || !deleteType) return;
    try {
      await api.deleteMessage(deleteMsg.id, deleteType);
      if (deleteType === "me") setMessages(prev => prev.filter(m => String(m.id) !== String(deleteMsg.id)));
      else setMessages(prev => prev.map(m => String(m.id) === String(deleteMsg.id) ? { ...m, deleted: true, text: "This message was deleted", type: undefined, imageUrl: undefined, reaction: null } : m));
    } catch (err) {
      setLoadError(err.message || "Couldn't delete message.");
    } finally {
      setDeleteMsg(null); setDeleteType(null);
    }
  };
  const copy = async () => {
    if (modal?.msg?.text) await navigator.clipboard?.writeText(modal.msg.text).catch(() => {});
    setModal(null);
  };
  const copyMsg = async (msg) => {
    if (msg?.text) await navigator.clipboard?.writeText(msg.text).catch(() => {});
  };
  const openDeleteDirect = (msg) => {
    setDeleteMsg(msg);
  };
  const react = async (msg, emoji) => {
    // Optimistic UI update — WS will confirm / sync full reactions map
    setMessages(prev =>
      prev.map(m =>
        String(m.id) === String(msg.id)
          ? { ...m, reaction: emoji, reactions: { ...(m.reactions || {}), [emoji]: [myId] } }
          : m
      )
    );
    setModal(null);
    try {
      const res = await api.sendReaction(msg.id, emoji);
      if (res?.reactions) {
        const reaction = Object.keys(res.reactions)[0] || null;
        setMessages(prev =>
          prev.map(m =>
            String(m.id) === String(msg.id)
              ? { ...m, reaction, reactions: res.reactions }
              : m
          )
        );
      }
    } catch (err) {
      // Roll back optimistic reaction on failure
      setMessages(prev =>
        prev.map(m =>
          String(m.id) === String(msg.id)
            ? { ...m, reaction: msg.reaction || null, reactions: msg.reactions || {} }
            : m
        )
      );
      setLoadError(err.message || "Couldn't react.");
    }
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e) => e.key === "Escape" && setLightbox(null);
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; };
  }, [lightbox]);

  const messageRows = messages.map((m, i) => ({ msg: m, first: !messages[i - 1] || messages[i - 1].outgoing !== m.outgoing, last: !messages[i + 1] || messages[i + 1].outgoing !== m.outgoing }));

  return (
    <div className={`pu-app ${screen ? "pu-in-chat" : ""}`}>

      <div className="pu-desktop-shell">
        <main className={`pu-list-screen ${screen ? "has-selection" : ""}`}>
          <div className="pu-list-title-row"><h1>Chats</h1><button className="pu-new-chat-btn" aria-label="New chat" onClick={() => navigate("/app/discover")}><PenLine size={17} /></button></div>
          <label className="pu-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search chats..." /></label>
          <div className="pu-tabs">
            <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All</button>
            <button className={tab === "unread" ? "active" : ""} onClick={() => setTab("unread")}>Unread{unreadCount > 0 && <span className="pu-tab-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}</button>
          </div>
          <div className="pu-chat-list">
            {loading ? <ChatListSkeleton /> : list.map(chat => (
              <button className={`pu-chat-item ${String(screen) === chat.id ? "selected" : ""}`} key={chat.id} onClick={() => openChat(chat.id)}>
                <Avatar name={chat.name} photoURL={chat.photoURL} online={chat.online} size={52} />
                <span className="pu-chat-meta">
                  <span className="pu-chat-top"><span className="pu-chat-name">{chat.name}{chat.verified && <span className="pu-verified">✓</span>}</span><time>{chat.time}</time></span>
                  <span className="pu-chat-bottom"><span className={`pu-chat-preview ${chat.typing ? "typing" : ""} ${chat.isVoice ? "voice" : ""}`}>{chat.isVoice ? "🎙 Voice message" : chat.lastMessage}</span>{chat.unread > 0 && <b className="pu-unread">{chat.unread}</b>}{chat.muted && <BellOff size={13} className="pu-muted" />}</span>
                  {chat.languages?.length > 0 && <span className="pu-language-tags">{chat.languages.map(l => <i key={l}>{l}</i>)}</span>}
                </span>
              </button>
            ))}
            {!loading && !list.length && <div className="pu-empty">No chats match your filter.</div>}
          </div>
        </main>

        <main className={`pu-conversation ${screen ? "has-selection" : "no-selection"}`}>
          {!screen ? (
            <div className="pu-empty-conversation">
              <div className="pu-empty-chat-icon"><Search size={26} /></div>
              <h2>Your messages</h2>
              <p>Select a conversation from the left to start chatting.</p>
              <button onClick={() => setQuery("")}>Browse chats</button>
            </div>
          ) : (
            <>
              <header className="pu-user-header">
                <button className="pu-back" onClick={closeChat} aria-label="Back"><ArrowLeft size={19} /></button>
                <Avatar name={currentChat?.name || "Peer"} photoURL={currentChat?.photoURL} online={currentChat?.online} size={40} />
                <div className="pu-user-info"><div><strong>{currentChat?.name}</strong>{currentChat?.verified && <span className="pu-verified">✓</span>}</div><span className={currentChat?.online ? "online" : ""}>{currentChat?.online ? "Online" : "Last seen recently"}</span></div>
                <div className="pu-user-actions"><button className="pu-icon-btn"><Phone size={18} /></button><button className="pu-icon-btn"><Video size={18} /></button><button className="pu-icon-btn"><Info size={18} /></button></div>
              </header>
              <div className="pu-messages" ref={messagesRef}>
                {messagesLoading ? <MessageListSkeleton /> : <>
                  <div className="pu-day-divider">Today</div>
                  {messageRows.map(({ msg, first, last }) => <MessageBubble key={msg.id} msg={{ ...msg, senderName: currentChat?.name, senderPhotoURL: currentChat?.photoURL }} first={first} last={last} onLongPress={m => setModal({ msg: m })} onReplyDrag={m => setReplyTo(m)} onImage={m => setLightbox(m)} onReply={m => setReplyTo(m)} onCopy={copyMsg} onReact={react} onDelete={openDeleteDirect} onScrollToMsg={scrollToMsg} />)}
                </>}
              </div>
              {replyTo && <div className="pu-reply-bar"><span></span><div><b>{replyTo.outgoing ? "You" : currentChat?.name}</b><small>{messagePreview(replyTo)}</small></div><button onClick={() => setReplyTo(null)}><X size={15} /></button></div>}
              {pending && <div className="pu-pending"><div className="pu-pending-thumb">{pending.type === "image" ? <img src={pending.imageUrl} alt="Selected" /> : <FileText size={22} />}</div><div><b>{pending.type === "image" ? "Photo" : pending.fileName}</b><small>{pending.type === "image" ? "Add a caption below, then send" : pending.fileMeta}</small></div><button onClick={removePending}><X size={15} /></button></div>}
              <div className="pu-composer">
                <button className="pu-composer-btn" onClick={() => setModal({ attach: true })} aria-label="Attach"><Plus size={19} /></button>
                <button className="pu-composer-btn" onClick={() => imageInput.current?.click()} aria-label="Gallery"><ImageIcon size={18} /></button>
                <button className="pu-composer-btn" aria-label="Voice"><Mic size={18} /></button>
                <div className="pu-input-wrap"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={pending ? (pending.type === "image" ? "Add a caption..." : "Add a message...") : "Write a message..."} /><button className="pu-emoji-btn"><Smile size={18} /></button></div>
                <button className="pu-send" onClick={send} aria-label="Send">{input.trim() || pending ? <Send size={18} fill="currentColor" /> : "👍"}</button>
              </div>
              <input ref={imageInput} type="file" accept="image/*" hidden onChange={pickImage} />
              <input ref={fileInput} type="file" accept="*/*" hidden onChange={pickFile} />
            </>
          )}
        </main>


      </div>

      {modal?.attach && <div className="pu-overlay pu-bottom" onClick={() => setModal(null)}><div className="pu-sheet" onClick={e => e.stopPropagation()}><div className="pu-sheet-head"><b>Share from device</b><button onClick={() => setModal(null)}><X size={16} /></button></div><button className="pu-action" onClick={() => { setModal(null); imageInput.current?.click(); }}><ImageIcon size={18} /><span>Photo from gallery</span></button><button className="pu-action" onClick={() => { setModal(null); fileInput.current?.click(); }}><FileText size={18} /><span>Document / file</span></button></div></div>}

      {modal?.msg && <div className="pu-overlay pu-blur pu-bottom" onClick={() => setModal(null)}><div className="pu-sheet" onClick={e => e.stopPropagation()}><div className={`pu-preview ${modal.msg.outgoing ? "outgoing" : ""}`}>{messagePreview(modal.msg)}</div><div className="pu-reactions">{EMOJIS.map(e => <button key={e} onClick={() => { react(modal.msg, e); }}>{e}</button>)}<button>+</button></div><div className="pu-actions"><button className="pu-action" onClick={copy}><span>Copy</span><Copy size={18} /></button><button className="pu-action" onClick={() => { setReplyTo(modal.msg); setModal(null); }}><span>Reply</span><Reply size={18} /></button><button className="pu-action" onClick={() => setModal(null)}><span>Forward</span><Forward size={18} /></button>{modal.msg.outgoing && <button className="pu-action danger" onClick={openDelete}><span>Delete</span><Trash2 size={18} /></button>}</div></div></div>}

      {deleteMsg && <div className="pu-overlay pu-bottom" onClick={() => setDeleteMsg(null)}><div className="pu-sheet" onClick={e => e.stopPropagation()}><p className="pu-delete-title">Delete message?</p><button className="pu-action danger" onClick={() => setDeleteType("me")}><span>Delete for me</span><Trash2 size={18} /></button><button className="pu-action danger" onClick={() => setDeleteType("everyone")}><span>Delete for everyone</span><UserRoundX size={18} /></button><button className="pu-action" onClick={() => setDeleteMsg(null)}><span>Cancel</span><X size={18} /></button></div></div>}

      {deleteType && <div className="pu-overlay pu-center"><div className="pu-confirm"><h3>Are you sure?</h3><p>{deleteType === "everyone" ? "This will delete the message for everyone in the chat. Are you sure?" : "This will delete the message only for you. Are you sure?"}</p><div><button onClick={() => { setDeleteType(null); setDeleteMsg(null); }}>Cancel</button><button className="danger" onClick={performDelete}>Delete</button></div></div></div>}

      {lightbox && (
        <div className="pu-lightbox" role="dialog" aria-modal="true" aria-label="Photo preview" onClick={() => setLightbox(null)}>
          <div className="pu-lightbox-head" onClick={e => e.stopPropagation()}>
            <button className="pu-lightbox-cancel" onClick={() => setLightbox(null)} aria-label="Cancel photo preview">Cancel</button>
            <b>Photo</b>
            <button onClick={async () => {
              try { await api.downloadAttachment(lightbox.id, lightbox.fileName || "PeerUP-photo"); }
              catch (err) { setLoadError(err.message || "Couldn't download photo."); }
            }} aria-label="Download photo"><Download size={18} /></button>
          </div>
          <div className="pu-lightbox-body" onClick={e => e.stopPropagation()}>
            <img src={lightbox.imageUrl || lightbox.attachmentUrl} alt="Full view" />
          </div>
          <div className="pu-lightbox-foot" onClick={e => e.stopPropagation()}>
            <button className="pu-lightbox-download" onClick={async () => {
              try { await api.downloadAttachment(lightbox.id, lightbox.fileName || "PeerUP-photo"); }
              catch (err) { setLoadError(err.message || "Couldn't download photo."); }
            }}><Download size={16} />Save photo</button>
            <button className="pu-lightbox-close-bottom" onClick={() => setLightbox(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
