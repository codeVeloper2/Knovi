import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import { SUBJECTS } from "../../subjects";
import * as api from "../../api";

function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

const RULES = [
  "Content must be educational and relevant to the subject.",
  "No harmful, offensive, or misleading material.",
  "Respect copyright — only use content you own or have rights to.",
  "Videos must be clear enough for students to learn from.",
];

export default function CreateTutorialPage() {
  const navigate = useNavigate();
  const toast    = useToast();

  const [title,       setTitle]       = useState("");
  const [subject,     setSubject]     = useState("");
  const [topic,       setTopic]       = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl,    setVideoUrl]    = useState("");
  const [thumbUrl,    setThumbUrl]    = useState("");
  const [linkInput,   setLinkInput]   = useState("");
  const [linkOk,      setLinkOk]      = useState(false);
  const [linkErr,     setLinkErr]     = useState("");
  const [mode,        setMode]        = useState("link"); // "link" | "upload"
  const [uploading,   setUploading]   = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [agreed,      setAgreed]      = useState(false);

  const videoFileRef = useRef(null);
  const thumbFileRef = useRef(null);

  // ── YouTube / link handling ─────────────────────────────────────────
  function handleLinkChange(val) {
    setLinkInput(val);
    setLinkErr("");
    setLinkOk(false);
    if (!val.trim()) { setVideoUrl(""); return; }

    const ytId = extractYouTubeId(val.trim());
    if (ytId) {
      setVideoUrl(`https://www.youtube.com/embed/${ytId}`);
      if (!thumbUrl) setThumbUrl(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
      setLinkOk(true);
      return;
    }
    if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(val.trim())) {
      setVideoUrl(val.trim());
      setLinkOk(true);
      return;
    }
    setLinkErr("Paste a YouTube link or a direct .mp4/.webm video URL.");
  }

  // ── File uploads ────────────────────────────────────────────────────
  async function handleVideoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.uploadLearnVideo(file);
      setVideoUrl(url);
      toast.success("Video uploaded!");
    } catch (err) {
      toast.error(err.message || "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleThumbFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.uploadLearnThumbnail(file);
      setThumbUrl(url);
    } catch (err) {
      toast.error(err.message || "Image upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title is required."); return; }
    if (!subject)      { toast.error("Select a subject."); return; }
    if (!videoUrl)     { toast.error("Add a video link or upload a file."); return; }
    if (!agreed)       { toast.error("Agree to the content guidelines first."); return; }

    setSubmitting(true);
    try {
      await api.createTutorial({
        title: title.trim(), subject, topic: topic.trim(),
        description: description.trim(), videoUrl, thumbnailUrl: thumbUrl,
      });
      setSubmitted(true);
    } catch (err) {
      toast.error(err.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const ytId = extractYouTubeId(linkInput);

  // ── Success screen ──────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="ct-success">
        <div className="ct-success-icon">🎉</div>
        <h2>Tutorial Published!</h2>
        <p>Your tutorial is now <strong>live</strong> and visible to all students.</p>
        <div className="ct-status-row">
          <span className="ct-status-pill done">Submitted</span>
          <span className="ct-arrow">→</span>
          <span className="ct-status-pill done">Published ✓</span>
        </div>
        <div className="ct-success-btns">
          <button type="button" className="ct-btn-ghost" onClick={() => navigate("/app/learn/tutorials")}>
            View Tutorials
          </button>
          <button type="button" className="ct-btn-primary" onClick={() => navigate("/app/learn")}>
            Back to Learn
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ct-page">
      <button type="button" className="ct-back" onClick={() => navigate("/app/learn/tutorials")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Tutorials
      </button>

      <div className="ct-header">
        <h1>Upload a Tutorial</h1>
        <p>Share your knowledge with fellow students. Your tutorial goes live immediately.</p>
      </div>

      <form className="ct-form" onSubmit={handleSubmit}>

        {/* ── Title ── */}
        <div className="ct-field">
          <label>Title <span className="ct-req">*</span></label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Newton Laws Made Easy"
            maxLength={200}
          />
        </div>

        {/* ── Subject + Topic ── */}
        <div className="ct-row">
          <div className="ct-field">
            <label>Subject <span className="ct-req">*</span></label>
            <select value={subject} onChange={e => setSubject(e.target.value)}>
              <option value="">Select subject...</option>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="ct-field">
            <label>Topic <span className="ct-opt">(optional)</span></label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Newton Laws"
              maxLength={120}
            />
          </div>
        </div>

        {/* ── Description ── */}
        <div className="ct-field">
          <label>Description <span className="ct-opt">(optional)</span></label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What will students learn from this tutorial?"
            rows={3}
            maxLength={1000}
          />
        </div>

        {/* ── Video ── */}
        <div className="ct-field">
          <label>Video <span className="ct-req">*</span></label>

          {/* Mode toggle */}
          <div className="ct-toggle">
            <button type="button" className={`ct-toggle-btn ${mode === "link" ? "active" : ""}`} onClick={() => setMode("link")}>
              🔗 Paste a link
            </button>
            <button type="button" className={`ct-toggle-btn ${mode === "upload" ? "active" : ""}`} onClick={() => setMode("upload")}>
              📁 Upload file
            </button>
          </div>

          {mode === "link" && (
            <div className="ct-link-area">
              <input
                type="text"
                className={`ct-link-input ${linkOk ? "ok" : ""} ${linkErr ? "err" : ""}`}
                placeholder="https://youtu.be/..."
                value={linkInput}
                onChange={e => handleLinkChange(e.target.value)}
              />
              {linkOk && <p className="ct-ok-msg">✅ Link recognised{ytId ? " — YouTube video" : ""}</p>}
              {linkErr && <p className="ct-err-msg">⚠️ {linkErr}</p>}

              {ytId && (
                <div className="ct-yt-card">
                  <img
                    src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                    alt="YouTube thumbnail"
                    className="ct-yt-img"
                  />
                  <div className="ct-yt-meta">
                    <span className="ct-yt-badge">YouTube</span>
                    <span className="ct-yt-id">ID: {ytId}</span>
                    <span className="ct-yt-auto">✅ Cover image auto-filled</span>
                  </div>
                </div>
              )}

              <p className="ct-link-hint">
                Paste a YouTube link (youtu.be/... or youtube.com/watch?v=...) or a direct .mp4 URL.
              </p>
            </div>
          )}

          {mode === "upload" && (
            <div>
              <div className="ct-upload-box" onClick={() => videoFileRef.current?.click()}>
                {videoUrl && !videoUrl.includes("youtube") ? (
                  <div className="ct-upload-done">✅ Video ready</div>
                ) : (
                  <>
                    <div className="ct-upload-icon">🎬</div>
                    <p>Click to select a video file</p>
                    <span>MP4, WebM, MOV · max 500 MB</span>
                  </>
                )}
              </div>
              <input ref={videoFileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={handleVideoFile} />
              {uploading && <p className="ct-uploading">Uploading...</p>}
            </div>
          )}
        </div>

        {/* ── Cover image ── */}
        <div className="ct-field">
          <label>Cover Image <span className="ct-opt">(optional)</span></label>
          <p className="ct-hint">
            The preview image shown on the tutorial card — like a YouTube thumbnail.
            If you pasted a YouTube link above, this was filled automatically.
          </p>
          <div className="ct-upload-box ct-upload-box--small" onClick={() => thumbFileRef.current?.click()}>
            {thumbUrl ? (
              <div className="ct-thumb-preview">
                <img src={thumbUrl} alt="Cover preview" />
                <span>Click to change</span>
              </div>
            ) : (
              <>
                <div className="ct-upload-icon">🖼️</div>
                <p>Upload a cover image</p>
                <span>JPG or PNG · max 5 MB</span>
              </>
            )}
          </div>
          <input ref={thumbFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleThumbFile} />
        </div>

        {/* ── Guidelines ── */}
        <div className="ct-rules">
          <h3>Content Guidelines</h3>
          <ul>
            {RULES.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <label className="ct-agree">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            I confirm this content follows the guidelines above.
          </label>
        </div>

        {/* ── Actions ── */}
        <div className="ct-actions">
          <button type="button" className="ct-btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="ct-btn-primary" disabled={submitting || uploading || !videoUrl}>
            {submitting ? "Submitting..." : "Submit for Review"}
          </button>
        </div>
      </form>
    </div>
  );
}
