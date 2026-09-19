import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

const COLORS = {
  Mathematics: "#6366f1",
  Math: "#6366f1",
  English: "#3b82f6",
  Biology: "#22c55e",
  Chemistry: "#f59e0b",
  Physics: "#eab308",
  History: "#a78bfa",
  Geography: "#34d399",
  "Computer Science": "#06b6d4",
  Economics: "#f59e0b",
  Literature: "#a78bfa",
};

const colorFor = subject => COLORS[subject] || "#4f6ef7";

const TABS = [
  { id: "explanations", label: "Saved Explanations", icon: "bulb" },
  { id: "pdfs", label: "PDFs", icon: "file" },
  { id: "videos", label: "Videos", icon: "play" },
  { id: "links", label: "Links & Others", icon: "link" },
];

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    bulb: <><path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.5 14.5a6 6 0 1 1 7 0c-.9.65-1.5 1.4-1.5 2.5h-5c0-1.1-.6-1.85-1.5-2.5Z"/><path d="M12 3v1"/></>,
    file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></>,
    play: <><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m10 8 6 4-6 4z"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 7 20l1.15-1.15"/></>,
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function formatDate(value) {
  if (!value) return "Saved resource";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved resource";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

function getDescription(item) {
  return item.description || "A useful study resource saved for later reference.";
}

function getSubject(item) {
  return item.subject || item.topic || "PeerUp";
}

function ResourceCard({ item, kind, onRemove, onOpen, onStar, starred }) {
  const subject = getSubject(item);
  const color = colorFor(subject);
  const isVideo = kind === "videos";
  const isCourse = kind === "links";
  const isLesson = kind === "explanations";

  return (
    <article className="sr-resource-card">
      <div className="sr-card-top">
        <div className="sr-resource-icon" style={{ background: `${color}22`, color }}>
          <Icon name={isVideo ? "play" : isCourse ? "link" : "bulb"} size={25} />
        </div>
        <button
          type="button"
          className={`sr-star ${starred ? "active" : ""}`}
          aria-label={starred ? "Unfavorite resource" : "Favorite resource"}
          onClick={() => onStar(item.id)}
        >
          <Icon name="star" size={20} />
        </button>
      </div>

      <div className="sr-resource-content">
        <div className="sr-tags">
          <span className="sr-tag" style={{ color }}>{subject}</span>
          {item.topic && <span className="sr-tag sr-tag-muted">{item.topic}</span>}
        </div>
        <h3>{item.title || "Untitled resource"}</h3>
        <p>{getDescription(item)}</p>
      </div>

      <div className="sr-resource-footer">
        <span className="sr-date">
          <Icon name="calendar" size={15} />
          {formatDate(item.createdAt)}
        </span>
        {isVideo && item.durationSeconds ? <span>{formatDuration(item.durationSeconds)}</span> : null}
        {isCourse && item.lessonsCount ? <span>{item.lessonsCount} lessons</span> : null}
        {isLesson && item.progressPct > 0 ? <span>{item.progressPct}% viewed</span> : null}

        <div className="sr-card-actions">
          <button type="button" className="sr-view-btn" onClick={onOpen}>View</button>
          <button
            type="button"
            className="sr-more-btn"
            aria-label="Remove saved resource"
            onClick={() => onRemove(item.id)}
          >
            <Icon name="more" size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptyResourceTab({ tab, onBrowse }) {
  const copy = {
    pdfs: {
      title: "No saved PDFs yet",
      text: "PDF resources you save from Learn will appear here.",
      button: "Browse Resources",
      icon: "file",
    },
  }[tab.id];

  return (
    <div className="sr-empty">
      <div className="sr-empty-icon"><Icon name={copy?.icon || tab.icon} size={30} /></div>
      <h3>{copy?.title || `No saved ${tab.label.toLowerCase()} yet`}</h3>
      <p>{copy?.text || "Save useful learning materials and they will stay here for quick access."}</p>
      <button type="button" className="sr-primary-btn" onClick={onBrowse}>
        {copy?.button || "Browse Learn"}
      </button>
    </div>
  );
}

export default function SavedPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState("explanations");
  const [saved, setSaved] = useState({ courses: [], tutorials: [], lessons: [] });
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All");
  const [sort, setSort] = useState("Recent");
  const [loading, setLoading] = useState(true);
  const [starred, setStarred] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    api.getSaved()
      .then(data => {
        if (alive) setSaved({ courses: data?.courses || [], tutorials: data?.tutorials || [], lessons: data?.lessons || [] });
      })
      .catch(() => toast.error("Failed to load saved resources."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [toast]);

  const tabItems = useMemo(() => {
    if (activeTab === "explanations") return saved.lessons;
    if (activeTab === "videos") return saved.tutorials;
    if (activeTab === "links") return saved.courses;
    return [];
  }, [activeTab, saved]);

  const subjects = useMemo(() => {
    const values = tabItems.map(getSubject).filter(Boolean);
    return ["All", ...Array.from(new Set(values)).sort()];
  }, [tabItems]);

  useEffect(() => {
    if (!subjects.includes(subject)) setSubject("All");
  }, [subjects, subject]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...tabItems]
      .filter(item => subject === "All" || getSubject(item) === subject)
      .filter(item => {
        if (!normalized) return true;
        return [item.title, item.description, item.subject, item.topic, item.creatorName]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(normalized));
      })
      .sort((a, b) => {
        if (sort === "Title") return String(a.title || "").localeCompare(String(b.title || ""));
        const aDate = new Date(a.createdAt || 0).getTime();
        const bDate = new Date(b.createdAt || 0).getTime();
        return sort === "Oldest" ? aDate - bDate : bDate - aDate;
      });
  }, [tabItems, query, subject, sort]);

  const counts = {
    explanations: saved.lessons.length,
    pdfs: 0,
    videos: saved.tutorials.length,
    links: saved.courses.length,
  };

  const totalSaved = counts.explanations + counts.pdfs + counts.videos + counts.links;

  function handleRemove(kind, id) {
    const type = kind === "explanations" ? "lesson" : kind === "videos" ? "tutorial" : "course";
    const key = type === "lesson" ? "lessons" : type === "tutorial" ? "tutorials" : "courses";
    api.toggleSaved(type, id)
      .then(() => {
        setSaved(prev => ({ ...prev, [key]: prev[key].filter(item => item.id !== id) }));
        toast.success("Removed from saved resources.");
      })
      .catch(() => toast.error("Couldn't remove that resource."));
  }

  function handleOpen(kind, item) {
    if (kind === "videos") navigate(`/app/learn/tutorials/${item.id}`);
    if (kind === "links") navigate(`/app/learn/courses/${item.id}`);
    if (kind === "explanations") navigate(`/app/learn/courses/${item.courseId}/lessons/${item.id}`);
  }

  function browse() {
    if (activeTab === "videos") navigate("/app/learn/tutorials");
    else if (activeTab === "links") navigate("/app/learn/courses");
    else navigate("/app/learn");
  }

  return (
    <div className="sr-page">
      <div className="sr-content-column">
        <header className="sr-header">
          <div className="sr-title-row">
            <div className="sr-title-icon"><Icon name="bulb" size={34} /></div>
            <div>
              <h1>Saved Resources</h1>
              <p>Your personal library of useful study materials. Keep everything<br className="sr-desktop-break" /> that helps you learn better — all in one place.</p>
            </div>
          </div>

          <div className="sr-header-tools">
            <label className="sr-search">
              <Icon name="search" size={20} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search resources (e.g. Newton's laws, PDF, video...)"
              />
            </label>
            <button type="button" className="sr-filter-btn" aria-label="Filter resources">
              <Icon name="filter" size={22} />
            </button>
          </div>
        </header>

        <div className="sr-tabs" role="tablist" aria-label="Saved resource types">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`sr-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => { setActiveTab(tab.id); setQuery(""); }}
            >
              <Icon name={tab.icon} size={21} />
              <span>{tab.label}</span>
              <b>{counts[tab.id]}</b>
            </button>
          ))}
        </div>

        <section className="sr-library-panel">
          <div className="sr-panel-head">
            <div>
              <div className="sr-panel-title">
                <Icon name={activeTab === "videos" ? "play" : activeTab === "links" ? "link" : activeTab === "pdfs" ? "file" : "bulb"} size={21} />
                <h2>{TABS.find(tab => tab.id === activeTab)?.label}</h2>
              </div>
              <p>{activeTab === "explanations"
                ? "AI-generated explanations, summaries and notes you've saved for future reference."
                : activeTab === "videos"
                  ? "Tutorial videos you've saved to watch and revisit later."
                  : activeTab === "pdfs"
                    ? "PDF study materials saved from your learning resources."
                    : "Courses and other useful learning materials saved for later."}
              </p>
            </div>

            <div className="sr-sort-wrap">
              <span>Sort by:</span>
              <select value={sort} onChange={event => setSort(event.target.value)}>
                <option>Recent</option>
                <option>Oldest</option>
                <option>Title</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="sr-grid sr-grid-loading">
              {[1, 2, 3, 4, 5, 6].map(item => <div key={item} className="sr-skeleton" />)}
            </div>
          ) : activeTab === "pdfs" ? (
            <EmptyResourceTab tab={TABS[1]} onBrowse={browse} />
          ) : filteredItems.length === 0 ? (
            <div className="sr-empty sr-empty-inline">
              <div className="sr-empty-icon"><Icon name={activeTab === "videos" ? "play" : activeTab === "links" ? "link" : "bulb"} size={30} /></div>
              <h3>{query || subject !== "All" ? "No matching resources" : `No saved ${TABS.find(tab => tab.id === activeTab)?.label.toLowerCase()} yet`}</h3>
              <p>{query || subject !== "All" ? "Try another search or clear your filters." : "Save useful materials while learning and they will appear here."}</p>
              <button type="button" className="sr-primary-btn" onClick={browse}>Browse Learn</button>
            </div>
          ) : (
            <>
              <div className="sr-subject-filter-row">
                <div className="sr-subject-filter-label">Subject</div>
                <div className="sr-subject-chips">
                  {subjects.map(value => (
                    <button
                      key={value}
                      type="button"
                      className={`sr-subject-chip ${subject === value ? "active" : ""}`}
                      onClick={() => setSubject(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sr-grid">
                {filteredItems.map(item => (
                  <ResourceCard
                    key={item.id}
                    item={item}
                    kind={activeTab}
                    starred={starred.has(`${activeTab}:${item.id}`)}
                    onStar={id => setStarred(prev => {
                      const next = new Set(prev);
                      const key = `${activeTab}:${id}`;
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    })}
                    onRemove={id => handleRemove(activeTab, id)}
                    onOpen={() => handleOpen(activeTab, item)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <aside className="sr-rail">
        <section className="sr-rail-card">
          <div className="sr-rail-title"><Icon name="bulb" size={20} /><h3>Resource Stats</h3></div>
          <div className="sr-stats-grid">
            <div><Icon name="bulb" size={22} /><strong>{counts.explanations}</strong><span>Explanations</span></div>
            <div><Icon name="file" size={22} /><strong>{counts.pdfs}</strong><span>PDFs</span></div>
            <div><Icon name="play" size={22} /><strong>{counts.videos}</strong><span>Videos</span></div>
            <div><Icon name="link" size={22} /><strong>{counts.links}</strong><span>Links</span></div>
          </div>
        </section>

        <section className="sr-rail-card sr-filter-card">
          <div className="sr-rail-title"><Icon name="filter" size={19} /><h3>Subject Filter</h3><button type="button" onClick={() => setSubject("All")}>Clear all</button></div>
          <div className="sr-filter-list">
            {subjects.filter(value => value !== "All").map(value => (
              <button key={value} type="button" className={subject === value ? "active" : ""} onClick={() => setSubject(value)}>
                <span className="sr-radio" />
                <span>{value}</span>
                <b>{tabItems.filter(item => getSubject(item) === value).length}</b>
              </button>
            ))}
            {subjects.length === 1 && <p className="sr-no-filter">Subject filters will appear when you have saved resources.</p>}
          </div>
        </section>

        <section className="sr-rail-card sr-save-more">
          <div className="sr-save-art"><Icon name="file" size={38} /></div>
          <h3>Save more. Learn faster.</h3>
          <p>Keep building your study library and make your study sessions even more effective.</p>
          <span>{totalSaved} saved resource{totalSaved === 1 ? "" : "s"}</span>
        </section>
      </aside>
    </div>
  );
}
