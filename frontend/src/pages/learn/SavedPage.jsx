import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

const COLORS = {
  Mathematics: "#6366f1",
  English: "#3b82f6",
  Biology: "#22c55e",
  Chemistry: "#f59e0b",
  Physics: "#2e8cff",
  History: "#a78bfa",
  Geography: "#22c7d9",
  "Computer Science": "#06b6d4",
  Accounting: "#f59e0b",
  Economics: "#f59e0b",
  Literature: "#ec4899",
  Psychology: "#34d399",
  Spanish: "#ef4444",
  French: "#60a5fa",
};

const color = (subject) => COLORS[subject] || "#4f6ef7";

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
    "aria-hidden": "true",
  };

  const paths = {
    bookmark: <><path d="M7 3.5h10v17l-5-3-5 3v-17Z" /></>,
    bulb: <><path d="M9 18h6" /><path d="M10 21h4" /><path d="M8.2 14.5A6 6 0 1 1 16 14.7c-.9.7-1.4 1.6-1.5 2.3h-5c-.1-.9-.5-1.7-1.3-2.5Z" /><path d="M10 10.5h4" /></>,
    file: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4" /><path d="M9 12h6M9 15h5" /></>,
    play: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m10 8 6 4-6 4V8Z" /></>,
    link: <><path d="M10 13.5 8.7 14.8a3.2 3.2 0 0 1-4.5-4.5l2.4-2.4a3.2 3.2 0 0 1 4.5 0" /><path d="m14 10.5 1.3-1.3a3.2 3.2 0 0 1 4.5 4.5l-2.4 2.4a3.2 3.2 0 0 1-4.5 0" /><path d="m8.5 15.5 7-7" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    chevron: <path d="m9 5 7 7-7 7" />,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const TABS = [
  { id: "explanations", label: "Saved Explanations", icon: "bulb" },
  { id: "pdfs", label: "PDFs", icon: "file" },
  { id: "videos", label: "Videos", icon: "play" },
  { id: "links", label: "Links & Others", icon: "link" },
];

function normalizeSaved(data) {
  return {
    courses: Array.isArray(data?.courses) ? data.courses : [],
    tutorials: Array.isArray(data?.tutorials) ? data.tutorials : [],
    lessons: Array.isArray(data?.lessons) ? data.lessons : [],
  };
}

function formatDate(value) {
  if (!value) return "Saved recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getExplanationItems(saved) {
  // The current backend supports saved courses, lessons and tutorials.
  // Courses/lessons are shown in the explanation library; tutorials are shown
  // in the Videos tab. This keeps every backend-supported saved item reachable.
  return [
    ...saved.courses.map((item) => ({ ...item, savedType: "course" })),
    ...saved.lessons.map((item) => ({ ...item, savedType: "lesson" })),
  ];
}

function getTabItems(saved, tab) {
  if (tab === "explanations") return getExplanationItems(saved);
  if (tab === "videos") return saved.tutorials.map((item) => ({ ...item, savedType: "tutorial" }));
  return [];
}

function getDescription(item) {
  if (item.description) return item.description;
  if (item.savedType === "course") {
    return `${item.lessonsCount || 0} lessons covering ${item.subject || "this subject"} step by step.`;
  }
  if (item.savedType === "tutorial") return "A student-created tutorial saved for later study.";
  return "A saved lesson ready to revisit.";
}

function ResourceCard({ item, onOpen, onRemove }) {
  const accent = color(item.subject);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <article className="ln-resource-card">
      <button type="button" className="ln-resource-main" onClick={onOpen}>
        <div className="ln-resource-top">
          <div className="ln-resource-thumb" style={{ "--resource-accent": accent }}>
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" />
            ) : (
              <Icon name={item.savedType === "tutorial" ? "play" : "bulb"} size={25} />
            )}
          </div>

          <div className="ln-resource-copy">
            <h3>{item.title || "Untitled resource"}</h3>
            <div className="ln-resource-tags">
              {item.subject && <span>{item.subject}</span>}
              {item.topic && <span>{item.topic}</span>}
            </div>
          </div>

          <span className="ln-star" aria-hidden="true">
            <Icon name="star" size={17} />
          </span>
        </div>

        <p>{getDescription(item)}</p>

        <div className="ln-resource-footer">
          <span className="ln-date">
            <Icon name="calendar" size={13} />
            {formatDate(item.createdAt)}
          </span>
          <span className="ln-view-link">
            View <Icon name="chevron" size={14} />
          </span>
        </div>
      </button>

      <div className="ln-resource-menu" ref={menuRef}>
        <button
          type="button"
          className="ln-more-btn"
          aria-label={`More options for ${item.title || "resource"}`}
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          <Icon name="more" size={18} />
        </button>

        {menuOpen && (
          <div className="ln-more-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onOpen();
              }}
            >
              View
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setMenuOpen(false);
                onRemove(item.savedType, item.id);
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function EmptyTab({ tab, hasSearch, hasSubject, onBrowse }) {
  const messages = {
    pdfs: ["No saved PDFs yet", "PDF resources will appear here when PDF saving is available."],
    links: ["No saved links yet", "Saved links and other materials will appear here."],
  };

  const [title, body] =
    messages[tab] || [
      hasSearch || hasSubject ? "No resources match your filters" : "No saved resources yet",
      hasSearch || hasSubject
        ? "Try a different search term or subject."
        : "Save learning materials while browsing to find them here.",
    ];

  return (
    <div className="ln-empty">
      <div className="ln-empty-icon">
        <Icon name={tab === "pdfs" ? "file" : tab === "links" ? "link" : "bookmark"} size={28} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      <button type="button" className="ln-btn-primary" onClick={onBrowse}>
        Browse Learn
      </button>
    </div>
  );
}

