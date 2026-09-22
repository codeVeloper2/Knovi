import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import "../../styles/chat.css";

const Icon = ({ children, size = 20, stroke = "currentColor", fill = "none", viewBox = "0 0 24 24" }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const SearchIcon = p => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon>;
const PlusIcon = p => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>;
const BackIcon = p => <Icon {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></Icon>;
const PhoneIcon = p => <Icon {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 11.2 18.85 19.5 19.5 0 0 1 5.15 12.8 19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.07 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.12L8.05 9.9a16 16 0 0 0 6.05 6.05l1.26-1.26a2 2 0 0 1 2.12-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92z"/></Icon>;
const VideoIcon = p => <Icon {...p}><path d="m23 7-7 5 7 5V7Z"/><rect x="1" y="5" width="15" height="14" rx="2"/></Icon>;
const MoreIcon = p => <Icon {...p} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></Icon>;
const AttachIcon = p => <Icon {...p}><path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.6 5.7l-9 9a2 2 0 1 1-2.8-2.8l8.5-8.5"/></Icon>;
const ImageIcon = p => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></Icon>;
const MicIcon = p => <Icon {...p}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0M12 17v5M8 22h8"/></Icon>;
const SmileIcon = p => <Icon {...p}><circle cx="12" cy="12" r="9.5"/><path d="M8 14.5s1.6 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/></Icon>;
const SendIcon = p => <Icon {...p} fill="currentColor" stroke="none"><path d="M2.5 3.2 21.7 12 2.5 20.8 4.8 13 15 12 4.8 11 2.5 3.2Z"/></Icon>;
const FileIcon = p => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></Icon>;
const CloseIcon = p => <Icon {...p}><path d="M18 6 6 18M6 6l12 12"/></Icon>;
const ReplyIcon = p => <Icon {...p}><path d="M9 17 4 12l5-5M4 12h9a7 7 0 0 1 7 7v1"/></Icon>;
const CopyIcon = p => <Icon {...p}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></Icon>;
const TrashIcon = p => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3M6 7l1 14h10l1-14"/></Icon>;
const InfoIcon = p => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></Icon>;
const CheckIcon = p => <Icon {...p}><path d="m4 12 5 5L20 6"/></Icon>;
const DoubleCheckIcon = ({ read, size = 16 }) => <Icon size={size} stroke={read ? "#60a5fa" : "currentColor"}><path d="m2 12 4 4L14 8"/><path d="m8 12 4 4 9-9"/></Icon>;
const GoalIcon = p => <Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></Icon>;

const EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "🔥", "✨"];

function timeLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(value) {
  const d = new Date(value);
  const n = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}
function listTime(value) {
  if (!value) return "";
  const d = new Date(value);
  const n = new Date();
  if (d.toDateString() === n.toDateString()) return timeLabel(value);
  const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function fileKind(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  return "file";
}

function Avatar({ person, size = 48, online = false }) {
  const name = person?.displayName || person?.name || "Peer";
  const initial = name.trim().charAt(0).toUpperCase() || "P";
  return (
    <span className="peerup-chat-avatar-wrap" style={{ width: size, height: size }}>
      {person?.photoURL ? (
        <img className="peerup-chat-avatar" src={person.photoURL} alt={name} width={size} height={size} referrerPolicy="no-referrer" />
      ) : (
        <span className="peerup-chat-avatar peerup-chat-avatar-fallback" style={{ fontSize: Math.max(14, size * .38) }}>{initial}</span>
      )}
      {online && <i className="peerup-chat-online" />}
    </span>
  );
}

function ComingSoon({ title, onClose }) {
  return (
    <div className="peerup-chat-modal-backdrop" onClick={onClose}>
      <div className="peerup-chat-modal" onClick={e => e.stopPropagation()}>
        <div className="peerup-chat-modal-icon">{title === "Voice note" ? "🎙️" : title === "Voice call" ? "📞" : "🎥"}</div>
        <h3>{title}</h3>
        <p>This prototype keeps the control in place. The feature can be connected to the real service later.</p>
        <button type="button" className="peerup-chat-primary-btn" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

function NewChat({ onClose, onStarted }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const subjects = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Computer Science", "Economics", "Accounting", "History"];

  useEffect(() => {
    if (!query.trim()) { setUsers([]); return; }
    let alive = true;
    const timer = setTimeout(() => {
      api.searchChatUsers(query.trim()).then(data => { if (alive) setUsers(Array.isArray(data) ? data : []); }).catch(() => { if (alive) setUsers([]); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
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
    <div className="peerup-chat-modal-backdrop" onClick={onClose}>
      <div className="peerup-chat-modal peerup-chat-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="peerup-chat-modal-head"><div><span className="peerup-chat-kicker">NEW CONVERSATION</span><h2>Start a chat</h2></div><button type="button" className="peerup-chat-icon-btn" onClick={onClose}><CloseIcon /></button></div>
        {!selected ? (
          <>
            <label className="peerup-chat-search large"><SearchIcon /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a study partner" /></label>
            <div className="peerup-chat-user-results">
              {!query && <p className="peerup-chat-muted">Search by name to find a study partner.</p>}
              {users.map(u => <button key={u.partnerId || u.id || u.uid} type="button" className="peerup-chat-user-result" onClick={() => setSelected(u)}><Avatar person={u} size={42} online={u.isOnline}/><span><b>{u.displayName || u.name}</b><small>{u.grade || u.subject || "PeerUP learner"}</small></span></button>)}
              {query && !users.length && <p className="peerup-chat-muted">No matching users found.</p>}
            </div>
          </>
        ) : (
          <>
            <div className="peerup-chat-selected-user"><Avatar person={selected} size={44}/><div><b>{selected.displayName || selected.name}</b><button type="button" onClick={() => setSelected(null)}>Change</button></div></div>
            <label className="peerup-chat-field"><span>Subject</span><select value={subject} onChange={e => setSubject(e.target.value)}><option value="">Select a subject</option>{subjects.map(s => <option key={s}>{s}</option>)}</select></label>
            <label className="peerup-chat-field"><span>Session goal <em>optional</em></span><input value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Finish Chapter 5 problems" /></label>
            <div className="peerup-chat-modal-actions"><button type="button" className="peerup-chat-secondary-btn" onClick={onClose}>Cancel</button><button type="button" className="peerup-chat-primary-btn" disabled={!subject || busy} onClick={start}>{busy ? "Starting…" : "Start chat"}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

function ConversationList({ conversations, activeId, myId, onSelect, onNew }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const unread = conversations.reduce((n, c) => n + (c.unread || 0), 0);
  const list = useMemo(() => conversations.filter(c => {
    const q = query.trim().toLowerCase();
    const match = !q || c.partner?.displayName?.toLowerCase().includes(q) || c.subject?.toLowerCase().includes(q) || c.lastMessage?.body?.toLowerCase().includes(q);
    return match && (filter === "all" || (c.unread || 0) > 0);
  }), [conversations, query, filter]);

  return (
    <aside className="peerup-chat-list-pane">
      <header className="peerup-chat-list-header">
        <div className="peerup-chat-brand"><div className="peerup-chat-logo">P</div><div><h1>Chats</h1><span>Study together</span></div></div>
        <div className="peerup-chat-header-actions"><button type="button" className="peerup-chat-icon-btn" onClick={onNew} aria-label="New chat"><PlusIcon /></button></div>
      </header>
      <label className="peerup-chat-search"><SearchIcon /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search chats..." />{query && <button type="button" onClick={() => setQuery("")}><CloseIcon size={15}/></button>}</label>
      <div className="peerup-chat-tabs"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>Unread {unread > 0 && <span>{unread > 9 ? "9+" : unread}</span>}</button></div>
      <div className="peerup-chat-list-title"><span>{filter === "all" ? "All chats" : "Unread"}</span><span>{list.length}</span></div>
      <div className="peerup-chat-list">
        {list.length === 0 ? <div className="peerup-chat-list-empty"><div>💬</div><b>{conversations.length ? "No matches" : "Your inbox is empty"}</b><p>{conversations.length ? "Try another search or filter." : "Start a conversation with a study partner."}</p><button type="button" onClick={onNew}>Start a chat</button></div> : list.map(c => {
          const last = c.lastMessage;
          const mine = last?.senderId === myId;
          const preview = last?.deleted ? "Message deleted" : last?.body || (last?.attachmentUrl ? "Sent an attachment" : "Start your study conversation");
          return <button key={c.id} type="button" className={`peerup-chat-row ${activeId === c.id ? "active" : ""}`} onClick={() => onSelect(c)}>
            <Avatar person={c.partner} size={52} online={c.partner?.isOnline}/>
            <div className="peerup-chat-row-main"><div className="peerup-chat-row-top"><b>{c.partner?.displayName || "Peer"}</b><time className={c.unread ? "unread" : ""}>{listTime(last?.createdAt)}</time></div><div className="peerup-chat-row-bottom"><span>{mine ? "You: " : ""}{preview}</span>{c.unread > 0 && <i>{c.unread > 9 ? "9+" : c.unread}</i>}</div>{c.subject && <small>{c.subject}</small>}{c.sessionGoal && <div className="peerup-chat-goal"><GoalIcon size={13}/> {c.sessionGoal}</div>}</div>
          </button>;
        })}
      </div>
      <button type="button" className="peerup-chat-new-fab" onClick={onNew}><PlusIcon size={18}/> <span>New chat</span></button>
    </aside>
  );
}

function ReactionPicker({ onPick, onClose }) {
  useEffect(() => { const close = () => onClose(); const id = setTimeout(() => document.addEventListener("click", close), 0); return () => { clearTimeout(id); document.removeEventListener("click", close); }; }, [onClose]);
  return <div className="peerup-chat-reaction-picker" onClick={e => e.stopPropagation()}>{EMOJIS.map(e => <button key={e} type="button" onClick={() => onPick(e)}>{e}</button>)}</div>;
}

function Message({ msg, mine, partner, myId, onReply, onReact, onDelete, onReport, onCopy, onImage }) {
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [swipe, setSwipe] = useState(0);
  const startX = useRef(0);
  const timer = useRef(null);
  const kind = fileKind(msg.attachmentName);
  const reactions = msg.reactions || {};

  function touchStart(e) { startX.current = e.touches[0].clientX; clearTimeout(timer.current); timer.current = setTimeout(() => setMenu(true), 550); }
  function touchMove(e) { clearTimeout(timer.current); const dx = e.touches[0].clientX - startX.current; if (dx > 0) setSwipe(Math.min(dx, 70)); }
  function touchEnd() { clearTimeout(timer.current); if (swipe > 50) onReply(msg); setSwipe(0); }

  if (msg.deleted) return <div className={`peerup-chat-message ${mine ? "mine" : "theirs"}`}><div className="peerup-chat-deleted"><TrashIcon size={14}/><em>This message was deleted</em></div></div>;

  return <div className={`peerup-chat-message ${mine ? "mine" : "theirs"}`}>
    {!mine && <Avatar person={partner} size={28}/>}<div className="peerup-chat-message-stack" style={{ transform: `translateX(${swipe}px)` }}>
      {swipe > 20 && <div className="peerup-chat-reply-hint"><ReplyIcon size={15}/></div>}
      <div className={`peerup-chat-bubble ${mine ? "out" : "in"}`} onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd}>
        {msg.replyToSnapshot && <div className="peerup-chat-quote"><b>{msg.replyToSenderName || partner?.displayName || "Reply"}</b><span>{msg.replyToSnapshot}</span></div>}
        {msg.attachmentUrl && kind === "image" && <img className="peerup-chat-message-image" src={msg.attachmentUrl} alt={msg.attachmentName || "Image"} onClick={() => onImage(msg.attachmentUrl, msg.attachmentName)}/>}
        {msg.attachmentUrl && kind === "video" && <video className="peerup-chat-message-video" src={msg.attachmentUrl} controls playsInline />}
        {msg.attachmentUrl && kind === "file" && <div className="peerup-chat-file"><span><FileIcon/></span><div><b>{msg.attachmentName || "File"}</b><small>{(msg.attachmentName || "FILE").split(".").pop().toUpperCase()}</small></div></div>}
        {msg.body && <p>{msg.body}</p>}
        <div className="peerup-chat-meta"><time>{timeLabel(msg.createdAt)}</time>{mine && (msg.failed ? <span>⚠️</span> : msg.pending ? <span>⌛</span> : msg.isRead || msg.isDelivered ? <DoubleCheckIcon read={msg.isRead}/> : <CheckIcon size={14}/>)}</div>
      </div>
      {Object.keys(reactions).length > 0 && <div className={`peerup-chat-reactions ${mine ? "right" : "left"}`}>{Object.entries(reactions).map(([emoji, users]) => <button key={emoji} type="button" onClick={() => onReact(msg.id, emoji)}>{emoji}<span>{Array.isArray(users) ? users.length : users}</span></button>)}</div>}
      <div className={`peerup-chat-message-actions ${mine ? "right" : "left"}`}>
        <button type="button" onClick={() => setPicker(v => !v)}><SmileIcon size={15}/></button><button type="button" onClick={() => onReply(msg)}><ReplyIcon size={15}/></button><button type="button" onClick={() => setMenu(v => !v)}><MoreIcon size={15}/></button>
        {picker && <ReactionPicker onPick={e => { onReact(msg.id, e); setPicker(false); }} onClose={() => setPicker(false)}/>}
        {menu && <div className={`peerup-chat-message-menu ${mine ? "right" : "left"}`}>
          <button type="button" onClick={() => { onReply(msg); setMenu(false); }}><ReplyIcon size={15}/>Reply</button>
          <button type="button" onClick={() => { onCopy(msg); setMenu(false); }}><CopyIcon size={15}/>Copy</button>
          {mine ? <button type="button" className="danger" onClick={() => { onDelete(msg.id); setMenu(false); }}><TrashIcon size={15}/>Delete</button> : <button type="button" className="danger" onClick={() => { onReport(msg.id); setMenu(false); }}><InfoIcon size={15}/>Report</button>}
        </div>}
      </div>
    </div>
  </div>;
}

function ChatRoom({ conversation, myId, onBack, onRefresh }) {
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [reply, setReply] = useState(null);
  const [staged, setStaged] = useState(null);
  const [typing, setTyping] = useState(false);
  const [goalEditing, setGoalEditing] = useState(false);
  const [goal, setGoal] = useState(conversation.sessionGoal || "");
  const [notice, setNotice] = useState(true);
  const [comingSoon, setComingSoon] = useState(null);
  const [imageView, setImageView] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const bottomRef = useRef(null);
  const socketRef = useRef(null);
  const typingRef = useRef(null);
  const fileRef = useRef(null);
  const imageRef = useRef(null);

  const partner = conversation.partner;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getMessages(conversation.id).then(data => {
      if (!alive) return;
      const byId = Object.fromEntries(data.map(m => [m.id, m]));
      setMessages(data.filter(m => !m.hiddenForMe).map(m => ({ ...m, replyToSenderName: m.replyToId && byId[m.replyToId] ? (byId[m.replyToId].senderId === myId ? "You" : partner?.displayName) : m.replyToSenderName })));
    }).catch(() => toast.error("Couldn't load messages.")).finally(() => alive && setLoading(false));
    api.markRead(conversation.id).catch(() => {});
    return () => { alive = false; };
  }, [conversation.id]);

  useEffect(() => {
    const ws = api.openChatSocket(conversation.id, event => {
      if (event.type === "message") {
        setMessages(prev => {
          const pending = prev.find(m => m.pending && m.senderId === myId && m.body === event.data.body);
          const without = prev.filter(m => !(m.pending && m.senderId === myId && m.body === event.data.body));
          if (without.some(m => m.id === event.data.id)) return without;
          return [...without, { ...event.data, replyToSnapshot: event.data.replyToSnapshot || pending?.replyToSnapshot, replyToSenderName: pending?.replyToSenderName }];
        });
        api.markRead(conversation.id).catch(() => {});
      }
      if (event.type === "typing" && event.userId !== myId) { setTyping(true); clearTimeout(typingRef.current); typingRef.current = setTimeout(() => setTyping(false), 1800); }
      if (event.type === "delivered") { const ids = new Set(event.msgIds || []); setMessages(prev => prev.map(m => ids.has(m.id) ? { ...m, isDelivered: true } : m)); }
      if (event.type === "read") setMessages(prev => prev.map(m => m.senderId === myId ? { ...m, isRead: true, isDelivered: true } : m));
      if (event.type === "deleted") setMessages(prev => prev.map(m => m.id === event.msgId ? { ...m, deleted: true, body: "", attachmentUrl: null } : m));
      if (event.type === "reaction") setMessages(prev => prev.map(m => m.id === event.msgId ? { ...m, reactions: event.reactions } : m));
    }, () => {});
    socketRef.current = ws;
    return () => { ws.close(); socketRef.current = null; };
  }, [conversation.id, myId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth" }); }, [messages, typing, loading]);

  function typingNow(value) {
    setText(value);
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: "typing" }));
  }
  function pickFile(e, forceImage = false) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    setStaged({ file, url, kind: forceImage ? "image" : fileKind(file.name) });
  }
  function clearStaged() { if (staged?.url) URL.revokeObjectURL(staged.url); setStaged(null); }

  async function send(e, bodyOverride = null) {
    e?.preventDefault();
    const body = bodyOverride ?? text.trim();
    if ((!body && !staged) || staged?.kind === "video" && !staged.file) return;
    const currentReply = reply;
    setText(""); setReply(null);
    if (staged) {
      const item = staged; setStaged(null);
      const tempId = `upload-${Date.now()}`;
      setMessages(prev => [...prev, { id: tempId, senderId: myId, body, attachmentUrl: item.url, attachmentName: item.file.name, createdAt: new Date().toISOString(), pending: true }]);
      try {
        const uploaded = await api.uploadAttachment(conversation.id, item.file);
        const real = await api.sendMessageRest(conversation.id, body, uploaded.url, uploaded.name, currentReply?.id || null);
        setMessages(prev => prev.filter(m => m.id !== tempId).concat(real));
        if (item.url) URL.revokeObjectURL(item.url);
        onRefresh(conversation.id);
      } catch { if (item.url) URL.revokeObjectURL(item.url); setMessages(prev => prev.map(m => m.id === tempId ? { ...m, failed: true } : m)); toast.error("Couldn't upload that file."); }
      return;
    }
    const tempId = `msg-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, senderId: myId, body, createdAt: new Date().toISOString(), pending: true, replyToSnapshot: currentReply?.body, replyToSenderName: currentReply?.senderName }]);
    try {
      if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: "message", body, replyToId: currentReply?.id || null }));
      else {
        const real = await api.sendMessageRest(conversation.id, body, null, null, currentReply?.id || null);
        setMessages(prev => prev.filter(m => m.id !== tempId).concat(real));
      }
      onRefresh(conversation.id);
    } catch { setMessages(prev => prev.map(m => m.id === tempId ? { ...m, failed: true } : m)); toast.error("Couldn't send your message."); }
  }

  async function react(id, emoji) { try { const result = await api.sendReaction(id, emoji); setMessages(prev => prev.map(m => m.id === id ? { ...m, reactions: result.reactions } : m)); } catch { toast.error("Couldn't add reaction."); } }
  async function deleteMessage(id, scope) { setDeleteId(null); if (scope === "me") setMessages(prev => prev.filter(m => m.id !== id)); else setMessages(prev => prev.map(m => m.id === id ? { ...m, deleted: true, body: "", attachmentUrl: null } : m)); try { await api.deleteMessage(id, scope); } catch { toast.error("Couldn't delete the message."); } }
  async function report(id) { try { await api.reportMessage(id); toast.success("Message reported."); } catch { toast.error("Couldn't report the message."); } }
  async function copy(msg) { const value = msg.body || (msg.attachmentName ? `📎 ${msg.attachmentName}` : ""); if (!value) return; try { await navigator.clipboard.writeText(value); toast.success("Message copied."); } catch { toast.error("Couldn't copy the message."); } }
  async function saveGoal() { try { const result = await api.setGoal(conversation.id, goal.trim()); setGoal(result.sessionGoal || ""); setGoalEditing(false); onRefresh(); } catch { toast.error("Couldn't update the goal."); } }

  const grouped = [];
  let previousDay = "";
  for (const msg of messages) {
    const key = new Date(msg.createdAt).toDateString();
    if (key !== previousDay) { grouped.push({ type: "day", id: `day-${key}`, label: dayLabel(msg.createdAt) }); previousDay = key; }
    grouped.push({ type: "message", msg });
  }

  return <section className="peerup-chat-room">
    <header className="peerup-chat-room-header">
      <button type="button" className="peerup-chat-icon-btn peerup-chat-back" onClick={onBack} aria-label="Back"><BackIcon/></button>
      <Avatar person={partner} size={42} online={partner?.isOnline}/>
      <div className="peerup-chat-room-user"><b>{partner?.displayName || "Peer"}</b><span>{typing ? "typing…" : partner?.isOnline ? "Online" : conversation.subject || "Offline"}</span></div>
      <div className="peerup-chat-room-actions"><button type="button" className="peerup-chat-icon-btn" onClick={() => setComingSoon("Voice call")}><PhoneIcon/></button><button type="button" className="peerup-chat-icon-btn" onClick={() => setComingSoon("Video call")}><VideoIcon/></button><button type="button" className="peerup-chat-icon-btn" onClick={() => setComingSoon("Conversation info")}><InfoIcon/></button></div>
    </header>

    {notice && <div className="peerup-chat-notice"><InfoIcon size={15}/><span>This is a study space. Keep it respectful and on-topic.</span><button type="button" onClick={() => setNotice(false)}><CloseIcon size={14}/></button></div>}

    {goalEditing ? <div className="peerup-chat-goal-editor"><GoalIcon size={17}/><input autoFocus value={goal} onChange={e => setGoal(e.target.value)} placeholder="Set a session goal"/><button type="button" onClick={saveGoal}>Save</button><button type="button" onClick={() => { setGoalEditing(false); setGoal(conversation.sessionGoal || ""); }}>Cancel</button></div> : conversation.sessionGoal && <button type="button" className="peerup-chat-goal-banner" onClick={() => setGoalEditing(true)}><GoalIcon size={15}/><span>{conversation.sessionGoal}</span></button>}

    <div className="peerup-chat-messages">
      {loading ? <div className="peerup-chat-loading"><span/><span/><i/><b/></div> : grouped.map(group => group.type === "day" ? <div className="peerup-chat-day" key={group.id}><span>{group.label}</span></div> : <Message key={group.msg.id} msg={group.msg} mine={group.msg.senderId === myId} partner={partner} myId={myId} onReply={m => setReply({ id: m.id, body: m.body || (m.attachmentName ? `📎 ${m.attachmentName}` : "Attachment"), senderName: m.senderId === myId ? "You" : partner?.displayName })} onReact={react} onDelete={id => setDeleteId(id)} onReport={report} onCopy={copy} onImage={(url, name) => setImageView({ url, name })}/>)}
      {typing && <div className="peerup-chat-typing"><Avatar person={partner} size={28}/><span><i/><i/><i/></span></div>}
      <div ref={bottomRef}/>
    </div>

    <form className="peerup-chat-composer" onSubmit={e => send(e)}>
      {reply && <div className="peerup-chat-reply-bar"><div><b>{reply.senderName}</b><span>{reply.body}</span></div><button type="button" onClick={() => setReply(null)}><CloseIcon size={15}/></button></div>}
      {staged && <div className="peerup-chat-staged"><div className="peerup-chat-staged-thumb">{staged.kind === "image" ? <img src={staged.url} alt="Selected"/> : staged.kind === "video" ? <video src={staged.url} muted/> : <FileIcon size={22}/>}</div><div><b>{staged.file.name}</b><span>Selected from this device</span></div><button type="button" onClick={clearStaged}><CloseIcon size={15}/></button></div>}
      <div className="peerup-chat-composer-row">
        <button type="button" className="peerup-chat-composer-btn" onClick={() => fileRef.current?.click()} aria-label="Attach file"><AttachIcon/></button>
        <input ref={fileRef} type="file" hidden accept="*/*" onChange={e => pickFile(e, false)}/>
        <button type="button" className="peerup-chat-composer-btn" onClick={() => imageRef.current?.click()} aria-label="Choose photo or video"><ImageIcon/></button>
        <input ref={imageRef} type="file" hidden accept="image/*,video/*" onChange={e => pickFile(e, true)}/>
        <button type="button" className="peerup-chat-composer-btn" onClick={() => setComingSoon("Voice note")} aria-label="Voice note"><MicIcon/></button>
        <div className="peerup-chat-input-wrap"><input value={text} onChange={e => typingNow(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={staged ? "Add a caption…" : "Message"}/><button type="button" onClick={() => setText(v => `${v}${v ? " " : ""}😊`)} aria-label="Emoji"><SmileIcon/></button></div>
        <button type={text.trim() || staged ? "submit" : "button"} className="peerup-chat-send" onClick={e => { if (!text.trim() && !staged) { e.preventDefault(); send(e, "👍"); } }} aria-label="Send">{text.trim() || staged ? <SendIcon size={19}/> : <span>👍</span>}</button>
      </div>
    </form>

    {comingSoon && <ComingSoon title={comingSoon} onClose={() => setComingSoon(null)}/>}
    {imageView && <div className="peerup-chat-lightbox" onClick={() => setImageView(null)}><button type="button" onClick={() => setImageView(null)}><CloseIcon/></button><img src={imageView.url} alt={imageView.name || "Image"}/></div>}
    {deleteId && <div className="peerup-chat-modal-backdrop" onClick={() => setDeleteId(null)}><div className="peerup-chat-modal" onClick={e => e.stopPropagation()}><div className="peerup-chat-modal-icon">🗑️</div><h3>Delete message?</h3><p>Choose how you want to remove this message.</p><button type="button" className="peerup-chat-danger-btn" onClick={() => deleteMessage(deleteId, "everyone")}>Delete for everyone</button><button type="button" className="peerup-chat-secondary-btn" onClick={() => deleteMessage(deleteId, "me")}>Delete for me</button><button type="button" className="peerup-chat-text-btn" onClick={() => setDeleteId(null)}>Cancel</button></div></div>}
  </section>;
}

function EmptyRoom({ onNew }) {
  return <section className="peerup-chat-empty-room"><div className="peerup-chat-empty-icon">💬</div><h2>Select a chat</h2><p>Your study conversations appear here.</p><button type="button" className="peerup-chat-primary-btn" onClick={onNew}>Start a chat</button></section>;
}

function LoadingShell() {
  return <div className="peerup-chat-shell peerup-chat-loading-shell"><aside className="peerup-chat-list-pane"><div className="peerup-chat-loading-title"/><div className="peerup-chat-loading-search"/><div className="peerup-chat-loading-list">{[1,2,3,4,5].map(i => <div key={i}><i/><span/><b/></div>)}</div></aside><section className="peerup-chat-empty-room"><div className="peerup-chat-spinner"/></section></div>;
}

export default function ChatPage() {
  const { profile, user } = useAuth();
  const { convId } = useParams();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newChat, setNewChat] = useState(false);
  const myId = parseInt(profile?.uid || user?.uid || "0", 10);

  async function refresh(selectId = null) {
    try {
      const data = await api.listConversations();
      setConversations(data);
      if (selectId) setActive(data.find(c => String(c.id) === String(selectId)) || null);
      return data;
    } catch { return []; }
  }
  useEffect(() => { let alive = true; api.listConversations().then(data => { if (!alive) return; setConversations(data); if (convId) setActive(data.find(c => String(c.id) === String(convId)) || null); }).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, [convId]);
  useEffect(() => { document.body.classList.toggle("peerup-chat-open", !!active); return () => document.body.classList.remove("peerup-chat-open"); }, [active]);

  if (loading) return <LoadingShell/>;
  return <div className={`peerup-chat-shell ${active ? "has-room" : ""}`}>
    <ConversationList conversations={conversations} activeId={active?.id} myId={myId} onSelect={c => setActive(c)} onNew={() => setNewChat(true)}/>
    {active ? <ChatRoom key={active.id} conversation={active} myId={myId} onBack={() => setActive(null)} onRefresh={refresh}/> : <EmptyRoom onNew={() => setNewChat(true)}/>}
    {newChat && <NewChat onClose={() => setNewChat(false)} onStarted={async conv => { setNewChat(false); await refresh(conv.id); }}/>}
  </div>;
}
