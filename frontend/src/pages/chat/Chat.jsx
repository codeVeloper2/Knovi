import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, Video, PenLine, ArrowLeft, Phone, Info, Plus, Image as ImageIcon, Mic, Smile, Send, FileText, X, Copy, Reply, Forward, Trash2, UserRoundX, Download, CheckCheck, BellOff } from "lucide-react";
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

const chatsSeed = [
  { id: "1", name: "Emma Johnson", verified: true, online: true, lastMessage: "Typing...", typing: true, time: "9:41 PM", unread: 2, languages: ["EN", "ES"], muted: false },
  { id: "2", name: "Liam Garcia", verified: true, online: true, lastMessage: "That sounds amazing! 😍", time: "9:30 PM", unread: 1, languages: ["EN", "FR"], muted: false },
  { id: "3", name: "Language Buddies", verified: false, online: false, lastMessage: "Sofia: Can someone help me with this?", time: "8:15 PM", unread: 5, languages: [], muted: true, isGroup: true },
  { id: "4", name: "Sofia Martinez", verified: true, online: true, lastMessage: "Voice message", time: "7:50 PM", unread: 0, languages: ["ES", "EN"], muted: false, isVoice: true },
  { id: "5", name: "Ahmed Hassan", verified: true, online: false, lastMessage: "I want to practice Arabic with you", time: "6:20 PM", unread: 0, languages: ["AR"], muted: false },
  { id: "6", name: "Mika Tanaka", verified: true, online: true, lastMessage: "Let's do a video call tomorrow! 📞", time: "5:42 PM", unread: 0, languages: ["JP", "EN"], muted: false },
  { id: "7", name: "Lucas Moreau", verified: true, online: true, lastMessage: "Merci beaucoup! 🙌", time: "Yesterday", unread: 0, languages: ["FR", "EN"], muted: false },
];

const conversationsSeed = {
  "1": [
    { id: "m1", text: "Hey! How's the new design coming along?", outgoing: false, time: "9:20 PM", status: "read" },
    { id: "m2", text: "Pretty good actually. Just finished the main screens.", outgoing: true, time: "9:22 PM", status: "read" },
    { id: "m3", text: "Can't wait to see it. The last version looked so clean.", outgoing: false, time: "9:23 PM", status: "read" },
    { id: "m4", text: "Thanks! I improved the button placement and spacing like you suggested.", outgoing: true, time: "9:25 PM", status: "read" },
    { id: "m5", text: "The primary call-to-action is much better now.", outgoing: true, time: "9:25 PM", status: "read" },
    { id: "m6", text: "Awesome. Want to hop on a quick call later?", outgoing: false, time: "9:30 PM", status: "read" },
    { id: "m7", text: "Sure, after 10 works for me.", outgoing: true, time: "9:31 PM", status: "delivered" },
  ],
  "2": [
    { id: "m1", text: "Are you free to practice English tonight?", outgoing: false, time: "9:10 PM", status: "read" },
    { id: "m2", text: "Yes! That sounds amazing! 😍", outgoing: true, time: "9:15 PM", status: "read" },
    { id: "m3", text: "We should try it this weekend.", outgoing: false, time: "9:18 PM", status: "read" },
  ],
  "3": [
    { id: "m1", text: "Sofia: Can someone help me with this?", outgoing: false, time: "8:10 PM", status: "read" },
    { id: "m2", text: "Sure, what do you need?", outgoing: true, time: "8:12 PM", status: "read" },
  ],
  "4": [
    { id: "m1", text: "Voice message", outgoing: false, time: "7:48 PM", status: "read", isVoice: true },
    { id: "m2", text: "Got it, I'll listen later!", outgoing: true, time: "7:50 PM", status: "delivered" },
  ],
  "5": [
    { id: "m1", text: "I want to practice Arabic with you", outgoing: false, time: "6:15 PM", status: "read" },
    { id: "m2", text: "Of course! When are you free?", outgoing: true, time: "6:18 PM", status: "read" },
  ],
  "6": [
    { id: "m1", text: "Let's do a video call tomorrow! 📞", outgoing: false, time: "5:40 PM", status: "read" },
    { id: "m2", text: "Sounds good, morning or afternoon?", outgoing: true, time: "5:42 PM", status: "delivered" },
  ],
  "7": [
    { id: "m1", text: "Merci beaucoup! 🙌", outgoing: false, time: "Yesterday", status: "read" },
    { id: "m2", text: "De rien! Anytime.", outgoing: true, time: "Yesterday", status: "read" },
  ],
};

