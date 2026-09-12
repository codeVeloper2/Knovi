import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import NotificationsBell from "../../components/NotificationsPanel";

const COLORS = {
  Mathematics:"#6366f1",Math:"#6366f1",English:"#3b82f6",Biology:"#22c55e",
  Chemistry:"#f59e0b",Physics:"#eab308",History:"#a78bfa",Geography:"#34d399",
  "Computer Science":"#06b6d4",Spanish:"#ef4444",French:"#60a5fa",Art:"#f472b6",
  Music:"#818cf8",Economics:"#f59e0b",Literature:"#a78bfa",Psychology:"#34d399",
  Programming:"#06b6d4","Further Math":"#6366f1",Accounting:"#f59e0b",
};
const color = s => COLORS[s] || "#6366f1";

function MobileHeader({ onBack }) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const name    = profile?.displayName || user?.displayName || "";
  const photo   = profile?.photoURL    || user?.photoURL    || "";
  const initial = name.trim()[0]?.toUpperCase() || "?";
  return (
    <div className="ln-mob-header">
      <div className="ln-mob-header-left">
        <button className="ln-mob-menu-btn" aria-label="Back" onClick={onBack}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <span className="ln-mob-logo">Peer<span className="ln-mob-accent">Up</span></span>
      </div>
      <div className="ln-mob-header-right">
        <NotificationsBell className="notif-bell-btn" />
        <button className="ln-mob-avatar" onClick={() => navigate("/app/settings")} aria-label="Profile">
          {photo ? <img src={photo} alt={name} referrerPolicy="no-referrer" /> : <span>{initial}</span>}
        </button>
      </div>
    </div>
  );
}

function fmtViews(v) {
  if (!v) return "0 views";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K views`;
  return `${v} views`;
}

const STATUS_MAP = {
  approved: { label: "Published", cls: "published" },
  pending:  { label: "Pending",   cls: "pending"   },
  rejected: { label: "Rejected",  cls: "rejected"  },
};

export default function MyTutorialsPage() {
  const navigate = useNavigate();
  const toast    = useToast();

  const [tab,       setTab]       = useState("published");
  const [tutorials, setTutorials] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    api.listTutorials({ mine: true })
      .then(setTutorials)
      .catch(() => toast.error("Couldn't load your tutorials. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  // split into Published vs Drafts (pending/rejected)
  const published = tutorials.filter(t => t.status === "approved");
  const drafts    = tutorials.filter(t => t.status !== "approved");
  const list      = tab === "published" ? published : drafts;

  return (
    <div className="myt-page">
      <MobileHeader onBack={() => navigate("/app/learn")} />

      {/* ── Title ── */}
      <div className="ln-topbar" style={{ marginTop: 64 }}>
        <button type="button" className="ln-back-btn" onClick={() => navigate("/app/learn")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Learn
        </button>
      </div>
      <h1 className="ln-page-title">My Tutorials</h1>
      <p className="ln-page-subtitle">Manage and track your created tutorials.</p>

      {/* ── Tabs ── */}
      <div className="ln-tabs">
        <button
          type="button"
          className={`ln-tab ${tab === "published" ? "active" : ""}`}
          onClick={() => setTab("published")}
        >
          Published
          {published.length > 0 && <span className="ln-tab-badge">{published.length}</span>}
        </button>
        <button
          type="button"
          className={`ln-tab ${tab === "drafts" ? "active" : ""}`}
          onClick={() => setTab("drafts")}
        >
          Drafts
          {drafts.length > 0 && <span className="ln-tab-badge">{drafts.length}</span>}
        </button>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="ln-loading"><span className="discover-spinner" /> Loading…</div>
      ) : list.length === 0 ? (
        <div className="ln-empty">
          <span>{tab === "published" ? "📺" : "📝"}</span>
          <h3>{tab === "published" ? "No published tutorials yet" : "No drafts"}</h3>
          <p>
            {tab === "published"
              ? "Create and publish a tutorial to share your knowledge."
              : "Pending or rejected tutorials appear here."}
          </p>
          <button type="button" className="ln-btn-primary" onClick={() => navigate("/app/learn/create")}>
            Create Tutorial
          </button>
        </div>
      ) : (
        <div className="myt-list">
          {list.map(t => {
            const c      = color(t.subject);
            const status = STATUS_MAP[t.status] || { label: t.status, cls: "draft" };
            const dur    = t.durationSeconds > 0
              ? `${Math.floor(t.durationSeconds / 60)}:${String(t.durationSeconds % 60).padStart(2, "0")}`
              : null;
            return (
              <div key={t.id} className="myt-card" onClick={() => navigate(`/app/learn/tutorials/${t.id}`)}>
                {/* Thumbnail */}
                <div className="myt-thumb">
                  {t.thumbnailUrl
                    ? <img src={t.thumbnailUrl} alt={t.title} />
                    : <div style={{ width:"100%", height:"100%", background:`${c}18`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={c} opacity=".5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      </div>
                  }
                </div>

                {/* Body */}
                <div className="myt-body">
                  <div className="myt-title">{t.title}</div>
                  <span className="myt-subject" style={{ color: c }}>{t.subject}</span>
                  <div className="myt-meta">
                    {fmtViews(t.views)}{dur ? ` · ${dur}` : ""}
                  </div>
                  <span className={`myt-status ${status.cls}`}>{status.label}</span>
                </div>

                {/* More button */}
                <button
                  type="button"
                  className="myt-more-btn"
                  onClick={e => { e.stopPropagation(); navigate(`/app/learn/tutorials/${t.id}`); }}
                  aria-label="View tutorial"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create CTA ── */}
      {!loading && (
        <div style={{ padding: "20px 20px 0" }}>
          <button type="button" className="ln-btn-primary" style={{ width: "100%" }}
            onClick={() => navigate("/app/learn/create")}>
            + Create New Tutorial
          </button>
        </div>
      )}
    </div>
  );
}
