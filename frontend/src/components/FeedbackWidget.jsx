/**
 * Floating "Send feedback" control + modal for authenticated app shells.
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import * as api from "../api";
import "./feedback-widget.css";

export default function FeedbackWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Hide on full-screen AI learning room (has its own flag actions)
  if (location.pathname.includes("/app/learn/ai/session/")) {
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      await api.submitFeedback({
        kind: "general",
        message: text,
        page: location.pathname,
      });
      setDone(true);
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 1600);
    } catch (err) {
      setError(err.message || "Could not send feedback.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="fb-fab"
        onClick={() => { setOpen(true); setError(""); setDone(false); }}
        aria-label="Send feedback"
        title="Send feedback"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="fb-fab-label">Feedback</span>
      </button>

      {open && (
        <div className="fb-overlay" onClick={() => !sending && setOpen(false)}>
          <div className="fb-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Send feedback">
            <div className="fb-modal-head">
              <h2>Send feedback</h2>
              <button type="button" className="fb-close" onClick={() => !sending && setOpen(false)} aria-label="Close">×</button>
            </div>
            {done ? (
              <p className="fb-success">Thanks — your feedback was sent.</p>
            ) : (
              <form onSubmit={handleSubmit}>
                <p className="fb-hint">Bugs, ideas, or anything that would make Knovi better. We read every message.</p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={5}
                  maxLength={4000}
                  required
                  disabled={sending}
                />
                {error && <p className="fb-error">{error}</p>}
                <div className="fb-actions">
                  <button type="button" className="fb-btn ghost" onClick={() => setOpen(false)} disabled={sending}>Cancel</button>
                  <button type="submit" className="fb-btn primary" disabled={sending || !message.trim()}>
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
