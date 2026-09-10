import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import { SUBJECTS } from "../../subjects";
import * as api from "../../api";

const RULES = [
  "Content must be educational and relevant to the subject.",
  "No harmful, offensive, or misleading material.",
  "Respect copyright — only use content you own or have rights to.",
  "Videos must be in English or include English subtitles where possible.",
];

export default function CreateTutorialPage() {
  const navigate = useNavigate();
  const toast    = useToast();

  const [title,       setTitle]      = useState("");
  const [subject,     setSubject]    = useState("");
  const [topic,       setTopic]      = useState("");
  const [description, setDescription]= useState("");
  const [videoUrl,    setVideoUrl]   = useState("");
  const [thumbUrl,    setThumbUrl]   = useState("");
  const [videoFile,   setVideoFile]  = useState(null);
  const [thumbFile,   setThumbFile]  = useState(null);
  const [uploading,   setUploading]  = useState(false);
  const [submitting,  setSubmitting] = useState(false);
  const [submitted,   setSubmitted]  = useState(false);
  const [agreed,      setAgreed]     = useState(false);

  const videoRef = useRef(null);
  const thumbRef = useRef(null);

  async function handleVideoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setUploading(true);
    try {
      const { url } = await api.uploadLearnVideo(file);
      setVideoUrl(url);
      toast.success("Video uploaded!");
    } catch (err) {
      toast.error(err.message || "Video upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleThumbSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbFile(file);
    setUploading(true);
    try {
      const { url } = await api.uploadLearnThumbnail(file);
      setThumbUrl(url);
    } catch (err) {
      toast.error(err.message || "Thumbnail upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim())   { toast.error("Title is required."); return; }
    if (!subject)        { toast.error("Select a subject."); return; }
    if (!agreed)         { toast.error("Please agree to the content guidelines."); return; }

    setSubmitting(true);
    try {
      await api.createTutorial({
        title: title.trim(),
        subject,
        topic: topic.trim(),
        description: description.trim(),
        videoUrl,
        thumbnailUrl: thumbUrl,
      });
      setSubmitted(true);
    } catch (err) {
      toast.error(err.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="cr-success">
        <div className="cr-success-icon">🎉</div>
        <h2>Tutorial Submitted!</h2>
        <p>Your tutorial is now <strong>pending review</strong>. We'll check it for content guidelines and publish it once approved.</p>
        <div className="cr-status-flow">
          <div className="cr-status-step done">Upload</div>
          <div className="cr-status-arrow">→</div>
          <div className="cr-status-step active">Pending Review</div>
          <div className="cr-status-arrow">→</div>
          <div className="cr-status-step">Approved</div>
          <div className="cr-status-arrow">→</div>
          <div className="cr-status-step">Published</div>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
          <button type="button" className="cd-save-btn" onClick={() => navigate("/app/learn/tutorials?tab=mine")}>My Uploads</button>
          <button type="button" className="lh-cta-btn" onClick={() => navigate("/app/learn")}>Back to Learn</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cr-page">
      <button type="button" className="cd-back" onClick={() => navigate("/app/learn/tutorials")}>
        ← Back to Tutorials
      </button>
      <h1 className="cr-title">Upload a Tutorial</h1>
      <p className="cr-subtitle">Share your knowledge with fellow students. Tutorials go through a brief review before publishing.</p>

      <form className="cr-form" onSubmit={handleSubmit}>
        {/* Title */}
        <div className="cr-field">
          <label>Title <span className="cr-req">*</span></label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder='e.g. "RTF Explained Simply"' maxLength={200} />
        </div>

        {/* Subject + Topic */}
        <div className="cr-row">
          <div className="cr-field">
            <label>Subject <span className="cr-req">*</span></label>
            <select value={subject} onChange={e => setSubject(e.target.value)}>
              <option value="">Select subject…</option>
              {SUBJECTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="cr-field">
            <label>Topic <span className="cr-optional">(optional)</span></label>
            <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
              placeholder='e.g. "Reduced Tax Facility"' maxLength={120} />
          </div>
        </div>

        {/* Description */}
        <div className="cr-field">
          <label>Description <span className="cr-optional">(optional)</span></label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="What will students learn from this tutorial?"
            rows={4} maxLength={1000} />
        </div>

        {/* Video upload */}
        <div className="cr-field">
          <label>Video <span className="cr-optional">(MP4, WebM, MOV · max 500 MB)</span></label>
          <div className="cr-upload-area" onClick={() => videoRef.current?.click()}>
            {videoFile ? (
              <div className="cr-upload-done">
                <span>✅ {videoFile.name}</span>
                {videoUrl && <span className="cr-upload-ok">Uploaded</span>}
              </div>
            ) : (
              <>
                <div className="cr-upload-icon">🎬</div>
                <p>Click to select a video file</p>
                <span>or drag and drop</span>
              </>
            )}
          </div>
          <input ref={videoRef} type="file" accept="video/*" style={{ display: "none" }} onChange={handleVideoSelect} />
          {uploading && <p className="cr-uploading">Uploading… please wait</p>}
        </div>

        {/* Thumbnail */}
        <div className="cr-field">
          <label>Thumbnail <span className="cr-optional">(JPG, PNG · max 5 MB)</span></label>
          <div className="cr-upload-area cr-upload-area--small" onClick={() => thumbRef.current?.click()}>
            {thumbUrl ? (
              <img src={thumbUrl} alt="thumbnail preview" className="cr-thumb-preview" />
            ) : (
              <>
                <div className="cr-upload-icon">🖼️</div>
                <p>Click to upload a thumbnail</p>
              </>
            )}
          </div>
          <input ref={thumbRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleThumbSelect} />
        </div>

        {/* Content rules */}
        <div className="cr-rules">
          <h3>Content Guidelines</h3>
          <ul>
            {RULES.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <label className="cr-agree">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            I confirm this content follows the guidelines above.
          </label>
        </div>

        <div className="cr-actions">
          <button type="button" className="cd-save-btn" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="lh-cta-btn" disabled={submitting || uploading}>
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        </div>
      </form>
    </div>
  );
}
