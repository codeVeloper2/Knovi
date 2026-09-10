import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import { SUBJECTS } from "../../subjects";

function TutCard({ tut, onClick }) {
  const mins = Math.floor((tut.durationSeconds || 0) / 60);
  const secs = String((tut.durationSeconds || 0) % 60).padStart(2, "0");
  const statusColor = { approved: "#22c55e", pending: "#f59e0b", rejected: "#ef4444" }[tut.status] || "#64748b";
  return (
    <div className="lh-tut-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onClick()}>
      <div className="lh-tut-thumb">
        {tut.thumbnailUrl
          ? <img src={tut.thumbnailUrl} alt={tut.title} />
          : <div className="lh-tut-thumb-placeholder">🎥</div>
        }
        {mins > 0 && <span className="lh-tut-duration">{mins}:{secs}</span>}
        {tut.progressPct > 0 && !tut.completed && (
          <div className="lh-card-progress-bar"><div style={{ width: `${tut.progressPct}%` }} /></div>
        )}
      </div>
      <div className="lh-tut-body">
        <div className="lh-card-subject">{tut.subject}{tut.topic ? ` · ${tut.topic}` : ""}</div>
        <div className="lh-tut-title">{tut.title}</div>
        <div className="lh-tut-creator">{tut.creatorName}</div>
        <div className="lh-card-meta">
          {tut.views > 0 && <><span>{tut.views} views</span><span>·</span></>}
          {tut.rating > 0 && <span>⭐ {tut.rating}</span>}
          {tut.status && tut.status !== "approved" && (
            <span style={{ color: statusColor, fontWeight: 700, textTransform: "capitalize" }}>{tut.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: "popular", label: "Popular"     },
  { id: "recent",  label: "Recent"      },
  { id: "mine",    label: "My Uploads"  },
];

export default function TutorialsPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const { profile } = useAuth();

  const [tab,       setTab]      = useState("popular");
  const [subject,   setSubject]  = useState("All");
  const [search,    setSearch]   = useState("");
  const [tutorials, setTutorials]= useState([]);
  const [loading,   setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    api.listTutorials({
      subject: subject !== "All" ? subject : undefined,
      sort:    tab !== "mine" ? tab : undefined,
      mine:    tab === "mine",
      search:  search || undefined,
    })
      .then(setTutorials)
      .catch(() => toast.error("Failed to load tutorials."))
      .finally(() => setLoading(false));
  }, [tab, subject, search]);

  return (
    <div className="lh-page">
      <div className="cp-header">
        <h1 className="cp-title">Student Tutorials</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="cp-search-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search tutorials…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className="lh-cta-btn" onClick={() => navigate("/app/learn/create")}>
            + Upload
          </button>
        </div>
      </div>

      <div className="lh-tabs">
        {TABS.map(t => (
          <button key={t.id} type="button"
            className={`lh-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      <div className="lh-filters">
        {["All", ...SUBJECTS].map(s => (
          <button key={s} type="button"
            className={`lh-filter-chip ${subject === s ? "active" : ""}`}
            onClick={() => setSubject(s)}
          >{s}</button>
        ))}
      </div>

      {loading
        ? <div className="lh-loading"><span className="discover-spinner" /> Loading…</div>
        : tutorials.length === 0
        ? (
          <div className="lh-empty">
            <div className="lh-empty-icon">🎥</div>
            <h3>{tab === "mine" ? "No uploads yet" : "No tutorials found"}</h3>
            <p>{tab === "mine" ? "Share your knowledge with fellow students." : "Try a different subject or search term."}</p>
            <button type="button" className="lh-cta-btn" onClick={() => navigate("/app/learn/create")}>
              Upload a Tutorial
            </button>
          </div>
        )
        : (
          <div className="lh-tut-grid lh-tut-grid--wide">
            {tutorials.map(t => (
              <TutCard key={t.id} tut={t} onClick={() => navigate(`/app/learn/tutorials/${t.id}`)} />
            ))}
          </div>
        )
      }
    </div>
  );
}
