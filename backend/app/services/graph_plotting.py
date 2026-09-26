"""Live graph plotting for AI Learning (Math + Physics MVP).

The AI emits a structured plot plan. This module:
  1. Validates / normalises the plan
  2. Deterministically verifies coordinates against meta
  3. Builds correction steps when verification fails
  4. Returns a payload safe to attach on teaching message.extra["plot"]

Frontend plays steps with animation; it never invents math.
"""
from __future__ import annotations

import ast
import logging
import math
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

ALLOWED_CONCEPTS = {"quadratic_graphs", "displacement_time_graphs"}
ALLOWED_OPS = {
    "say", "pause", "set_axes", "draw_function", "draw_polyline",
    "point", "segment", "vline", "hline", "erase", "clear", "done",
}
MAX_STEPS = 40
MAX_ATTEMPTS = 2
EPS = 1e-2

# ── Safe expression evaluation ───────────────────────────────────────────────

_ALLOWED_FUNCS = {
    "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "asin": math.asin, "acos": math.acos, "atan": math.atan,
    "sqrt": math.sqrt, "abs": abs, "log": math.log, "ln": math.log,
    "log10": math.log10, "exp": math.exp,
    "floor": math.floor, "ceil": math.ceil,
}
_ALLOWED_CONSTS = {"pi": math.pi, "e": math.e}


class _SafeEval(ast.NodeVisitor):
    def visit(self, node):  # type: ignore[override]
        if isinstance(node, ast.Expression):
            return self.visit(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.Num):  # py<3.8 compat
            return float(node.n)
        if isinstance(node, ast.Name):
            if node.id == "x" or node.id == "t":
                return None  # placeholder replaced by caller
            if node.id in _ALLOWED_CONSTS:
                return _ALLOWED_CONSTS[node.id]
            raise ValueError(f"Name not allowed: {node.id}")
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            v = self.visit(node.operand)
            return v if isinstance(node.op, ast.UAdd) else -v
        if isinstance(node, ast.BinOp) and type(node.op) in (
            ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod,
        ):
            a, b = self.visit(node.left), self.visit(node.right)
            op = node.op
            if isinstance(op, ast.Add):
                return a + b
            if isinstance(op, ast.Sub):
                return a - b
            if isinstance(op, ast.Mult):
                return a * b
            if isinstance(op, ast.Div):
                return a / b
            if isinstance(op, ast.Pow):
                if abs(b) > 12:
                    raise ValueError("Exponent too large")
                return a ** b
            if isinstance(op, ast.Mod):
                return a % b
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id not in _ALLOWED_FUNCS:
                raise ValueError(f"Function not allowed: {node.func.id}")
            args = [self.visit(a) for a in node.args]
            return _ALLOWED_FUNCS[node.func.id](*args)
        raise ValueError(f"Unsupported expression node: {type(node).__name__}")


def _normalise_expr(expr: str) -> str:
    s = (expr or "").strip()
    s = s.replace("^", "**")
    s = re.sub(r"\s+", "", s)
    # implicit multiplication: 2x -> 2*x, 2( -> 2*(
    s = re.sub(r"(\d)([a-zA-Z(])", r"\1*\2", s)
    s = re.sub(r"(\))(\d)", r"\1*\2", s)
    s = re.sub(r"(\))([a-zA-Z(])", r"\1*\2", s)
    return s


def eval_expr(expr: str, x: float, var: str = "x") -> float:
    normalised = _normalise_expr(expr)
    tree = ast.parse(normalised, mode="eval")
    # Replace variable name with constant by rewriting AST
    class Replacer(ast.NodeTransformer):
        def visit_Name(self, node: ast.Name):
            if node.id in (var, "x", "t"):
                return ast.Constant(value=float(x))
            return node
    tree = Replacer().visit(tree)
    try:
        ast.fix_locations(tree)
    except Exception:
        pass
    return float(_SafeEval().visit(tree))


# ── Normalisation ────────────────────────────────────────────────────────────

