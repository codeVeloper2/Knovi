import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, Video, PenLine, ArrowLeft, Phone, Info, Plus, Image as ImageIcon, Mic, Smile, Send, FileText, X, Copy, Reply, Forward, Trash2, UserRoundX, Download, CheckCheck, BellOff } from "lucide-react";
import * as api from "../../api";
import { useAuth } from "../../context/AuthContext";
import "./Chat.css";

const EMOJIS = ["🔥", "👏", "😢", "😮", "🙏", "😂", "✨"];

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
function Avatar({ name, size = 52, online = false, className = "" }) {
  return (
    <span className={`pu-avatar-wrap ${className}`}>
      <span className="pu-avatar" style={{ ...avatarStyle(name), width: size, height: size, fontSize: Math.max(12, size * .36) }}>{initials(name)}</span>
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
function mapMessage(raw, myId, partnerName) {
  const isImage = !!raw.attachmentUrl && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(raw.attachmentUrl);
  return {
    ...raw,
    text: raw.body || "",
    outgoing: Number(raw.senderId) === Number(myId),
    time: formatTime(raw.createdAt),
    status: raw.isRead ? "read" : raw.isDelivered ? "delivered" : "sent",
    type: raw.attachmentUrl ? (isImage ? "image" : "document") : undefined,
    imageUrl: isImage ? raw.attachmentUrl : undefined,
    fileName: raw.attachmentName || undefined,
    fileMeta: raw.attachmentName ? fileExt(raw.attachmentName) : undefined,
    replyTo: raw.replyToId ? { text: raw.replyToSnapshot || "Message", outgoing: false, name: "Reply" } : null,
    senderName: Number(raw.senderId) === Number(myId) ? "You" : partnerName,
    reaction: Object.keys(raw.reactions || {})[0] || null,
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

function MessageBubble({ msg, first, last, onLongPress, onReplyDrag, onImage }) {
  const timer = useRef(null);
  const start = useRef(null);
  const dragging = useRef(false);
  const [dragY, setDragY] = useState(0);
  const [draggingUi, setDraggingUi] = useState(false);

  const begin = (e) => {
    const p = e.touches?.[0] || e;
    if (!p) return;
    start.current = { x: p.clientX, y: p.clientY, time: Date.now() };
    timer.current = setTimeout(() => onLongPress(msg), 500);
  };
  const move = (e) => {
    if (!start.current) return;
    const p = e.touches?.[0] || e;
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
    const p = e.changedTouches?.[0] || e;
    const dy = p.clientY - start.current.y;
    const dx = p.clientX - start.current.x;
    const elapsed = Date.now() - start.current.time;
    if (dragging.current && Math.abs(dy) >= 52 && Math.abs(dy) > Math.abs(dx) * 1.2) onReplyDrag(msg);
    else if (!dragging.current && elapsed < 400 && msg.type === "image" && msg.imageUrl) onImage(msg.imageUrl);
    start.current = null;
    dragging.current = false;
    setDraggingUi(false);
    setDragY(0);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const bubbleClass = ["pu-bubble", msg.type === "image" || msg.type === "document" ? "media" : "", msg.deleted ? "deleted" : "", last ? "last-in-group" : ""].filter(Boolean).join(" ");
  const rowClass = [`pu-message-row`, msg.outgoing ? "outgoing" : "incoming", last ? "last-in-group" : "", draggingUi ? "dragging" : ""].filter(Boolean).join(" ");

  return (
    <div className={rowClass}>
      {!msg.outgoing && <Avatar name={msg.senderName || "Peer"} size={28} className="pu-msg-avatar" />}
      <div className="pu-msg-stack">
        <div className="pu-reply-drag-hint"><Reply size={14} /></div>
        <div
          className={bubbleClass}
          style={{ transform: `translateY(${dragY}px)` }}
          onTouchStart={begin} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}
          onMouseDown={begin} onMouseMove={(e) => e.buttons && move(e)} onMouseUp={end} onMouseLeave={() => clearTimeout(timer.current)}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => { if (msg.type === "image" && msg.imageUrl && e.detail === 1) onImage(msg.imageUrl); }}
        >
          {msg.replyTo && <div className="pu-bubble-reply"><span>{msg.replyTo.name}</span><small>{msg.replyTo.text}</small></div>}
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
  const [loadError, setLoadError] = useState("");
  const imageInput = useRef(null);
  const fileInput = useRef(null);
  const messagesRef = useRef(null);

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
  const loadMessages = async (id) => {
    if (!id) return;
    try {
      const rows = await api.getMessages(id);
      const partner = chats.find(c => c.id === String(id))?.name || "Peer";
      setMessages((rows || []).map(m => mapMessage(m, user?.id, partner)));
      await api.markRead(id).catch(() => {});
      setChats(prev => prev.map(c => c.id === String(id) ? { ...c, unread: 0 } : c));
    } catch (err) {
      setLoadError(err.message || "Couldn't load messages.");
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
        const mapped = mapMessage(event.data, user?.id, partner);
        setMessages(prev => prev.some(m => String(m.id) === String(mapped.id)) ? prev : [...prev, mapped]);
        refreshChats();
      } else if (event.type === "deleted") {
        setMessages(prev => prev.map(m => String(m.id) === String(event.msgId) ? { ...m, deleted: true, text: "This message was deleted", type: undefined, imageUrl: undefined, reaction: null } : m));
      } else if (event.type === "reaction") {
        const reaction = Object.keys(event.reactions || {})[0] || null;
        setMessages(prev => prev.map(m => String(m.id) === String(event.msgId) ? { ...m, reaction } : m));
      } else if (event.type === "read") {
        setMessages(prev => prev.map(m => m.outgoing ? { ...m, status: "read" } : m));
      }
    });
    return () => ws.close();
  }, [screen, user?.id]);
  useEffect(() => {
    requestAnimationFrame(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; });
  }, [screen, messages.length]);

  const openChat = async (id) => {
    setScreen(String(id));
    navigate(`/app/chat/${id}`, { replace: true });
    setReplyTo(null); setPending(null); setModal(null);
    await loadMessages(String(id));
  };
  const closeChat = () => {
    setScreen(null); navigate("/app/chat", { replace: true });
    setReplyTo(null); setPending(null); setModal(null);
  };

  const send = async () => {
    if (!screen) return;
    try {
      let attachmentUrl = null, attachmentName = null;
      if (pending?.file) {
        const uploaded = await api.uploadAttachment(screen, pending.file);
        attachmentUrl = uploaded.url;
        attachmentName = uploaded.name || pending.file.name;
      }
      const text = input.trim();
      if (!text && !attachmentUrl) return;
      await api.sendMessageRest(screen, text, attachmentUrl, attachmentName, replyTo?.id || null);
      if (pending?.imageUrl) URL.revokeObjectURL(pending.imageUrl);
      setPending(null); setInput(""); setReplyTo(null);
      await refreshChats();
    } catch (err) {
      setLoadError(err.message || "Couldn't send message.");
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
  const react = async (msg, emoji) => {
    try { await api.sendReaction(msg.id, emoji); } catch (err) { setLoadError(err.message || "Couldn't react."); }
    setModal(null);
  };

  const messageRows = messages.map((m, i) => ({ msg: m, first: !messages[i - 1] || messages[i - 1].outgoing !== m.outgoing, last: !messages[i + 1] || messages[i + 1].outgoing !== m.outgoing }));

  return (
    <div className={`pu-app ${screen ? "pu-in-chat" : ""}`}>
      <header className="pu-peer-header">
        <div className="pu-brand"><span className="pu-logo">P</span><strong>PeerUP</strong></div>
        <div className="pu-header-actions">
          {!screen && <button className="pu-icon-btn" aria-label="Camera"><Video size={19} /></button>}
          {!screen && <button className="pu-icon-btn" aria-label="New chat"><PenLine size={19} /></button>}
          {screen && <button className="pu-icon-btn" aria-label="Search"><Search size={19} /></button>}
        </div>
      </header>

      {!screen ? (
        <main className="pu-list-screen">
          <div className="pu-list-title-row"><h1>Chats</h1></div>
          <label className="pu-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search chats..." /></label>
          <div className="pu-tabs">
            <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All</button>
            <button className={tab === "unread" ? "active" : ""} onClick={() => setTab("unread")}>Unread{unreadCount > 0 && <span className="pu-tab-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}</button>
          </div>
          <div className="pu-chat-list">
            {list.map(chat => (
              <button className="pu-chat-item" key={chat.id} onClick={() => openChat(chat.id)}>
                <Avatar name={chat.name} online={chat.online} size={52} />
                <span className="pu-chat-meta">
                  <span className="pu-chat-top"><span className="pu-chat-name">{chat.name}{chat.verified && <span className="pu-verified">✓</span>}</span><time>{chat.time}</time></span>
                  <span className="pu-chat-bottom"><span className={`pu-chat-preview ${chat.typing ? "typing" : ""} ${chat.isVoice ? "voice" : ""}`}>{chat.isVoice ? "🎙 Voice message" : chat.lastMessage}</span>{chat.unread > 0 && <b className="pu-unread">{chat.unread}</b>}{chat.muted && <BellOff size={13} className="pu-muted" />}</span>
                  {chat.languages?.length > 0 && <span className="pu-language-tags">{chat.languages.map(l => <i key={l}>{l}</i>)}</span>}
                </span>
              </button>
            ))}
            {!list.length && <div className="pu-empty">No chats match your filter.</div>}
          </div>
        </main>
      ) : (
        <main className="pu-conversation">
          <header className="pu-user-header">
            <button className="pu-back" onClick={closeChat} aria-label="Back"><ArrowLeft size={19} /></button>
            <Avatar name={currentChat?.name || "Peer"} online={currentChat?.online} size={40} />
            <div className="pu-user-info"><div><strong>{currentChat?.name}</strong>{currentChat?.verified && <span className="pu-verified">✓</span>}</div><span className={currentChat?.online ? "online" : ""}>{currentChat?.online ? "Online" : "Last seen recently"}</span></div>
            <div className="pu-user-actions"><button className="pu-icon-btn"><Phone size={18} /></button><button className="pu-icon-btn"><Video size={18} /></button><button className="pu-icon-btn"><Info size={18} /></button></div>
          </header>
          <div className="pu-messages" ref={messagesRef}>
            <div className="pu-day-divider">Today</div>
            {messageRows.map(({ msg, first, last }) => <MessageBubble key={msg.id} msg={{ ...msg, senderName: currentChat?.name }} first={first} last={last} onLongPress={m => setModal({ msg: m })} onReplyDrag={m => setReplyTo(m)} onImage={url => setLightbox(url)} />)}
          </div>
          {replyTo && <div className="pu-reply-bar"><span></span><div><b>{replyTo.outgoing ? "You" : currentChat?.name}</b><small>{messagePreview(replyTo)}</small></div><button onClick={() => setReplyTo(null)}><X size={15} /></button></div>}
          {pending && <div className="pu-pending"><div className="pu-pending-thumb">{pending.type === "image" ? <img src={pending.imageUrl} alt="Selected" /> : <FileText size={22} />}</div><div><b>{pending.type === "image" ? "Photo" : pending.fileName}</b><small>{pending.type === "image" ? "Add a caption below, then send" : pending.fileMeta}</small></div><button onClick={removePending}><X size={15} /></button></div>}
          <div className="pu-composer">
            <button className="pu-composer-btn" onClick={() => setModal({ attach: true })} aria-label="Attach"><Plus size={19} /></button>
            <button className="pu-composer-btn" onClick={() => imageInput.current?.click()} aria-label="Gallery"><ImageIcon size={18} /></button>
            <button className="pu-composer-btn" aria-label="Voice"><Mic size={18} /></button>
            <div className="pu-input-wrap"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={pending ? (pending.type === "image" ? "Add a caption..." : "Add a message...") : "Nhắn tin"} /><button className="pu-emoji-btn"><Smile size={18} /></button></div>
            <button className="pu-send" onClick={send} aria-label="Send">{input.trim() || pending ? <Send size={18} fill="currentColor" /> : "👍"}</button>
          </div>
          <input ref={imageInput} type="file" accept="image/*" hidden onChange={pickImage} />
          <input ref={fileInput} type="file" accept="*/*" hidden onChange={pickFile} />
        </main>
      )}

      {modal?.attach && <div className="pu-overlay pu-bottom" onClick={() => setModal(null)}><div className="pu-sheet" onClick={e => e.stopPropagation()}><div className="pu-sheet-head"><b>Share from device</b><button onClick={() => setModal(null)}><X size={16} /></button></div><button className="pu-action" onClick={() => { setModal(null); imageInput.current?.click(); }}><ImageIcon size={18} /><span>Photo from gallery</span></button><button className="pu-action" onClick={() => { setModal(null); fileInput.current?.click(); }}><FileText size={18} /><span>Document / file</span></button></div></div>}

      {modal?.msg && <div className="pu-overlay pu-blur pu-bottom" onClick={() => setModal(null)}><div className="pu-sheet" onClick={e => e.stopPropagation()}><div className={`pu-preview ${modal.msg.outgoing ? "outgoing" : ""}`}>{messagePreview(modal.msg)}</div><div className="pu-reactions">{EMOJIS.map(e => <button key={e} onClick={() => { react(modal.msg, e); }}>{e}</button>)}<button>+</button></div><div className="pu-actions"><button className="pu-action" onClick={copy}><span>Copy</span><Copy size={18} /></button><button className="pu-action" onClick={() => { setReplyTo(modal.msg); setModal(null); }}><span>Reply</span><Reply size={18} /></button><button className="pu-action" onClick={() => setModal(null)}><span>Forward</span><Forward size={18} /></button>{modal.msg.outgoing && <button className="pu-action danger" onClick={openDelete}><span>Delete</span><Trash2 size={18} /></button>}</div></div></div>}

      {deleteMsg && <div className="pu-overlay pu-bottom" onClick={() => setDeleteMsg(null)}><div className="pu-sheet" onClick={e => e.stopPropagation()}><p className="pu-delete-title">Delete message?</p><button className="pu-action danger" onClick={() => setDeleteType("me")}><span>Delete for me</span><Trash2 size={18} /></button><button className="pu-action danger" onClick={() => setDeleteType("everyone")}><span>Delete for everyone</span><UserRoundX size={18} /></button><button className="pu-action" onClick={() => setDeleteMsg(null)}><span>Cancel</span><X size={18} /></button></div></div>}

      {deleteType && <div className="pu-overlay pu-center"><div className="pu-confirm"><h3>Are you sure?</h3><p>{deleteType === "everyone" ? "This will delete the message for everyone in the chat. Are you sure?" : "This will delete the message only for you. Are you sure?"}</p><div><button onClick={() => { setDeleteType(null); setDeleteMsg(null); }}>Cancel</button><button className="danger" onClick={performDelete}>Delete</button></div></div></div>}

      {lightbox && <div className="pu-lightbox"><div className="pu-lightbox-head"><button onClick={() => setLightbox(null)}><X size={18} /></button><b>Photo</b><button onClick={() => window.open(lightbox, "_blank", "noopener,noreferrer")}><Download size={18} /></button></div><div className="pu-lightbox-body"><img src={lightbox} alt="Full view" /></div><div className="pu-lightbox-foot"><a href={lightbox} download="PeerUP-photo"><Download size={16} />Save photo</a></div></div>}
    </div>
  );
}
