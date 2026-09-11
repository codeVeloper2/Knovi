import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

const COLORS = {
  Math:"#6366f1",English:"#3b82f6",Biology:"#22c55e",Chemistry:"#f59e0b",
  Physics:"#eab308",History:"#a78bfa",Geography:"#34d399","Computer Science":"#06b6d4",
  Spanish:"#ef4444",French:"#60a5fa",Art:"#f472b6",Music:"#818cf8",
  Economics:"#f59e0b",Literature:"#a78bfa",Psychology:"#34d399",
};
const color = s => COLORS[s] || "#6366f1";

function LessonRow({ lesson, index, active, onPlay }) {
  const min = Math.floor((lesson.durationSeconds||0)/60);
  const sec = String((lesson.durationSeconds||0)%60).padStart(2,"0");
  return (
    <button
      type="button"
      className={`cd-row ${active ? "cd-row--active" : ""} ${lesson.completed ? "cd-row--done" : ""}`}
      onClick={onPlay}
    >
      <span className="cd-row-num">
        {lesson.completed ? "✓" : index + 1}
      </span>
      <div className="cd-row-info">
        <span className="cd-row-title">{lesson.title}</span>
        {lesson.description && <span className="cd-row-desc">{lesson.description.slice(0,80)}</span>}
      </div>
      <span className="cd-row-dur">{min}:{sec}</span>
    </button>
  );
}

export default function CourseDetailPage() {
  const { courseId } = useParams();
  const navigate     = useNavigate();
  const toast        = useToast();

  const [course,    setCourse]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    api.getCourse(courseId)
      .then(setCourse)
      .catch(() => toast.error("Could not load course."))
      .finally(() => setLoading(false));
  }, [courseId]);

  async function handleStart() {
    if (!course) return;
    if (!course.enrolled) {
      setEnrolling(true);
      try {
        const updated = await api.enrollCourse(courseId);
        setCourse(updated);
        const first = updated.lessons?.[0];
        if (first) navigate(`/app/learn/courses/${courseId}/lessons/${first.id}`);
      } catch (err) { toast.error(err.message || "Failed to start."); }
      finally { setEnrolling(false); }
    } else {
      const next = course.lessons?.find(l => !l.completed) || course.lessons?.[0];
      if (next) navigate(`/app/learn/courses/${courseId}/lessons/${next.id}`);
    }
  }

  async function handleSave() {
    try {
      const { saved: s } = await api.toggleSaved("course", parseInt(courseId));
      setSaved(s);
      toast.success(s ? "Course saved!" : "Removed from saved.");
    } catch { toast.error("Could not save."); }
  }

  if (loading) return <div className="ln-loading"><span className="discover-spinner"/> Loading course...</div>;
  if (!course) return null;

  const c   = color(course.subject);
  const pct = course.progressPct || 0;

  return (
    <div className="ln-page">
      <button type="button" className="ct-back" onClick={() => navigate("/app/learn/courses")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Courses
      </button>

      <div className="cd-layout">
        {/* ── Left ── */}
        <div className="cd-main">
          <div className="cd-hero-thumb">
            {course.thumbnailUrl
              ? <img src={course.thumbnailUrl} alt={course.title}/>
              : <div className="cd-hero-empty" style={{ background:`${c}18` }}>📚</div>
            }
            <span className="cd-hero-subject" style={{ background:c }}>{course.subject}</span>
          </div>

          <h1 className="cd-title">{course.title}</h1>

          <div className="cd-meta-row">
            {course.rating > 0 && <span>⭐ {course.rating} ({course.ratingCount})</span>}
            <span>{course.lessonsCount} lessons</span>
            <span>{course.durationMinutes} min total</span>
            <span>by {course.creatorName}</span>
          </div>

          {pct > 0 && (
            <div className="cd-prog-wrap">
              <div className="cd-prog-bar"><div style={{ width:`${pct}%`, background:c }}/></div>
              <span style={{ color:c }}>{pct}%</span>
            </div>
          )}

          {course.description && <p className="cd-desc">{course.description}</p>}

          <h2 className="cd-curriculum-label">Curriculum</h2>
          <div className="cd-lessons">
            {(course.lessons||[]).map((l,i) => (
              <LessonRow
                key={l.id}
                lesson={l}
                index={i}
                active={false}
                onPlay={() => navigate(`/app/learn/courses/${courseId}/lessons/${l.id}`)}
              />
            ))}
          </div>
        </div>

        {/* ── Right sticky ── */}
        <div className="cd-sidebar">
          <div className="cd-cta-box">
            {pct > 0 && (
              <div className="cd-prog-wrap" style={{ marginBottom:16 }}>
                <div className="cd-prog-bar"><div style={{ width:`${pct}%`, background:c }}/></div>
                <span style={{ color:c }}>{pct}%</span>
              </div>
            )}
            <button
              type="button"
              className="ln-btn-primary ln-btn-full"
              onClick={handleStart}
              disabled={enrolling}
            >
              {enrolling ? "Starting..." : course.enrolled
                ? (pct > 0 ? "Continue Course" : "Start Course")
                : "Start Course"
              }
            </button>
            <button
              type="button"
              className={`cd-save-btn ${saved ? "saved" : ""}`}
              onClick={handleSave}
            >
              {saved ? "✓ Saved" : "🔖 Save Course"}
            </button>
            <div className="cd-info-list">
              <div><span>📖</span> {course.lessonsCount} lessons</div>
              <div><span>⏱</span> {course.durationMinutes} min</div>
              {course.rating > 0 && <div><span>⭐</span> {course.rating} rating</div>}
            </div>
          </div>

          <div className="cd-peer-box">
            <p>Need help with <strong>{course.subject}</strong>?</p>
            <button
              type="button"
              className="cd-peer-btn"
              onClick={() => navigate(`/app/discover?subject=${encodeURIComponent(course.subject)}`)}
            >
              Find a Study Partner →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
