/**
 * LearnStagePage — /app/study-rooms/session/:sessionId/learn
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import { STAGES, pickActivity, ytVideoId } from "./sessionUtils";
import StageBar from "./StageBar";

export default function LearnStagePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getLearningSession(Number(sessionId))
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [sessionId]);

  async function handleNext() {
    try {
      await api.advanceSessionStage(Number(sessionId), "explain");
      navigate(`/app/study-rooms/session/${sessionId}/explain`);
    } catch {
      navigate(`/app/study-rooms/session/${sessionId}/explain`);
    }
  }

  async function handleMarkComplete() {
    await handleNext();
  }

  if (error) return <div className="ls-stage-error">⚠️ {error}</div>;
  if (!session) return <div className="ls-stage-loading"><div className="ls-loading-spinner" /></div>;

  const topic = session.topic || {};
  const activity = pickActivity(topic, "learn");
  const objectives = topic.objectives || [];
  const resources = topic.resources || [];
  const videoResource = resources.find((r) => r.type === "video" && r.url);
  const ytId = videoResource ? ytVideoId(videoResource.url) : null;

  return (
    <div className="ls-stage-page">
      <StageBar current="learn" sessionId={sessionId} />

      <div className="ls-stage-topbar">
        <button className="ls-btn-ghost ls-btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <button className="ls-btn-ghost ls-btn-sm" onClick={handleMarkComplete}>Mark as Complete</button>
      </div>

      <div className="ls-stage-layout">
        <div className="ls-stage-main">
          {/* Stage label */}
          <div className="ls-stage-label">
            <span className="ls-stage-num">1</span>
            <div>
              <p className="ls-stage-type">Learn</p>
              <h2 className="ls-stage-title">{activity?.title || `Introduction to ${topic.name}`}</h2>
              <span className="ls-stage-mins">8 min</span>
            </div>
          </div>

          {/* Activity prompt */}
          {activity?.prompt && (
            <p className="ls-stage-prompt">{activity.prompt}</p>
          )}

          {/* Video embed / thumbnail */}
          {ytId ? (
            <div className="ls-video-embed">
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                title={videoResource.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="ls-video-iframe"
              />
            </div>
          ) : videoResource?.thumbnailUrl ? (
            <a href={videoResource.url} target="_blank" rel="noopener noreferrer" className="ls-video-thumb-link">
              <img src={videoResource.thumbnailUrl} alt={videoResource.title} className="ls-video-thumb" />
              <span className="ls-video-play-overlay">▶ Watch Video</span>
            </a>
          ) : null}
        </div>

        {/* Key takeaways sidebar */}
        <aside className="ls-stage-aside">
          <h3 className="ls-aside-title">Key Takeaways</h3>
          {objectives.length === 0 ? (
            <p className="ls-aside-empty">No objectives defined yet.</p>
          ) : (
            <ul className="ls-takeaways">
              {objectives.map((o) => (
                <li key={o.id} className="ls-takeaway-item">
                  <span className="ls-takeaway-tick">✓</span>
                  <span>{o.title}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <div className="ls-stage-footer">
        <button className="ls-btn-primary ls-stage-next-btn" onClick={handleNext}>
          Next →
        </button>
      </div>
    </div>
  );
}
