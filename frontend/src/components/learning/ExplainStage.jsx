import { useState } from "react";
import * as api from "../../api";

// Simple inline icon components
const Loader = () => (
  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
  </svg>
);

const MessageSquare = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

/**
 * ExplainStage — Student explains concept in their own words
 */
export default function ExplainStage({ conceptId, progress, onComplete }) {
  const [explanation, setExplanation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!explanation.trim()) {
      setError("Please write your explanation before submitting.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await api.post(`/api/v1/concepts/${conceptId}/submit-explanation`, {
        explanation: explanation.trim(),
      });
      
      if (!response.ok) {
        // Check if AI unavailable
        if (response.error?.code === "AI_UNAVAILABLE") {
          setError(response.error.message || "AI verification is temporarily unavailable. Your response has been saved.");
          // Still call onComplete to refresh progress
          if (onComplete) {
            await onComplete();
          }
          return;
        }
        throw new Error(response.message || "Failed to submit explanation");
      }

      // Refresh progress
      if (onComplete) {
        await onComplete();
      }
    } catch (err) {
      console.error("Error submitting explanation:", err);
      setError(err.message || "Failed to submit explanation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="explain-stage">
      <div className="explain-content">
        <div className="explain-header">
          <MessageSquare size={48} className="explain-icon" />
          <h2>Explain It In Your Own Words</h2>
          <p>
            Show that you understand this concept by explaining it in your own words.
            Don't worry about perfect grammar - focus on demonstrating your understanding.
          </p>
        </div>

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        <div className="explanation-input-area">
          <label htmlFor="explanation">Your Explanation:</label>
          <textarea
            id="explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Explain the concept as if you're teaching it to a friend..."
            rows={12}
            className="explanation-textarea"
            disabled={submitting}
          />
          <p className="char-count">
            {explanation.length} characters
            {explanation.length < 100 && " (aim for at least 100)"}
          </p>
        </div>

        <div className="explain-actions">
          <button
            onClick={handleSubmit}
            disabled={submitting || explanation.trim().length < 50}
            className="btn-primary btn-large"
          >
            {submitting ? (
              <>
                <Loader className="spinner" size={20} />
                Submitting for AI Review...
              </>
            ) : (
              "Submit Explanation"
            )}
          </button>
          {explanation.trim().length < 50 && (
            <p className="hint-text">Write at least 50 characters to submit.</p>
          )}
        </div>
      </div>
    </div>
  );
}
