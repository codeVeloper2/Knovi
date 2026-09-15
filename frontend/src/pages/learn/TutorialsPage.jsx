import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import { SUBJECTS } from "../../subjects";
import NotificationsBell from "../../components/NotificationsPanel";

const COLORS = {
  Mathematics:"#6366f1",Math:"#6366f1",English:"#3b82f6",Biology:"#22c55e",
  Chemistry:"#f59e0b",Physics:"#eab308",History:"#a78bfa",Geography:"#34d399",
  "Computer Science":"#06b6d4",Spanish:"#ef4444",French:"#60a5fa",Art:"#f472b6",
  Music:"#818cf8",Economics:"#f59e0b",Literature:"#a78bfa",Psychology:"#34d399",
  Programming:"#06b6d4","Further Math":"#6366f1",Accounting:"#f59e0b",
};
const color = s => COLORS[s] || "#6366f1";

const STATUS_LABEL = { approved:"Published", pending:"Pending Review", rejected:"Rejected" };
const STATUS_COLOR = { approved:"#22c55e",   pending:"#f59e0b",        rejected:"#ef4444"  };

function MobileHeader() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const name  = profile?.displayName || user?.displayName || "";
  const photo = profile?.photoURL    || user?.photoURL    || "";
  const initial = name.trim()[0]?.toUpperCase() || "?";
  return (
    <div className="ln-mob-header">
      <div className="ln-mob-header-left">
        <button className="ln-mob-menu-btn" aria-label="Open menu"
          onClick={() => window.dispatchEvent(new CustomEvent("peerup:open-nav"))}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
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

function TutCard({ t, onClick, showStatus }) {
  const c   = color(t.subject);
  const dur = t.durationSeconds > 0
    ? `${Math.floor(t.durationSeconds/60)}:${String(t.durationSeconds%60).padStart(2,"0")}`
    : null;
  return (
    <button type="button" className="ln-card" onClick={onClick}>
      <div className="ln-card-thumb">
        {t.thumbnailUrl
          ? <img src={t.thumbnailUrl} alt={t.title} />
          : <div className="ln-card-thumb-empty" style={{ background:`${c}18` }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill={c} opacity=".4"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
        }
        <div className="play-overlay">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white" opacity=".9"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
        {dur && <span className="ln-card-dur">{dur}</span>}
        {t.progressPct > 0 && !t.completed && (
          <div className="ln-card-bar"><div style={{ width:`${t.progressPct}%`, background:c }}/></div>
        )}
        {showStatus && (
          <span className="ln-card-status" style={{ background: STATUS_COLOR[t.status] || "#64748b" }}>
            {STATUS_LABEL[t.status] || t.status}
          </span>
        )}
      </div>
      <div className="ln-card-body">
        <span className="ln-card-subject" style={{ color:c }}>{t.subject}{t.topic ? ` · ${t.topic}` : ""}</span>
        <p className="ln-card-title">{t.title}</p>
        <span className="ln-card-meta">
          {t.views > 0 ? `${t.views} views` : ""}
          {t.views > 0 && t.rating > 0 ? " · " : ""}
          {t.rating > 0 ? `⭐ ${t.rating}` : ""}
        </span>
        <span className="ln-card-creator">{t.creatorName}</span>
      </div>
    </button>
  );
}

const TABS = [
  { id:"popular", label:"Popular" },
  { id:"recent",  label:"Recent"  },
  { id:"mine",    label:"My Tutorials" },
];

export default function TutorialsPage() {
  const navigate  = useNavigate();
  const toast     = useToast();
  const [searchParams] = useSearchParams();

  const [tab,       setTab]       = useState("popular");
  const [subject,   setSubject]   = useState("All");
  const [search,    setSearch]    = useState(searchParams.get("search") || "");
  const [tutorials, setTutorials] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    api.listTutorials({
      subject: subject !== "All" ? subject : undefined,
      sort:    tab !== "mine" ? tab : undefined,
      mine:    tab === "mine",
      search:  search || undefined,
    })
      .then(setTutorials)
      .catch(() => toast.error("Couldn't load tutorials. Please try again."))
      .finally(() => setLoading(false));
  }, [tab, subject, search]);

  return (
    <div className="ln-page lh-page">
      {/* MobileHeader is a duplicate — MobileTopBar handles this globally */}

      {/* ── Back + title ── */}
      <div className="ln-topbar">
        <button type="button" className="ln-back-btn" onClick={() => navigate("/app/learn")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Learn
        </button>
      </div>
      <h1 className="ln-page-title">Tutorials</h1>
      <p className="ln-page-subtitle">Learn from practical lessons created by students.</p>

      {/* ── Search ── */}
      <div className="ln-search-wrap">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          placeholder="Search tutorials, subjects, or topics..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} style={{ background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer" }}>✕</button>
        )}
      </div>

      {/* ── Subject chips ── */}
      {tab !== "mine" && (
        <div className="ln-chips">
          {["All", ...SUBJECTS].map(s => (
            <button
              key={s} type="button"
              className={`ln-chip ${subject === s ? "selected" : ""}`}
              style={{ "--c": color(s) }}
              onClick={() => setSubject(s)}
            >{s}</button>
          ))}
        </div>
      )}

      {/* ── Sort row + Upload button ── */}
      <div className="ln-sort-row">
        <span className="ln-sort-label">Sort by</span>
        <select
          className="ln-sort-select"
          value={tab !== "mine" ? tab : "popular"}
          onChange={e => setTab(e.target.value)}
          disabled={tab === "mine"}
        >
          <option value="popular">Recommended</option>
          <option value="recent">Recent</option>
        </select>
        <div style={{ marginLeft:"auto" }}>
          <button type="button" className="ln-btn-primary" style={{ padding:"8px 16px", fontSize:"0.82rem" }}
            onClick={() => navigate("/app/learn/create")}>
            + Create
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="ln-tabs">
        {TABS.map(t => (
          <button
            key={t.id} type="button"
            className={`ln-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="ln-loading"><span className="discover-spinner" /> Loading...</div>
      ) : tutorials.length === 0 ? (
        <div className="ln-empty">
          <span>{tab === "mine" ? "📤" : "🎥"}</span>
          <h3>{tab === "mine" ? "No tutorials yet" : "No tutorials found"}</h3>
          <p>
            {tab === "mine"
              ? "Create your first tutorial and share your knowledge."
              : "Try a different subject or search term."}
          </p>
          <button type="button" className="ln-btn-primary" onClick={() => navigate("/app/learn/create")}>
            Create a Tutorial
          </button>
        </div>
      ) : (
        <div className="ln-grid">
          {tutorials.map(t => (
            <TutCard
              key={t.id} t={t}
              showStatus={tab === "mine"}
              onClick={() => navigate(`/app/learn/tutorials/${t.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
