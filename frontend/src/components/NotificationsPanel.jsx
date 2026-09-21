import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../api";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function typeIcon(type) {
  if (type === "friend_request") return "👋";
  if (type === "study_invite")   return "📚";
  if (type === "message")        return "💬";
  return "🔔";
}

// ── Avatar fallback ──
function NotiAvatar({ url, name, type }) {
  const initial = (name || "?")[0].toUpperCase();
  if (url) {
    return <img src={url} alt={name} className="noti-avatar" referrerPolicy="no-referrer" />;
  }
  return (
    <div className="noti-avatar noti-avatar--fallback">
      {initial}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bell button + dropdown panel
// Usage: <NotificationsBell />
// ─────────────────────────────────────────────────────────────────────────────
export default function NotificationsBell({ className = "notif-bell-btn" }) {
  const navigate  = useNavigate();
  const [open, setOpen]         = useState(false);
  const [items, setItems]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const panelRef = useRef(null);
  const btnRef   = useRef(null);

  // Load on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.getNotifications()
      .then(d => { setItems(d.notifications || []); setTotal(d.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // Poll total count every 30s (for badge) even when panel is closed
  useEffect(() => {
    let active = true;
    function poll() {
      api.getNotifications()
        .then(d => { if (active) setTotal(d.total || 0); })
        .catch(() => {});
    }
    poll();
    const t = setInterval(poll, 30000);
    return () => { active = false; clearInterval(t); };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        btnRef.current   && !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  function handleClick(item) {
    setOpen(false);
    navigate(item.linkTo);
  }

  return (
    <div className="notif-wrap" style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        ref={btnRef}
        className={className}
        aria-label="Notifications"
        onClick={() => setOpen(o => !o)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {total > 0 && (
          <span className="notif-badge">{total > 9 ? "9+" : total}</span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div ref={panelRef} className="notif-panel">
          <div className="notif-panel-head">
            <span className="notif-panel-title">Notifications</span>
            {total > 0 && <span className="notif-panel-count">{total}</span>}
          </div>

          <div className="notif-panel-body">
            {loading && (
              <div className="notif-empty">
                <span className="discover-spinner" style={{ width: 20, height: 20 }} />
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="notif-empty">
                <span style={{ fontSize: "1.8rem" }}>🔔</span>
                <p>You're all caught up!</p>
              </div>
            )}

            {!loading && items.map(item => (
              <button
                key={item.id}
                type="button"
                className="notif-item"
                onClick={() => handleClick(item)}
              >
                <div className="notif-item-left">
                  <div className="notif-avatar-wrap">
                    <NotiAvatar url={item.photoURL} name={item.title} type={item.type} />
                    <span className="notif-type-badge">{typeIcon(item.type)}</span>
                  </div>
                </div>
                <div className="notif-item-body">
                  <p className="notif-item-title">{item.title}</p>
                  <p className="notif-item-sub">{item.body}</p>
                  <p className="notif-item-time">{timeAgo(item.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>

          {items.length > 0 && (
            <div className="notif-panel-foot">
              <button
                type="button"
                className="notif-see-all"
                onClick={() => { setOpen(false); navigate("/app/chat"); }}
              >
                Go to Chat →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
