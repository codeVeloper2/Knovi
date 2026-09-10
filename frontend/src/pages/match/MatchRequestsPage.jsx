import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

// ── Icons ─────────────────────────────────────────────────────────
const InboxIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
  </svg>
);
const SendIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const LearnIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);
const TeachIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
);

function Avatar({ url, name, size = 44 }) {
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

function StatusBadge({ status }) {
  const map = {
    pending:  { label: "Pending",  cls: "mr-status-pending"  },
    accepted: { label: "Accepted", cls: "mr-status-accepted" },
    declined: { label: "Declined", cls: "mr-status-declined" },
  };
  const s = map[status] || map.pending;
  return <span className={`mr-status ${s.cls}`}>{s.label}</span>;
}

function RequestCard({ req, perspective, onAccept, onDecline, acting }) {
  const isIncoming = perspective === "incoming";
  const person = isIncoming ? req.sender : req.receiver;
  // acting = { id, action } | null
  const isAccepting = acting?.id === req.id && acting?.action === "accept";
  const isDeclining = acting?.id === req.id && acting?.action === "decline";
  const isBusy = isAccepting || isDeclining;

  return (
    <div className={`mr-card mr-card--${req.status}`}>
      {/* Top row: avatar + person info + status badge */}
      <div className="mr-card-top">
        <Avatar url={person.photoURL} name={person.displayName} size={48} />
        <div className="mr-card-person">
          <div className="mr-card-name">
            {person.displayName}
            {person.isOnline && <span className="mr-online-dot" />}
          </div>
          <div className="mr-card-grade">{person.grade || "Student"}</div>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {/* Request details */}
      <div className="mr-card-details">
        <div className="mr-detail-row">
          <span className="mr-detail-icon">
            {req.mode === "learn" ? <LearnIcon /> : <TeachIcon />}
          </span>
          <span className="mr-detail-label">
            {req.mode === "learn"
              ? isIncoming
                ? `Wants to learn ${req.subject} from you`
                : `You want to learn ${req.subject} from them`
              : isIncoming
              ? `Wants to teach you ${req.subject}`
              : `You offered to teach them ${req.subject}`}
          </span>
        </div>

        <div className="mr-detail-row">
          <span className="mr-detail-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </span>
          <span className="mr-detail-label">Subject: <strong>{req.subject}</strong></span>
        </div>

        {req.message && (
          <div className="mr-message-box">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>{req.message}</span>
          </div>
        )}

        <div className="mr-detail-row" style={{ opacity: 0.55 }}>
          <ClockIcon />
          <span className="mr-detail-label">{timeAgo(req.createdAt)}</span>
        </div>
      </div>

      {/* Actions — only for pending incoming */}
      {isIncoming && req.status === "pending" && (
        <div className="mr-card-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm mr-btn-decline"
            onClick={() => onDecline(req.id)}
            disabled={isBusy}
          >
            <XIcon /> {isDeclining ? "Declining…" : "Decline"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onAccept(req.id)}
            disabled={isBusy}
          >
            <CheckIcon /> {isAccepting ? "Accepting…" : "Accept"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function MatchRequestsPage() {
  const toast = useToast();
  const [tab, setTab] = useState("received"); // "received" | "sent"
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null); // id of request being acted on

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
      toast.error(err.message || "Failed to load match requests.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function handleAccept(reqId) {
    setActing({ id: reqId, action: "accept" });
    try {
      await api.respondMatchRequest(reqId, "accept");
      toast.success("Match request accepted!");
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

  const pendingCount = received.filter(r => r.status === "pending").length;
  const list = tab === "received" ? received : sent;

  return (
    <div className="mr-page">
      {/* Header */}
      <div className="mr-header">
        <div className="mr-title-row">
          <div className="mr-icon">
            <InboxIcon />
          </div>
          <div>
            <h1 className="mr-title">Match Requests</h1>
            <p className="mr-subtitle">Manage your incoming and outgoing study partner requests.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mr-tabs">
          <button
            type="button"
            className={`mr-tab ${tab === "received" ? "active" : ""}`}
            onClick={() => setTab("received")}
          >
            <InboxIcon />
            Received
            {pendingCount > 0 && <span className="mr-tab-badge">{pendingCount}</span>}
          </button>
          <button
            type="button"
            className={`mr-tab ${tab === "sent" ? "active" : ""}`}
            onClick={() => setTab("sent")}
          >
            <SendIcon />
            Sent
            {sent.filter(r => r.status === "pending").length > 0 && (
              <span className="mr-tab-badge">{sent.filter(r => r.status === "pending").length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mr-content">
        {loading ? (
          <div className="mr-loading">
            <span className="discover-spinner" />
            <span>Loading requests…</span>
          </div>
        ) : list.length === 0 ? (
          <div className="mr-empty">
            {tab === "received" ? <InboxIcon /> : <SendIcon />}
            <h3>{tab === "received" ? "No requests received yet" : "No requests sent yet"}</h3>
            <p>
              {tab === "received"
                ? "When students send you a match request, they'll appear here."
                : "Go to Discover to find students and send match requests."}
            </p>
          </div>
        ) : (
          <div className="mr-list">
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