export default function SavedPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [saved, setSaved] = useState({ courses: [], tutorials: [], lessons: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("explanations");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("All");
  const [sort, setSort] = useState("recent");
  const [filterOpen, setFilterOpen] = useState(false);

  const [draftSubject, setDraftSubject] = useState("All");
  const [draftSort, setDraftSort] = useState("recent");

  useEffect(() => {
    let alive = true;

    api.getSaved()
      .then((data) => {
        if (alive) setSaved(normalizeSaved(data));
      })
      .catch(() => {
        if (alive) toast.error("Failed to load saved resources.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [toast]);

  const allSaved = useMemo(
    () => [...saved.courses, ...saved.tutorials, ...saved.lessons],
    [saved]
  );

  const subjects = useMemo(
    () => ["All", ...Array.from(new Set(allSaved.map((item) => item.subject).filter(Boolean))).sort()],
    [allSaved]
  );

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();

    return getTabItems(saved, tab)
      .filter((item) => subject === "All" || item.subject === subject)
      .filter((item) => {
        if (!query) return true;
        return [
          item.title,
          item.subject,
          item.topic,
          item.description,
          item.creatorName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (sort === "title") return (a.title || "").localeCompare(b.title || "");
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return sort === "oldest" ? aTime - bTime : bTime - aTime;
      });
  }, [saved, tab, subject, search, sort]);

  const counts = {
    explanations: saved.courses.length + saved.lessons.length,
    pdfs: 0,
    videos: saved.tutorials.length,
    links: 0,
  };

  const subjectCounts = useMemo(() => {
    const map = {};
    allSaved.forEach((item) => {
      if (item.subject) map[item.subject] = (map[item.subject] || 0) + 1;
    });
    return map;
  }, [allSaved]);

  const total = allSaved.length;

  function openFilter() {
    setDraftSubject(subject);
    setDraftSort(sort);
    setFilterOpen(true);
  }

  function cancelFilter() {
    setFilterOpen(false);
  }

  function applyFilter() {
    setSubject(draftSubject);
    setSort(draftSort);
    setFilterOpen(false);
  }

  function clearFilters() {
    setSubject("All");
    setSort("recent");
    setDraftSubject("All");
    setDraftSort("recent");
    setSearch("");
  }

  async function removeResource(type, id) {
    try {
      await api.toggleSaved(type, id);
      const key = type === "course" ? "courses" : type === "tutorial" ? "tutorials" : "lessons";

      setSaved((previous) => ({
        ...previous,
        [key]: previous[key].filter((item) => item.id !== id),
      }));

      toast.success("Removed from saved resources.");
    } catch {
      toast.error("Couldn't remove this resource.");
    }
  }

  function openResource(item) {
    if (item.savedType === "course") {
      navigate(`/app/learn/courses/${item.id}`);
      return;
    }

    if (item.savedType === "tutorial") {
      navigate(`/app/learn/tutorials/${item.id}`);
      return;
    }

    if (item.courseId) {
      navigate(`/app/learn/courses/${item.courseId}/lessons/${item.id}`);
      return;
    }

    toast.error("This saved lesson is missing its course.");
  }

  return (
    <div className="ln-page learn-rebuild-page">
      <header className="ln-page-head">
        <div className="ln-heading-icon">
          <Icon name="bookmark" size={30} />
        </div>

        <div className="ln-heading-copy">
          <h1>Saved Resources</h1>
          <p>
            Your personal library of useful study materials. Keep everything
            that helps you learn better — all in one place.
          </p>
        </div>

        <div className="ln-header-tools">
          <label className="ln-search">
            <Icon name="search" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search resources (e.g. Newton's laws, PDF, video...)"
              aria-label="Search saved resources"
            />
            {search && (
              <button
                type="button"
                className="ln-search-clear"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <Icon name="x" size={15} />
              </button>
            )}
          </label>

          <button
            type="button"
            className={`ln-filter-btn ${filterOpen ? "active" : ""}`}
            onClick={openFilter}
            aria-expanded={filterOpen}
            aria-label="Open saved resource filters"
          >
            <Icon name="filter" size={20} />
          </button>
        </div>
      </header>

      {filterOpen && (
        <div className="ln-filter-popover" role="dialog" aria-label="Saved resource filters">
          <div className="ln-filter-popover-head">
            <div>
              <strong>Filter resources</strong>
              <span>Choose a subject and sorting order.</span>
            </div>
            <button type="button" onClick={cancelFilter} aria-label="Cancel filters">
              <Icon name="x" size={18} />
            </button>
          </div>

          <div className="ln-filter-fields">
            <label>
              <span>Subject</span>
              <select value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)}>
                {subjects.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>

            <label>
              <span>Sort by</span>
              <select value={draftSort} onChange={(event) => setDraftSort(event.target.value)}>
                <option value="recent">Recent</option>
                <option value="oldest">Oldest</option>
                <option value="title">Title</option>
              </select>
            </label>
          </div>

          <div className="ln-filter-actions">
            <button type="button" className="ln-filter-cancel" onClick={cancelFilter}>
              Cancel
            </button>
            <button type="button" className="ln-filter-clear" onClick={clearFilters}>
              Clear
            </button>
            <button type="button" className="ln-filter-apply" onClick={applyFilter}>
              Apply filters
            </button>
          </div>
        </div>
      )}

      <div className="ln-layout">
        <main className="ln-main">
          <div className="ln-tabs" role="tablist" aria-label="Saved resource types">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`ln-tab ${tab === item.id ? "active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                <Icon name={item.icon} size={20} />
                <span>{item.label}</span>
                <b>{counts[item.id]}</b>
              </button>
            ))}
          </div>

          <section className="ln-content-panel">
            <div className="ln-section-head">
              <div>
                <div className="ln-section-title">
                  <Icon name={tab === "videos" ? "play" : tab === "pdfs" ? "file" : tab === "links" ? "link" : "bulb"} size={24} />
                  <h2>
                    {TABS.find((item) => item.id === tab)?.label || "Saved Resources"}
                  </h2>
                </div>
                <p>
                  {tab === "explanations"
                    ? "AI-generated explanations, summaries and notes you've saved for future reference."
                    : tab === "videos"
                      ? "Saved student tutorials and educational videos."
                      : tab === "pdfs"
                        ? "Saved PDF study materials."
                        : "Saved links and other useful study materials."}
                </p>
              </div>

              <label className="ln-inline-sort-wrap">
                <span>Sort by:</span>
                <select
                  className="ln-inline-sort"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  aria-label="Sort saved resources"
                >
                  <option value="recent">Recent</option>
                  <option value="oldest">Oldest</option>
                  <option value="title">Title</option>
                </select>
              </label>
            </div>

            {loading ? (
              <div className="ln-grid">
                {[1, 2, 3, 4].map((value) => (
                  <div className="ln-resource-card ln-skeleton" key={value} />
                ))}
              </div>
            ) : items.length ? (
              <div className="ln-grid">
                {items.map((item) => (
                  <ResourceCard
                    key={`${item.savedType}-${item.id}`}
                    item={item}
                    onOpen={() => openResource(item)}
                    onRemove={removeResource}
                  />
                ))}
              </div>
            ) : (
              <EmptyTab
                tab={tab}
                hasSearch={Boolean(search.trim())}
                hasSubject={subject !== "All"}
                onBrowse={() => navigate("/app/learn")}
              />
            )}
          </section>
        </main>

        <aside className="ln-rail" aria-label="Saved resource information">
          <section className="ln-rail-card">
            <h2>Resource Stats</h2>
            <div className="ln-stat-grid">
              <div><span className="ln-stat-icon"><Icon name="bulb" size={18} /></span><strong>{counts.explanations}</strong><small>Explanations</small></div>
              <div><span className="ln-stat-icon"><Icon name="file" size={18} /></span><strong>{counts.pdfs}</strong><small>PDFs</small></div>
              <div><span className="ln-stat-icon"><Icon name="play" size={18} /></span><strong>{counts.videos}</strong><small>Videos</small></div>
              <div><span className="ln-stat-icon"><Icon name="link" size={18} /></span><strong>{counts.links}</strong><small>Links</small></div>
            </div>
          </section>

          <section className="ln-rail-card">
            <div className="ln-rail-head">
              <h2>Subject Filter</h2>
              <button type="button" onClick={() => { setSubject("All"); setDraftSubject("All"); }}>
                Clear all
              </button>
            </div>

            <div className="ln-subject-list">
              {subjects.filter((value) => value !== "All").map((value) => (
                <button
                  key={value}
                  type="button"
                  className={subject === value ? "active" : ""}
                  onClick={() => {
                    setSubject(value);
                    setDraftSubject(value);
                  }}
                >
                  <span className="ln-radio">{subject === value ? "●" : "○"}</span>
                  <span>{value}</span>
                  <b>{subjectCounts[value] || 0}</b>
                </button>
              ))}

              {!subjects.filter((value) => value !== "All").length && (
                <p className="ln-rail-muted">Subjects appear as you save resources.</p>
              )}
            </div>
          </section>

          <section className="ln-rail-card ln-save-more">
            <div className="ln-save-more-icon"><Icon name="bookmark" size={28} /></div>
            <strong>Save more. Learn faster.</strong>
            <p>Keep building your study library and make your future learning sessions more effective.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
