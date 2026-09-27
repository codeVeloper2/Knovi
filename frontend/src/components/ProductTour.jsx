import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./product-tour.css";

/**
 * First-time product tour for registered students.
 * Explains Knovi and each main nav destination.
 *
 * Usage:
 *   <ProductTour open={open} onClose={finish} userId={uid} />
 *
 * Persistence: localStorage key knovi_nav_tour_v1:<userId|anon>
 */

export const TOUR_STORAGE_PREFIX = "knovi_nav_tour_v1";

export function tourStorageKey(userId) {
  return `${TOUR_STORAGE_PREFIX}:${userId || "anon"}`;
}

export function hasCompletedTour(userId) {
  try {
    return localStorage.getItem(tourStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markTourComplete(userId) {
  try {
    localStorage.setItem(tourStorageKey(userId), "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearTourComplete(userId) {
  try {
    localStorage.removeItem(tourStorageKey(userId));
  } catch {
    /* ignore */
  }
}

/** Ordered steps. `target` matches data-tour="…" on a nav element. */
export const TOUR_STEPS = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to Knovi 👋",
    body: "Knovi helps you learn smarter with AI, find study partners, and track your growth. This quick tour shows what each part of the app is for.",
  },
  {
    id: "home",
    target: "home",
    title: "Home",
    body: "Your dashboard. See streaks, pick up active learning sessions, and check recent activity — all in one place.",
  },
  {
    id: "discover",
    target: "discover",
    title: "Discover",
    body: "Find other students by subject, class, or interests. Send match requests and build your study circle.",
  },
  {
    id: "chat",
    target: "chat",
    title: "Chat",
    body: "Message peers you’ve matched with. Ask questions, share notes, and coordinate study sessions.",
  },
  {
    id: "challenge",
    target: "challenge",
    title: "Challenge",
    body: "Compete or practice with peers. Challenges make revision more fun and help you lock in what you’ve learned.",
  },
  {
    id: "learn",
    target: "learn",
    title: "Learn",
    body: "The heart of Knovi. Browse subjects and concepts, then learn with KnoAI in a guided Learning Room — teach, practice, and master topics.",
  },
  {
    id: "progress",
    target: "progress",
    title: "Progress",
    body: "See how you’re improving over time — activity, strengths, and areas to revisit so you always know what’s next.",
  },
  {
    id: "settings",
    target: "settings",
    title: "Settings",
    body: "Update your profile, learning preferences, security, and notifications. Keep your account tuned to how you study.",
  },
  {
    id: "done",
    target: null,
    title: "You’re all set ✨",
    body: "Tip: press Shift+K, then a letter (H, D, E, C, L, P, S) to jump around the app from the keyboard. Press ? anytime for the full shortcut list.",
  },
];

const PAD = 10;

function measureTarget(selector) {
  if (!selector) return null;
  const el = document.querySelector(`[data-tour="${selector}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    bottom: r.bottom,
    right: r.right,
  };
}

function tooltipPosition(hole, tipW, tipH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 14;

  if (!hole) {
    return {
      top: Math.max(24, (vh - tipH) / 2),
      left: Math.max(16, (vw - tipW) / 2),
    };
  }

  // Prefer below the target; flip above if not enough room.
  let top = hole.top + hole.height + gap;
  if (top + tipH > vh - 16) {
    top = hole.top - tipH - gap;
  }
  if (top < 16) top = 16;

  let left = hole.cx - tipW / 2;
  left = Math.min(Math.max(16, left), vw - tipW - 16);

  return { top, left };
}

export default function ProductTour({ open, onClose, userId }) {
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState(null);
  const [tipPos, setTipPos] = useState({ top: 80, left: 24 });

  const step = TOUR_STEPS[index];
  const total = TOUR_STEPS.length;
  const isLast = index === total - 1;

  const finish = useCallback(() => {
    markTourComplete(userId);
    onClose?.();
  }, [userId, onClose]);

  const goNext = useCallback(() => {
    if (isLast) finish();
    else setIndex((i) => i + 1);
  }, [isLast, finish]);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Reset when opened.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Measure target + place tooltip; re-measure on resize/scroll.
  useLayoutEffect(() => {
    if (!open || !step) return undefined;

    function update() {
      const nextHole = measureTarget(step.target);
      setHole(nextHole);
      // Rough tip size; refined after paint via ref not needed for good UX.
      const tipW = Math.min(360, window.innerWidth - 32);
      const tipH = 200;
      setTipPos(tooltipPosition(nextHole, tipW, tipH));
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step]);

  // Keyboard: Esc skip, arrows, Enter next.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, finish, goNext, goBack]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const spotlightStyle = useMemo(() => {
    if (!hole) {
      return {
        clipPath: "none",
        background: "rgba(2, 8, 20, 0.72)",
      };
    }
    const { top, left, width, height } = hole;
    // Four rects via polygon hole in overlay.
    return {
      clipPath: `polygon(
        0% 0%, 0% 100%, ${left}px 100%, ${left}px ${top}px,
        ${left + width}px ${top}px, ${left + width}px ${top + height}px,
        ${left}px ${top + height}px, ${left}px 100%, 100% 100%, 100% 0%
      )`,
      background: "rgba(2, 8, 20, 0.78)",
    };
  }, [hole]);

  if (!open || !step) return null;

  return createPortal(
    <div className="ptour" role="dialog" aria-modal="true" aria-label="Product tour">
      <div className="ptour-overlay" style={spotlightStyle} onClick={finish} />

      {hole && (
        <div
          className="ptour-spotlight"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
          }}
          aria-hidden="true"
        />
      )}

      <div
        className={`ptour-card${hole ? " ptour-card--anchored" : " ptour-card--center"}`}
        style={{ top: tipPos.top, left: tipPos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ptour-progress">
          <span>
            {index + 1} / {total}
          </span>
          <div className="ptour-dots" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <i key={s.id} className={i === index ? "on" : i < index ? "done" : ""} />
            ))}
          </div>
        </div>

        <h2>{step.title}</h2>
        <p>{step.body}</p>

        <div className="ptour-actions">
          <button type="button" className="ptour-btn ghost" onClick={finish}>
            Skip
          </button>
          <div className="ptour-actions-right">
            {index > 0 && (
              <button type="button" className="ptour-btn ghost" onClick={goBack}>
                Back
              </button>
            )}
            <button type="button" className="ptour-btn primary" onClick={goNext}>
              {isLast ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
