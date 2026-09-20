import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

const COLORS = {
  Mathematics:"#6366f1", Math:"#6366f1", English:"#3b82f6", Biology:"#22c55e",
  Chemistry:"#f59e0b", Physics:"#2e8cff", History:"#a78bfa", Geography:"#22c7d9",
  "Computer Science":"#06b6d4", Accounting:"#f59e0b", Economics:"#f59e0b",
  Literature:"#ec4899", Psychology:"#34d399", Spanish:"#ef4444", French:"#60a5fa",
  Art:"#f472b6", Music:"#818cf8",
};
const color = s => COLORS[s] || "#4f6ef7";

function ResourceIcon({ type }) {
  const icon = type === "tutorial" ? "▶" : type === "course" ? "▤" : "💡";
  return <span className="ln-resource-icon">{icon}</span>;
}

function SavedCard({ item, type, onRemove, onClick }) {
  const c = color(item.subject);
  const description = item.description || (
    type === "course"
      ? `${item.lessonsCount || 0} lessons · ${item.durationMinutes || 0} minutes of guided learning.`
      : type === "tutorial"
        ? "A student-created tutorial saved for later study."
        : "A saved lesson ready to revisit."
  );

  return (
    <article className="ln-resource-card">
      <button type="button" className="ln-resource-main" onClick={onClick}>
        <div className="ln-resource-top">
          <div className="ln-resource-thumb" style={{ "--resource-accent": c }}>
            {item.thumbnailUrl
              ? <img src={item.thumbnailUrl} alt="" />
              : <ResourceIcon type={type}/>}
          </div>
          <div className="ln-resource-copy">
            {item.subject && <span className="ln-resource-subject" style={{ color:c }}>{item.subject}</span>}
            <h3>{item.title}</h3>
            <div className="ln-resource-tags">
              {item.topic && <span>{item.topic}</span>}
              {type === "course" && <span>{item.lessonsCount || 0} lessons</span>}
              {type === "tutorial" && <span>Video</span>}
              {type === "lesson" && <span>Lesson</span>}
            </div>
          </div>
          <span className="ln-star" aria-hidden="true">☆</span>
        </div>
        <p>{description}</p>
        <div className="ln-resource-footer">
          <span>{type === "course" ? `${item.durationMinutes || 0} min` : type === "tutorial" ? "Tutorial" : "Saved lesson"}</span>
          <span className="ln-view-link">View <span>›</span></span>
        </div>
      </button>
      <button
        type="button"
        className="ln-remove"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.title} from saved resources`}
      >
        ⋮
      </button>
    </article>
  );
}

const TABS = [
  ["Courses", "courses"],
  ["Tutorials", "tutorials"],
  ["Lessons", "lessons"],
];

export default function SavedPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState("Courses");
  const [saved, setSaved] = useState({ courses: [], tutorials: [], lessons: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("All");
  const [sort, setSort] = useState("recent");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getSaved()
      .then(data => alive && setSaved({
        courses: Array.isArray(data?.courses) ? data.courses : [],
        tutorials: Array.isArray(data?.tutorials) ? data.tutorials : [],
        lessons: Array.isArray(data?.lessons) ? data.lessons : [],
      }))
      .catch(() => alive && toast.error("Failed to load saved content."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [toast]);

  const subjects = useMemo(() => {
    const all = [...saved.courses, ...saved.tutorials, ...saved.lessons]
      .map(item => item.subject)
      .filter(Boolean);
    return ["All", ...Array.from(new Set(all)).sort()];
  }, [saved]);

  const rawItems = tab === "Courses" ? saved.courses : tab === "Tutorials" ? saved.tutorials : saved.lessons;
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...rawItems]
      .filter(item => subject === "All" || item.subject === subject)
      .filter(item => !q || [item.title, item.subject, item.topic, item.description, item.creatorName]
        .filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === "title") return (a.title || "").localeCompare(b.title || "");
        const ad = new Date(a.createdAt || 0).getTime();
        const bd = new Date(b.createdAt || 0).getTime();
        return sort === "oldest" ? ad - bd : bd - ad;
      });
  }, [rawItems, search, subject, sort]);

  const counts = {
    courses: saved.courses.length,
    tutorials: saved.tutorials.length,
    lessons: saved.lessons.length,
  };

  async function remove(type, id) {
    try {
      await api.toggleSaved(type, id);
      const key = type === "course" ? "courses" : type === "tutorial" ? "tutorials" : "lessons";
      setSaved(prev => ({ ...prev, [key]: prev[key].filter(x => x.id !== id) }));
      toast.success("Removed from saved.");
    } catch {
      toast.error("Couldn't remove this resource.");
    }
  }

  function handleClick(item) {
    if (tab === "Courses") navigate(`/app/learn/courses/${item.id}`);
    else if (tab === "Tutorials") navigate(`/app/learn/tutorials/${item.id}`);
    else navigate(`/app/learn/courses/${item.courseId}/lessons/${item.id}`);
  }

  const total = counts.courses + counts.tutorials + counts.lessons;

  return (
    <div className="ln-page">
      <header className="ln-page-head">
        <div className="ln-heading-icon">▱</div>
        <div>
          <h1>Saved Resources</h1>
          <p>Your personal library of useful study materials. Keep everything that helps you learn better — all in one place.</p>
        </div>
        <div className="ln-header-tools">
          <label className="ln-search">
            <span>⌕</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search resources..."
              aria-label="Search saved resources"
            />
          </label>
          <button
            type="button"
            className={`ln-filter-btn ${filterOpen ? "active" : ""}`}
            onClick={() => setFilterOpen(v => !v)}
            aria-expanded={filterOpen}
            aria-label="Filter saved resources"
          >
            ☰
          </button>
        </div>
      </header>

      {filterOpen && (
        <div className="ln-filter-panel">
          <label>
            <span>Subject</span>
            <select value={subject} onChange={e => setSubject(e.target.value)}>
              {subjects.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>
            <span>Sort by</span>
            <select value={sort} onChange={e => setSort(e.target.value)}>
              <option value="recent">Recent</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title</option>
            </select>
          </label>
          <button type="button" className="ln-clear-filter" onClick={() => { setSubject("All"); setSort("recent"); setSearch(""); }}>
            Clear filters
          </button>
        </div>
      )}

      <div className="ln-layout">
        <main>
          <div className="ln-tabs">
            {TABS.map(([label, key]) => (
              <button key={label} type="button" className={`ln-tab ${tab === label ? "active" : ""}`} onClick={() => setTab(label)}>
                <span>{label}</span><b>{counts[key]}</b>
              </button>
            ))}
          </div>

          <section className="ln-content-panel">
            <div className="ln-section-head">
              <div>
                <h2>{tab === "Courses" ? "Saved Courses" : tab === "Tutorials" ? "Saved Tutorials" : "Saved Lessons"}</h2>
                <p>Saved study materials you can return to anytime.</p>
              </div>
              <select className="ln-inline-sort" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort resources">
                <option value="recent">Recent</option>
                <option value="oldest">Oldest</option>
                <option value="title">Title</option>
              </select>
            </div>

            {loading ? (
              <div className="ln-grid">
                {[1,2,3,4].map(i => <div className="ln-resource-card ln-skeleton" key={i}/>)}
              </div>
            ) : items.length ? (
              <div className="ln-grid">
                {items.map(item => (
                  <SavedCard
                    key={item.id}
                    item={item}
                    type={tab === "Courses" ? "course" : tab === "Tutorials" ? "tutorial" : "lesson"}
                    onClick={() => handleClick(item)}
                    onRemove={id => remove(tab === "Courses" ? "course" : tab === "Tutorials" ? "tutorial" : "lesson", id)}
                  />
                ))}
              </div>
            ) : (
              <div className="ln-empty">
                <span>🔖</span>
                <h3>{search || subject !== "All" ? "No resources match your filters" : `No saved ${tab.toLowerCase()} yet`}</h3>
                <p>{search || subject !== "All" ? "Try another subject or search term." : "Save learning materials while browsing to find them here."}</p>
                <button type="button" className="ln-btn-primary" onClick={() => navigate("/app/learn")}>Browse Learn</button>
              </div>
            )}
          </section>
        </main>

        <aside className="ln-rail">
          <section className="ln-rail-card">
            <h2>Resource Stats</h2>
            <div className="ln-stat-grid">
              <div><strong>{counts.courses}</strong><span>Courses</span></div>
              <div><strong>{counts.tutorials}</strong><span>Tutorials</span></div>
              <div><strong>{counts.lessons}</strong><span>Lessons</span></div>
              <div><strong>{total}</strong><span>Total Saved</span></div>
            </div>
          </section>

          <section className="ln-rail-card">
            <div className="ln-rail-head"><h2>Subject Filter</h2><button type="button" onClick={() => setSubject("All")}>Clear all</button></div>
            <div className="ln-subject-list">
              {subjects.filter(s => s !== "All").map(s => (
                <button key={s} type="button" className={subject === s ? "active" : ""} onClick={() => setSubject(s)}>
                  <span className="ln-radio">{subject === s ? "●" : "○"}</span><span>{s}</span>
                  <b>{[...saved.courses, ...saved.tutorials, ...saved.lessons].filter(x => x.subject === s).length}</b>
                </button>
              ))}
              {!subjects.filter(s => s !== "All").length && <p className="ln-rail-muted">Subjects appear as you save resources.</p>}
            </div>
          </section>

          <section className="ln-rail-card ln-save-more">
            <strong>Save more. Learn faster.</strong>
            <p>Keep building your study library and make future sessions more effective.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
