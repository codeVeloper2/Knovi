import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

const META = {
  course: ["COURSE", "▣", "#4f7cff"],
  lesson: ["LESSON", "▤", "#1fb89a"],
  tutorial: ["TUTORIAL", "▶", "#c267ff"],
  explanation: ["EXPLANATION", "✦", "#ffb84d"],
};

function Icon({ name, size = 20 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
    arrow: <path d="m9 5 7 7-7 7"/>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    bookmark: <path d="M7 4h10v16l-5-3-5 3V4Z"/>,
    bulb: <><path d="M9 18h6M10 21h4"/><path d="M8.2 14.5A6 6 0 1 1 16 14.7c-.9.7-1.4 1.6-1.5 2.3h-5c-.1-.9-.5-1.7-1.3-2.5Z"/></>,
    play: <path d="m9 7 9 5-9 5V7Z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function normalize(data) {
  return {
    courses: Array.isArray(data?.courses) ? data.courses : [],
    tutorials: Array.isArray(data?.tutorials) ? data.tutorials : [],
    lessons: Array.isArray(data?.lessons) ? data.lessons : [],
    explanations: Array.isArray(data?.explanations) ? data.explanations : [],
  };
}

function dateLabel(value) {
  if (!value) return "Saved recently";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Saved recently" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function typeMeta(type) {
  return META[type] || META.lesson;
}

function ResourceCard({ item, type, onOpen, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [label, symbol, accent] = typeMeta(type);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const description = item.description || (
    type === "course" ? `${item.lessonsCount || 0} lessons · ${item.subject || "General study"}` :
    type === "tutorial" ? "A student-created tutorial saved for later." :
    type === "explanation" ? "A tutor explanation saved from your Learning Room." :
    "A saved lesson ready to revisit."
  );

  return (
    <article className="sv2-card" style={{ "--accent": accent }}>
      <button type="button" className="sv2-card-main" onClick={onOpen}>
        <div className="sv2-thumb">
          {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : <span>{symbol}</span>}
        </div>
        <div className="sv2-card-body">
          <div className="sv2-card-top"><span className="sv2-type">{label}</span><span className="sv2-date">{dateLabel(item.createdAt)}</span></div>
          <h3>{item.title || "Untitled resource"}</h3>
          <p>{description}</p>
          <div className="sv2-tags">{item.subject && <span>{item.subject}</span>}{item.classLevel && <span>{item.classLevel}</span>}{item.topic && <span>{item.topic}</span>}</div>
        </div>
        <span className="sv2-arrow"><Icon name="arrow" size={17}/></span>
      </button>
      {type === "explanation" && <button type="button" className="sv2-read-aloud" onClick={() => { if (window.speechSynthesis) { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(item.content || ""); u.rate = 0.95; window.speechSynthesis.speak(u); } }}>🔊 Read aloud</button>}
      <div className="sv2-menu" ref={ref}>
        <button type="button" onClick={() => setOpen(v => !v)} aria-label={`More options for ${item.title || "resource"}`}><Icon name="more" size={17}/></button>
        {open && <div className="sv2-menu-pop"><button onClick={onOpen}>Open</button><button className="danger" onClick={() => { setOpen(false); onRemove(type, item.id); }}>Remove</button></div>}
      </div>
    </article>
  );
}

export default function SavedPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [saved, setSaved] = useState({ courses: [], tutorials: [], lessons: [], explanations: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("all");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("All");
  const [sort, setSort] = useState("recent");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getSaved().then(data => alive && setSaved(normalize(data)))
      .catch(() => alive && toast.error("Failed to load saved resources."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [toast]);

  const all = useMemo(() => [
    ...saved.courses.map(item => ({ item, type: "course" })),
    ...saved.lessons.map(item => ({ item, type: "lesson" })),
    ...saved.tutorials.map(item => ({ item, type: "tutorial" })),
    ...saved.explanations.map(item => ({ item, type: "explanation" })),
  ], [saved]);

  const subjects = useMemo(() => ["All", ...Array.from(new Set(all.map(x => x.item.subject).filter(Boolean))).sort()], [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(({ item, type }) => {
      if (view !== "all" && type !== view) return false;
      if (subject !== "All" && item.subject !== subject) return false;
      if (!q) return true;
      return [item.title, item.description, item.subject, item.topic, item.creatorName, type].filter(Boolean).join(" ").toLowerCase().includes(q);
    }).sort((a,b) => {
      if (sort === "title") return (a.item.title || "").localeCompare(b.item.title || "");
      const aa = new Date(a.item.createdAt || 0).getTime(), bb = new Date(b.item.createdAt || 0).getTime();
      return sort === "oldest" ? aa - bb : bb - aa;
    });
  }, [all, view, subject, search, sort]);

  const counts = {
    all: all.length,
    course: saved.courses.length,
    lesson: saved.lessons.length,
    tutorial: saved.tutorials.length,
    explanation: saved.explanations.length,
  };

  async function removeResource(type, id) {
    try {
      await api.toggleSaved(type, id);
      const key = type === "course" ? "courses" : type === "tutorial" ? "tutorials" : type === "explanation" ? "explanations" : "lessons";
      setSaved(prev => ({ ...prev, [key]: prev[key].filter(item => item.id !== id) }));
      toast.success("Removed from saved resources.");
    } catch { toast.error("Couldn't remove this resource."); }
  }

  function openResource(item, type) {
    if (type === "course") return navigate(`/app/learn/courses/${item.id}`);
    if (type === "tutorial") return navigate(`/app/learn/tutorials/${item.id}`);
    if (type === "explanation") return navigate(`/app/learn/ai/session/${item.sessionId}`);
    if (item.courseId) return navigate(`/app/learn/courses/${item.courseId}/lessons/${item.id}`);
    toast.error("This saved lesson is missing its course.");
  }

  const filters = [
    ["all", "Everything", counts.all],
    ["course", "Courses", counts.course],
    ["lesson", "Lessons", counts.lesson],
    ["tutorial", "Tutorials", counts.tutorial],
    ["explanation", "Explanations", counts.explanation],
  ];

  return (
    <div className="sv2-page">
      <header className="sv2-hero">
        <div className="sv2-hero-icon"><Icon name="bookmark" size={31}/></div>
        <div className="sv2-hero-copy">
          <span className="sv2-eyebrow">YOUR LIBRARY</span>
          <h1>Saved resources, organized.</h1>
          <p>Everything you've bookmarked for later, in one focused study library.</p>
        </div>
        <div className="sv2-total"><strong>{counts.all}</strong><span>SAVED</span></div>
      </header>

      <div className="sv2-toolbar">
        <label className="sv2-search"><Icon name="search" size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your library..." aria-label="Search saved resources"/>{search && <button type="button" onClick={() => setSearch("")}><Icon name="x" size={15}/></button>}</label>
        <button type="button" className={`sv2-filter-toggle${filterOpen ? " active" : ""}`} onClick={() => setFilterOpen(v => !v)}><Icon name="filter" size={18}/><span>Filters</span></button>
      </div>

      {filterOpen && (
        <section className="sv2-filter-panel">
          <label><span>Subject</span><select value={subject} onChange={e => setSubject(e.target.value)}>{subjects.map(s => <option key={s}>{s}</option>)}</select></label>
          <label><span>Sort</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Recently saved</option><option value="oldest">Oldest first</option><option value="title">Title</option></select></label>
          <button type="button" onClick={() => { setSubject("All"); setSort("recent"); setSearch(""); }}>Reset</button>
        </section>
      )}

      <div className="sv2-layout">
        <aside className="sv2-sidebar">
          <div className="sv2-sidebar-title"><span>LIBRARY</span><b>{counts.all}</b></div>
          {filters.map(([id, label, count]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><span>{label}</span><b>{count}</b></button>
          ))}
          <div className="sv2-sidebar-divider"/>
          <div className="sv2-sidebar-title"><span>SUBJECTS</span></div>
          <div className="sv2-subjects">
            {subjects.filter(s => s !== "All").slice(0, 8).map(s => <button key={s} className={subject === s ? "active" : ""} onClick={() => setSubject(s)}>{s}</button>)}
            {!subjects.slice(1).length && <small>Subjects appear as you save resources.</small>}
          </div>
        </aside>

        <main className="sv2-main">
          <div className="sv2-main-head">
            <div><span className="sv2-eyebrow">COLLECTION</span><h2>{filters.find(x => x[0] === view)?.[1] || "Saved resources"}</h2></div>
            <span className="sv2-result-count">{loading ? "Loading..." : `${filtered.length} ${filtered.length === 1 ? "resource" : "resources"}`}</span>
          </div>

          {loading ? (
            <div className="sv2-grid">{[1,2,3,4].map(i => <div className="sv2-skeleton" key={i}/>)}</div>
          ) : filtered.length ? (
            <div className="sv2-grid">{filtered.map(({ item, type }) => <ResourceCard key={`${type}-${item.id}`} item={item} type={type} onOpen={() => openResource(item,type)} onRemove={removeResource}/>)}</div>
          ) : (
            <div className="sv2-empty"><div className="sv2-empty-icon"><Icon name="bookmark" size={30}/></div><h3>{search || subject !== "All" ? "Nothing matches your filters" : "Your library is empty"}</h3><p>{search || subject !== "All" ? "Try a different search, subject, or filter." : "Save courses, lessons, tutorials, and tutor explanations while you learn."}</p><button onClick={() => navigate("/app/learn")}>Explore Learn <Icon name="arrow" size={16}/></button></div>
          )}
        </main>
      </div>
    </div>
  );
}
