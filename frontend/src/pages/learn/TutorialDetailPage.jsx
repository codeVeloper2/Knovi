import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import NotificationsBell from "../../components/NotificationsPanel";

// ── helpers ────────────────────────────────────────────────────────────────
const COLORS = {
  Mathematics:"#6366f1",Math:"#6366f1",English:"#3b82f6",Biology:"#22c55e",
  Chemistry:"#f59e0b",Physics:"#eab308",History:"#a78bfa",Geography:"#34d399",
  "Computer Science":"#06b6d4",Spanish:"#ef4444",French:"#60a5fa",Art:"#f472b6",
  Music:"#818cf8",Economics:"#f59e0b",Literature:"#a78bfa",Psychology:"#34d399",
  Programming:"#06b6d4","Further Math":"#6366f1",Accounting:"#f59e0b",
};
const color = s => COLORS[s] || "#6366f1";

function fmtDur(sec) {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}
function fmtViews(v) {
  if (!v) return null;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(v);
}
function isYouTube(url) {
  return url && (url.includes("youtube.com") || url.includes("youtu.be"));
}
function isVimeo(url) {
  return url && url.includes("vimeo.com");
}
function getEmbedUrl(url) {
  if (!url) return null;
  // Already an embed URL
  if (url.includes("/embed/")) return url;
  // YouTube
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
  // Vimeo
  const vmMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vmMatch) return `https://player.vimeo.com/video/${vmMatch[1]}`;
  return null;
}

// ── Mobile header ──────────────────────────────────────────────────────────
function MobileHeader({ onBack }) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const name    = profile?.displayName || user?.displayName || "";
  const photo   = profile?.photoURL    || user?.photoURL    || "";
  const initial = name.trim()[0]?.toUpperCase() || "?";
  return (
    <div className="ln-mob-header">
      <div className="ln-mob-header-left">
        <button className="ln-mob-menu-btn" aria-label="Back" onClick={onBack}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <span className="ln-mob-logo">Kno<span className="ln-mob-accent">vi</span></span>
      </div>
      <div className="ln-mob-header-right">
        <NotificationsBell className="notif-bell-btn" />
        <button className="ln-mob-avatar" onClick={() => navigate("/app/settings")} aria-label="Profile">
          {photo ? <img src={photo} alt={name} referrerPolicy="no-referrer" /> : <span>{initial}</span>}
        </button>
      </div>
    </div>
  );
}

