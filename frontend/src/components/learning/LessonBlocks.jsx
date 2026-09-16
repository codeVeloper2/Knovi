/**
 * LessonBlocks — Dedicated UI components for each AI lesson block type.
 *
 * Block types supported:
 *   explanation, key_idea, analogy, example, worked_example, formula,
 *   comparison, step_by_step, misconception, application, visual, quick_check,
 *   reflection, key_points, summary
 */
import { useState } from "react";

// ─── Shared icons ─────────────────────────────────────────────────────────────

export function IconLightbulb() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" /><path d="M10 22h4" />
    </svg>
  );
}
export function IconAnalogy() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
    </svg>
  );
}
export function IconExample() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
export function IconSteps() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
export function IconFormula() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
    </svg>
  );
}
export function IconAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  );
}
export function IconReflect() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
export function IconSummary() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
export function IconKeyPoints() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

// ─── Block: Explanation ───────────────────────────────────────────────────────

export function ExplanationBlock({ block }) {
  return (
    <div className="lb-block lb-explanation">
      {block.title && <h3 className="lb-block-title">{block.title}</h3>}
      <p className="lb-block-text">{block.content}</p>
    </div>
  );
}

// ─── Block: Key Idea ──────────────────────────────────────────────────────────

export function KeyIdeaBlock({ block }) {
  return (
    <div className="lb-block lb-key-idea">
      <div className="lb-key-idea-accent" />
      <div className="lb-key-idea-body">
        <div className="lb-block-tag">
          <IconLightbulb /> Key Idea
        </div>
        {block.title && <h3 className="lb-block-title">{block.title}</h3>}
        <p className="lb-key-idea-text">{block.content}</p>
      </div>
    </div>
  );
}

// ─── Block: Analogy ───────────────────────────────────────────────────────────

export function AnalogyBlock({ block }) {
  return (
    <div className="lb-block lb-analogy">
      <div className="lb-block-tag">
        <IconAnalogy /> Think of it this way
      </div>
      {block.title && <h3 className="lb-block-title">{block.title}</h3>}
      <p className="lb-analogy-text">{block.content}</p>
    </div>
  );
}

// ─── Block: Example ───────────────────────────────────────────────────────────

export function ExampleBlock({ block }) {
  return (
    <div className="lb-block lb-example">
      <div className="lb-block-tag">
        <IconExample /> Example
      </div>
      {block.title && <h3 className="lb-block-title">{block.title}</h3>}
      <p className="lb-block-text">{block.content}</p>
    </div>
  );
}

// ─── Block: Worked Example ────────────────────────────────────────────────────

