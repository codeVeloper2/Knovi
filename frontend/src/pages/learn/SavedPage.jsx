import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

const COLORS = {
  Math:"#6366f1",English:"#3b82f6",Biology:"#22c55e",Chemistry:"#f59e0b",
  Physics:"#eab308",History:"#a78bfa",Geography:"#34d399","Computer Science":"#06b6d4",
  Spanish:"#ef4444",French:"#60a5fa",Art:"#f472b6",Music:"#818cf8",
  Economics:"#f59e0b",Literature:"#a78bfa",Psychology:"#34d399",
};
const color = s => COLORS[s] || "#6366f1";

function SavedCard({ item, type, onRemove, onClick }) {
  const c = color(item.subject);
  return (
    <button type="button" className="ln-card" onClick={onClick}>
      <div className="ln-card-thumb">
        {item.thumbnailUrl
          ? <img src={item.thumbnailUrl} alt={item.title}/>
          : <div className="ln-card-thumb-empty" style={{ background:`${c}18` }}>
              {type === "Tutorials" ? "🎥" : "📚"}
            </div>
        }
      </div>
      <div className="ln-card-body">
        {item.subject && <span className="ln-card-subject" style={{ color:c }}>{item.subject}</span>}
        <p className="ln-card-title">{item.title}</p>
        {item.creatorName && <span className="ln-card-creator">{item.creatorName}</span>}
        {type === "Courses" && (
          <span className="ln-card-meta">{item.lessonsCount} lessons · {item.durationMinutes} min</span>
        )}
        <button
          type="button"
          className="sv-remove-btn"
          onClick={e => { e.stopPropagation(); onRemove(item.id); }}
        >
          Remove
        </button>
      </div>
    </button>
  );
}

const TABS = ["Courses","Tutorials","Lessons"];

export default function SavedPage() {
  const navigate = useNavigate();
  const toast    = useToast();

  const [tab,     setTab]    = useState("Courses");
  const [saved,   setSaved]  = useState({ courses:[], tutorials:[], lessons:[] });
  const [loading, setLoading]= useState(true);

  useEffect(() => {
    api.getSaved()
      .then(setSaved)
      .catch(() => toast.error("Failed to load saved content."))
      .finally(() => setLoading(false));
  }, []);

  async function remove(type, id) {
    await api.toggleSaved(type, id);
    const key = type === "course" ? "courses" : type === "tutorial" ? "tutorials" : "lessons";
    setSaved(prev => ({ ...prev, [key]: prev[key].filter(x => x.id !== id) }));
    toast.success("Removed from saved.");
  }

  const items = tab === "Courses"
    ? saved.courses
    : tab === "Tutorials"
    ? saved.tutorials
    : saved.lessons;

  const typeKey = tab === "Courses" ? "course" : tab === "Tutorials" ? "tutorial" : "lesson";

  function handleClick(item) {
    if (tab === "Courses")   navigate(`/app/learn/courses/${item.id}`);
    if (tab === "Tutorials") navigate(`/app/learn/tutorials/${item.id}`);
    if (tab === "Lessons")   navigate(`/app/learn/courses/${item.courseId}/lessons/${item.id}`);
  }

  return (
    <div className="ln-page">
      <div className="ln-page-header">
        <button type="button" className="ct-back" onClick={() => navigate("/app/learn")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Learn
        </button>
        <h1 className="ln-page-title">Saved</h1>
      </div>

      <div className="ln-tabs">
        {TABS.map(t => {
          const key = t.toLowerCase();
          const count = saved[key]?.length || 0;
          return (
            <button key={t} type="button"
              className={`ln-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}{count > 0 && <span className="ln-tab-badge">{count}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="ln-loading"><span className="discover-spinner"/> Loading...</div>
      ) : items.length === 0 ? (
        <div className="ln-empty">
          <span>🔖</span>
          <h3>No saved {tab.toLowerCase()} yet</h3>
          <p>Bookmark {tab.toLowerCase()} while browsing to find them here.</p>
          <button type="button" className="ln-btn-primary"
            onClick={() => navigate(tab === "Courses" ? "/app/learn/courses" : "/app/learn/tutorials")}
          >
            Browse {tab}
          </button>
        </div>
      ) : (
        <div className="ln-grid">
          {items.map(item => (
            <SavedCard
              key={item.id}
              item={item}
              type={tab}
              onClick={() => handleClick(item)}
              onRemove={id => remove(typeKey, id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
