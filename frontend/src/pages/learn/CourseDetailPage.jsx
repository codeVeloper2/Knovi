import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";

function LessonRow({ lesson, index, onPlay, active }) {
  const mins = Math.floor((lesson.durationSeconds || 0) / 60);
  const secs = String((lesson.durationSeconds || 0) % 60).padStart(2, "0");
  return (
    <div
      className={`cd-lesson-row ${active ? "active" : ""} ${lesson.completed ? "done" : ""}`}
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onPlay()}
    >
      <div className="cd-lesson-num">
        {lesson.completed
          ? <span className="cd-check">✓</span>
          : <span>{index + 1}</span>
        }
      </div>
      <div className="cd-lesson-info">
        <div className="cd-lesson-title">{lesson.title}</div>
        {lesson.description && <div className="cd-lesson-desc">{lesson.description.slice(0, 80)}</div>}
      </div>
      <div className="cd-lesson-dur">{mins}:{secs}</div>
      {lesson.progressPct > 0 && !lesson.completed && (
        <div className="cd-lesson-bar"><div style={{ width: `${lesson.progressPct}%` }} /></div>
      )}
    </div>
  );
}

export default function CourseDetailPage() {
  const { courseId }  = useParams();
  const navigate      = useNavigate();
  const toast         = useToast();
  const { profile }   = useAuth();

  const [course,    setCourse]   = useState(null);
  const [loading,   setLoading]  = useState(true);
  const [enrolling, setEnrolling]= useState(false);
  const [saved,     setSaved]    = useState(false);

  useEffect(() => {
    api.getCourse(courseId)
      .then(c => { setCourse(c); })
      .catch(() => toast.error("Could not load course."))
      .finally(() => setLoading(false));
  }, [courseId]);

  async function handleEnroll() {
    setEnrolling(true);
    try {
      const updated = await api.enrollCourse(courseId);
      setCourse(updated);
      // Navigate to first lesson
      if (updated.lessons?.[0]) {
        navigate(`/app/learn/courses/${courseId}/lessons/${updated.lessons[0].id}`);
      }
    } catch (err) {
      toast.error(err.message || "Enrolment failed.");
    } finally {
      setEnrolling(false);
    }
  }

  async function handleSave() {
    const { saved: s } = await api.toggleSaved("course", parseInt(courseId));
    setSaved(s);
    toast.success(s ? "Course saved!" : "Removed from saved.");
  }

  function continueLesson() {
    if (!course?.lessons) return;
    // Find first incomplete lesson
    const next = course.lessons.find(l => !l.completed) || course.lessons[0];
    navigate(`/app/learn/courses/${courseId}/lessons/${next.id}`);
  }

  if (loading) return <div className="lh-loading"><span className="discover-spinner" /> Loading course…</div>;
  if (!course) return null;

  const pct = course.progressPct || 0;

  return (
    <div className="cd-page">
      {/* Back */}
      <button type="button" className="cd-back" onClick={() => navigate("/app/learn/courses")}>
        ← Back to Courses
      </button>

      <div className="cd-layout">
        {/* ── Left: details ── */}
        <div className="cd-main">
          <div className="cd-thumb">
            {course.thumbnailUrl
              ? <img src={course.thumbnailUrl} alt={course.title} />
              : <div className="cd-thumb-placeholder">📚</div>
            }
          </div>

          <div className="cd-subject-chip">{course.subject}</div>
          <h1 className="cd-title">{course.title}</h1>

          <div className="cd-meta-row">
            {course.rating > 0 && <span>⭐ {course.rating} ({course.ratingCount})</span>}
            <span>{course.lessonsCount} lessons</span>
            <span>{course.durationMinutes} min total</span>
            <span>by {course.creatorName}</span>
          </div>

          {pct > 0 && (
            <div className="cd-progress-wrap">
              <div className="cd-progress-bar"><div style={{ width: `${pct}%` }} /></div>
              <span>{pct}% complete</span>
            </div>
          )}

          <p className="cd-description">{course.description}</p>

          {/* Curriculum */}
          <h2 className="cd-curriculum-title">Course Curriculum</h2>
          <div className="cd-lessons">
            {(course.lessons || []).map((l, i) => (
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

        {/* ── Right: sticky CTA ── */}
        <div className="cd-sidebar">
          <div className="cd-cta-card">
            {pct > 0 && (
              <div className="cd-cta-progress">
                <div className="cd-progress-bar"><div style={{ width: `${pct}%` }} /></div>
                <span>{pct}%</span>
              </div>
            )}
            {course.enrolled ? (
              <button type="button" className="lh-cta-btn btn-full" onClick={continueLesson}>
                {pct > 0 ? "Continue Course" : "Start Course"}
              </button>
            ) : (
              <button type="button" className="lh-cta-btn btn-full" onClick={handleEnroll} disabled={enrolling}>
                {enrolling ? "Starting…" : "Start Course"}
              </button>
            )}
            <button type="button" className={`cd-save-btn ${saved ? "saved" : ""}`} onClick={handleSave}>
              {saved ? "✓ Saved" : "🔖 Save"}
            </button>
            <div className="cd-cta-meta">
              <div>{course.lessonsCount} lessons</div>
              <div>{course.durationMinutes} min</div>
              {course.rating > 0 && <div>⭐ {course.rating}</div>}
            </div>
          </div>

          {/* Study with peer CTA */}
          <div className="cd-peer-cta">
            <p>Still need help with <strong>{course.subject}</strong>?</p>
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
