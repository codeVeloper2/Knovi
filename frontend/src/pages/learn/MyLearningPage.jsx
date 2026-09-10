import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

function CourseProgressCard({ course, onClick }) {
  const pct = course.progressPct || 0;
  return (
    <div className="ml-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onClick()}>
      <div className="ml-card-thumb">
        {course.thumbnailUrl
          ? <img src={course.thumbnailUrl} alt={course.title} />
          : <div className="lh-card-thumb-placeholder">📚</div>
        }
      </div>
      <div className="ml-card-body">
        <div className="lh-card-subject">{course.subject}</div>
        <div className="lh-card-title">{course.title}</div>
        <div className="ml-progress-wrap">
          <div className="ml-progress-bar"><div style={{ width: `${pct}%` }} /></div>
          <span className="ml-pct">{pct}%</span>
        </div>
        <div className="lh-card-meta">{course.lessonsCount} lessons · {course.durationMinutes} min</div>
      </div>
    </div>
  );
}

function HistoryItem({ item, onClick }) {
  const mins = Math.floor((item.durationSeconds || 0) / 60);
  return (
    <div className="ml-history-item" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onClick()}>
      <div className="ml-history-thumb">
        {item.thumbnailUrl
          ? <img src={item.thumbnailUrl} alt={item.title} />
          : <div className="lh-tut-thumb-placeholder">{item.type === "tutorial" ? "🎥" : "▶"}</div>
        }
      </div>
      <div className="ml-history-body">
        <div className="lh-card-title" style={{ fontSize: "0.9rem" }}>{item.title}</div>
        {item.subject && <div className="lh-card-subject">{item.subject}</div>}
        <div className="ml-progress-wrap">
          <div className="ml-progress-bar"><div style={{ width: `${item.percentage}%` }} /></div>
          <span className="ml-pct">{item.percentage}%</span>
        </div>
        <div className="lh-card-meta">
          {mins > 0 && <span>{mins} min</span>}
          <span>·</span>
          <span>{new Date(item.lastWatchedAt).toLocaleDateString()}</span>
          {item.completed && <span className="ml-completed-badge">✓ Complete</span>}
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: "inProgress",  label: "In Progress"       },
  { id: "completed",   label: "Completed"          },
  { id: "history",     label: "Watch History"      },
];

export default function MyLearningPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const [tab,     setTab]    = useState("inProgress");
  const [data,    setData]   = useState({ inProgress: [], completed: [], history: [] });
  const [loading, setLoading]= useState(true);

  useEffect(() => {
    api.getMyLearning()
      .then(setData)
      .catch(() => toast.error("Failed to load learning data."))
      .finally(() => setLoading(false));
  }, []);

  function goToCourse(id) { navigate(`/app/learn/courses/${id}`); }
  function goToHistory(item) {
    if (item.type === "lesson")   navigate(`/app/learn/courses/${item.courseId}/lessons/${item.id}`);
    else                          navigate(`/app/learn/tutorials/${item.id}`);
  }

  const inProgress = data.inProgress  || [];
  const completed  = data.completed   || [];
  const history    = data.history     || [];

  return (
    <div className="lh-page">
      <h1 className="cp-title">My Learning</h1>

      <div className="lh-tabs">
        {TABS.map(t => (
          <button key={t.id} type="button"
            className={`lh-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "inProgress" && inProgress.length > 0 && ` (${inProgress.length})`}
            {t.id === "completed"  && completed.length  > 0 && ` (${completed.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="lh-loading"><span className="discover-spinner" /> Loading…</div>
      ) : (
        <>
          {tab === "inProgress" && (
            inProgress.length === 0 ? (
              <div className="lh-empty">
                <div className="lh-empty-icon">📖</div>
                <h3>No courses in progress</h3>
                <p>Start a course and it will appear here.</p>
                <button type="button" className="lh-cta-btn" onClick={() => navigate("/app/learn/courses")}>Browse Courses</button>
              </div>
            ) : (
              <div className="ml-grid">
                {inProgress.map(c => <CourseProgressCard key={c.id} course={c} onClick={() => goToCourse(c.id)} />)}
              </div>
            )
          )}

          {tab === "completed" && (
            completed.length === 0 ? (
              <div className="lh-empty">
                <div className="lh-empty-icon">🏆</div>
                <h3>No completed courses yet</h3>
                <p>Complete all lessons in a course to mark it done.</p>
              </div>
            ) : (
              <div className="ml-grid">
                {completed.map(c => (
                  <div key={c.id} className="ml-card ml-card--done" onClick={() => goToCourse(c.id)} role="button" tabIndex={0}>
                    <div className="ml-card-thumb">
                      {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt={c.title} /> : <div className="lh-card-thumb-placeholder">📚</div>}
                    </div>
                    <div className="ml-card-body">
                      <div className="lh-card-subject">{c.subject}</div>
                      <div className="lh-card-title">{c.title}</div>
                      <div className="ml-completed-badge large">✓ Completed</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "history" && (
            history.length === 0 ? (
              <div className="lh-empty">
                <div className="lh-empty-icon">🕐</div>
                <h3>No watch history yet</h3>
                <p>Start watching lessons or tutorials to track your progress.</p>
                <button type="button" className="lh-cta-btn" onClick={() => navigate("/app/learn")}>Go to Learn</button>
              </div>
            ) : (
              <div className="ml-history-list">
                {history.map((item, i) => (
                  <HistoryItem key={i} item={item} onClick={() => goToHistory(item)} />
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