def _f(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _clamp_canvas(canvas: dict) -> dict:
    x_min, x_max = _f(canvas.get("xMin"), -5), _f(canvas.get("xMax"), 5)
    y_min, y_max = _f(canvas.get("yMin"), -5), _f(canvas.get("yMax"), 5)
    if x_max - x_min < 1e-6:
        x_max = x_min + 1
    if y_max - y_min < 1e-6:
        y_max = y_min + 1
    # prevent extreme domains
    if abs(x_max - x_min) > 200:
        mid = (x_min + x_max) / 2
        x_min, x_max = mid - 100, mid + 100
    if abs(y_max - y_min) > 200:
        mid = (y_min + y_max) / 2
        y_min, y_max = mid - 100, mid + 100
    return {
        "xLabel": str(canvas.get("xLabel") or "x")[:40],
        "yLabel": str(canvas.get("yLabel") or "y")[:40],
        "xMin": x_min,
        "xMax": x_max,
        "yMin": y_min,
        "yMax": y_max,
        "grid": bool(canvas.get("grid", True)),
    }


def _normalise_step(raw: Any, index: int) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    op = str(raw.get("op") or "").strip().lower()
    if op not in ALLOWED_OPS:
        return None
    step: dict[str, Any] = {"op": op}
    if raw.get("id") is not None:
        step["id"] = str(raw["id"])[:64]
    if op == "say":
        step["text"] = str(raw.get("text") or "")[:500]
    elif op == "pause":
        step["ms"] = max(0, min(3000, int(_f(raw.get("ms"), 400))))
    elif op == "draw_function":
        expr = str(raw.get("expression") or raw.get("expr") or "").strip()
        if not expr:
            return None
        step["expression"] = expr
        step["xFrom"] = raw.get("xFrom")
        step["xTo"] = raw.get("xTo")
        step["durationMs"] = max(400, min(4000, int(_f(raw.get("durationMs"), 1400))))
        step["id"] = step.get("id") or f"curve_{index}"
    elif op == "draw_polyline":
        pts = raw.get("points") or []
        cleaned = []
        for p in pts[:40]:
            if isinstance(p, (list, tuple)) and len(p) >= 2:
                cleaned.append([_f(p[0]), _f(p[1])])
            elif isinstance(p, dict):
                cleaned.append([_f(p.get("x", p.get("t"))), _f(p.get("y", p.get("s")))])
        if len(cleaned) < 2:
            return None
        step["points"] = cleaned
        step["durationMs"] = max(400, min(4000, int(_f(raw.get("durationMs"), 900))))
        step["id"] = step.get("id") or f"poly_{index}"
    elif op == "point":
        step["x"] = _f(raw.get("x"))
        step["y"] = _f(raw.get("y"))
        step["label"] = str(raw.get("label") or "")[:80]
        step["id"] = step.get("id") or f"pt_{index}"
    elif op == "segment":
        step["x1"] = _f(raw.get("x1"))
        step["y1"] = _f(raw.get("y1"))
        step["x2"] = _f(raw.get("x2"))
        step["y2"] = _f(raw.get("y2"))
        step["id"] = step.get("id") or f"seg_{index}"
    elif op == "vline":
        step["x"] = _f(raw.get("x"))
        step["label"] = str(raw.get("label") or "")[:40]
        step["style"] = "dashed" if raw.get("style") == "dashed" else "solid"
        step["id"] = step.get("id") or f"vline_{index}"
    elif op == "hline":
        step["y"] = _f(raw.get("y"))
        step["label"] = str(raw.get("label") or "")[:40]
        step["style"] = "dashed" if raw.get("style") == "dashed" else "solid"
        step["id"] = step.get("id") or f"hline_{index}"
    elif op == "erase":
        ids = raw.get("ids") or ([] if raw.get("id") is None else [raw.get("id")])
        step["ids"] = [str(i)[:64] for i in ids][:20]
        if raw.get("last") is not None:
            step["last"] = max(1, min(20, int(_f(raw.get("last"), 1))))
    return step


def normalise_plan(raw: Any, *, subject_name: str = "", concept_name: str = "") -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    concept = str(raw.get("concept") or "").strip()
    if concept not in ALLOWED_CONCEPTS:
        # Infer from subject / concept name
        blob = f"{subject_name} {concept_name} {raw.get('title') or ''}".lower()
        if any(k in blob for k in ("quadratic", "parabola", "x^2", "x²")):
            concept = "quadratic_graphs"
        elif any(k in blob for k in ("displacement", "s-t", "s–t", "distance-time", "motion graph")):
            concept = "displacement_time_graphs"
        else:
            # Only allow plots on math/physics subjects
            sub = subject_name.lower()
            if "math" in sub:
                concept = "quadratic_graphs"
            elif "physic" in sub:
                concept = "displacement_time_graphs"
            else:
                return None

    steps_in = raw.get("steps") or []
    if not isinstance(steps_in, list) or not steps_in:
        return None

    steps: list[dict] = []
    for i, s in enumerate(steps_in[:MAX_STEPS]):
        ns = _normalise_step(s, i)
        if ns:
            steps.append(ns)
    if not steps:
        return None
    if steps[-1]["op"] != "done":
        steps.append({"op": "done"})

    canvas = _clamp_canvas(raw.get("canvas") or {})
    meta = raw.get("meta") if isinstance(raw.get("meta"), dict) else {}

    if concept == "quadratic_graphs":
        expr = str(meta.get("expression") or raw.get("expression") or "")
        # pull expression from first draw_function if missing
        if not expr:
            for s in steps:
                if s["op"] == "draw_function":
                    expr = s["expression"]
                    break
        meta = {
            "expression": expr,
            "a": meta.get("a"),
            "b": meta.get("b"),
            "c": meta.get("c"),
            "vertex": meta.get("vertex"),
            "roots": meta.get("roots") or [],
            "yIntercept": meta.get("yIntercept"),
        }
        if "math" not in canvas["xLabel"].lower() and canvas["xLabel"] in ("x", "X"):
            canvas["xLabel"] = "x"
            canvas["yLabel"] = canvas.get("yLabel") or "y"
    else:
        waypoints = meta.get("waypoints") or []
        cleaned_wp = []
        for w in waypoints[:20]:
            if isinstance(w, dict):
                cleaned_wp.append({"t": _f(w.get("t", w.get("x"))), "s": _f(w.get("s", w.get("y")))})
            elif isinstance(w, (list, tuple)) and len(w) >= 2:
                cleaned_wp.append({"t": _f(w[0]), "s": _f(w[1])})
        if not cleaned_wp:
            for s in steps:
                if s["op"] == "draw_polyline":
                    for p in s["points"]:
                        cleaned_wp.append({"t": p[0], "s": p[1]})
        meta = {
            "quantityX": "time",
            "quantityY": "displacement",
            "unitX": str(meta.get("unitX") or "s")[:8],
            "unitY": str(meta.get("unitY") or "m")[:8],
            "waypoints": cleaned_wp,
        }
        canvas["xLabel"] = canvas.get("xLabel") or "t (s)"
        canvas["yLabel"] = canvas.get("yLabel") or "s (m)"

    return {
        "plotId": str(raw.get("plotId") or "plot_1")[:64],
        "attempt": max(1, min(MAX_ATTEMPTS, int(_f(raw.get("attempt"), 1)))),
        "subject": "mathematics" if concept == "quadratic_graphs" else "physics",
        "concept": concept,
        "title": str(raw.get("title") or "Graph")[:120],
        "canvas": canvas,
        "meta": meta,
        "steps": steps,
    }


# ── Verification ─────────────────────────────────────────────────────────────

def _verify_quadratic(plan: dict) -> dict:
    issues: list[str] = []
    meta = plan["meta"]
    expr = meta.get("expression") or ""
    if not expr:
        issues.append("Missing quadratic expression.")
        return {"ok": False, "issues": issues}

    # Check draw_function matches
    for s in plan["steps"]:
        if s["op"] == "draw_function":
            try:
                # sample a few points — both expressions should agree if same
                for xv in (-1.0, 0.0, 1.0, 2.0):
                    eval_expr(s["expression"], xv)
            except Exception as exc:
                issues.append(f"Invalid curve expression: {exc}")
                break
            # soft check equality of meta expr vs curve
            try:
                for xv in (0.0, 1.0, 2.0):
                    if abs(eval_expr(expr, xv) - eval_expr(s["expression"], xv)) > 0.15:
                        issues.append("Curve expression does not match meta.expression.")
                        break
            except Exception:
                pass

    for s in plan["steps"]:
        if s["op"] != "point":
            continue
        try:
            expected = eval_expr(expr, s["x"])
            if abs(expected - s["y"]) > max(EPS, 0.08 * (1 + abs(expected))):
                issues.append(
                    f"Point {s.get('id')} at ({s['x']}, {s['y']}) is not on y = {expr} (expected y ≈ {expected:.3f})."
                )
        except Exception as exc:
            issues.append(f"Could not verify point {s.get('id')}: {exc}")

    # vertex check if provided
    vertex = meta.get("vertex")
    if isinstance(vertex, dict) and expr:
        try:
            # try to derive a,b,c if present
            a, b, c = meta.get("a"), meta.get("b"), meta.get("c")
            if a is not None and b is not None and abs(float(a)) > 1e-9:
                vx = -float(b) / (2 * float(a))
                if abs(vx - _f(vertex.get("x"))) > 0.15:
                    issues.append(f"Vertex x should be ≈ {vx:.3f}.")
        except Exception:
            pass

    return {"ok": len(issues) == 0, "issues": issues}


def _verify_st(plan: dict) -> dict:
    issues: list[str] = []
    canvas = plan["canvas"]
    xl = (canvas.get("xLabel") or "").lower()
    yl = (canvas.get("yLabel") or "").lower()
    if "t" not in xl and "time" not in xl:
        issues.append("Displacement–time graphs must use time on the horizontal axis.")
    if "s" not in yl and "disp" not in yl and "distance" not in yl and "position" not in yl:
        # soft warning only if completely wrong
        if "v" in yl or "veloc" in yl:
            issues.append("Vertical axis should be displacement, not velocity.")

    for s in plan["steps"]:
        if s["op"] == "draw_polyline":
            pts = s["points"]
            for i in range(1, len(pts)):
                t0, t1 = pts[i - 1][0], pts[i][0]
                if t1 + 1e-9 < t0:
                    issues.append(f"Polyline {s.get('id')} goes backwards in time.")
                # near-vertical = infinite speed
                if abs(t1 - t0) < 1e-6 and abs(pts[i][1] - pts[i - 1][1]) > 1e-3:
                    issues.append(f"Polyline {s.get('id')} has a vertical segment (impossible speed).")
            for p in pts:
                if p[0] < -1e-6:
                    issues.append("Time values must be ≥ 0.")
                    break
    return {"ok": len(issues) == 0, "issues": issues}


def verify_plan(plan: dict) -> dict:
    if plan["concept"] == "quadratic_graphs":
        return _verify_quadratic(plan)
    return _verify_st(plan)


# ── Auto-correction ──────────────────────────────────────────────────────────

def _correct_quadratic(plan: dict, issues: list[str]) -> Optional[dict]:
    """Build correction steps: erase bad points and replot using the expression."""
    expr = plan["meta"].get("expression") or ""
    if not expr:
        return None
    bad_ids = []
    fixes = []
    for s in plan["steps"]:
        if s["op"] != "point":
            continue
        try:
            expected = eval_expr(expr, s["x"])
            if abs(expected - s["y"]) > max(EPS, 0.08 * (1 + abs(expected))):
                bad_ids.append(s["id"])
                fixes.append({
                    "op": "point",
                    "id": s["id"],
                    "x": s["x"],
                    "y": round(expected, 4),
                    "label": s.get("label") or f"({s['x']:g}, {expected:g})",
                })
        except Exception:
            bad_ids.append(s["id"])

    if not bad_ids and not any("expression" in i.lower() or "curve" in i.lower() for i in issues):
        return None

    steps: list[dict] = [
        {
            "op": "say",
            "text": "I saw a mistake in the earlier graph — let me correct it.",
        }
    ]
    if bad_ids:
        steps.append({"op": "erase", "ids": bad_ids})
        steps.extend(fixes)
    # If curve itself was wrong, redraw from meta expression
    if any("curve" in i.lower() or "expression" in i.lower() for i in issues):
        steps.append({"op": "erase", "ids": ["curve", "curve_0", "curve_1"]})
        steps.append({
            "op": "draw_function",
            "id": "curve",
            "expression": expr,
            "durationMs": 1400,
        })
    steps.append({"op": "done"})
    return {
        "reason": "; ".join(issues[:3]),
        "steps": steps,
    }


def _correct_st(plan: dict, issues: list[str]) -> Optional[dict]:
    wp = plan["meta"].get("waypoints") or []
    if len(wp) < 2:
        return None
    steps: list[dict] = [
        {"op": "say", "text": "I saw a mistake in the earlier graph — redrawing the motion path."},
        {"op": "clear"},
        {"op": "set_axes"},
    ]
    pts = [[w["t"], w["s"]] for w in wp]
    steps.append({
        "op": "draw_polyline",
        "id": "motion",
        "points": pts,
        "durationMs": 1600,
    })
    steps.append({"op": "done"})
    return {"reason": "; ".join(issues[:3]), "steps": steps}


def build_correction(plan: dict, verification: dict) -> Optional[dict]:
    if verification.get("ok"):
        return None
    issues = verification.get("issues") or []
    if plan["concept"] == "quadratic_graphs":
        return _correct_quadratic(plan, issues)
    return _correct_st(plan, issues)


# ── Public entry ─────────────────────────────────────────────────────────────

def process_ai_plot(
    raw_plot: Any,
    *,
    subject_name: str = "",
    concept_name: str = "",
) -> Optional[dict]:
    """Validate AI plot payload and attach verification + optional correction.

    Returns None if the plot should be dropped (invalid / wrong subject).
    """
    if raw_plot is None:
        return None
    sub = (subject_name or "").lower()
    # MVP gate: only Math + Physics subjects
    if not any(k in sub for k in ("math", "physic")):
        return None

    plan = normalise_plan(raw_plot, subject_name=subject_name, concept_name=concept_name)
    if not plan:
        logger.info("Dropped invalid/unsupported plot payload")
        return None

    verification = verify_plan(plan)
    correction = build_correction(plan, verification) if not verification["ok"] else None

    # If verification failed and we cannot correct, still ship the plan but flag it
    # so the UI can show a soft warning after playback.
    return {
        "plotId": plan["plotId"],
        "attempt": plan["attempt"],
        "subject": plan["subject"],
        "concept": plan["concept"],
        "title": plan["title"],
        "canvas": plan["canvas"],
        "meta": plan["meta"],
        "steps": plan["steps"],
        "verification": verification,
        "correction": correction,
        "status": "final" if verification["ok"] else ("correcting" if correction else "final_with_warning"),
    }


def subject_allows_plots(subject_name: str) -> bool:
    sub = (subject_name or "").lower()
    return any(k in sub for k in ("math", "physic"))


PLOT_PROMPT_INSTRUCTIONS = """
LIVE GRAPH PLOTTING (Mathematics and Physics only):
When a graph materially helps (quadratic/parabola sketches, or displacement–time motion graphs),
include an optional "plot" object in the JSON. Otherwise set "plot" to null.

The UI will animate the plot step-by-step like a tutor drawing on a board.
Do NOT describe ASCII art graphs. Do NOT invent plot kinds outside this schema.

"plot" schema:
{
  "plotId": "plot_1",
  "concept": "quadratic_graphs" | "displacement_time_graphs",
  "title": "short title",
  "canvas": { "xLabel": "...", "yLabel": "...", "xMin": 0, "xMax": 10, "yMin": -2, "yMax": 10, "grid": true },
  "meta": { ... concept-specific ... },
  "steps": [ ordered drawing actions ]
}

Allowed step ops: say, pause, set_axes, draw_function, draw_polyline, point, segment, vline, hline, erase, clear, done

quadratic_graphs meta: { "expression": "x^2 - 4*x + 3", "a": 1, "b": -4, "c": 3, "vertex": {"x":2,"y":-1}, "roots": [1,3] }
- Use draw_function with the same expression. Points MUST lie on the curve.
- Prefer: set_axes → guides → curve → key points → done.

displacement_time_graphs meta: { "waypoints": [{"t":0,"s":0},{"t":3,"s":0},{"t":8,"s":15}] }
- x-axis MUST be time, y-axis displacement. Use draw_polyline segments only (no vertical segments).
- Prefer: set_axes → polyline segments in time order → labels → done.

Keep steps ≤ 25. Always end with {"op":"done"}. Use "say" for brief tutor narration while drawing.
If a graph is not needed, "plot": null.
"""
