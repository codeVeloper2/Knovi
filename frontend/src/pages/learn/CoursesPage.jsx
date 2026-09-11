import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import { SUBJECTS } from "../../subjects";

const COLORS = {
  Math: "#6366f1", English: "#3b82f6", Biology: "#22c55e",
  Chemistry: "#f59e0b", Physics: "#eab308", History: "#a78bfa",
  Geography: "#34d399", "Computer Science": "#06b6d4", Spanish: "#ef4444",
  French: "#60a5fa", Art: "#f472b6", Music: "#818cf8",
  Economics: "#f59e0b", Literature: "#a78bfa", Psychology: "#34d399",
};
const color = s => COLORS[s] || "#6366f1";

function CourseCard({ c, onClick }) {
  const col = color(c.subject);
  const pct = c.progressPct || 0;
  return (
    <button type="button" className="ln-card" onClick={onClick}>
      <div className="ln-card-thumb">
        {c.thumbnailUrl
          ? <img src={c.thumbnailUrl} alt={c.title} />
          : <div className="ln-card-thumb-empty" style={{ background: `${col}18` }}>
              <span style={{ fontSize: "2rem" }}>📚</span>
            </div>
        }
        {pct > 0 && (
          <div className="ln-card-bar"><div style={{ width: `${pct}%`, background: col }} /></div>
        )}
      </div>
      <div className="ln-card-body">
        <span className="ln-card-subject" style={{ color: col }}>{c.subject}</span>
        <p className="ln-card-title">{c.title}</p>
        <span className="ln-card-meta">
          {c.lessonsCount} lessons · {c.durationMinutes} min
          {c.rating > 0 ? ` · ⭐ ${c.rating}` : ""}
        </span>
        <span className="ln-card-creator">by {c.creatorName}</span>
        {pct > 0 && <span className="ln-card-pct" style={{ color: col }}>{pct}% complete</span>}
      </div>
    </button>
  );
}

const TABS = [
  { id: "all",      label: "All Courses"  },
  { id: "enrolled", label: "My Courses"   },
  { id: "saved",    label: "Saved"        },
];

export default function CoursesPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const [params] = useSearchParams();

  const [tab,     setTab]     = useState("all");
  const [subject, setSubject] = useState(params.get("subject") || "All");
  const [search,  setSearch]  = useState(params.get("search")  || "");
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.listCourses({
      subject:  subject !== "All" ? subject : undefined,
      enrolled: tab === "enrolled",
      saved:    tab === "saved",
      search:   search || undefined,
    })
      .then(setCourses)
      .catch(() => toast.error("Failed to load courses."))
      .finally(() => setLoading(false));
  }, [tab, subject, search]);

  return (
    <div className="ln-page">
      {/* Header */}
      <div className="ln-page-header">
        <button type="button" className="ct-back" onClick={() => navigate("/app/learn")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Learn
        </button>
        <div className="ln-page-title-row">
          <h1 className="ln-page-title">Courses</h1>
          <div className="ln-search-bar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search courses..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="ln-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`ln-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Subject filter */}
      <div className="ln-chips">
        {["All", ...SUBJECTS].map(s => (
          <button
            key={s}
            type="button"
            className={`ln-chip ${subject === s ? "selected" : ""}`}
            style={{ "--c": color(s) }}
            onClick={() => setSubject(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="ln-loading"><span className="discover-spinner" /> Loading...</div>
      ) : courses.length === 0 ? (
        <div className="ln-empty">
          <span>📚</span>
          <h3>{tab === "enrolled" ? "No courses started yet" : tab === "saved" ? "Nothing saved" : "No courses found"}</h3>
          <p>{tab === "all" ? "Try a different subject or search term." : "Browse all courses to get started."}</p>
          {tab !== "all" && (
            <button type="button" className="ln-btn-primary" onClick={() => setTab("all")}>Browse All Courses</button>
          )}
        </div>
      ) : (
        <div className="ln-grid">
          {courses.map(c => (
            <CourseCard key={c.id} c={c} onClick={() => navigate(`/app/learn/courses/${c.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
