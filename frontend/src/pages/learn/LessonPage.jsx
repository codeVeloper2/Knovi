import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import VideoPlayer from "./VideoPlayer";

// ── Discussion ────────────────────────────────────────────────────────────
function Discussion({ contentType, contentId }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api.getLearnComments(contentType, contentId).then(setComments).catch(() => {});
  }, [contentType, contentId]);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      const c = await api.postLearnComment(contentType, contentId, body.trim(), replyTo);
      setComments(prev => [c, ...prev]);
      setBody(""); setReplyTo(null);
    } catch { toast.error("Couldn't post comment."); }
    finally { setPosting(false); }
  }

  async function like(id) {
    const { likes } = await api.likeLearnComment(id);
    setComments(prev => prev.map(c => c.id === id ? { ...c, likes } : c));
  }

  return (
    <div className="lp-discussion">
      <h3>Discussion</h3>
      <form className="lp-comment-form" onSubmit={submit}>
        <img
          src={profile?.photoURL || ""}
          alt=""
          className="lp-comment-avatar"
          onError={e => { e.target.style.display = "none"; }}
        />
        <div className="lp-comment-input-wrap">
          {replyTo && <div className="lp-reply-label">Replying to comment · <button type="button" onClick={() => setReplyTo(null)}>cancel</button></div>}
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Ask a question or share a thought…"
            rows={2}
          />
          <button type="submit" className="lh-cta-btn" disabled={posting || !body.trim()}>
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </form>

      <div className="lp-comments-list">
        {comments.length === 0 && <p className="lp-no-comments">No comments yet. Be the first!</p>}
        {comments.map(c => (
          <div key={c.id} className="lp-comment">
            <img src={c.authorPhoto || ""} alt="" className="lp-comment-avatar" onError={e => { e.target.style.display = "none"; }} />
            <div className="lp-comment-body">
              <div className="lp-comment-author">{c.authorName}</div>
              <div className="lp-comment-text">{c.body}</div>
              <div className="lp-comment-actions">
                <button type="button" onClick={() => like(c.id)}>👍 {c.likes || 0}</button>
                <button type="button" onClick={() => setReplyTo(c.id)}>Reply</button>
              </div>
              {c.replies?.map(r => (
                <div key={r.id} className="lp-reply">
                  <img src={r.authorPhoto || ""} alt="" className="lp-comment-avatar sm" onError={e => { e.target.style.display = "none"; }} />
                  <div>
                    <div className="lp-comment-author">{r.authorName}</div>
                    <div className="lp-comment-text">{r.body}</div>
                    <div className="lp-comment-actions">
                      <button type="button" onClick={() => like(r.id)}>👍 {r.likes || 0}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────
function NotesPanel({ videoRef }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");

  function addNote() {
    if (!text.trim()) return;
    const pos = videoRef.current?.currentTime || 0;
    const mins = Math.floor(pos / 60);
    const secs = String(Math.floor(pos % 60)).padStart(2, "0");
    setNotes(prev => [...prev, { time: `${mins}:${secs}`, text: text.trim(), pos }]);
    setText("");
  }

  function jumpTo(pos) {
    if (videoRef.current) videoRef.current.currentTime = pos;
  }

  return (
    <div className="lp-notes">
      <h3>My Notes</h3>
      <div className="lp-notes-input">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a note for the current timestamp…"
          rows={2}
        />
        <button type="button" className="lh-cta-btn" onClick={addNote}>Add Note</button>
      </div>
      {notes.length === 0
        ? <p className="lp-no-comments">No notes yet. Pause the video and add a note!</p>
        : notes.map((n, i) => (
          <div key={i} className="lp-note-item">
            <button type="button" className="lp-note-time" onClick={() => jumpTo(n.pos)}>{n.time}</button>
            <span>{n.text}</span>
          </div>
        ))
      }
    </div>
  );
}

// ── Lesson Page ───────────────────────────────────────────────────────────
export default function LessonPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const toast    = useToast();

  const [course,    setCourse]   = useState(null);
  const [lesson,    setLesson]   = useState(null);
  const [loading,   setLoading]  = useState(true);
  const [tab,       setTab]      = useState("description"); // description | notes | discussion
  const [completed, setCompleted]= useState(false);
  const [saved,     setSaved]    = useState(false);

  const videoRef   = useRef(null);
  const progressTimer = useRef(null);

  useEffect(() => {
    Promise.all([
      api.getCourse(courseId),
    ]).then(([c]) => {
      setCourse(c);
      const l = c.lessons?.find(x => String(x.id) === String(lessonId));
      if (!l) { toast.error("Lesson not found."); navigate(`/app/learn/courses/${courseId}`); return; }
      setLesson(l);
      setCompleted(l.completed || false);
    }).catch(() => toast.error("Could not load lesson."))
      .finally(() => setLoading(false));
  }, [courseId, lessonId]);

  // Save progress every 10 seconds while playing
  const saveProgress = useCallback(() => {
    if (!videoRef.current || !lesson) return;
    const pos = Math.floor(videoRef.current.currentTime);
    const dur = Math.floor(videoRef.current.duration) || lesson.durationSeconds || 1;
    api.saveVideoProgress(parseInt(lessonId), null, pos, dur).catch(() => {});
  }, [lesson, lessonId]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => { progressTimer.current = setInterval(saveProgress, 10000); };
    const onPause = () => { clearInterval(progressTimer.current); saveProgress(); };
    const onEnded = () => { clearInterval(progressTimer.current); saveProgress(); };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    // Resume from saved position
    if (lesson?.positionSeconds > 5) {
      v.currentTime = lesson.positionSeconds;
    }
    return () => {
      clearInterval(progressTimer.current);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [lesson, saveProgress]);

  async function markComplete() {
    if (!lesson) return;
    await api.saveVideoProgress(parseInt(lessonId), null, lesson.durationSeconds || 0, lesson.durationSeconds || 1);
    setCompleted(true);
    toast.success("Lesson marked as complete!");
    // Auto-advance to next lesson
    const lessons = course?.lessons || [];
    const idx = lessons.findIndex(l => String(l.id) === String(lessonId));
    if (idx < lessons.length - 1) {
      const nextId = lessons[idx + 1].id;
      setTimeout(() => navigate(`/app/learn/courses/${courseId}/lessons/${nextId}`), 800);
    }
  }

  async function handleSave() {
    const { saved: s } = await api.toggleSaved("lesson", parseInt(lessonId));
    setSaved(s);
    toast.success(s ? "Lesson saved!" : "Removed from saved.");
  }

  if (loading) return <div className="lh-loading"><span className="discover-spinner" /> Loading lesson…</div>;
  if (!lesson)  return null;

  const lessons  = course?.lessons || [];
  const idx      = lessons.findIndex(l => String(l.id) === String(lessonId));
  const prevLesson = idx > 0 ? lessons[idx - 1] : null;
  const nextLesson = idx < lessons.length - 1 ? lessons[idx + 1] : null;

  return (
    <div className="lp-page">
      <button type="button" className="cd-back" onClick={() => navigate(`/app/learn/courses/${courseId}`)}>
        ← {course?.title}
      </button>

      <div className="lp-layout">
        {/* ── Video + tabs ── */}
        <div className="lp-main">
          {/* Video player */}
          <div className="lp-video-wrap">
            <VideoPlayer
              src={lesson.videoUrl || ""}
              poster={lesson.thumbnailUrl || ""}
              startAt={lesson.positionSeconds || 0}
              onProgress={(pos, dur) => api.saveVideoProgress(parseInt(lessonId), null, pos, dur).catch(() => {})}
              onEnded={() => {
                setCompleted(true);
                toast.success("Lesson finished!");
              }}
            />
          </div>

          {/* Title row */}
          <div className="lp-title-row">
            <div>
              <h1 className="lp-title">{lesson.title}</h1>
              <div className="lh-card-meta">
                <span>{course?.subject}</span>
                {lesson.durationSeconds > 0 && <><span>·</span><span>{Math.floor(lesson.durationSeconds / 60)} min</span></>}
              </div>
            </div>
            <div className="lp-actions">
              <button type="button" className={`lp-icon-btn ${saved ? "active" : ""}`} onClick={handleSave} title="Save">
                🔖
              </button>
              {!completed
                ? <button type="button" className="lh-cta-btn" onClick={markComplete}>✓ Mark as Complete</button>
                : <div className="lp-completed-badge">✓ Completed</div>
              }
            </div>
          </div>

          {/* Nav arrows */}
          <div className="lp-nav-row">
            {prevLesson
              ? <button type="button" className="lp-nav-btn" onClick={() => navigate(`/app/learn/courses/${courseId}/lessons/${prevLesson.id}`)}>← Previous</button>
              : <span />
            }
            {nextLesson && (
              <button type="button" className="lp-nav-btn primary" onClick={() => navigate(`/app/learn/courses/${courseId}/lessons/${nextLesson.id}`)}>
                Next: {nextLesson.title} →
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="lh-tabs" style={{ marginTop: 24 }}>
            {["description", "notes", "discussion"].map(t => (
              <button key={t} type="button"
                className={`lh-tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === "description" && (
            <div className="lp-description">
              <p>{lesson.description || "No description provided."}</p>
              {/* Study with peer CTA */}
              <div className="lp-peer-nudge">
                <span>Still confused about <strong>{course?.subject}</strong>?</span>
                <button type="button" className="cd-peer-btn"
                  onClick={() => navigate(`/app/discover?subject=${encodeURIComponent(course?.subject || "")}`)}>
                  Find a Study Partner →
                </button>
              </div>
            </div>
          )}
          {tab === "notes"       && <NotesPanel videoRef={videoRef} />}
          {tab === "discussion"  && <Discussion contentType="lesson" contentId={parseInt(lessonId)} />}
        </div>

        {/* ── Sidebar: lesson list ── */}
        <div className="lp-sidebar">
          <div className="lp-sidebar-title">{course?.title}</div>
          <div className="lp-lesson-list">
            {lessons.map((l, i) => (
              <div
                key={l.id}
                className={`lp-lesson-item ${String(l.id) === String(lessonId) ? "active" : ""} ${l.completed ? "done" : ""}`}
                onClick={() => navigate(`/app/learn/courses/${courseId}/lessons/${l.id}`)}
                role="button"
                tabIndex={0}
              >
                <span className="lp-lesson-num">{l.completed ? "✓" : i + 1}</span>
                <span className="lp-lesson-name">{l.title}</span>
                <span className="lp-lesson-dur">{Math.floor((l.durationSeconds || 0) / 60)}m</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