export function WorkedExampleBlock({ block }) {
  const steps = Array.isArray(block.steps) ? block.steps : [];
  return (
    <div className="lb-block lb-worked-example">
      <div className="lb-block-tag">
        <IconSteps /> Worked Example
      </div>
      {block.title && <h3 className="lb-block-title">{block.title}</h3>}
      {block.problem && (
        <div className="lb-we-problem">
          <span className="lb-we-label">Problem</span>
          <p>{block.problem}</p>
        </div>
      )}
      {steps.length > 0 && (
        <div className="lb-we-steps">
          <span className="lb-we-label">Solution</span>
          <ol className="lb-we-step-list">
            {steps.map((step, i) => (
              <li key={i} className="lb-we-step">
                <span className="lb-we-step-num">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {block.answer && (
        <div className="lb-we-answer">
          <span className="lb-we-label">Answer</span>
          <p className="lb-we-answer-text">{block.answer}</p>
        </div>
      )}
    </div>
  );
}

// ─── Block: Formula ───────────────────────────────────────────────────────────

export function FormulaBlock({ block }) {
  const variables = Array.isArray(block.variables) ? block.variables : [];
  return (
    <div className="lb-block lb-formula">
      <div className="lb-block-tag">
        <IconFormula /> Formula
      </div>
      {block.title && <h3 className="lb-block-title">{block.title}</h3>}
      <div className="lb-formula-display">
        <code className="lb-formula-code">{block.formula}</code>
      </div>
      {variables.length > 0 && (
        <div className="lb-formula-vars">
          <div className="lb-we-label">Variables</div>
          <div className="lb-formula-var-list">
            {variables.map((v, i) => (
              <div key={i} className="lb-formula-var">
                <code className="lb-formula-var-sym">{v.symbol}</code>
                <span className="lb-formula-var-eq">=</span>
                <span className="lb-formula-var-def">
                  {v.meaning}{v.unit ? <em> ({v.unit})</em> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {block.when_to_use && (
        <p className="lb-formula-usage">
          <strong>When to use:</strong> {block.when_to_use}
        </p>
      )}
    </div>
  );
}

// ─── Block: Comparison ────────────────────────────────────────────────────────

export function ComparisonBlock({ block }) {
  const left = block.left || {};
  const right = block.right || {};
  return (
    <div className="lb-block lb-comparison">
      {block.title && <h3 className="lb-block-title">{block.title}</h3>}
      <div className="lb-comparison-grid">
        <div className="lb-comparison-col lb-comparison-left">
          <div className="lb-comparison-label">{left.label || "Option A"}</div>
          <ul className="lb-comparison-points">
            {(left.points || []).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="lb-comparison-divider" />
        <div className="lb-comparison-col lb-comparison-right">
          <div className="lb-comparison-label">{right.label || "Option B"}</div>
          <ul className="lb-comparison-points">
            {(right.points || []).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Block: Step by Step ──────────────────────────────────────────────────────

export function StepByStepBlock({ block }) {
  const steps = Array.isArray(block.steps) ? block.steps : [];
  return (
    <div className="lb-block lb-step-by-step">
      <div className="lb-block-tag">
        <IconSteps /> Step by Step
      </div>
      {block.title && <h3 className="lb-block-title">{block.title}</h3>}
      <ol className="lb-sbs-list">
        {steps.map((step, i) => (
          <li key={i} className="lb-sbs-item">
            <span className="lb-sbs-num">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Block: Misconception ─────────────────────────────────────────────────────

export function MisconceptionBlock({ block }) {
  return (
    <div className="lb-block lb-misconception">
      <div className="lb-block-tag lb-block-tag-warn">
        <IconAlert /> Common Mistake
      </div>
      {block.title && <h3 className="lb-block-title">{block.title}</h3>}
      {block.mistake && (
        <div className="lb-misc-mistake">
          <span className="lb-misc-label lb-misc-label-wrong">✗ Often thought:</span>
          <p>{block.mistake}</p>
        </div>
      )}
      {block.correction && (
        <div className="lb-misc-correction">
          <span className="lb-misc-label lb-misc-label-right">✓ Actually:</span>
          <p>{block.correction}</p>
        </div>
      )}
      {/* fallback: content field */}
      {!block.mistake && block.content && <p className="lb-block-text">{block.content}</p>}
    </div>
  );
}

// ─── Block: Reflection ────────────────────────────────────────────────────────

export function ReflectionBlock({ block }) {
  return (
    <div className="lb-block lb-reflection">
      <div className="lb-block-tag lb-block-tag-reflect">
        <IconReflect /> Think About This
      </div>
      <p className="lb-reflection-question">{block.question || block.content}</p>
    </div>
  );
}

// ─── Block: Key Points ────────────────────────────────────────────────────────

export function KeyPointsBlock({ block }) {
  const items = Array.isArray(block.items) ? block.items : [];
  return (
    <div className="lb-block lb-key-points">
      <div className="lb-block-tag">
        <IconKeyPoints /> {block.title || "Key Takeaways"}
      </div>
      <ul className="lb-kp-list">
        {items.map((item, i) => (
          <li key={i} className="lb-kp-item">
            <span className="lb-kp-dot" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Block: Summary ───────────────────────────────────────────────────────────

export function SummaryBlock({ block }) {
  return (
    <div className="lb-block lb-summary">
      <div className="lb-block-tag lb-block-tag-success">
        <IconSummary /> {block.title || "What You Learned"}
      </div>
      <p className="lb-summary-text">{block.content}</p>
    </div>
  );
}

// ─── Block: Application ───────────────────────────────────────────────────────

export function ApplicationBlock({ block }) {
  return (
    <div className="lb-block lb-application">
      <div className="lb-block-tag lb-block-tag-app">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        Real-World Application
      </div>
      {block.title && <h3 className="lb-block-title">{block.title}</h3>}
      <p className="lb-block-text">{block.content}</p>
    </div>
  );
}

// ─── Block: Visual ────────────────────────────────────────────────────────────

export function VisualBlock({ block }) {
  const elements = Array.isArray(block.elements) ? block.elements : [];
  return (
    <div className="lb-block lb-visual">
      <div className="lb-block-tag lb-block-tag-visual">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        Visual Explanation
      </div>
      {block.title && <h3 className="lb-block-title">{block.title}</h3>}
      {block.description && <p className="lb-visual-desc">{block.description}</p>}
      {elements.length > 0 && (
        <div className="lb-visual-elements">
          {elements.map((el, i) => (
            <div key={i} className="lb-visual-element">{el}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Block: Quick Check ───────────────────────────────────────────────────────

export function QuickCheckBlock({ block }) {
  const [selected, setSelected] = useState(null);
  const options = block.options || {};
  const correct = block.answer;

  function handleSelect(letter) {
    if (selected !== null) return; // lock after first pick
    setSelected(letter);
  }

  return (
    <div className="lb-block lb-quick-check">
      <div className="lb-block-tag lb-block-tag-qc">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
        </svg>
        Quick Check
      </div>
      <p className="lb-qc-question">{block.question}</p>
      <div className="lb-qc-options">
        {["A", "B", "C", "D"].map(letter => {
          const text = options[letter];
          if (!text) return null;
          let cls = "lb-qc-option";
          if (selected !== null) {
            if (letter === correct) cls += " qc-correct";
            else if (letter === selected) cls += " qc-wrong";
          }
          return (
            <button key={letter} className={cls} onClick={() => handleSelect(letter)} disabled={selected !== null}>
              <span className="lb-qc-letter">{letter}</span>
              <span>{text}</span>
            </button>
          );
        })}
      </div>
      {selected !== null && block.explanation && (
        <div className={`lb-qc-feedback ${selected === correct ? "qc-fb-correct" : "qc-fb-wrong"}`}>
          {selected === correct ? "✓ Correct! " : "✗ Not quite. "}
          {block.explanation}
        </div>
      )}
    </div>
  );
}

// ─── Block dispatcher ─────────────────────────────────────────────────────────

export function LessonBlock({ block }) {
  if (!block?.type) return null;
  switch (block.type) {
    case "explanation":    return <ExplanationBlock block={block} />;
    case "key_idea":       return <KeyIdeaBlock block={block} />;
    case "analogy":        return <AnalogyBlock block={block} />;
    case "example":        return <ExampleBlock block={block} />;
    case "worked_example": return <WorkedExampleBlock block={block} />;
    case "formula":        return <FormulaBlock block={block} />;
    case "comparison":     return <ComparisonBlock block={block} />;
    case "step_by_step":   return <StepByStepBlock block={block} />;
    case "misconception":  return <MisconceptionBlock block={block} />;
    case "application":    return <ApplicationBlock block={block} />;
    case "visual":         return <VisualBlock block={block} />;
    case "quick_check":    return <QuickCheckBlock block={block} />;
    case "reflection":     return <ReflectionBlock block={block} />;
    case "key_points":     return <KeyPointsBlock block={block} />;
    case "summary":        return <SummaryBlock block={block} />;
    default:               return <ExplanationBlock block={block} />;
  }
}
