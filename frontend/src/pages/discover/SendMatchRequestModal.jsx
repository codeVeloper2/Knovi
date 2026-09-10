import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

// ── Icons ─────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const LearnIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);
const TeachIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>
);
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);

function Avatar({ url, name, size = 44 }) {
  const initials = (name || "?").trim().slice(0, 1).toUpperCase();
  return url ? (
    <img src={url} alt={name} className="match-modal-avatar" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
  ) : (
    <div className="match-modal-avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </div>
  );
}

export default function SendMatchRequestModal({ student, currentUser, onClose, onSuccess }) {
  const toast = useToast();
  const [mode, setMode] = useState("learn");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Calculate available subjects based on mode (recalculates instantly on mode change)
  const availableSubjects = useMemo(() => {
    const myGoodAt   = new Set(currentUser?.subjectsGoodAt  || []);
    const myNeedHelp = new Set(currentUser?.subjectsNeedHelp || []);
    const theirGoodAt   = new Set(student.subjectsGoodAt  || []);
    const theirNeedHelp = new Set(student.subjectsNeedHelp || []);

    if (mode === "learn") {
      // I want to learn from them → their good_at ∩ my need_help
      return [...theirGoodAt].filter(s => myNeedHelp.has(s));
    } else {
      // I want to teach them → my good_at ∩ their need_help
      return [...myGoodAt].filter(s => theirNeedHelp.has(s));
    }
  }, [mode, currentUser, student]);

  // Auto-select first subject whenever the available list changes
  useEffect(() => {
    setSubject(availableSubjects.length > 0 ? availableSubjects[0] : "");
  }, [availableSubjects]);

  const canSend = !!subject && availableSubjects.length > 0;

  async function handleSend() {
    if (!canSend || sending) return;
    setSending(true);
    try {
      await api.sendMatchRequest(
        parseInt(student.uid, 10),
        mode,
        subject,
        message.trim() || null,
      );
      onSuccess();
    } catch (err) {
      toast.error(err.message || "Failed to send friend request.");
    } finally {
      setSending(false);
    }
  }

  const firstName = student.displayName?.split(" ")[0] || student.displayName;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="match-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="match-modal-header">
          <div className="match-modal-icon">
            <SendIcon />
          </div>
          <div style={{ flex: 1 }}>
            <h2 className="match-modal-title">Send Friend Request</h2>
            <p className="match-modal-subtitle">Connect with {student.displayName} and learn together.</p>
          </div>
          <button type="button" className="match-modal-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Receiver info */}
        <div className="match-modal-receiver">
          <Avatar url={student.photoURL} name={student.displayName} size={44} />
          <div className="match-modal-receiver-info">
            <div className="match-modal-receiver-name">{student.displayName}</div>
            <div className="match-modal-receiver-meta">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              </svg>
              {student.grade || "University Student"}
              {student.isOnline && (
                <>
                  <span className="match-modal-dot">•</span>
                  <span className="match-modal-online">● Online</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mode selection */}
        <div className="match-modal-section">
          <label className="match-modal-label">What would you like to do?</label>
          <div className="match-modal-mode-cards">
            <button
              type="button"
              className={`match-modal-mode-card ${mode === "learn" ? "active" : ""}`}
              onClick={() => setMode("learn")}
            >
              {mode === "learn" && <div className="match-modal-mode-check"><CheckIcon /></div>}
              <LearnIcon />
              <div className="match-modal-mode-title">I want to learn</div>
              <div className="match-modal-mode-desc">Get help with a subject from {firstName}</div>
            </button>
            <button
              type="button"
              className={`match-modal-mode-card ${mode === "teach" ? "active" : ""}`}
              onClick={() => setMode("teach")}
            >
              {mode === "teach" && <div className="match-modal-mode-check"><CheckIcon /></div>}
              <TeachIcon />
              <div className="match-modal-mode-title">I can teach you</div>
              <div className="match-modal-mode-desc">Help {firstName} learn a subject from you</div>
            </button>
          </div>
        </div>

        {/* Subject */}
        <div className="match-modal-section">
          <label className="match-modal-label">Select subject</label>
          {availableSubjects.length > 0 ? (
            <>
              <div className="match-modal-select-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--text-dim)", flexShrink: 0 }}>
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                <select
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="match-modal-select"
                >
                  {availableSubjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <p className="match-modal-hint">Only subjects you both can work on will be shown.</p>
            </>
          ) : (
            <div className="match-modal-no-subjects">
              <p>No matching subjects for this option.</p>
              <p className="match-modal-hint">Try switching to the other mode above.</p>
            </div>
          )}
        </div>

        {/* Message */}
        <div className="match-modal-section">
          <label className="match-modal-label">Message <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(optional)</span></label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, 500))}
            placeholder={`Hi, can you help me with ${subject || "this"}?`}
            className="match-modal-textarea"
            rows={3}
          />
          <div className="match-modal-char-count">{message.length}/500</div>
        </div>

        {/* Actions */}
        <div className="match-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSend}
            disabled={!canSend || sending}
          >
            <SendIcon />
            {sending ? "Sending…" : "Send Request"}
          </button>
        </div>

      </div>
    </div>
  );
}
