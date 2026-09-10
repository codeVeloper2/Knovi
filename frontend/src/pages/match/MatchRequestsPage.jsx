import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

// ── Icons ─────────────────────────────────────────────────────────
const InboxIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
  </svg>
);
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);
const XIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
);
const UsersIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

function Avatar({ url, name, size = 46 }) {
  const initials = (name || "?").trim().slice(0, 1).toUpperCase();
  return url ? (
    <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} referrerPolicy="no-referrer" />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: "var(--blue)",
      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>{initials}</div>
  );
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusPill({ status }) {
  const map = {
    pending:  { label: "Pending",  color: "var(--fr-pending-color)",  bg: "var(--fr-pending-bg)"  },
    accepted: { label: "Accepted", color: "var(--fr-accepted-color)", bg: "var(--fr-accepted-bg)" },
    declined: { label: "Declined", color: "var(--fr-declined-color)", bg: "var(--fr-declined-bg)" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, color: s.color, background: s.bg, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function RequestCard({ req, perspective, onAccept, onDecline, acting }) {
  const isIncoming = perspective === "incoming";
  const person = isIncoming ? req.sender : req.receiver;
  const isAccepting = acting?.id === req.id && acting?.action === "accept";
  const isDeclining = acting?.id === req.id && acting?.action === "decline";
  const isBusy = isAccepting || isDeclining;

  const modeLabel = req.mode === "learn"
    ? (isIncoming ? `Wants to learn ${req.subject} from you` : `You want to learn ${req.subject}`)
    : (isIncoming ? `Wants to teach you ${req.subject}` : `You offered to teach ${req.subject}`);

  return (
    <div className="fr-card">
      <div className="fr-card-main">
        <Avatar url={person.photoURL} name={person.displayName} size={46} />
        <div className="fr-card-body">
          <div className="fr-card-top-row">
            <div className="fr-card-name-wrap">
              <span className="fr-card-name">{person.displayName}</span>
              {person.isOnline && <span className="fr-online-dot" title="Online" />}
            </div>
            <StatusPill status={req.status} />
          </div>
          <div className="fr-card-grade">{person.grade || "Student"}</div>
          <div className="fr-card-meta">
            <span className="fr-meta-tag">{modeLabel}</span>
          </div>
          {req.message && (
            <p className="fr-card-message">"{req.message}"</p>
          )}
          <div className="fr-card-time">
            <ClockIcon />
            {timeAgo(req.createdAt)}
          </div>
        </div>
      </div>

      {isIncoming && req.status === "pending" && (
        <div className="fr-card-actions">
          <button type="button" className="fr-btn fr-btn-decline" onClick={() => onDecline(req.id)} disabled={isBusy}>
            <XIcon /> {isDeclining ? "Declining…" : "Decline"}
          </button>
          <button type="button" className="fr-btn fr-btn-accept" onClick={() => onAccept(req.id)} disabled={isBusy}>
            <CheckIcon /> {isAccepting ? "Accepting…" : "Accept"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function MatchRequestsPage() {
  const toast = useToast();
  const [tab, setTab] = useState("received");
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, out] = await Promise.all([
        api.listMatchRequests("incoming", "all"),
        api.listMatchRequests("outgoing", "all"),
      ]);
      setReceived(inc);
      setSent(out);
    } catch (err) {
      toast.error(err.message || "Failed to load friend requests.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function handleAccept(reqId) {
    setActing({ id: reqId, action: "accept" });
    try {
      await api.respondMatchRequest(reqId, "accept");
      toast.success("Friend request accepted! You can now chat.");
      await load();
    } catch (err) {
      toast.error(err.message || "Failed to accept request.");
    } finally {
      setActing(null);
    }
  }

  async function handleDecline(reqId) {
    setActing({ id: reqId, action: "decline" });
    try {
      await api.respondMatchRequest(reqId, "decline");
      toast.success("Request declined.");
      await load();
    } catch (err) {
      toast.error(err.message || "Failed to decline request.");
    } finally {
      setActing(null);
    }
  }

  const pendingIncoming = received.filter(r => r.status === "pending").length;
  const pendingOutgoing = sent.filter(r => r.status === "pending").length;
  const list = tab === "received" ? received : sent;

  return (
    <div className="fr-page">
      {/* Page header */}
      <div className="fr-page-header">
        <div className="fr-page-title-block">
          <h1 className="fr-page-title">Friend Requests</h1>
          <p className="fr-page-subtitle">Accept a request to unlock chat and study rooms with that student.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="fr-tabs-bar">
        <button
          type="button"
          className={`fr-tab ${tab === "received" ? "fr-tab--active" : ""}`}
          onClick={() => setTab("received")}
        >
          <InboxIcon />
          <span>Received</span>
          {pendingIncoming > 0 && <span className="fr-tab-badge">{pendingIncoming}</span>}
        </button>
        <button
          type="button"
          className={`fr-tab ${tab === "sent" ? "fr-tab--active" : ""}`}
          onClick={() => setTab("sent")}
        >
          <SendIcon />
          <span>Sent</span>
          {pendingOutgoing > 0 && <span className="fr-tab-badge">{pendingOutgoing}</span>}
        </button>
      </div>

      {/* Content */}
      <div className="fr-content">
        {loading ? (
          <div className="fr-loading">
            <span className="discover-spinner" />
            <span>Loading…</span>
          </div>
        ) : list.length === 0 ? (
          <div className="fr-empty">
            <div className="fr-empty-icon">
              {tab === "received" ? <InboxIcon /> : <UsersIcon />}
            </div>
            <h3 className="fr-empty-title">
              {tab === "received" ? "No requests yet" : "No requests sent yet"}
            </h3>
            <p className="fr-empty-text">
              {tab === "received"
                ? "When a student sends you a friend request, it will appear here."
                : "Head to Discover to find students and send friend requests."}
            </p>
          </div>
        ) : (
          <div className="fr-list">
            {list.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                perspective={tab === "received" ? "incoming" : "outgoing"}
                onAccept={handleAccept}
                onDecline={handleDecline}
                acting={acting}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
