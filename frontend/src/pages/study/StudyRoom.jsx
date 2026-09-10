import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import DOMPurify from "dompurify";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

// ── Icons ─────────────────────────────────────────────────────────────────
const TimerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const FocusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/>
  </svg>
);
const EndIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><path d="M9 9l6 6m0-6l-6 6"/>
  </svg>
);
const StarIcon = ({ filled = false }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2 21 23 12 2 3v7l15 2-15 2z"/>
  </svg>
);
const TickIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);
const DoubleTickIcon = () => (
  <svg width="18" height="14" viewBox="0 0 26 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M2 7l4 4 8-8"/><path d="M10 7l4 4 8-8"/>
  </svg>
);
const MaterialsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>
);
const WhiteboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
  </svg>
);
const NotesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
);

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Avatar({ url, name, size = 32 }) {
  const initials = (name || "?").trim().slice(0, 1).toUpperCase();
  return url
    ? <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} referrerPolicy="no-referrer" />
    : <div className="qchat-avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.4, flexShrink: 0 }}>{initials}</div>;
}

// ── Confetti ──────────────────────────────────────────────────────────────
function Confetti() {
  const particles = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: ["#ffd700", "#ff6b6b", "#4ecdc4", "#45b7d1", "#96e6a1", "#a29bfe", "#ff9ff3"][i % 7],
      delay: Math.random() * 1.5,
      duration: 2.5 + Math.random() * 2,
      size: 6 + Math.random() * 8,
      shape: i % 3 === 0 ? "50%" : "2px",
    })), []);
  return (
    <div className="confetti-container">
      {particles.map(p => (
        <div key={p.id} className="confetti-particle" style={{
          left: `${p.left}%`,
          backgroundColor: p.color,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
          width: p.size,
          height: p.size,
          borderRadius: p.shape,
        }} />
      ))}
    </div>
  );
}

