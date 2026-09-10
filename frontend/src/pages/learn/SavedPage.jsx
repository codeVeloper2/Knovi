import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

const TABS = ["Courses", "Tutorials", "Lessons"];

export default function SavedPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const [tab,     setTab]    = useState("Courses");
  const [saved,   setSaved]  = useState({ courses: [], tutorials: [], lessons: [] });
  const [loading, setLoading]= useState(true);

  useEffect(() => {
    api.getSaved()
      .then(setSaved)
      .catch(() => toast.error("Failed to load saved content."))
      .finally(() => setLoading(false));
  }, []);

  async function unsave(type, id) {
    await api.toggleSaved(type, id);
    setSaved(prev => ({
      ...prev,
      courses:   type === "course"   ? prev.courses.filter(x => x.id !== id)   : prev.courses,
      tutorials: type === "tutorial" ? prev.tutorials.filter(x => x.id !== id) : prev.tutorials,
      lessons:   type === "lesson"   ? prev.lessons.filter(x => x.id !== id)   : prev.lessons,
    }));
    toast.success("Removed from saved.");
  }

  const items = tab === "Courses" ? saved.courses : tab === "Tutorials" ? saved.tutorials : saved.lessons;

  return (
    <div className="lh-page">
      <h1 className="cp-title">Saved</h1>

      <div className="lh-tabs">
        {TABS.map(t => (
          <button key={t} type="button"
            className={`lh-tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t} {saved[t.toLowerCase()]?.length > 0 && `(${saved[t.toLowerCase()].length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="lh-loading"><span className="discover-spinner" /> Loading…</div>
      ) : items.length === 0 ? (
        <div className="lh-empty">
          <div className="lh-empty-icon">🔖</div>
          <h3>No saved {tab.toLowerCase()} yet</h3>
          <p>Bookmark {tab.toLowerCase()} while browsing to find them here.</p>
          <button type="button" className="lh-cta-btn"
            onClick={() => navigate(tab === "Courses" ? "/app/learn/courses" : "/app/learn/tutorials")}>
            Browse {tab}
          </button>
        </div>
      ) : (
        <div className={tab === "Tutorials" ? "lh-tut-grid" : "lh-grid"}>
          {items.map(item => (
            <div key={item.id} className={tab === "Tutorials" ? "lh-tut-card" : "lh-course-card"}>
              <div
                className={tab === "Tutorials" ? "lh-tut-thumb" : "lh-card-thumb"}
                onClick={() => {
                  if (tab === "Courses")   navigate(`/app/learn/courses/${item.id}`);
                  if (tab === "Tutorials") navigate(`/app/learn/tutorials/${item.id}`);
                  if (tab === "Lessons")   navigate(`/app/learn/courses/${item.courseId}/lessons/${item.id}`);
                }}
              >
                {item.thumbnailUrl
                  ? <img src={item.thumbnailUrl} alt={item.title} />
                  : <div className={tab === "Tutorials" ? "lh-tut-thumb-placeholder" : "lh-card-thumb-placeholder"}>{tab === "Tutorials" ? "🎥" : "📚"}</div>
                }
              </div>
              <div className={tab === "Tutorials" ? "lh-tut-body" : "lh-card-body"}>
                {item.subject && <div className="lh-card-subject">{item.subject}</div>}
                <div className={tab === "Tutorials" ? "lh-tut-title" : "lh-card-title"}>{item.title}</div>
                {item.creatorName && <div className="lh-tut-creator">{item.creatorName}</div>}
                <div className="lh-card-meta">
                  {tab === "Courses"   && <><span>{item.lessonsCount} lessons</span><span>·</span><span>{item.durationMinutes} min</span></>}
                  {tab === "Tutorials" && item.views > 0 && <span>{item.views} views</span>}
                </div>
                <button type="button" className="cr-unsave-btn"
                  onClick={() => unsave(tab.slice(0, -1).toLowerCase(), item.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