function cloneData() {
  return { chats: structuredClone(chatsSeed), conversations: structuredClone(conversationsSeed) };
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
  const [data, setData] = useState(cloneData);
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
  const imageInput = useRef(null);
  const fileInput = useRef(null);
  const messagesRef = useRef(null);

  const currentChat = data.chats.find(c => c.id === screen) || null;
  const unreadCount = data.chats.reduce((sum, c) => sum + (c.unread || 0), 0);
  const list = useMemo(() => data.chats.filter(c => {
    const q = query.trim().toLowerCase();
    const matches = !q || c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q);
    return matches && (tab === "all" || c.unread > 0);
  }), [data.chats, query, tab]);
  const messages = screen ? (data.conversations[screen] || []) : [];

  useEffect(() => { if (screen) navigate(`/chat/${screen}`, { replace: true }); }, [screen]);
  useEffect(() => { requestAnimationFrame(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }); }, [screen, messages.length]);

  const openChat = (id) => {
    setScreen(id);
    setData(d => ({ ...d, chats: d.chats.map(c => c.id === id ? { ...c, unread: 0 } : c) }));
    setReplyTo(null); setPending(null); setModal(null);
  };
  const closeChat = () => { setScreen(null); navigate("/chat", { replace: true }); setReplyTo(null); setPending(null); setModal(null); };

  const updateMessage = (id, updater) => setData(d => ({ ...d, conversations: { ...d.conversations, [screen]: d.conversations[screen].map(m => m.id === id ? updater(m) : m) } }));

  const send = () => {
    if (!screen) return;
    if (pending) {
      const media = pending;
      const msg = { type: media.type, imageUrl: media.imageUrl, fileName: media.fileName, fileMeta: media.fileMeta, text: input.trim(), outgoing: true, status: "delivered" };
      addMessage(msg); setPending(null); setInput(""); return;
    }
    const text = input.trim();
    if (!text) return;
    addMessage({ text, outgoing: true, status: "delivered" }); setInput("");
  };
  const addMessage = (payload) => {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const reply = replyTo ? { text: messagePreview(replyTo), outgoing: replyTo.outgoing, name: replyTo.outgoing ? "You" : currentChat?.name || "User" } : null;
    const msg = { id: `m${Date.now()}`, time, ...payload, ...(reply ? { replyTo: reply } : {}) };
    setData(d => ({
      chats: d.chats.map(c => c.id === screen ? { ...c, lastMessage: msg.type === "image" ? (msg.text ? `📷 ${msg.text}` : "📷 Photo") : msg.type === "document" ? `📄 ${msg.fileName}` : msg.text, time, typing: false } : c),
      conversations: { ...d.conversations, [screen]: [...(d.conversations[screen] || []), msg] },
    }));
    setReplyTo(null);
  };

  const pickImage = (e) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    const url = URL.createObjectURL(file);
    setPending({ type: "image", imageUrl: url, fileName: file.name });
  };
  const pickFile = (e) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file); setPending({ type: "image", imageUrl: url, fileName: file.name });
    } else setPending({ type: "document", fileName: file.name, fileMeta: `${fileExt(file.name)} · ${fileSize(file.size)}` });
  };
  const removePending = () => { if (pending?.imageUrl) URL.revokeObjectURL(pending.imageUrl); setPending(null); };

  const performDelete = () => {
    if (!deleteMsg || !screen) return;
    setData(d => {
      const current = d.conversations[screen] || [];
      const next = deleteType === "me" ? current.filter(m => m.id !== deleteMsg.id) : current.map(m => m.id === deleteMsg.id ? { ...m, text: "This message was deleted", deleted: true, reaction: null, type: undefined, imageUrl: undefined } : m);
      return { ...d, conversations: { ...d.conversations, [screen]: next } };
    });
    setDeleteMsg(null); setDeleteType(null);
  };
  const copy = async () => { if (modal?.msg?.text) await navigator.clipboard?.writeText(modal.msg.text).catch(() => {}); setModal(null); };
  const openDelete = () => { if (modal?.msg?.outgoing) { setDeleteMsg(modal.msg); setModal(null); } };

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

      {modal?.msg && <div className="pu-overlay pu-blur pu-bottom" onClick={() => setModal(null)}><div className="pu-sheet" onClick={e => e.stopPropagation()}><div className={`pu-preview ${modal.msg.outgoing ? "outgoing" : ""}`}>{messagePreview(modal.msg)}</div><div className="pu-reactions">{EMOJIS.map(e => <button key={e} onClick={() => { updateMessage(modal.msg.id, m => ({ ...m, reaction: e })); setModal(null); }}>{e}</button>)}<button>+</button></div><div className="pu-actions"><button className="pu-action" onClick={copy}><span>Copy</span><Copy size={18} /></button><button className="pu-action" onClick={() => { setReplyTo(modal.msg); setModal(null); }}><span>Reply</span><Reply size={18} /></button><button className="pu-action" onClick={() => setModal(null)}><span>Forward</span><Forward size={18} /></button>{modal.msg.outgoing && <button className="pu-action danger" onClick={openDelete}><span>Delete</span><Trash2 size={18} /></button>}</div></div></div>}

      {deleteMsg && <div className="pu-overlay pu-bottom" onClick={() => setDeleteMsg(null)}><div className="pu-sheet" onClick={e => e.stopPropagation()}><p className="pu-delete-title">Delete message?</p><button className="pu-action danger" onClick={() => setDeleteType("me")}><span>Delete for me</span><Trash2 size={18} /></button><button className="pu-action danger" onClick={() => setDeleteType("everyone")}><span>Delete for everyone</span><UserRoundX size={18} /></button><button className="pu-action" onClick={() => setDeleteMsg(null)}><span>Cancel</span><X size={18} /></button></div></div>}

      {deleteType && <div className="pu-overlay pu-center"><div className="pu-confirm"><h3>Are you sure?</h3><p>{deleteType === "everyone" ? "This will delete the message for everyone in the chat. Are you sure?" : "This will delete the message only for you. Are you sure?"}</p><div><button onClick={() => { setDeleteType(null); setDeleteMsg(null); }}>Cancel</button><button className="danger" onClick={performDelete}>Delete</button></div></div></div>}

      {lightbox && <div className="pu-lightbox"><div className="pu-lightbox-head"><button onClick={() => setLightbox(null)}><X size={18} /></button><b>Photo</b><button onClick={() => window.open(lightbox, "_blank", "noopener,noreferrer")}><Download size={18} /></button></div><div className="pu-lightbox-body"><img src={lightbox} alt="Full view" /></div><div className="pu-lightbox-foot"><a href={lightbox} download="PeerUP-photo"><Download size={16} />Save photo</a></div></div>}
    </div>
  );
}
