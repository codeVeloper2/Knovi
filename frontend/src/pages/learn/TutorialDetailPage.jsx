import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import VideoPlayer from "./VideoPlayer";

function isYouTube(url) {
  return url && (url.includes("youtube.com/embed") || url.includes("youtu.be") || url.includes("youtube.com/watch"));
}

// Inline Discussion component (same pattern as LessonPage)
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
        <img src={profile?.photoURL || ""} alt="" className="lp-comment-avatar" onError={e => { e.target.style.display = "none"; }} />
        <div className="lp-comment-input-wrap">
          {replyTo && <div className="lp-reply-label">Replying · <button type="button" onClick={() => setReplyTo(null)}>cancel</button></div>}
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Ask a question…" rows={2} />
          <button type="submit" className="lh-cta-btn" disabled={posting || !body.trim()}>{posting ? "Posting…" : "Post"}</button>
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TutorialDetailPage() {
  const { tutorialId } = useParams();
  const navigate = useNavigate();
  const toast    = useToast();

  const [tut,       setTut]     = useState(null);
  const [loading,   setLoading] = useState(true);
  const [saved,     setSaved]   = useState(false);
  const [tab,       setTab]     = useState("description");

  const videoRef = useRef(null);
  const progressTimer = useRef(null);

  useEffect(() => {
    api.getTutorial(tutorialId)
      .then(t => setTut(t))
      .catch(() => toast.error("Could not load tutorial."))
      .finally(() => setLoading(false));
  }, [tutorialId]);

  const saveProgress = useCallback(() => {
    if (!videoRef.current || !tut) return;
    const pos = Math.floor(videoRef.current.currentTime);
    const dur = Math.floor(videoRef.current.duration) || tut.durationSeconds || 1;
    api.saveVideoProgress(null, parseInt(tutorialId), pos, dur).catch(() => {});
  }, [tut, tutorialId]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !tut) return;
    const onPlay = () => { progressTimer.current = setInterval(saveProgress, 10000); };
    const onPause = () => { clearInterval(progressTimer.current); saveProgress(); };
    const onEnded = () => { clearInterval(progressTimer.current); saveProgress(); };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    if (tut.positionSeconds > 5) v.currentTime = tut.positionSeconds;
    return () => {
      clearInterval(progressTimer.current);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [tut, saveProgress]);

  async function handleSave() {
    const { saved: s } = await api.toggleSaved("tutorial", parseInt(tutorialId));
    setSaved(s);
    toast.success(s ? "Tutorial saved!" : "Removed from saved.");
  }

  if (loading) return <div className="lh-loading"><span className="discover-spinner" /> Loading…</div>;
  if (!tut)    return null;

  return (
    <div className="lp-page">
      <button type="button" className="cd-back" onClick={() => navigate("/app/learn/tutorials")}>
        ← Tutorials
      </button>

      <div className="lp-layout">
        <div className="lp-main">
          <div className="lp-video-wrap">
            {tut.videoUrl ? (
              isYouTube(tut.videoUrl) ? (
                <iframe
                  src={tut.videoUrl}
                  className="lp-video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={tut.title}
                  style={{ border: "none" }}
                />
              ) : (
                <VideoPlayer
                  src={tut.videoUrl}
                  poster={tut.thumbnailUrl || ""}
                  startAt={tut.positionSeconds || 0}
                  onProgress={(pos, dur) => api.saveVideoProgress(null, parseInt(tutorialId), pos, dur).catch(() => {})}
                />
              )
            ) : (
              <div className="lp-video-placeholder"><span>▶</span><p>No video available.</p></div>
            )}
          </div>

          <div className="lp-title-row">
            <div>
              <h1 className="lp-title">{tut.title}</h1>
              <div className="lh-card-meta">
                <span>{tut.subject}</span>
                {tut.topic && <><span>·</span><span>{tut.topic}</span></>}
                {tut.views > 0 && <><span>·</span><span>{tut.views} views</span></>}
                {tut.rating > 0 && <><span>·</span><span>⭐ {tut.rating}</span></>}
              </div>
              <div className="lp-creator-row">
                {tut.creatorPhoto && <img src={tut.creatorPhoto} alt="" className="lp-creator-avatar" onError={e => { e.target.style.display = "none"; }} />}
                <span>{tut.creatorName}</span>
              </div>
            </div>
            <div className="lp-actions">
              <button type="button" className={`lp-icon-btn ${saved ? "active" : ""}`} onClick={handleSave}>🔖</button>
            </div>
          </div>

          <div className="lh-tabs" style={{ marginTop: 24 }}>
            {["description", "discussion"].map(t => (
              <button key={t} type="button"
                className={`lh-tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>

          {tab === "description" && (
            <div className="lp-description">
              <p>{tut.description || "No description provided."}</p>
              <div className="lp-peer-nudge">
                <span>Want to study <strong>{tut.subject}</strong> with a peer?</span>
                <button type="button" className="cd-peer-btn"
                  onClick={() => navigate(`/app/discover?subject=${encodeURIComponent(tut.subject || "")}`)}>
                  Find a Study Partner →
                </button>
              </div>
            </div>
          )}
          {tab === "discussion" && <Discussion contentType="tutorial" contentId={parseInt(tutorialId)} />}
        </div>

        {/* Sidebar: creator info */}
        <div className="lp-sidebar">
          <div className="cd-cta-card">
            <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
              {tut.creatorPhoto && <img src={tut.creatorPhoto} alt="" style={{ width: 56, height: 56, borderRadius: "50%", marginBottom: 8 }} onError={e => { e.target.style.display = "none"; }} />}
              <div style={{ fontWeight: 700, color: "var(--text)" }}>{tut.creatorName}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Creator</div>
            </div>
            <button type="button" className={`cd-save-btn ${saved ? "saved" : ""}`} onClick={handleSave}>
              {saved ? "✓ Saved" : "🔖 Save Tutorial"}
            </button>
          </div>
          <div className="cd-peer-cta">
            <p>Still need help with <strong>{tut.subject}</strong>?</p>
            <button type="button" className="cd-peer-btn"
              onClick={() => navigate(`/app/discover?subject=${encodeURIComponent(tut.subject || "")}`)}>
              Find a Study Partner →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