// ── Discussion ─────────────────────────────────────────────────────────────
function Discussion({ contentType, contentId }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [comments, setComments] = useState([]);
  const [body,     setBody]     = useState("");
  const [replyTo,  setReplyTo]  = useState(null);
  const [posting,  setPosting]  = useState(false);

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
    } catch { toast.error("Couldn't post comment. Please try again."); }
    finally { setPosting(false); }
  }

  async function like(id) {
    try {
      const { likes } = await api.likeLearnComment(id);
      setComments(prev => prev.map(c => c.id === id ? { ...c, likes } : c));
    } catch {}
  }

  return (
    <div>
      <form className="tut-comment-form" onSubmit={submit}>
        {profile?.photoURL
          ? <img src={profile.photoURL} alt="" className="tut-comment-av" referrerPolicy="no-referrer" onError={e => { e.target.style.display = "none"; }} />
          : <div className="tut-comment-av" style={{ background: "var(--navy-panel)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.9rem", color: "#fff" }}>
              {(profile?.displayName || "?")[0].toUpperCase()}
            </div>
        }
        <div className="tut-comment-input-wrap">
          {replyTo && (
            <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
              Replying ·{" "}
              <button type="button" style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer" }} onClick={() => setReplyTo(null)}>cancel</button>
            </div>
          )}
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Ask a question or leave a comment…" rows={2} />
          <button type="submit" className="ln-btn-primary" style={{ alignSelf: "flex-end", padding: "8px 20px", fontSize: "0.82rem" }} disabled={posting || !body.trim()}>
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </form>
      <div className="tut-comments-list">
        {comments.length === 0 && (
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>No comments yet. Be the first!</p>
        )}
        {comments.map(c => (
          <div key={c.id} className="tut-comment">
            {c.authorPhoto
              ? <img src={c.authorPhoto} alt="" className="tut-comment-av" referrerPolicy="no-referrer" onError={e => { e.target.style.display = "none"; }} />
              : <div className="tut-comment-av" style={{ background: "var(--navy-panel)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem", color: "#fff" }}>
                  {(c.authorName || "?")[0].toUpperCase()}
                </div>
            }
            <div className="tut-comment-body">
              <div className="tut-comment-author">{c.authorName}</div>
              <div className="tut-comment-text">{c.body}</div>
              <div className="tut-comment-actions">
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

// ── Related tutorials ──────────────────────────────────────────────────────
function RelatedList({ subject, currentId, navigate }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.listTutorials({ subject, sort: "popular" })
      .then(data => setItems(data.filter(t => t.id !== currentId).slice(0, 6)))
      .catch(() => {});
  }, [subject, currentId]);

  if (!items.length) return <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>No related tutorials found.</p>;

  return (
    <div className="tut-related-list">
      {items.map(t => {
        const c   = color(t.subject);
        const dur = fmtDur(t.durationSeconds);
        return (
          <button key={t.id} type="button" className="tut-related-item" onClick={() => navigate(`/app/learn/tutorials/${t.id}`)}>
            <div className="tut-related-thumb">
              {t.thumbnailUrl
                ? <img src={t.thumbnailUrl} alt={t.title} />
                : <div style={{ width:"100%", height:"100%", background:`${c}18`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={c} opacity=".5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
              }
              {dur && <span className="tut-related-dur">{dur}</span>}
            </div>
            <div className="tut-related-body">
              <div className="tut-related-title">{t.title}</div>
              <div className="tut-related-creator">{t.creatorName}</div>
              <span className="tut-related-subject" style={{ background: c }}>{t.subject}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function TutorialDetailPage() {
  const { tutorialId } = useParams();
  const navigate  = useNavigate();
  const toast     = useToast();
  const { profile } = useAuth();

  const [tut,     setTut]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved,   setSaved]   = useState(false);
  const [tab,     setTab]     = useState("about");
  const [completed, setCompleted] = useState(false);

  const videoRef      = useRef(null);
  const progressTimer = useRef(null);

  useEffect(() => {
    api.getTutorial(tutorialId)
      .then(t => { setTut(t); setCompleted(t.completed || false); })
      .catch(() => toast.error("Couldn't load tutorial. Please try again."))
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
    const onPlay  = () => { progressTimer.current = setInterval(saveProgress, 10000); };
    const onPause = () => { clearInterval(progressTimer.current); saveProgress(); };
    const onEnded = () => { clearInterval(progressTimer.current); saveProgress(); };
    v.addEventListener("play",  onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    if (tut.positionSeconds > 5) v.currentTime = tut.positionSeconds;
    return () => {
      clearInterval(progressTimer.current);
      v.removeEventListener("play",  onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [tut, saveProgress]);

  async function handleSave() {
    try {
      const { saved: s } = await api.toggleSaved("tutorial", parseInt(tutorialId));
      setSaved(s);
      toast.success(s ? "Tutorial saved!" : "Removed from saved.");
    } catch { toast.error("Couldn't save. Please try again."); }
  }

  async function handleShare() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: tut?.title || "Tutorial", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard!");
      }
    } catch {}
  }

  async function handleMarkComplete() {
    if (!videoRef.current && !tut) return;
    const dur = tut.durationSeconds || 1;
    await api.saveVideoProgress(null, parseInt(tutorialId), dur, dur).catch(() => {});
    setCompleted(true);
    toast.success("Marked as completed! 🎉");
  }

  if (loading) return (
    <div className="tut-page">
      <MobileHeader onBack={() => navigate("/app/learn/tutorials")} />
      <div className="ln-loading" style={{ marginTop: 80 }}>
        <span className="discover-spinner" /> Loading tutorial…
      </div>
    </div>
  );

  if (!tut) return null;

  const c       = color(tut.subject);
  const dur     = fmtDur(tut.durationSeconds);
  const views   = fmtViews(tut.views);
  const embedUrl = getEmbedUrl(tut.videoUrl);
  const isEmbed  = !!embedUrl;

  return (
    <div className="tut-page">
      <MobileHeader onBack={() => navigate("/app/learn/tutorials")} />

      {/* ── Video ── */}
      <div className="tut-video-wrap">
        {tut.videoUrl ? (
          isEmbed ? (
            <iframe
              src={embedUrl}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={tut.title}
            />
          ) : (
            <video
              ref={videoRef}
              src={tut.videoUrl}
              poster={tut.thumbnailUrl || ""}
              controls
              playsInline
              style={{ width: "100%", height: "100%" }}
            />
          )
        ) : (
          <div className="tut-video-placeholder">
            <span>▶</span>
            <p>No video available.</p>
          </div>
        )}
      </div>

      {/* ── Meta ── */}
      <div className="tut-meta">
        <h1 className="tut-title">{tut.title}</h1>

        {/* Creator row — no Follow button */}
        <div className="tut-creator-row">
          <div className="tut-creator-av">
            {tut.creatorPhoto
              ? <img src={tut.creatorPhoto} alt={tut.creatorName} referrerPolicy="no-referrer" onError={e => { e.target.style.display = "none"; }} />
              : <span>{(tut.creatorName || "?")[0].toUpperCase()}</span>
            }
          </div>
          <div>
            <div className="tut-creator-name">{tut.creatorName || "Anonymous"}</div>
          </div>
        </div>

        {/* Info chips: subject · duration · views */}
        <div className="tut-info-row">
          <span className="tut-info-chip" style={{ borderColor: `${c}40` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />
            {tut.subject}
          </span>
          {dur && (
            <span className="tut-info-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              {dur}
            </span>
          )}
          {views && (
            <span className="tut-info-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {views}
            </span>
          )}
        </div>

        {/* Action row: Save + Share */}
        <div className="tut-action-row">
          <button type="button" className={`tut-action-btn ${saved ? "active" : ""}`} onClick={handleSave}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            {saved ? "Saved" : "Save"}
          </button>
          <button type="button" className="tut-action-btn" onClick={handleShare}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>
        </div>
      </div>

      {/* ── Tabs: About / Comments / Related ── */}
      <div className="tut-tabs">
        {["about", "comments", "related"].map(t => (
          <button key={t} type="button"
            className={`tut-tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "about" ? "About" : t === "comments" ? "Comments" : "Related"}
          </button>
        ))}
      </div>

      <div className="tut-tab-content">
        {/* ── About ── */}
        {tab === "about" && (
          <div>
            {tut.description ? (
              <>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text)", margin: "0 0 10px" }}>About this tutorial</h3>
                <p className="tut-about-desc">{tut.description}</p>
              </>
            ) : (
              <p className="tut-about-desc" style={{ color: "var(--text-dim)" }}>No description provided.</p>
            )}

            {/* What you'll learn — derived from description sentences */}
            {tut.description && tut.description.length > 40 && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text)", margin: "0 0 8px" }}>What you'll learn</h3>
                <ul className="tut-learn-list">
                  {tut.description.split(/\.|,|\n/).filter(s => s.trim().length > 15).slice(0, 3).map((s, i) => (
                    <li key={i}>{s.trim()}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Find a peer nudge */}
            <div className="tut-peer-nudge">
              <span>Want to study <strong>{tut.subject}</strong> with a peer?</span>
              <button type="button" className="tut-peer-btn"
                onClick={() => navigate(`/app/discover?subject=${encodeURIComponent(tut.subject || "")}`)}>
                Find Partner →
              </button>
            </div>

            {/* Mark as complete */}
            {!completed ? (
              <button type="button" className="tut-mark-btn" onClick={handleMarkComplete}>
                ✓ Mark as Completed
              </button>
            ) : (
              <button type="button" className="tut-mark-btn done" disabled>
                ✓ Completed
              </button>
            )}
          </div>
        )}

        {/* ── Comments ── */}
        {tab === "comments" && (
          <Discussion contentType="tutorial" contentId={parseInt(tutorialId)} />
        )}

        {/* ── Related ── */}
        {tab === "related" && (
          <RelatedList subject={tut.subject} currentId={parseInt(tutorialId)} navigate={navigate} />
        )}
      </div>
    </div>
  );
}
