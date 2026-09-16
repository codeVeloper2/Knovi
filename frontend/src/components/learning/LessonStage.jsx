import { useState, useEffect } from "react";
import * as api from "../../api";

// Simple inline icon components
const Loader = () => (
  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
  </svg>
);

const BookOpen = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const CheckCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

/**
 * LessonStage — Display AI-generated lesson and track completion
 */
export default function LessonStage({ conceptId, progress, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lesson, setLesson] = useState(null);
  const [error, setError] = useState(null);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    // Load existing lesson if already generated
    if (progress?.lessonContent) {
      setLesson(progress.lessonContent);
    }
  }, [progress]);

  const handleGenerateLesson = async () => {
    try {
      setGenerating(true);
      setError(null);

      const response = await api.post(`/api/v1/concepts/${conceptId}/generate-lesson`);
      
      if (!response.ok) {
        throw new Error(response.message || "Failed to generate lesson");
      }

      setLesson(response.lesson);
    } catch (err) {
      console.error("Error generating lesson:", err);
      setError(err.message || "Failed to generate lesson. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCompleteLesson = async () => {
    try {
      setCompleting(true);
      setError(null);

      const response = await api.post(`/api/v1/concepts/${conceptId}/complete-lesson`);
      
      if (!response.ok) {
        throw new Error(response.message || "Failed to complete lesson");
      }

      // Refresh progress to unlock checkpoint
      if (onComplete) {
        await onComplete();
      }
    } catch (err) {
      console.error("Error completing lesson:", err);
      setError(err.message || "Failed to complete lesson. Please try again.");
    } finally {
      setCompleting(false);
    }
  };

  // If lesson not generated yet
  if (!lesson && !progress?.lessonContent) {
    return (
      <div className="lesson-stage">
        <div className="lesson-intro">
          <BookOpen size={48} className="lesson-intro-icon" />
          <h2>Ready to Learn?</h2>
          <p>
            Your AI tutor will create a personalized lesson for this concept.
            The lesson will take about 5-10 minutes to complete.
          </p>
          
          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}

          <button
            onClick={handleGenerateLesson}
            disabled={generating}
            className="btn-primary btn-large"
          >
            {generating ? (
              <>
                <Loader className="spinner" size={20} />
                Generating Your Lesson...
              </>
            ) : (
              "Generate Lesson"
            )}
          </button>
        </div>
      </div>
    );
  }

  // Lesson generated, display it
  const lessonData = lesson || progress?.lessonContent;
  const isCompleted = progress?.lessonCompleted;

  return (
    <div className="lesson-stage">
      <div className="lesson-content">
        {/* Lesson Header */}
        <div className="lesson-header">
          <h2 className="lesson-title">{lessonData.title}</h2>
          {isCompleted && (
            <div className="lesson-completed-badge">
              <CheckCircle size={20} />
              <span>Completed</span>
            </div>
          )}
        </div>

        {/* Introduction */}
        {lessonData.introduction && (
          <div className="lesson-section">
            <p className="lesson-introduction">{lessonData.introduction}</p>
          </div>
        )}

        {/* Sections */}
        {lessonData.sections && lessonData.sections.map((section, idx) => (
          <div key={idx} className="lesson-section">
            <h3 className="lesson-section-heading">{section.heading}</h3>
            <div className="lesson-section-content">
              <p>{section.content}</p>
            </div>
            
            {section.keyPoints && section.keyPoints.length > 0 && (
              <div className="lesson-key-points">
                <h4>Key Points:</h4>
                <ul>
                  {section.keyPoints.map((point, pidx) => (
                    <li key={pidx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {/* Examples */}
        {lessonData.examples && lessonData.examples.length > 0 && (
          <div className="lesson-examples">
            <h3>Examples</h3>
            {lessonData.examples.map((example, idx) => (
              <div key={idx} className="lesson-example">
                <h4>{example.title}</h4>
                <p>{example.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {lessonData.summary && (
          <div className="lesson-summary">
            <h3>Summary</h3>
            <p>{lessonData.summary}</p>
          </div>
        )}

        {/* Complete Button */}
        {!isCompleted && (
          <div className="lesson-actions">
            {error && (
              <div className="error-message">
                <p>{error}</p>
              </div>
            )}
            
            <button
              onClick={handleCompleteLesson}
              disabled={completing}
              className="btn-primary btn-large"
            >
              {completing ? (
                <>
                  <Loader className="spinner" size={20} />
                  Completing...
                </>
              ) : (
                "Complete Lesson"
              )}
            </button>
            <p className="lesson-actions-hint">
              Make sure you understand the material before proceeding to the checkpoint.
            </p>
          </div>
        )}

        {isCompleted && (
          <div className="lesson-completed-message">
            <CheckCircle size={24} />
            <p>Lesson completed! Proceed to the Checkpoint stage.</p>
          </div>
        )}
      </div>
    </div>
  );
}
