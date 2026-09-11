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

function ProgressCard({ course, onClick }) {
  const c   = color(course.subject);
  const pct = course.progressPct || 0;
  return (
    <button type="button" className="ml-card" onClick={onClick}>
      <div className="ml-thumb">
        {course.thumbnailUrl
          ? <img src={course.thumbnailUrl} alt={course.title}/>
          : <div className="ml-thumb-empty" style={{ background:`${c}18` }}>📚</div>
        }
      </div>
      <div className="ml-body">
        <span className="ln-card-subject" style={{ color:c }}>{course.subject}</span>
        <p className="ln-card-title">{course.title}</p>
        <div className="ml-prog-wrap">
          <div className="ml-prog-bar"><div style={{ width:`${pct}%`, background:c }}/></div>
          <span style={{ color:c }}>{pct}%</span>
        </div>
        <span className="ln-card-meta">{course.lessonsCount} lessons · {course.durationMinutes} min</span>
      </div>
    </button>
  );
}

function HistoryRow({ item, onClick }) {
  const c   = color(item.subject);
  const min = Math.floor((item.durationSeconds||0)/60);
  const date = new Date(item.lastWatchedAt).toLocaleDateString("en-US",{month:"short",day:"numeric"});
  return (
    <button type="button" className="ml-history-row" onClick={onClick}>
      <div className="ml-hist-thumb">
        {item.thumbnailUrl
          ? <img src={item.thumbnailUrl} alt={item.title}/>
          : <div className="ml-hist-thumb-empty">▶</div>
        }
      </div>
      <div className="ml-hist-body">
        <p className="ml-hist-title">{item.title}</p>
        {item.subject && <span className="ln-card-subject" style={{ color:c }}>{item.subject}</span>}
        <div className="ml-prog-wrap" style={{ marginTop:6 }}>
          <div className="ml-prog-bar"><div style={{ width:`${item.percentage}%`, background:c }}/></div>
          <span style={{ color:c }}>{item.percentage}%</span>
        </div>
        <span className="ln-card-meta">{min > 0 ? `${min} min · ` : ""}{date}</span>
      </div>
      {item.completed && <span className="ml-done-badge">✓ Done</span>}
    </button>
  );
}

const TABS = [
  { id:"inProgress", label:"In Progress"   },
  { id:"completed",  label:"Completed"     },
  { id:"history",    label:"Watch History" },
];

export default function MyLearningPage() {
  const navigate = useNavigate();
  const toast    = useToast();

  const [tab,     setTab]    = useState("inProgress");
  const [data,    setData]   = useState({ inProgress:[], completed:[], history:[] });
  const [loading, setLoading]= useState(true);

  useEffect(() => {
    api.getMyLearning()
      .then(setData)
      .catch(() => toast.error("Failed to load."))
      .finally(() => setLoading(false));
  }, []);

  const inP  = data.inProgress || [];
  const comp = data.completed  || [];
  const hist = data.history    || [];

  return (
    <div className="ln-page">
      <div className="ln-page-header">
        <button type="button" className="ct-back" onClick={() => navigate("/app/learn")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Learn
        </button>
        <h1 className="ln-page-title">My Learning</h1>
      </div>

      <div className="ln-tabs">
        {TABS.map(t => (
          <button key={t.id} type="button"
            className={`ln-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "inProgress" && inP.length  > 0 && <span className="ln-tab-badge">{inP.length}</span>}
            {t.id === "completed"  && comp.length > 0 && <span className="ln-tab-badge">{comp.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ln-loading"><span className="discover-spinner"/> Loading...</div>
      ) : (
        <>
          {tab === "inProgress" && (
            inP.length === 0 ? (
              <div className="ln-empty">
                <span>📖</span>
                <h3>No courses in progress</h3>
                <p>Start a course and it will show up here.</p>
                <button type="button" className="ln-btn-primary" onClick={() => navigate("/app/learn/courses")}>Browse Courses</button>
              </div>
            ) : (
              <div className="ln-grid">{inP.map(c => <ProgressCard key={c.id} course={c} onClick={() => navigate(`/app/learn/courses/${c.id}`)}/>)}</div>
            )
          )}

          {tab === "completed" && (
            comp.length === 0 ? (
              <div className="ln-empty">
                <span>🏆</span>
                <h3>No completed courses yet</h3>
                <p>Complete all lessons in a course to see it here.</p>
              </div>
            ) : (
              <div className="ln-grid">
                {comp.map(c => (
                  <button key={c.id} type="button" className="ml-card ml-card--done" onClick={() => navigate(`/app/learn/courses/${c.id}`)}>
                    <div className="ml-thumb">
                      {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt={c.title}/> : <div className="ml-thumb-empty">📚</div>}
                    </div>
                    <div className="ml-body">
                      <span className="ln-card-subject" style={{ color: color(c.subject) }}>{c.subject}</span>
                      <p className="ln-card-title">{c.title}</p>
                      <span className="ml-done-badge" style={{ marginTop:8 }}>✓ Completed</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {tab === "history" && (
            hist.length === 0 ? (
              <div className="ln-empty">
                <span>🕐</span>
                <h3>No watch history yet</h3>
                <p>Watch lessons and tutorials to build your history.</p>
                <button type="button" className="ln-btn-primary" onClick={() => navigate("/app/learn")}>Start Learning</button>
              </div>
            ) : (
              <div className="ml-history-list">
                {hist.map((item,i) => (
                  <HistoryRow key={i} item={item} onClick={() => {
                    if (item.type === "lesson") navigate(`/app/learn/courses/${item.courseId}/lessons/${item.id}`);
                    else navigate(`/app/learn/tutorials/${item.id}`);
                  }}/>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
