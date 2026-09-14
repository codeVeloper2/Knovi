/**
 * QuestionCard — reusable question renderer for Practice / Challenge / Check pages.
 * Renders the appropriate input type based on question.questionType.
 */
export default function QuestionCard({
  question,
  answer,
  setAnswer,
  showHint,
  onToggleHint,
  onSubmit,
  submitting,
  optionStyle = "radio", // "radio" | "card"
}) {
  if (!question) return null;
  const { questionType, question: qText, options, hint } = question;

  return (
    <div className="ls-question-card">
      <p className="ls-question-text">{qText}</p>

      {/* Input by type */}
      {questionType === "multiple_choice" && options?.length > 0 && (
        <div className={`ls-options ${optionStyle === "card" ? "ls-options-cards" : ""}`}>
          {options.map((opt) => {
            const selected = answer === opt.label;
            return optionStyle === "card" ? (
              <button
                key={opt.label}
                className={`ls-option-card ${selected ? "selected" : ""}`}
                onClick={() => setAnswer(opt.label)}
                type="button"
              >
                <span className="ls-option-label">{opt.label}.</span>
                <span>{opt.text}</span>
              </button>
            ) : (
              <label key={opt.label} className={`ls-option-radio ${selected ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="answer"
                  value={opt.label}
                  checked={selected}
                  onChange={() => setAnswer(opt.label)}
                />
                <span className="ls-option-label">{opt.label}.</span>
                <span>{opt.text}</span>
              </label>
            );
          })}
        </div>
      )}

      {questionType === "numeric" && (
        <div className="ls-numeric-wrap">
          <input
            className="ls-input"
            type="number"
            placeholder="Enter your answer (e.g. 3 m/s²)"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
      )}

      {(questionType === "short_answer") && (
        <input
          className="ls-input"
          type="text"
          placeholder="Your answer…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      )}

      {questionType === "explanation" && (
        <textarea
          className="ls-explain-textarea"
          placeholder="Explain your answer…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
        />
      )}

      {/* Hint toggle + Submit */}
      <div className="ls-question-footer">
        {hint && (
          <button className="ls-btn-ghost ls-btn-sm" onClick={onToggleHint} type="button">
            💡 {showHint ? "Hide Hint" : "Hint"}
          </button>
        )}
        <button
          className="ls-btn-primary"
          onClick={onSubmit}
          disabled={!answer.trim() || submitting}
          type="button"
        >
          {submitting ? "Checking…" : "Submit"}
        </button>
      </div>

      {showHint && hint && (
        <div className="ls-hint-box">
          <span className="ls-hint-icon">💡</span>
          <p>{hint}</p>
        </div>
      )}
    </div>
  );
}
