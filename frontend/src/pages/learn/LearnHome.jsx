import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import { SUBJECTS } from "../../subjects";

// ── Shared components ─────────────────────────────────────────────────────

function SubjectFilter({ value, onChange }) {
  return (
    <div className="lh-filters">
      {["All", ...SUBJECTS].map(s => (
        <button
          key={s}
          type="button"
          className={`lh-filter-chip ${value === s ? "active" : ""}`}
          onClick={() => onChange(s)}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function CourseCard({ course, onClick }) {
  const pct = course.progressPct || 0;
  return (
    <div className="lh-course-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onClick()}>
      <div className="lh-card-thumb" style={{ background: course.thumbnailUrl ? "none" : "var(--navy-700)" }}>
        {course.thumbnailUrl
          ? <img src={course.thumbnailUrl} alt={course.title} />
          : <div className="lh-card-thumb-placeholder">📚</div>
        }
        {course.enrolled && pct > 0 && (
          <div className="lh-card-progress-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="lh-card-body">
        <div className="lh-card-subject">{course.subject}</div>
        <div className="lh-card-title">{course.title}</div>
        <div className="lh-card-meta">
          <span>{course.lessonsCount} lessons</span>
          <span>·</span>
          <span>{course.durationMinutes} min</span>
          {course.rating > 0 && <><span>·</span><span>⭐ {course.rating}</span></>}
        </div>
        <div className="lh-card-creator">by {course.creatorName}</div>
        {course.enrolled && pct > 0 && (
          <div className="lh-card-pct">{pct}% complete</div>
        )}
      </div>
    </div>
  );
}

function TutorialCard({ tut, onClick }) {
  const mins = Math.floor((tut.durationSeconds || 0) / 60);
  return (
    <div className="lh-tut-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onClick()}>
      <div className="lh-tut-thumb">
        {tut.thumbnailUrl
          ? <img src={tut.thumbnailUrl} alt={tut.title} />
          : <div className="lh-tut-thumb-placeholder">🎥</div>
        }
        {mins > 0 && <span className="lh-tut-duration">{mins}:{String((tut.durationSeconds || 0) % 60).padStart(2,"0")}</span>}
        {tut.progressPct > 0 && !tut.completed && (
          <div className="lh-card-progress-bar">
            <div style={{ width: `${tut.progressPct}%` }} />
          </div>
        )}
      </div>
      <div className="lh-tut-body">
        <div className="lh-card-subject">{tut.subject}</div>
        <div className="lh-tut-title">{tut.title}</div>
        <div className="lh-tut-creator">{tut.creatorName}</div>
        <div className="lh-card-meta">
          {tut.views > 0 && <><span>{tut.views} views</span><span>·</span></>}
          {tut.rating > 0 && <span>⭐ {tut.rating}</span>}
        </div>
      </div>
    </div>
  );
}

function ContinueCard({ item, onClick }) {
  const mins = Math.floor((item.durationSeconds || 0) / 60);
  return (
    <div className="lh-continue-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onClick()}>
      <div className="lh-continue-thumb">
        {item.thumbnailUrl
          ? <img src={item.thumbnailUrl} alt={item.title} />
          : <div className="lh-tut-thumb-placeholder">▶</div>
        }
      </div>
      <div className="lh-continue-body">
        <div className="lh-continue-title">{item.title}</div>
        {item.subject && <div className="lh-card-subject">{item.subject}</div>}
        <div className="lh-continue-bar-wrap">
          <div className="lh-continue-bar">
            <div className="lh-continue-fill" style={{ width: `${item.percentage}%` }} />
          </div>
          <span className="lh-continue-pct">{item.percentage}%</span>
        </div>
        <div className="lh-card-meta">{mins} min</div>
      </div>
    </div>
  );
}

function Section({ title, action, actionLabel, children }) {
  return (
    <section className="lh-section">
      <div className="lh-section-head">
        <h2 className="lh-section-title">{title}</h2>
        {action && <button type="button" className="lh-see-all" onClick={action}>{actionLabel || "See all →"}</button>}
      </div>
      {children}
    </section>
  );
}

// ── Learn Home Page ───────────────────────────────────────────────────────
export default function LearnHome() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const toast       = useToast();

  const [search,    setSearch]   = useState("");
  const [subject,   setSubject]  = useState("All");
  const [feed,      setFeed]     = useState(null);
  const [loading,   setLoading]  = useState(true);

  useEffect(() => {
    api.getLearnHome()
      .then(setFeed)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) navigate(`/app/learn/courses?search=${encodeURIComponent(search.trim())}`);
  }

  function goToCourse(id) { navigate(`/app/learn/courses/${id}`); }
  function goToTutorial(id) { navigate(`/app/learn/tutorials/${id}`); }
  function goToContinue(item) {
    if (item.type === "lesson") navigate(`/app/learn/courses/${item.courseId}/lessons/${item.id}`);
    else navigate(`/app/learn/tutorials/${item.id}`);
  }

  return (
    <div className="lh-page">
      {/* ── Hero ── */}
      <div className="lh-hero">
        <div className="lh-hero-text">
          <h1>Learn Smarter Together</h1>
          <p>Watch tutorials, take courses, and learn from your peers.</p>
        </div>
        <form className="lh-search-form" onSubmit={handleSearch}>
          <div className="lh-search-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search courses, topics, or tutorials…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="submit" className="lh-search-btn">Search</button>
          </div>
        </form>
      </div>

      {/* ── Subject filter ── */}
      <SubjectFilter value={subject} onChange={s => {
        setSubject(s);
        navigate(`/app/learn/courses?subject=${encodeURIComponent(s)}`);
      }} />

      {loading && (
        <div className="lh-loading">
          <span className="discover-spinner" /> Loading…
        </div>
      )}

      {!loading && feed && (
        <>
          {/* Continue Watching */}
          {feed.continueWatching?.length > 0 && (
            <Section title="Continue Watching">
              <div className="lh-continue-row">
                {feed.continueWatching.map(item => (
                  <ContinueCard key={`${item.type}-${item.id}`} item={item} onClick={() => goToContinue(item)} />
                ))}
              </div>
            </Section>
          )}

          {/* Recommended */}
          {feed.recommended?.length > 0 && (
            <Section title="Recommended for You" action={() => navigate("/app/learn/courses")} actionLabel="Browse all →">
              <div className="lh-grid">
                {feed.recommended.slice(0, 4).map(c => (
                  <CourseCard key={c.id} course={c} onClick={() => goToCourse(c.id)} />
                ))}
              </div>
            </Section>
          )}

          {/* Popular Courses */}
          {feed.popular?.length > 0 && (
            <Section title="Popular Courses" action={() => navigate("/app/learn/courses")} actionLabel="See all →">
              <div className="lh-grid">
                {feed.popular.slice(0, 4).map(c => (
                  <CourseCard key={c.id} course={c} onClick={() => goToCourse(c.id)} />
                ))}
              </div>
            </Section>
          )}

          {/* Student Tutorials */}
          {feed.latestTutorials?.length > 0 && (
            <Section title="Student Tutorials" action={() => navigate("/app/learn/tutorials")} actionLabel="See all →">
              <div className="lh-tut-grid">
                {feed.latestTutorials.slice(0, 4).map(t => (
                  <TutorialCard key={t.id} tut={t} onClick={() => goToTutorial(t.id)} />
                ))}
              </div>
            </Section>
          )}

          {/* Empty state */}
          {!feed.recommended?.length && !feed.popular?.length && !feed.latestTutorials?.length && (
            <div className="lh-empty">
              <div className="lh-empty-icon">🎓</div>
              <h3>No content yet</h3>
              <p>Be the first to upload a tutorial and help your peers!</p>
              <button type="button" className="lh-cta-btn" onClick={() => navigate("/app/learn/create")}>
                + Upload Tutorial
              </button>
            </div>
          )}

          {/* Become a creator CTA */}
          <div className="lh-creator-cta">
            <div className="lh-creator-cta-text">
              <h3>Share your knowledge</h3>
              <p>Upload a tutorial and help other students learn.</p>
            </div>
            <button type="button" className="lh-cta-btn" onClick={() => navigate("/app/learn/create")}>
              Become a Creator
            </button>
          </div>
        </>
      )}
    </div>
  );
}