// ── Whiteboard Panel (Excalidraw) ─────────────────────────────────────────
function WhiteboardPanel({ wsRef, onRegisterApi, initialElements, onSave }) {
  const excalidrawApiRef = useRef(null);
  const isApplyingRemote = useRef(false);
  const broadcastTimerRef = useRef(null);
  const dbSaveTimerRef = useRef(null);

  // Register our API with parent so it can push remote updates
  useEffect(() => {
    onRegisterApi({
      applyRemoteElements: (remoteElements) => {
        if (!excalidrawApiRef.current) return;
        isApplyingRemote.current = true;
        // Merge by ID: update existing, add new — never remove local elements
        const current = excalidrawApiRef.current.getSceneElements();
        const byId = new Map(current.map(e => [e.id, e]));
        for (const el of remoteElements) byId.set(el.id, el);
        excalidrawApiRef.current.updateScene({ elements: Array.from(byId.values()) });
        setTimeout(() => { isApplyingRemote.current = false; }, 80);
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(elements) {
    if (isApplyingRemote.current) return;
    const snapshot = JSON.parse(JSON.stringify(elements));
    // Broadcast to partner (fast, 200ms debounce)
    clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "whiteboard_op",
          op: { kind: "sync", elements: snapshot },
        }));
      }
    }, 200);
    // Persist to DB (slow, 2s debounce)
    clearTimeout(dbSaveTimerRef.current);
    dbSaveTimerRef.current = setTimeout(() => {
      onSave?.(snapshot);
    }, 2000);
  }

  return (
    <div className="study-excalidraw-container">
      <Excalidraw
        excalidrawAPI={(api) => { excalidrawApiRef.current = api; }}
        onChange={(elements) => handleChange(elements)}
        initialData={{ elements: initialElements || [], appState: { viewBackgroundColor: "#ffffff" } }}
        UIOptions={{
          canvasActions: {
            export: false,
            loadScene: false,
            saveAsImage: false,
            saveToActiveFile: false,
            theme: false,
            clearCanvas: false,
            changeViewBackgroundColor: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  );
}

// ── Learning Journey Screen ───────────────────────────────────────────────
function LearningJourneyScreen({ room, partner, profile, onDone }) {
  const sessionCount = (profile?.sessionCount || 1);
  const progressPct = Math.min(100, (sessionCount / 10) * 100);
  const xp = (profile?.xp || 0) + 50; // include XP just earned
  const nextSteps = [
    { icon: "🧠", label: "Take a quiz", desc: "Test what you learned today" },
    { icon: "📖", label: "Review notes", desc: "Read through your session notes" },
    { icon: "🗂️", label: "Make flashcards", desc: "Reinforce key concepts" },
    { icon: "🤝", label: "Book next session", desc: `Schedule another session with ${partner?.displayName || "your partner"}` },
  ];

  return (
    <div className="learning-journey-screen">
      <div className="learning-journey-content">
        <div className="learning-journey-trophy">🎓</div>
        <h2 className="learning-journey-title">Learning Journey Update</h2>
        <p className="learning-journey-subtitle">
          Session #{sessionCount} in <strong>{room.subject}</strong> complete!
        </p>

        {/* XP Badge */}
        <div className="learning-journey-xp-badge">
          <span className="lj-xp-plus">+50 XP</span>
          <span className="lj-xp-total">{xp} XP total</span>
        </div>

        {/* Progress bar */}
        <div className="learning-journey-progress-section">
          <div className="lj-progress-header">
            <span>Your {room.subject} Journey</span>
            <span>{sessionCount}/10 sessions</span>
          </div>
          <div className="lj-progress-track">
            <div className="lj-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="lj-progress-caption">
            {progressPct >= 100
              ? "🏆 Milestone reached! You've completed 10 sessions in this subject."
              : `${10 - sessionCount} more session${10 - sessionCount === 1 ? "" : "s"} to reach your first milestone`}
          </p>
        </div>

        {/* Next steps */}
        <div className="lj-next-steps">
          <h3 className="lj-next-steps-title">Recommended Next Steps</h3>
          <div className="lj-steps-grid">
            {nextSteps.map((step, i) => (
              <div key={i} className="lj-step-card">
                <span className="lj-step-icon">{step.icon}</span>
                <div>
                  <div className="lj-step-label">{step.label}</div>
                  <div className="lj-step-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 24 }} onClick={onDone}>
          Back to Chat
        </button>
      </div>
    </div>
  );
}

// ── Rich Text Notes Editor ─────────────────────────────────────────────────
function NotesEditor({ htmlValue, onChange, partnerName, partnerIsEditing }) {
  const editorRef = useRef(null);
  const isLocalEdit = useRef(false);
  const [fmt, setFmt] = useState({
    bold: false, italic: false, underline: false, strikeThrough: false,
    insertUnorderedList: false, insertOrderedList: false,
    justifyLeft: false, justifyCenter: false, justifyRight: false,
    block: "p",
  });

  // Re-read formatting state whenever selection changes
  function updateFmt() {
    try {
      const block = (document.queryCommandValue("formatBlock") || "p").toLowerCase();
      setFmt({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
        justifyLeft: document.queryCommandState("justifyLeft"),
        justifyCenter: document.queryCommandState("justifyCenter"),
        justifyRight: document.queryCommandState("justifyRight"),
        block,
      });
    } catch { /* ignore in unsupported envs */ }
  }

  useEffect(() => {
    document.addEventListener("selectionchange", updateFmt);
    return () => document.removeEventListener("selectionchange", updateFmt);
  }, []);

  // Apply partner's incoming notes only when we're not actively editing
  useEffect(() => {
    if (!editorRef.current) return;
    if (isLocalEdit.current) return;
    if (editorRef.current.innerHTML !== htmlValue) {
      editorRef.current.innerHTML = DOMPurify.sanitize(htmlValue || "");
    }
  }, [htmlValue]);

  function execCmd(cmd, value = null) {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    updateFmt();
    emitChange();
  }

  function emitChange() {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }

  function handleInput() {
    isLocalEdit.current = true;
    clearTimeout(isLocalEdit._timer);
    isLocalEdit._timer = setTimeout(() => { isLocalEdit.current = false; }, 2000);
    emitChange();
  }

  function handleKeyDown(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      execCmd("insertHTML", "&nbsp;&nbsp;&nbsp;&nbsp;");
    }
  }

  // Button with auto active state from fmt
  const Btn = ({ cmd, value, title, children }) => (
    <button
      type="button"
      title={title}
      className={`notes-tool-btn${fmt[cmd] ? " active" : ""}`}
      onMouseDown={e => { e.preventDefault(); execCmd(cmd, value); }}
    >
      {children}
    </button>
  );

  const ToolSep = () => <div className="notes-tool-sep" />;

  // Heading button active if current block matches
  const HeadBtn = ({ tag, label, title }) => (
    <button
      type="button"
      title={title}
      className={`notes-tool-btn notes-tool-text${fmt.block === tag.toLowerCase() ? " active" : ""}`}
      onMouseDown={e => { e.preventDefault(); execCmd("formatBlock", tag); }}
    >{label}</button>
  );

  return (
    <div className="notes-editor-wrap">
      {partnerIsEditing && (
        <div className="notes-partner-indicator">
          <span className="notes-partner-dot" />
          <span className="notes-partner-label">{partnerName || "Partner"} is editing…</span>
        </div>
      )}
      <div className="notes-toolbar">
        {/* Text style */}
        <Btn cmd="bold" title="Bold (Ctrl+B)"><strong>B</strong></Btn>
        <Btn cmd="italic" title="Italic (Ctrl+I)"><em>I</em></Btn>
        <Btn cmd="underline" title="Underline (Ctrl+U)"><u>U</u></Btn>
        <Btn cmd="strikeThrough" title="Strikethrough"><s>S</s></Btn>

        <ToolSep />

        {/* Headings */}
        <HeadBtn tag="H1" label="H1" title="Heading 1" />
        <HeadBtn tag="H2" label="H2" title="Heading 2" />
        <HeadBtn tag="H3" label="H3" title="Heading 3" />
        <HeadBtn tag="P"  label="¶"  title="Normal paragraph" />

        <ToolSep />

        {/* Lists */}
        <Btn cmd="insertUnorderedList" title="Bullet list">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
        </Btn>
        <Btn cmd="insertOrderedList" title="Numbered list">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1.5"/></svg>
        </Btn>
        <button type="button" className="notes-tool-btn" title="Indent"
          onMouseDown={e => { e.preventDefault(); execCmd("indent"); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/><polyline points="9 12 13 8 13 16 9 12"/></svg>
        </button>
        <button type="button" className="notes-tool-btn" title="Outdent"
          onMouseDown={e => { e.preventDefault(); execCmd("outdent"); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/><polyline points="13 12 9 16 9 8 13 12"/></svg>
        </button>

        <ToolSep />

        {/* Alignment */}
        <Btn cmd="justifyLeft" title="Align left">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
        </Btn>
        <Btn cmd="justifyCenter" title="Center">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </Btn>
        <Btn cmd="justifyRight" title="Align right">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
        </Btn>

        <ToolSep />

        {/* Highlight */}
        <button type="button" className="notes-tool-btn" title="Highlight text"
          onMouseDown={e => { e.preventDefault(); execCmd("hiliteColor", "#fef08a"); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 11-6 6v3h3l6-6m4.5-9.5a2.121 2.121 0 0 1 3 3L13 14l-4 1 1-4 7.5-7.5z"/></svg>
        </button>

        <ToolSep />

        {/* Undo / Redo */}
        <button type="button" className="notes-tool-btn" title="Undo (Ctrl+Z)"
          onMouseDown={e => { e.preventDefault(); execCmd("undo"); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
        </button>
        <button type="button" className="notes-tool-btn" title="Redo (Ctrl+Y)"
          onMouseDown={e => { e.preventDefault(); execCmd("redo"); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
        </button>

        <ToolSep />

        {/* Clear formatting */}
        <button type="button" className="notes-tool-btn" title="Clear formatting"
          onMouseDown={e => { e.preventDefault(); execCmd("removeFormat"); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>
        </button>
      </div>

      <div
        ref={editorRef}
        className="notes-rich-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        data-placeholder="Start typing your notes… Both you and your partner see each character as you type."
      />
    </div>
  );
}

// ── Quick Chat Panel ──────────────────────────────────────────────────────
function QuickChatPanel({ conv, myId, partner }) {
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const chatWsRef = useRef(null);
  const typingTimerRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.getMessages(conv.id)
      .then(msgs => setMessages(msgs.filter(m => !m.hiddenForMe)))
      .catch(() => {});
    api.markRead(conv.id).catch(() => {});
  }, [conv.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    const ws = api.openChatSocket(conv.id, handleWsMsg, () => {});
    chatWsRef.current = ws;
    return () => { ws.close(); chatWsRef.current = null; };
  }, [conv.id]);

  function handleWsMsg(msg) {
    if (msg.type === "message") {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.data.id)) return prev;
        const withoutTemp = prev.filter(m =>
          !(m.pending && m.body === msg.data.body && m.senderId === myId)
        );
        return [...withoutTemp, msg.data];
      });
      api.markRead(conv.id).catch(() => {});
    } else if (msg.type === "typing") {
      if (msg.userId !== myId) {
        setTyping(true);
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTyping(false), 2000);
      }
    } else if (msg.type === "read") {
      setMessages(prev => prev.map(m =>
        m.senderId === myId ? { ...m, isRead: true, isDelivered: true } : m
      ));
    } else if (msg.type === "delivered") {
      const ids = new Set(msg.msgIds || []);
      setMessages(prev => prev.map(m =>
        ids.has(m.id) ? { ...m, isDelivered: true } : m
      ));
    } else if (msg.type === "deleted") {
      setMessages(prev => prev.map(m =>
        m.id === msg.msgId ? { ...m, deleted: true, body: "" } : m
      ));
    }
  }

  function sendTypingSignal() {
    if (chatWsRef.current?.readyState === WebSocket.OPEN) {
      chatWsRef.current.send(JSON.stringify({ type: "typing" }));
    }
  }

  async function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    setSending(true);
    const tempId = `pending-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, senderId: myId, body,
      createdAt: new Date().toISOString(),
      pending: true, isDelivered: false, isRead: false, reactions: {},
    }]);
    try {
      const ws = chatWsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "message", body }));
      } else {
        const msg = await api.sendMessageRest(conv.id, body);
        setMessages(prev => prev.filter(m => m.id !== tempId).concat([msg]));
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, failed: true } : m));
      toast.error(err.message || "Couldn't send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="study-quick-chat">
      <div className="study-quick-chat-header">
        <div className="qchat-header-info">
          <Avatar url={partner?.photoURL} name={partner?.displayName} size={28} />
          <div>
            <div className="qchat-partner-name">{partner?.displayName}</div>
            <div className="qchat-subject">{conv.subject}</div>
          </div>
        </div>
        <span className="qchat-label">Chat</span>
      </div>

      <div className="study-quick-chat-messages">
        {messages.length === 0 && (
          <div className="qchat-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p>No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map(msg => {
          const mine = msg.senderId === myId;
          if (msg.deleted) {
            return (
              <div key={msg.id} className={`qchat-row ${mine ? "mine" : "theirs"}`}>
                <div className="qchat-bubble qchat-deleted">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                  <span>Deleted</span>
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`qchat-row ${mine ? "mine" : "theirs"}`}>
              {!mine && <Avatar url={partner?.photoURL} name={partner?.displayName} size={24} />}
              <div className="qchat-bubble-wrap">
                <div className={`qchat-bubble ${mine ? "bubble-mine" : "bubble-theirs"}`}>
                  {msg.attachmentUrl && (
                    <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="qchat-attachment">
                      📎 {msg.attachmentName || "Attachment"}
                    </a>
                  )}
                  {msg.body && <span className="qchat-text">{msg.body}</span>}
                  <div className="qchat-meta">
                    <span>{fmtTime(msg.createdAt)}</span>
                    {mine && (
                      msg.failed
                        ? <span style={{ color: "var(--danger)" }}>⚠</span>
                        : msg.pending
                          ? <span style={{ opacity: 0.5 }}>···</span>
                          : <span className={`qchat-tick ${msg.isRead ? "read" : ""}`}>
                              {msg.isRead || msg.isDelivered ? <DoubleTickIcon /> : <TickIcon />}
                            </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="qchat-row theirs">
            <Avatar url={partner?.photoURL} name={partner?.displayName} size={24} />
            <div className="qchat-typing-bubble">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="qchat-input-bar" onSubmit={send}>
        <input
          className="qchat-input"
          value={text}
          onChange={e => { setText(e.target.value); sendTypingSignal(); }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type a message…"
          disabled={sending}
        />
        <button type="submit" className="qchat-send-btn" disabled={!text.trim() || sending}>
          <SendIcon />
        </button>
      </form>
    </div>
  );
}

// ── Pending Invitations ───────────────────────────────────────────────────
function PendingInvitations({ invitations, onAccept, onDecline }) {
  if (!invitations || invitations.length === 0) return null;
  return (
    <div className="study-pending-invitations">
      <h3>📬 Pending Invitations</h3>
      <div className="study-invitations-list">
        {invitations.map(inv => (
          <div key={inv.roomId} className="study-invitation-card">
            <img src={inv.partner.photoURL || "/default-avatar.png"} alt="" className="study-invitation-avatar" />
            <div className="study-invitation-info">
              <div className="study-invitation-name">{inv.partner.displayName}</div>
              <div className="study-invitation-subject">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                {inv.subject}
              </div>
              {inv.goal && <div className="study-invitation-goal">🎯 {inv.goal}</div>}
            </div>
            <div className="study-invitation-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDecline(inv.roomId)}>Decline</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAccept(inv)}>Join</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Student Picker Modal ──────────────────────────────────────────────────
function StudentPickerModal({ onClose, onSelectStudent }) {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try { setPartners(await api.getAcceptedMatchPartners()); }
      catch { toast.error("Failed to load your accepted connections."); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = partners.filter(p =>
    p.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  async function handleSelect(partner) {
    setSelecting(true);
    try {
      let convId = partner.conversationId;
      if (!convId) {
        const conv = await api.startConversation(partner.partnerId, partner.subject);
        convId = conv.id;
      }
      onSelectStudent({
        id: convId,
        partner: { uid: partner.partnerId, displayName: partner.displayName, photoURL: partner.photoURL, isOnline: partner.isOnline },
        subject: partner.subject,
      });
    } catch (err) {
      toast.error(err.message || "Couldn't open conversation.");
    } finally {
      setSelecting(false);
    }
  }

  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="study-picker-modal" onClick={e => e.stopPropagation()}>
        <h2>Choose Study Partner</h2>
        <p className="study-picker-subtitle">Only accepted match partners can be invited</p>
        <div className="study-picker-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" placeholder="Search by name or subject..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="study-picker-list">
          {loading && <p className="study-empty-text">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <p className="study-empty-text">
              {partners.length === 0 ? "No accepted match partners yet. Accept a match request first." : "No partners match your search."}
            </p>
          )}
          {!loading && filtered.map(partner => (
            <div key={partner.partnerId} className={`study-picker-card ${selecting ? "disabled" : ""}`}
              onClick={() => !selecting && handleSelect(partner)}
              style={{ opacity: selecting ? 0.6 : 1, cursor: selecting ? "not-allowed" : "pointer" }}>
              <img src={partner.photoURL || "/default-avatar.png"} alt="" className="study-picker-avatar" />
              <div className="study-picker-info">
                <div className="study-picker-name">
                  {partner.displayName}
                  {partner.isOnline && <span className="study-online-badge">Online</span>}
                </div>
                <div className="study-picker-subject">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  {partner.subject}
                </div>
              </div>
              <svg className="study-picker-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </div>
        <div className="study-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={selecting}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Session Goal Modal ────────────────────────────────────────────────────
const FOCUS_OPTIONS = [15, 20, 25, 30, 45, 60];
const BREAK_OPTIONS = [5, 10, 15];

function SessionGoalModal({ conv, onClose, onStart, profile }) {
  const [goal, setGoal] = useState("");
  const [focusMins, setFocusMins] = useState(25);
  const [breakMins, setBreakMins] = useState(5);
  const [role, setRole] = useState(null); // "teaching" | "learning"
  const [starting, setStarting] = useState(false);
  const toast = useToast();

  const goodAt = profile?.subjectsGoodAt || [];
  const needHelp = profile?.subjectsNeedHelp || [];

  // All subjects from profile, deduplicated
  const allSubjects = [...new Set([...goodAt, ...needHelp])];

  // Selected subject — default to the conversation subject if it's in profile, else first match
  const defaultSubject = allSubjects.includes(conv.subject)
    ? conv.subject
    : (allSubjects[0] || conv.subject);
  const [selectedSubject, setSelectedSubject] = useState(defaultSubject);

  // Auto-select role when subject changes
  function pickSubject(subj) {
    setSelectedSubject(subj);
    if (goodAt.includes(subj) && !needHelp.includes(subj)) setRole("teaching");
    else if (needHelp.includes(subj) && !goodAt.includes(subj)) setRole("learning");
    else setRole(null); // subject is in both or neither — user picks manually
  }

  // Initial role pre-selection
  useEffect(() => {
    pickSubject(defaultSubject);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart() {
    if (!role) { toast.error("Please select your role for this session."); return; }
    setStarting(true);
    try {
      const room = await api.createRoom(conv.id, goal.trim() || null, role, selectedSubject);
      onStart(room, focusMins, breakMins, role);
    } catch (err) {
      toast.error(err.message || "Couldn't create study room.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="study-goal-modal" onClick={e => e.stopPropagation()}>
        <h2>Set up your session</h2>

        {/* Subject picker */}
        <div className="study-field-label">Subject</div>
        {allSubjects.length > 0 ? (
          <div className="study-subject-picker">
            {allSubjects.map(subj => (
              <button
                key={subj}
                type="button"
                className={`study-subject-chip ${selectedSubject === subj ? "active" : ""}`}
                onClick={() => pickSubject(subj)}
              >
                {goodAt.includes(subj) && <span className="study-subject-chip-dot teach" title="I can teach this" />}
                {needHelp.includes(subj) && <span className="study-subject-chip-dot learn" title="I need help with this" />}
                {subj}
              </button>
            ))}
          </div>
        ) : (
          <div className="study-subject-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            {conv.subject}
          </div>
        )}
        {allSubjects.length > 0 && (
          <div className="study-subject-chip-legend">
            <span><span className="study-subject-chip-dot teach inline" /> Can teach</span>
            <span><span className="study-subject-chip-dot learn inline" /> Need help</span>
          </div>
        )}

        {/* Role selection */}
        <div className="study-field-label">Your role in this session</div>
        <div className="study-role-picker">
          <button
            type="button"
            className={`study-role-card ${role === "teaching" ? "active" : ""}`}
            onClick={() => setRole("teaching")}
          >
            <span className="study-role-icon">🎓</span>
            <span className="study-role-title">I'm Teaching</span>
            <span className="study-role-hint">{selectedSubject}</span>
          </button>
          <button
            type="button"
            className={`study-role-card ${role === "learning" ? "active" : ""}`}
            onClick={() => setRole("learning")}
          >
            <span className="study-role-icon">📖</span>
            <span className="study-role-title">I'm Learning</span>
            <span className="study-role-hint">{selectedSubject}</span>
          </button>
        </div>

        {/* Goal */}
        <div className="study-field-label">Session goal <span className="study-field-optional">(optional)</span></div>
        <input
          value={goal}
          onChange={e => setGoal(e.target.value)}
          placeholder="e.g. Understand the RTF topic in Accounting"
          className="study-goal-input"
          maxLength={200}
        />

        {/* Timer config */}
        <div className="study-timer-config">
          <div className="study-timer-config-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Timer Settings
          </div>
          <div className="study-timer-config-row">
            <div className="study-timer-config-group">
              <div className="study-timer-config-label">Focus</div>
              <div className="study-timer-chips">
                {FOCUS_OPTIONS.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`study-timer-chip ${focusMins === m ? "active" : ""}`}
                    onClick={() => setFocusMins(m)}
                  >{m}m</button>
                ))}
              </div>
            </div>
            <div className="study-timer-config-divider" />
            <div className="study-timer-config-group">
              <div className="study-timer-config-label">Break</div>
              <div className="study-timer-chips">
                {BREAK_OPTIONS.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`study-timer-chip ${breakMins === m ? "active" : ""}`}
                    onClick={() => setBreakMins(m)}
                  >{m}m</button>
                ))}
              </div>
            </div>
          </div>
          <div className="study-timer-config-summary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {focusMins} min focus → {breakMins} min break, repeat
          </div>
        </div>

        <div className="study-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={starting}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleStart} disabled={starting}>
            {starting ? "Sending…" : "Send Invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Session Detail Modal ──────────────────────────────────────────────────
function SessionDetailModal({ roomId, onClose }) {
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("notes");

  useEffect(() => {
    api.getRoom(roomId)
      .then(r => setRoom(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roomId]);

  const duration = room?.durationMinutes || 0;
  const durationStr = duration >= 60
    ? `${Math.floor(duration / 60)}h ${duration % 60}m`
    : `${duration} min`;

  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="session-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="session-detail-header">
          <div className="session-detail-header-left">
            <div className="session-detail-subject">{room?.subject || "Session"}</div>
            {room?.goal && <div className="session-detail-goal">🎯 {room.goal}</div>}
          </div>
          <button type="button" className="session-detail-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Stats row */}
        {room && (
          <div className="session-detail-stats">
            <div className="session-detail-stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {durationStr}
            </div>
            <div className="session-detail-stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {room.startedAt ? new Date(room.startedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""}
            </div>
            {room.partner && (
              <div className="session-detail-stat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                {room.partner.displayName}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="session-detail-tabs">
          <button type="button" className={`session-detail-tab ${activeTab === "notes" ? "active" : ""}`} onClick={() => setActiveTab("notes")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Notes
          </button>
          <button type="button" className={`session-detail-tab ${activeTab === "materials" ? "active" : ""}`} onClick={() => setActiveTab("materials")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            Materials
          </button>
        </div>

        {/* Content */}
        <div className="session-detail-body">
          {loading && (
            <div className="session-detail-loading">
              <span className="discover-spinner" />
            </div>
          )}

          {!loading && activeTab === "notes" && (
            room?.notes
              ? <div
                  className="session-detail-notes"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(room.notes) }}
                />
              : <div className="session-detail-empty">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.25 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <p>No notes were taken in this session.</p>
                </div>
          )}

          {!loading && activeTab === "materials" && (
            (room?.materials?.length > 0)
              ? <div className="session-detail-materials">
                  {room.materials.map(mat => (
                    <a key={mat.id} href={mat.url} target="_blank" rel="noopener noreferrer" className="session-detail-material-row">
                      <span>{mat.fileType === "image" ? "🖼️" : mat.fileType === "pdf" ? "📄" : "📎"}</span>
                      <span className="session-detail-mat-name">{mat.name}</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                  ))}
                </div>
              : <div className="session-detail-empty">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.25 }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  <p>No materials were added in this session.</p>
                </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Break Modal ───────────────────────────────────────────────────────────
function BreakModal({ remaining, onSkip, onContinue }) {
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return (
    <div className="sc-overlay">
      <div className="study-break-modal">
        <div className="study-break-icon">🎉</div>
        <h2>Great work!</h2>
        <p>Time for a 5 minute break</p>
        <div className="study-break-timer">{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</div>
        <div className="study-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onSkip}>Skip Break</button>
          <button type="button" className="btn btn-primary" onClick={onContinue}>Take Break</button>
        </div>
      </div>
    </div>
  );
}

// ── End Session Confirm ───────────────────────────────────────────────────
function EndSessionModal({ onCancel, onConfirm, ending }) {
  return (
    <div className="sc-overlay" onClick={onCancel}>
      <div className="study-end-modal" onClick={e => e.stopPropagation()}>
        <div className="study-end-icon"><EndIcon /></div>
        <h3>End this study session?</h3>
        <p>Your notes and progress will be saved.</p>
        <div className="study-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={ending}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={ending}>
            {ending ? "Ending…" : "End Session"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Blocked Navigation Modal ──────────────────────────────────────────────
function BlockedNavModal({ onStay, onEndAndLeave, ending }) {
  return (
    <div className="sc-overlay">
      <div className="study-blocked-modal">
        <div className="study-blocked-icon">🔒</div>
        <h3>You're in an active session</h3>
        <p>End the session first to leave the study room. Your notes will be saved automatically.</p>
        <div className="study-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onStay}>Stay in Session</button>
          <button type="button" className="btn btn-danger" onClick={onEndAndLeave} disabled={ending}>
            {ending ? "Ending…" : "End & Leave"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Session Complete Modal ────────────────────────────────────────────────
function SessionCompleteModal({ room, partner, onClose }) {
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleSubmit() {
    setSubmitting(true);
    try {
      if (rating > 0) await api.endRoom(room.id, rating);
      onClose();
    } catch {
      toast.error("Couldn't save rating.");
    } finally {
      setSubmitting(false);
    }
  }

  const duration = room.durationMinutes || 0;
  return (
    <>
      <Confetti />
      <div className="sc-overlay" onClick={onClose}>
        <div className="study-complete-modal" onClick={e => e.stopPropagation()}>
          <div className="study-complete-icon">🏆</div>
          <h2>Session Complete 🎓</h2>
          <div className="study-complete-details">
            <div className="study-complete-row"><span>Subject:</span><strong>{room.subject}</strong></div>
            <div className="study-complete-row"><span>Duration:</span><strong>{duration} minutes</strong></div>
            <div className="study-complete-row"><span>Partner:</span><strong>{partner?.displayName || "Unknown"}</strong></div>
            {room.goal && <div className="study-complete-row"><span>Goal:</span><strong>{room.goal}</strong></div>}
          </div>
          <div className="study-rating-section">
            <p>How was your session with {partner?.displayName || "your partner"}?</p>
            <div className="study-rating-stars">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" className={`study-star ${rating >= n ? "filled" : ""}`} onClick={() => setRating(n)}>
                  <StarIcon filled={rating >= n} />
                </button>
              ))}
            </div>
          </div>
          <div className="study-complete-checklist">
            <div className="study-complete-check"><span className="study-check-icon">✅</span><span>Notes saved</span></div>
            <div className="study-complete-check"><span className="study-check-icon">✅</span><span>+50 XP earned</span></div>
            <div className="study-complete-check"><span className="study-check-icon">✅</span><span>Session added to history</span></div>
          </div>
          <button type="button" className="btn btn-primary btn-full" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Continue"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Report Modal ──────────────────────────────────────────────────────────
function ReportModal({ onClose }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const toast = useToast();

  function handleSubmit() {
    if (!reason) { toast.error("Please select a reason."); return; }
    toast.success("Report submitted. Thank you.");
    onClose();
  }

  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="study-report-modal" onClick={e => e.stopPropagation()}>
        <h3>Report an Issue</h3>
        <div className="field">
          <label>Reason</label>
          <select value={reason} onChange={e => setReason(e.target.value)}>
            <option value="">Select a reason…</option>
            <option value="inappropriate">Inappropriate behavior</option>
            <option value="spam">Spam or off-topic</option>
            <option value="harassment">Harassment</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label>Details (optional)</label>
          <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Describe what happened…" rows={4} />
        </div>
        <div className="study-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={handleSubmit}>Submit Report</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Study Room ───────────────────────────────────────────────────────
export default function StudyRoomPage() {
  const [searchParams] = useSearchParams();
  const convId = parseInt(searchParams.get("convId") || "0", 10);
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const toast = useToast();
  const myId = parseInt(profile?.uid || user?.uid || "0", 10);

  const [conv, setConv] = useState(null);
  const [room, setRoom] = useState(null);
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [recentRooms, setRecentRooms] = useState([]);
  const [confirmDeleteRoomId, setConfirmDeleteRoomId] = useState(null);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [mode, setMode] = useState("notes");
  const [focusMode, setFocusMode] = useState(false);
  const [waitingForPartner, setWaitingForPartner] = useState(false);

  // Timer
  const [timerPhase, setTimerPhase] = useState("focus");
  const [timerFocusSecs, setTimerFocusSecs] = useState(25 * 60);
  const [timerBreakSecs, setTimerBreakSecs] = useState(5 * 60);
  const [timerRemaining, setTimerRemaining] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showBreakModal, setShowBreakModal] = useState(false);

  // Modals
  const [showEndModal, setShowEndModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showLearningJourney, setShowLearningJourney] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [ending, setEnding] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [wbBarsCollapsed, setWbBarsCollapsed] = useState(false);

  // Partner editing indicator for notes
  const [partnerIsEditing, setPartnerIsEditing] = useState(false);
  const partnerEditTimerRef = useRef(null);

  // Notes (HTML string from rich text editor)
  const [notes, setNotes] = useState("");
  const notesRef = useRef("");  // always-current value for intervals
  const notesDbTimerRef = useRef(null);

  // Whiteboard
  const [whiteboardElements, setWhiteboardElements] = useState([]);

  // Materials
  const [materials, setMaterials] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Autosave status indicator
  const [lastSaved, setLastSaved] = useState(null);

  // Room WebSocket
  const wsRef = useRef(null);
  // Refs so WS handlers can always read the current timer config without stale closures
  const timerFocusSecsRef = useRef(25 * 60);
  const timerBreakSecsRef = useRef(5 * 60);
  // Ref so polling interval can read current waitingForPartner without stale closure
  const waitingForPartnerRef = useRef(false);
  // Excalidraw API ref (registered by WhiteboardPanel)
  const wbApiRef = useRef(null);

  // Keep ref in sync with state so async callbacks always see current value
  waitingForPartnerRef.current = waitingForPartner;

  // ── Is an active session locked? ──────────────────────────────────────
  const isLocked = !!room && !room.endedAt;
  const [showBlockedModal, setShowBlockedModal] = useState(false);

  // Block browser back / refresh / close
  useEffect(() => {
    if (!isLocked) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isLocked]);

  // Intercept in-app navigation (sidebar clicks, etc.) by patching pushState
  useEffect(() => {
    if (!isLocked) return;
    const origPush = window.history.pushState.bind(window.history);
    window.history.pushState = function (state, title, url) {
      // Allow navigation within the same room path
      const isSameRoute = typeof url === "string" && url.includes("/app/rooms");
      if (!isSameRoute) {
        setShowBlockedModal(true);
        return;
      }
      origPush(state, title, url);
    };
    return () => { window.history.pushState = origPush; };
  }, [isLocked]);

  // ── Auto-save every 30 seconds ────────────────────────────────────────
  useEffect(() => {
    if (!room?.id) return;
    const interval = setInterval(async () => {
      try {
        await api.updateRoomNotes(room.id, notesRef.current);
        setLastSaved(new Date());
      } catch { /* silent */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [room?.id]);

  // Polling fallback: if waiting and WS missed the partner_joined event, detect via REST
  useEffect(() => {
    if (!waitingForPartner || !room?.id) return;
    const convId = room.conversationId;
    const interval = setInterval(async () => {
      if (!waitingForPartnerRef.current) { clearInterval(interval); return; }
      try {
        const { active, room: fresh } = await api.getActiveRoom(convId);
        if (active && fresh?.partnerJoined) {
          setRoom(fresh);
          setWaitingForPartner(false);
          setTimerRunning(true);
          toast.success("Your partner joined the study room!");
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: "timer_sync",
                action: "start",
                focusSecs: timerFocusSecsRef.current,
                breakSecs: timerBreakSecsRef.current,
                remaining: timerFocusSecsRef.current,
                phase: "focus",
              }));
            }
          }, 500);
        }
      } catch { /* silent */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [waitingForPartner, room?.id]);

  // Load conversation + check for active room
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!convId) {
          const [rooms, invitations] = await Promise.all([
            api.getRecentRooms(),
            api.getPendingStudyInvitations(),
          ]);
          setRecentRooms(rooms);
          setPendingInvitations(invitations);
          setLoading(false);
          return;
        }

        const convs = await api.listConversations();
        const c = convs.find(cv => cv.id === convId);
        if (!c) { toast.error("Conversation not found."); navigate("/app/rooms"); return; }
        if (!active) return;
        setConv(c);
        setPartner(c.partner);

        const { active: hasRoom, room: existingRoom } = await api.getActiveRoom(convId);
        if (hasRoom && existingRoom) {
          setRoom(existingRoom);
          const initialNotes = existingRoom.notes || "";
          setNotes(initialNotes);
          notesRef.current = initialNotes;
          setWhiteboardElements(existingRoom.whiteboard || []);
          setMaterials(existingRoom.materials || []);
          if (existingRoom.partnerJoined) {
            // Both in room — start timer immediately; creator will sync config via WS
            setTimerRunning(true);
          } else if (existingRoom.creatorId === myId) {
            setWaitingForPartner(true);
          } else {
            // Partner joining for the first time
            await api.joinRoom(existingRoom.id);
            setTimerRunning(true); // will be corrected by timer_sync from creator
          }
        } else {
          setShowGoalModal(true);
        }
      } catch (err) {
        toast.error(err.message || "Failed to load conversation.");
        if (convId) navigate("/app/rooms");
      } finally {
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [convId]);

  async function handleAcceptInvitation(invitation) {
    try {
      await api.joinRoom(invitation.roomId);
      navigate(`/app/rooms?convId=${invitation.conversationId}`);
    } catch (err) {
      toast.error(err.message || "Failed to join room.");
    }
  }

  async function handleDeclineInvitation(roomId) {
    try {
      await api.declineStudyInvitation(roomId);
      setPendingInvitations(prev => prev.filter(inv => inv.roomId !== roomId));
      toast.success("Invitation declined.");
    } catch (err) {
      toast.error(err.message || "Failed to decline invitation.");
    }
  }

  // Room WebSocket
  useEffect(() => {
    if (!room) return;
    const ws = api.openRoomSocket(room.id, handleWsMessage, () => {});
    wsRef.current = ws;
    return () => { ws.close(); wsRef.current = null; };
  }, [room?.id]);

  function handleWsMessage(msg) {
    if (msg.type === "notes_update") {
      const incoming = msg.notes || "";
      setNotes(incoming);
      notesRef.current = incoming;
      // Show partner editing indicator
      setPartnerIsEditing(true);
      clearTimeout(partnerEditTimerRef.current);
      partnerEditTimerRef.current = setTimeout(() => setPartnerIsEditing(false), 3000);
    } else if (msg.type === "whiteboard_op") {
      if (msg.op?.kind === "sync" && wbApiRef.current) {
        wbApiRef.current.applyRemoteElements(msg.op.elements || []);
      }
    } else if (msg.type === "timer_sync") {
      setTimerPhase(msg.phase || "focus");
      if (typeof msg.remaining === "number") setTimerRemaining(msg.remaining);
      // Receive timer config broadcast from creator on session start
      if (typeof msg.focusSecs === "number") {
        setTimerFocusSecs(msg.focusSecs);
        timerFocusSecsRef.current = msg.focusSecs;
        setTimerRemaining(msg.focusSecs);
      }
      if (typeof msg.breakSecs === "number") {
        setTimerBreakSecs(msg.breakSecs);
        timerBreakSecsRef.current = msg.breakSecs;
      }
      if (msg.action === "pause") setTimerRunning(false);
      else if (msg.action === "resume" || msg.action === "start") setTimerRunning(true);
    } else if (msg.type === "material_added") {
      setMaterials(prev => [...prev, msg.material]);
    } else if (msg.type === "material_removed") {
      setMaterials(prev => prev.filter(m => m.id !== msg.materialId));
    } else if (msg.type === "partner_joined") {
      setRoom(msg.room);
      setWaitingForPartner(false);
      setTimerRunning(true);
      toast.success(`${partner?.displayName} joined the study room!`);
      // Broadcast the configured timer to the partner so they start in sync
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "timer_sync",
            action: "start",
            focusSecs: timerFocusSecsRef.current,
            breakSecs: timerBreakSecsRef.current,
            remaining: timerFocusSecsRef.current,
            phase: "focus",
          }));
        }
      }, 500); // brief delay to let partner's WS stabilize
    } else if (msg.type === "session_ended") {
      setRoom(msg.room);
      setWaitingForPartner(false);
      setShowCompleteModal(true);
    } else if (msg.type === "invitation_declined") {
      toast.error("Your study invitation was declined.");
      setWaitingForPartner(false);
      navigate("/app/rooms");
    }
  }

  // Timer tick
  useEffect(() => {
    if (!timerRunning || timerRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimerRemaining(prev => {
        if (prev <= 1) {
          setTimerRunning(false);
          if (timerPhase === "focus") { setShowBreakModal(true); return timerBreakSecs; }
          else { setTimerPhase("focus"); setTimerRunning(true); return timerFocusSecs; }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, timerRemaining, timerPhase, timerBreakSecs, timerFocusSecs]);

  function startSession(createdRoom, focusMins = 25, breakMins = 5) {
    const focusSecs = focusMins * 60;
    const breakSecs = breakMins * 60;
    timerFocusSecsRef.current = focusSecs;
    timerBreakSecsRef.current = breakSecs;
    setTimerFocusSecs(focusSecs);
    setTimerBreakSecs(breakSecs);
    setTimerRemaining(focusSecs);
    setTimerPhase("focus");
    setRoom(createdRoom);
    const initialNotes = createdRoom.notes || "";
    setNotes(initialNotes);
    notesRef.current = initialNotes;
    setWhiteboardElements(createdRoom.whiteboard || []);
    setMaterials(createdRoom.materials || []);
    setShowGoalModal(false);
    if (createdRoom.creatorId === myId && !createdRoom.partnerJoined) {
      setWaitingForPartner(true);
    } else {
      setTimerRunning(true);
    }
  }

  function handleNotesChange(html) {
    setNotes(html);
    notesRef.current = html;
    // Broadcast to partner immediately (real-time)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "notes_update", notes: html }));
    }
    // Debounce DB save
    clearTimeout(notesDbTimerRef.current);
    notesDbTimerRef.current = setTimeout(() => {
      api.updateRoomNotes(room.id, html)
        .then(() => setLastSaved(new Date()))
        .catch(() => {});
    }, 1200);
  }

  async function handleEndSession() {
    setEnding(true);
    const wasWaiting = waitingForPartner;
    // Final save before ending
    try { await api.updateRoomNotes(room.id, notesRef.current); } catch { /* ok */ }
    try {
      const endedRoom = await api.endRoom(room.id, null);
      setRoom(endedRoom);
      setShowEndModal(false);
      setWaitingForPartner(false);
      if (wasWaiting) {
        navigate("/app/rooms");
      } else {
        setShowCompleteModal(true);
      }
    } catch (err) {
      toast.error(err.message || "Couldn't end session.");
    } finally {
      setEnding(false);
    }
  }

  async function handleEndAndLeave() {
    setEnding(true);
    try { await api.updateRoomNotes(room.id, notesRef.current); } catch { /* ok */ }
    try {
      await api.endRoom(room.id, null);
      setRoom(r => r ? { ...r, endedAt: new Date().toISOString() } : r);
      setShowBlockedModal(false);
      navigate("/app/chat");
    } catch (err) {
      toast.error(err.message || "Couldn't end session.");
    } finally {
      setEnding(false);
    }
  }

  function handleCompleteClose() {
    setShowCompleteModal(false);
    setShowLearningJourney(true);
  }

  function handleJourneyDone() {
    setShowLearningJourney(false);
    const dest = conv?.id ? `/app/chat?convId=${conv.id}` : "/app/chat";
    navigate(dest);
  }

  async function handleDeleteRoom(roomId) {
    try {
      await api.deleteRoom(roomId);
      setRecentRooms(prev => prev.filter(r => r.id !== roomId));
      toast.success("Session removed from your history");
    } catch {
      toast.error("Could not delete session");
    } finally {
      setConfirmDeleteRoomId(null);
    }
  }

  if (loading) {
    return (
      <div className="study-loading">
        <span className="discover-spinner" />
        <p>Loading study room…</p>
      </div>
    );
  }

  // Show waiting screen IMMEDIATELY after sending invitation (before landing-page check)
  if (waitingForPartner) {
    return (
      <div className="study-waiting">
        <div className="study-waiting-content">
          <div className="study-waiting-pulse">
            <span className="study-waiting-ring" />
            <span className="study-waiting-ring study-waiting-ring--2" />
            <span className="study-waiting-dot" />
          </div>
          <h2>Invitation Sent!</h2>
          <p>Waiting for <strong>{partner?.displayName}</strong> to join your session.</p>
          <div className="study-waiting-timer-preview">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {Math.round(timerFocusSecs / 60)} min focus · {Math.round(timerBreakSecs / 60)} min break
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowEndModal(true)}>
            Cancel Session
          </button>
        </div>
        {showEndModal && <EndSessionModal onCancel={() => setShowEndModal(false)} onConfirm={handleEndSession} ending={ending} />}
      </div>
    );
  }

  // Landing page — no convId
  if (!convId) {
    const totalMinutes = recentRooms.reduce((sum, r) => sum + (r.durationMinutes || 0), 0);
    const completedSessions = recentRooms.filter(r => r.durationMinutes > 0).length;

    return (
      <div className="srl-page">
        {/* ── Hero header ─────────────────────────────────────────── */}
        <div className="srl-hero">
          <div className="srl-hero-left">
            <div className="srl-hero-icon">🎓</div>
            <div>
              <h1 className="srl-title">Study Rooms</h1>
              <p className="srl-subtitle">Collaborate in real time with your study partners</p>
            </div>
          </div>
          <button
            type="button"
            className="srl-new-btn"
            onClick={() => setShowPickerModal(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            New Study Session
          </button>
        </div>

        {/* ── Stats row ───────────────────────────────────────────── */}
        <div className="srl-stats">
          <div className="srl-stat">
            <span className="srl-stat-value">{completedSessions}</span>
            <span className="srl-stat-label">Sessions</span>
          </div>
          <div className="srl-stat-divider" />
          <div className="srl-stat">
            <span className="srl-stat-value">{totalMinutes}</span>
            <span className="srl-stat-label">Minutes studied</span>
          </div>
          <div className="srl-stat-divider" />
          <div className="srl-stat">
            <span className="srl-stat-value">{pendingInvitations.length}</span>
            <span className="srl-stat-label">Pending invites</span>
          </div>
        </div>

        {/* ── Pending invitations ─────────────────────────────────── */}
        {pendingInvitations.length > 0 && (
          <section className="srl-section">
            <h2 className="srl-section-title">
              <span className="srl-section-dot srl-dot-invite" />
              Pending Invitations
              <span className="srl-badge">{pendingInvitations.length}</span>
            </h2>
            <div className="srl-invites">
              {pendingInvitations.map(inv => (
                <div key={inv.roomId} className="srl-invite-card">
                  <img
                    src={inv.partner.photoURL || "/default-avatar.png"}
                    alt=""
                    className="srl-invite-avatar"
                    onError={e => { e.target.style.display = "none"; }}
                  />
                  <div className="srl-invite-body">
                    <div className="srl-invite-name">
                      {inv.partner.displayName}
                      {inv.partner.isOnline && <span className="srl-online-dot" />}
                    </div>
                    <div className="srl-invite-subject">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                      {inv.subject}
                    </div>
                    {inv.goal && <div className="srl-invite-goal">🎯 {inv.goal}</div>}
                  </div>
                  <div className="srl-invite-actions">
                    <button type="button" className="srl-btn-decline" onClick={() => handleDeclineInvitation(inv.roomId)}>
                      Decline
                    </button>
                    <button type="button" className="srl-btn-join" onClick={() => handleAcceptInvitation(inv)}>
                      Join Room
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Recent sessions ─────────────────────────────────────── */}
        <section className="srl-section">
          <h2 className="srl-section-title">
            <span className="srl-section-dot srl-dot-recent" />
            Recent Sessions
          </h2>

          {recentRooms.length === 0 ? (
            <div className="srl-empty">
              <div className="srl-empty-icon">📚</div>
              <h3>No sessions yet</h3>
              <p>Start your first study session by clicking <strong>New Study Session</strong></p>
              <button type="button" className="srl-new-btn" style={{ marginTop: 16 }} onClick={() => setShowPickerModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                New Study Session
              </button>
            </div>
          ) : (
            <div className="srl-grid">
              {recentRooms.map(r => (
                <div
                  key={r.id}
                  className={`srl-session-card${confirmDeleteRoomId === r.id ? " srl-session-card--confirming" : ""}`}
                  onClick={() => confirmDeleteRoomId !== r.id && setSelectedSessionId(r.id)}
                >
                  {confirmDeleteRoomId === r.id ? (
                    <div className="srl-delete-confirm">
                      <p>Remove this session from your history?</p>
                      <div className="srl-delete-confirm-actions">
                        <button type="button" className="srl-delete-yes" onClick={(e) => { e.stopPropagation(); handleDeleteRoom(r.id); }}>
                          Remove
                        </button>
                        <button type="button" className="srl-delete-no" onClick={(e) => { e.stopPropagation(); setConfirmDeleteRoomId(null); }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="srl-card-top">
                        <span className="srl-card-subject">{r.subject}</span>
                        <div className="srl-card-top-right">
                          <span className="srl-card-duration">{r.durationMinutes} min</span>
                          <button
                            type="button"
                            className="srl-card-delete-btn"
                            title="Remove from history"
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteRoomId(r.id); }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="srl-card-goal">{r.goal || "No goal set"}</div>
                      <div className="srl-card-footer">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {new Date(r.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                      <div className="srl-card-hint">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View session
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Modals ─────────────────────────────────────────────── */}
        {showPickerModal && (
          <StudentPickerModal
            onClose={() => setShowPickerModal(false)}
            onSelectStudent={(selectedConv) => {
              setConv(selectedConv);
              setPartner(selectedConv.partner);
              setShowPickerModal(false);
              setShowGoalModal(true);
            }}
          />
        )}
        {showGoalModal && conv && (
          <SessionGoalModal
            conv={conv}
            profile={profile}
            onClose={() => { setShowGoalModal(false); setConv(null); setPartner(null); }}
            onStart={(createdRoom, focusMins, breakMins) => {
              startSession(createdRoom, focusMins, breakMins);
              window.history.replaceState(null, "", `/app/rooms?convId=${conv.id}`);
            }}
          />
        )}
        {selectedSessionId && (
          <SessionDetailModal
            roomId={selectedSessionId}
            onClose={() => setSelectedSessionId(null)}
          />
        )}
      </div>
    );
  }

  if (!room) {
    return (
      <>
        {showGoalModal && conv && (
          <SessionGoalModal conv={conv} profile={profile} onClose={() => navigate("/app/rooms")} onStart={(r, fm, bm) => startSession(r, fm, bm)} />
        )}
      </>
    );
  }

  const mins = Math.floor(timerRemaining / 60);
  const secs = timerRemaining % 60;

  return (
    <div className={`study-room ${focusMode ? "study-room--focus" : ""} ${wbBarsCollapsed ? "study-room--wb-collapsed" : ""}`}>
      {/* Navigation blocker modal */}
      {showBlockedModal && (
        <BlockedNavModal
          onStay={() => setShowBlockedModal(false)}
          onEndAndLeave={handleEndAndLeave}
          ending={ending}
        />
      )}

      {/* Header */}
      <div className="study-room-header">
        <div className="study-room-header-left">
          <div className="study-subject-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            {room.subject}
          </div>
          {room.myRole && (
            <div className={`study-role-badge study-role-badge--${room.myRole}`}>
              {room.myRole === "teaching" ? "🎓 Teaching" : "📖 Learning"}
            </div>
          )}
          <span className="study-header-sep">·</span>
          <span className="study-partner-name">{partner?.displayName}</span>
          {partner?.isOnline && <span className="study-online-dot" />}
        </div>

        {room.goal && (
          <div className="study-goal-display">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            {room.goal}
          </div>
        )}

        <div className="study-room-header-right">
          {lastSaved && (
            <span className="study-autosave-tag">
              ✓ Saved {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button type="button" className="study-icon-btn" onClick={() => setFocusMode(!focusMode)} title={focusMode ? "Exit Focus Mode" : "Focus Mode"}>
            <FocusIcon />
          </button>
          <button type="button" className="study-icon-btn" onClick={() => setShowReportModal(true)} title="Report">🚩</button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setShowEndModal(true)}>
            <EndIcon /> End Session
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="study-room-body">
        <div className="study-workspace">
          <div className="study-tabs">
            <button type="button" className={`study-tab ${mode === "notes" ? "active" : ""}`} onClick={() => { setMode("notes"); setWbBarsCollapsed(false); }}>
              <NotesIcon /> Notes
            </button>
            <button type="button" className={`study-tab ${mode === "whiteboard" ? "active" : ""}`} onClick={() => { setMode("whiteboard"); setWbBarsCollapsed(true); }}>
              <WhiteboardIcon /> Whiteboard
            </button>
            <button type="button" className={`study-tab ${mode === "materials" ? "active" : ""}`} onClick={() => { setMode("materials"); setWbBarsCollapsed(false); }}>
              <MaterialsIcon /> Materials
            </button>
          </div>

          <div className="study-workspace-content">
            {mode === "notes" && (
              <NotesEditor
                htmlValue={notes}
                onChange={handleNotesChange}
                partnerName={partner?.displayName}
                partnerIsEditing={partnerIsEditing}
              />
            )}
            {mode === "whiteboard" && (
              <WhiteboardPanel
                wsRef={wsRef}
                onRegisterApi={(wbApi) => { wbApiRef.current = wbApi; }}
                initialElements={whiteboardElements}
                onSave={(elements) => api.updateWhiteboard(room.id, elements).catch(() => {})}
              />
            )}
            {mode === "materials" && (
              <div className="study-materials">
                <div className="study-materials-header">
                  <h3>Study Materials</h3>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? "Uploading…" : "+ Add File"}
                  </button>
                  <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try { await api.uploadRoomMaterial(room.id, file); toast.success("File uploaded!"); }
                    catch (err) { toast.error(err.message || "Upload failed."); }
                    finally { setUploading(false); e.target.value = ""; }
                  }} />
                </div>
                <div className="study-materials-list">
                  {materials.length === 0 && <p className="study-empty-text">No materials yet. Upload a file to get started.</p>}
                  {materials.map(mat => (
                    <div key={mat.id} className="study-material-card">
                      <div className="study-material-icon">{mat.fileType === "image" ? "🖼️" : mat.fileType === "pdf" ? "📄" : "📎"}</div>
                      <div className="study-material-info">
                        <div className="study-material-name">{mat.name}</div>
                        <div className="study-material-meta">{mat.sizeBytes ? `${(mat.sizeBytes / 1024).toFixed(1)} KB` : "Link"}</div>
                      </div>
                      <a href={mat.url} target="_blank" rel="noopener noreferrer" className="study-icon-btn" title="Open">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {!focusMode && conv && (
          <QuickChatPanel conv={conv} myId={myId} partner={partner} />
        )}

        {/* Mobile floating chat button */}
        <button
          type="button"
          className="study-floating-chat-btn"
          onClick={() => setShowMobileChat(true)}
          title="Open chat"
        >
          💬
        </button>

        {/* Mobile chat drawer */}
        {showMobileChat && conv && (
          <div className="study-mobile-chat-drawer">
            <div className="study-mobile-chat-header">
              <span>Chat with {partner?.displayName}</span>
              <button type="button" onClick={() => setShowMobileChat(false)}>✕</button>
            </div>
            <QuickChatPanel conv={conv} myId={myId} partner={partner} />
          </div>
        )}
      </div>

      {/* Timer Bar */}
      <div className="study-timer-bar">
        <div className="study-timer-display">
          <TimerIcon />
          <span className="study-timer-text">{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</span>
          <span className="study-timer-phase">{timerPhase === "focus" ? "Focus" : "Break"}</span>
        </div>
        <div className="study-timer-controls">
          {timerRunning ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              setTimerRunning(false);
              if (wsRef.current?.readyState === WebSocket.OPEN)
                wsRef.current.send(JSON.stringify({ type: "timer_sync", action: "pause", remaining: timerRemaining, phase: timerPhase }));
            }}>Pause</button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              setTimerRunning(true);
              if (wsRef.current?.readyState === WebSocket.OPEN)
                wsRef.current.send(JSON.stringify({ type: "timer_sync", action: "resume", remaining: timerRemaining, phase: timerPhase }));
            }}>Resume</button>
          )}
          {mode === "whiteboard" && (
            <button
              type="button"
              className="study-wb-bars-toggle"
              onClick={() => setWbBarsCollapsed(v => !v)}
              title={wbBarsCollapsed ? "Show controls" : "Collapse controls"}
            >
              {wbBarsCollapsed
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              }
              {wbBarsCollapsed ? "Show" : "Collapse"}
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {showBreakModal && (
        <BreakModal
          remaining={timerRemaining}
          onSkip={() => { setShowBreakModal(false); setTimerPhase("focus"); setTimerRemaining(25 * 60); setTimerRunning(true); }}
          onContinue={() => { setShowBreakModal(false); setTimerPhase("break"); setTimerRunning(true); }}
        />
      )}
      {showEndModal && <EndSessionModal onCancel={() => setShowEndModal(false)} onConfirm={handleEndSession} ending={ending} />}
      {showCompleteModal && <SessionCompleteModal room={room} partner={partner} onClose={handleCompleteClose} />}
      {showLearningJourney && room && (
        <LearningJourneyScreen
          room={room}
          partner={partner}
          profile={profile}
          onDone={handleJourneyDone}
        />
      )}
      {showReportModal && <ReportModal onClose={() => setShowReportModal(false)} />}
    </div>
  );
}
