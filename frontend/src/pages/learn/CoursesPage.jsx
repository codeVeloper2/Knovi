import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import { SUBJECTS } from "../../subjects";

function CourseCard({ course, onClick }) {
  const pct = course.progressPct || 0;
  return (
    <div className="lh-course-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onClick()}>
      <div className="lh-card-thumb">
        {course.thumbnailUrl
          ? <img src={course.thumbnailUrl} alt={course.title} />
          : <div className="lh-card-thumb-placeholder">📚</div>
        }
        {pct > 0 && <div className="lh-card-progress-bar"><div style={{ width: `${pct}%` }} /></div>}
      </div>
      <div className="lh-card-body">
        <div className="lh-card-subject">{course.subject}</div>
        <div className="lh-card-title">{course.title}</div>
        <div className="lh-card-desc">{course.description?.slice(0, 80)}{course.description?.length > 80 ? "…" : ""}</div>
        <div className="lh-card-meta">
          <span>{course.lessonsCount} lessons</span>
          <span>·</span>
          <span>{course.durationMinutes} min</span>
          {course.rating > 0 && <><span>·</span><span>⭐ {course.rating}</span></>}
        </div>
        <div className="lh-card-creator">by {course.creatorName}</div>
        {pct > 0 && <div className="lh-card-pct">{pct}% complete</div>}
      </div>
    </div>
  );
}

const TABS = [
  { id: "all",      label: "All Courses" },
  { id: "enrolled", label: "My Courses"  },
  { id: "saved",    label: "Saved"       },
];

export default function CoursesPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const [params]     = useSearchParams();

  const [tab,      setTab]      = useState("all");
  const [subject,  setSubject]  = useState(params.get("subject") || "All");
  const [search,   setSearch]   = useState(params.get("search") || "");
  const [courses,  setCourses]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    api.listCourses({
      subject: subject !== "All" ? subject : undefined,
      enrolled: tab === "enrolled",
      saved:    tab === "saved",
      search:   search || undefined,
    })
      .then(setCourses)
      .catch(() => toast.error("Failed to load courses."))
      .finally(() => setLoading(false));
  }, [tab, subject, search]);

  return (
    <div className="lh-page">
      <div className="cp-header">
        <h1 className="cp-title">Courses</h1>
        <div className="cp-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search courses…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="lh-tabs">
        {TABS.map(t => (
          <button key={t.id} type="button"
            className={`lh-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {/* Subject pills */}
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
        : courses.length === 0
        ? (
          <div className="lh-empty">
            <div className="lh-empty-icon">📚</div>
            <h3>{tab === "enrolled" ? "No courses started yet" : tab === "saved" ? "No saved courses" : "No courses found"}</h3>
            <p>{tab === "all" ? "Try a different subject or search term." : "Browse all courses to get started."}</p>
            {tab !== "all" && <button type="button" className="lh-cta-btn" onClick={() => setTab("all")}>Browse Courses</button>}
          </div>
        )
        : (
          <div className="lh-grid lh-grid--wide">
            {courses.map(c => (
              <CourseCard key={c.id} course={c} onClick={() => navigate(`/app/learn/courses/${c.id}`)} />
            ))}
          </div>
        )
      }
    </div>
  );
}
