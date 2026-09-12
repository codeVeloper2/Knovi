import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { SUBJECTS } from "../../subjects";
import * as api from "../../api";
import NotificationsBell from "../../components/NotificationsPanel";

// ── YouTube / embed helpers ────────────────────────────────────────────────
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}
function getEmbedUrl(url) {
  if (!url) return null;
  if (url.includes("/embed/")) return url;
  const ytId = extractYouTubeId(url);
  if (ytId) return `https://www.youtube.com/embed/${ytId}?rel=0`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
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
        <span className="ln-mob-logo">Peer<span className="ln-mob-accent">Up</span></span>
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

// ── Stepper ────────────────────────────────────────────────────────────────
function Stepper({ step }) {
  const steps = ["Basic Info", "Video", "Preview"];
  return (
    <div className="ct-stepper">
      {steps.map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <div className={`ct-step ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}>
            <span className="ct-step-num">
              {i + 1 < step ? "✓" : i + 1}
            </span>
            <span className="ct-step-label">{label}</span>
          </div>
          {i < steps.length - 1 && <div className={`ct-step-line ${i + 1 < step ? "done" : ""}`} />}
        </div>
      ))}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function CreateTutorialPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const { profile, user } = useAuth();

  const [step, setStep] = useState(1);

  // Step 1 — Basic Info
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [subject,     setSubject]     = useState("");
  const [topic,       setTopic]       = useState("");
  const [thumbUrl,    setThumbUrl]    = useState("");
  const [thumbUploading, setThumbUploading] = useState(false);

  // Step 2 — Video Source
  const [videoMode,   setVideoMode]   = useState(null); // "upload" | "link"
  const [videoUrl,    setVideoUrl]    = useState("");
  const [linkInput,   setLinkInput]   = useState("");
  const [linkOk,      setLinkOk]      = useState(false);
  const [linkErr,     setLinkErr]     = useState("");
  const [videoUploading, setVideoUploading] = useState(false);

  // Step 3 — Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [publishedId, setPublishedId] = useState(null);

  const thumbRef = useRef(null);
  const videoRef = useRef(null);

  const creatorName = profile?.displayName || user?.displayName || "You";

  // ── Link validation ────────────────────────────────────────────────────
  function handleLinkChange(val) {
    setLinkInput(val);
    setLinkErr(""); setLinkOk(false);
    if (!val.trim()) { setVideoUrl(""); return; }
    const ytId = extractYouTubeId(val.trim());
    if (ytId) {
      setVideoUrl(`https://www.youtube.com/embed/${ytId}?rel=0`);
      if (!thumbUrl) setThumbUrl(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
      setLinkOk(true); return;
    }
    if (/vimeo\.com\/\d+/.test(val.trim())) {
      const vm = val.trim().match(/vimeo\.com\/(\d+)/);
      setVideoUrl(`https://player.vimeo.com/video/${vm[1]}`);
      setLinkOk(true); return;
    }
    if (/\.(mp4|webm|ogg|mov)([\?#]|$)/i.test(val.trim())) {
      setVideoUrl(val.trim()); setLinkOk(true); return;
    }
    setLinkErr("Paste a YouTube, Vimeo, or direct .mp4/.webm link.");
  }

  // ── File uploads ───────────────────────────────────────────────────────
  async function handleThumbFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbUploading(true);
    try {
      const { url } = await api.uploadLearnThumbnail(file);
      setThumbUrl(url);
    } catch (err) { toast.error(err.message || "Couldn't upload thumbnail."); }
    finally { setThumbUploading(false); e.target.value = ""; }
  }
  async function handleVideoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoUploading(true);
    try {
      const { url } = await api.uploadLearnVideo(file);
      setVideoUrl(url);
      toast.success("Video uploaded!");
    } catch (err) { toast.error(err.message || "Couldn't upload video."); }
    finally { setVideoUploading(false); e.target.value = ""; }
  }

  // ── Navigation between steps ───────────────────────────────────────────
  function nextStep1() {
    if (!title.trim()) { toast.error("Please enter a title."); return; }
    if (!subject)      { toast.error("Please select a subject."); return; }
    setStep(2);
  }
  function nextStep2() {
    if (!videoUrl) { toast.error("Please add a video link or upload a file."); return; }
    setStep(3);
  }

  // ── Publish ────────────────────────────────────────────────────────────
  async function handlePublish() {
    setSubmitting(true);
    try {
      const tut = await api.createTutorial({
        title: title.trim(),
        subject,
        topic: topic.trim(),
        description: description.trim(),
        videoUrl,
        thumbnailUrl: thumbUrl,
      });
      setPublishedId(tut.id);
      setSubmitted(true);
    } catch (err) { toast.error(err.message || "Publish failed. Please try again."); }
    finally { setSubmitting(false); }
  }

  // ── Success screen ─────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="ct-page">
        <MobileHeader onBack={() => navigate("/app/learn")} />
        <div className="ct-success" style={{ marginTop: 90 }}>
          <div className="ct-success-icon">🎉</div>
          <h2>Tutorial Published!</h2>
          <p>Your tutorial is now live and visible to all students.</p>
          <div className="ct-status-row">
            <span className="ct-status-pill done">✓ Submitted</span>
            <span className="ct-arrow">→</span>
            <span className="ct-status-pill done">✓ Published</span>
          </div>
          <div className="ct-success-btns">
            {publishedId && (
              <button type="button" className="ln-btn-primary"
                onClick={() => navigate(`/app/learn/tutorials/${publishedId}`)}>
                View Tutorial
              </button>
            )}
            <button type="button" className="ln-btn-ghost"
              onClick={() => navigate("/app/learn/tutorials")}>
              Browse Tutorials
            </button>
            <button type="button" className="ln-btn-ghost"
              onClick={() => { setSubmitted(false); setStep(1); setTitle(""); setDescription(""); setSubject(""); setTopic(""); setThumbUrl(""); setVideoUrl(""); setLinkInput(""); setVideoMode(null); }}>
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ytId     = extractYouTubeId(linkInput);
  const embedUrl = getEmbedUrl(videoUrl);

  return (
    <div className="ct-page">
      <MobileHeader onBack={() => step > 1 ? setStep(s => s - 1) : navigate("/app/learn")} />

      {/* Hero */}
      <div className="ct-hero" style={{ marginTop: 64 }}>
        <h1>Create Tutorial</h1>
        <p>Share your knowledge with the community.</p>
      </div>

      {/* Stepper */}
      <Stepper step={step} />

      {/* ══ STEP 1 — Basic Info ══════════════════════════════════════════ */}
      {step === 1 && (
        <>
          <div className="ct-form">

            {/* Thumbnail */}
            <div className="ct-field">
              <label>Thumbnail <span className="ct-opt">(optional)</span></label>
              <div className="ct-thumb-drop" onClick={() => thumbRef.current?.click()}>
                {thumbUrl
                  ? <img src={thumbUrl} alt="Thumbnail preview" />
                  : <>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".4">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span>Add thumbnail</span>
                      <span className="ct-thumb-sub">Upload an image or choose from gallery</span>
                    </>
                }
              </div>
              <input ref={thumbRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleThumbFile} />
              {thumbUploading && <p className="ct-uploading">Uploading…</p>}
              {thumbUrl && (
                <button type="button" className="ct-thumb-btn" onClick={() => thumbRef.current?.click()}>
                  Change image
                </button>
              )}
            </div>

            {/* Title */}
            <div className="ct-field">
              <label>Title <span className="ct-req">*</span> <span className="ct-char">{title.length}/100</span></label>
              <input
                type="text" value={title} maxLength={100}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Python Variables and Data Types"
              />
            </div>

            {/* Description */}
            <div className="ct-field">
              <label>Description <span className="ct-req">*</span> <span className="ct-char">{description.length}/500</span></label>
              <textarea
                value={description} rows={4} maxLength={500}
                onChange={e => setDescription(e.target.value)}
                placeholder="Tell students what they'll learn…"
              />
            </div>

            {/* Subject */}
            <div className="ct-field">
              <label>Subject <span className="ct-req">*</span></label>
              <select value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="">Select subject…</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Topic / Tags */}
            <div className="ct-field">
              <label>Topic / Tags <span className="ct-opt">(optional)</span></label>
              <input
                type="text" value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. variables, python, basics"
                maxLength={120}
              />
              <p className="ct-hint">Add tags to help students find your tutorial.</p>
            </div>
          </div>

          <div className="ct-nav-row">
            <button type="button" className="ln-btn-ghost" onClick={() => navigate("/app/learn")}>Cancel</button>
            <button type="button" className="ln-btn-primary" onClick={nextStep1}>Next →</button>
          </div>
        </>
      )}

      {/* ══ STEP 2 — Video Source ════════════════════════════════════════ */}
      {step === 2 && (
        <>
          <div className="ct-form">
            <div className="ct-field">
              <label>Choose Video Source</label>
              <p className="ct-hint">Upload a video file or add a link from YouTube, Vimeo, or other platforms.</p>
            </div>

            {/* Source selector */}
            <div className="ct-source-grid">
              <button type="button"
                className={`ct-source-card ${videoMode === "upload" ? "selected" : ""}`}
                onClick={() => setVideoMode("upload")}>
                <span className="ct-source-icon">📁</span>
                <strong>Upload Video</strong>
                <span>Upload a video file from your device</span>
              </button>
              <button type="button"
                className={`ct-source-card ${videoMode === "link" ? "selected" : ""}`}
                onClick={() => setVideoMode("link")}>
                <span className="ct-source-icon">🔗</span>
                <strong>Add Link</strong>
                <span>Use YouTube, Vimeo or other video links</span>
              </button>
            </div>

            {/* Upload mode */}
            {videoMode === "upload" && (
              <div className="ct-field">
                <label>Video File</label>
                <div className="ct-upload-box" onClick={() => videoRef.current?.click()}>
                  {videoUrl && !videoUrl.includes("youtube") && !videoUrl.includes("vimeo") ? (
                    <div className="ct-upload-done">✅ Video ready</div>
                  ) : (
                    <>
                      <div className="ct-upload-icon">🎬</div>
                      <p>Tap to upload or drag and drop</p>
                      <span>MP4, WebM, MOV (Max 500MB)</span>
                    </>
                  )}
                </div>
                <input ref={videoRef} type="file" accept="video/*" style={{ display: "none" }} onChange={handleVideoFile} />
                {videoUploading && <p className="ct-uploading">Uploading… this may take a moment.</p>}
              </div>
            )}

            {/* Link mode */}
            {videoMode === "link" && (
              <div className="ct-field">
                <label>Video Link</label>
                <input
                  type="text"
                  className={`ct-link-input ${linkOk ? "ok" : ""} ${linkErr ? "err" : ""}`}
                  placeholder="https://youtu.be/... or https://vimeo.com/..."
                  value={linkInput}
                  onChange={e => handleLinkChange(e.target.value)}
                />
                {linkOk && <p className="ct-ok-msg">✅ Link recognised{ytId ? " — YouTube video" : ""}</p>}
                {linkErr && <p className="ct-err-msg">⚠️ {linkErr}</p>}
                {ytId && (
                  <div className="ct-yt-card">
                    <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="YouTube preview" className="ct-yt-img" />
                    <div className="ct-yt-meta">
                      <span className="ct-yt-badge">YouTube</span>
                      <span className="ct-yt-id">ID: {ytId}</span>
                      <span className="ct-yt-auto">✅ Thumbnail auto-filled</span>
                    </div>
                  </div>
                )}
                <p className="ct-link-hint">
                  Paste a YouTube link, Vimeo link, or a direct .mp4/.webm video URL.
                </p>
              </div>
            )}

            {/* OR divider */}
            {!videoMode && (
              <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
                Choose a source above to continue.
              </p>
            )}
          </div>

          <div className="ct-nav-row">
            <button type="button" className="ln-btn-ghost" onClick={() => setStep(1)}>← Back</button>
            <button type="button" className="ln-btn-primary" onClick={nextStep2}
              disabled={!videoUrl || videoUploading}>
              Next →
            </button>
          </div>
        </>
      )}

      {/* ══ STEP 3 — Preview ════════════════════════════════════════════ */}
      {step === 3 && (
        <>
          <div className="ct-form">
            <div className="ct-field">
              <label>Preview Your Tutorial</label>
              <p className="ct-hint">Check everything before publishing.</p>
            </div>

            <div className="ct-preview-card">
              {/* Video preview */}
              <div className="ct-preview-video">
                {embedUrl ? (
                  <iframe src={embedUrl} allowFullScreen title={title} />
                ) : videoUrl ? (
                  <video src={videoUrl} controls playsInline style={{ width:"100%", height:"100%" }} />
                ) : (
                  <div className="ct-preview-no-video">
                    <span>▶</span> No video
                  </div>
                )}
              </div>

              {/* Meta preview */}
              <div className="ct-preview-body">
                <div className="ct-preview-title">{title || "Untitled Tutorial"}</div>
                <div className="ct-preview-creator">
                  {creatorName} · {subject || "No subject"}
                  {topic ? ` · ${topic}` : ""}
                </div>
                {description && (
                  <p className="ct-preview-desc">{description}</p>
                )}
              </div>
            </div>
          </div>

          <div className="ct-nav-row">
            <button type="button" className="ln-btn-ghost" onClick={() => setStep(2)}>← Back</button>
            <button type="button" className="ln-btn-primary" onClick={handlePublish} disabled={submitting}>
              {submitting ? "Publishing…" : "Publish Tutorial"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
