/**
 * Live graph plot player for AI Learning Room.
 * Plays structured steps from message.extra.plot with draw / erase / correct.
 */
import { useEffect, useMemo, useRef, useState } from "react";

const PAD = { l: 48, r: 16, t: 20, b: 36 };

function evalExpr(expr, x) {
  if (!expr) return NaN;
  let s = String(expr).trim().replace(/\^/g, "**");
  s = s.replace(/(\d)([a-zA-Z(])/g, "$1*$2");
  s = s.replace(/\)(\d)/g, ")*$1");
  s = s.replace(/\)([a-zA-Z(])/g, ")*$1");
  // eslint-disable-next-line no-new-func
  const fn = new Function("x", "Math", `"use strict"; const sin=Math.sin,cos=Math.cos,tan=Math.tan,sqrt=Math.sqrt,abs=Math.abs,log=Math.log,exp=Math.exp,pi=Math.PI,e=Math.E; return (${s});`);
  try {
    const y = fn(x, Math);
    return Number.isFinite(y) ? y : NaN;
  } catch {
    return NaN;
  }
}

function sampleFunction(expr, x0, x1, n = 120) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = evalExpr(expr, x);
    if (Number.isFinite(y)) pts.push([x, y]);
  }
  return pts;
}

function usePlotScalers(canvas, width, height) {
  return useMemo(() => {
    const xMin = canvas?.xMin ?? -5;
    const xMax = canvas?.xMax ?? 5;
    const yMin = canvas?.yMin ?? -5;
    const yMax = canvas?.yMax ?? 5;
    const iw = Math.max(10, width - PAD.l - PAD.r);
    const ih = Math.max(10, height - PAD.t - PAD.b);
    const sx = (x) => PAD.l + ((x - xMin) / (xMax - xMin || 1)) * iw;
    const sy = (y) => PAD.t + ((yMax - y) / (yMax - yMin || 1)) * ih;
    return { sx, sy, xMin, xMax, yMin, yMax, iw, ih };
  }, [canvas, width, height]);
}

export default function GraphPlotPlayer({ plot }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 360, h: 260 });
  const [objects, setObjects] = useState([]); // drawable objects currently on canvas
  const [phase, setPhase] = useState("idle"); // idle | drawing | verifying | correcting | final | warning
  const [statusText, setStatusText] = useState("");
  const [sayLine, setSayLine] = useState("");
  const cancelRef = useRef(false);

  const canvas = plot?.canvas || {};
  const { sx, sy, xMin, xMax, yMin, yMax } = usePlotScalers(canvas, size.w, size.h);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(280, r.width), h: 260 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    cancelRef.current = false;
    setObjects([]);
    setSayLine("");
    setPhase("idle");
    if (!plot?.steps?.length) return undefined;

    let alive = true;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const playSteps = async (steps, mode) => {
      setPhase(mode);
      for (const step of steps) {
        if (!alive || cancelRef.current) return;
        const op = step.op;
        if (op === "say") {
          setSayLine(step.text || "");
          await sleep(Math.min(2200, 600 + String(step.text || "").length * 12));
        } else if (op === "pause") {
          await sleep(step.ms || 400);
        } else if (op === "set_axes") {
          // axes always drawn from canvas; no object needed
          await sleep(200);
        } else if (op === "clear") {
          setObjects([]);
          await sleep(200);
        } else if (op === "erase") {
          setObjects((prev) => {
            let next = prev;
            if (Array.isArray(step.ids) && step.ids.length) {
              const ban = new Set(step.ids);
              next = next.filter((o) => !ban.has(o.id));
            }
            if (step.last) next = next.slice(0, Math.max(0, next.length - step.last));
            return next;
          });
          await sleep(350);
        } else if (op === "draw_function") {
          const xFrom = step.xFrom ?? xMin;
          const xTo = step.xTo ?? xMax;
          const all = sampleFunction(step.expression, xFrom, xTo, 100);
          const duration = step.durationMs || 1400;
          const frames = 24;
          for (let f = 1; f <= frames; f++) {
            if (!alive || cancelRef.current) return;
            const slice = all.slice(0, Math.ceil((all.length * f) / frames));
            setObjects((prev) => {
              const rest = prev.filter((o) => o.id !== step.id);
              return [...rest, { id: step.id, kind: "curve", points: slice }];
            });
            await sleep(duration / frames);
          }
        } else if (op === "draw_polyline") {
          const pts = step.points || [];
          const duration = step.durationMs || 900;
          const frames = Math.max(8, pts.length * 4);
          for (let f = 1; f <= frames; f++) {
            if (!alive || cancelRef.current) return;
            const t = f / frames;
            const count = Math.max(2, Math.ceil(t * (pts.length - 1)) + 1);
            setObjects((prev) => {
              const rest = prev.filter((o) => o.id !== step.id);
              return [...rest, { id: step.id, kind: "poly", points: pts.slice(0, count) }];
            });
            await sleep(duration / frames);
          }
        } else if (op === "point") {
          setObjects((prev) => {
            const rest = prev.filter((o) => o.id !== step.id);
            return [...rest, { id: step.id, kind: "point", x: step.x, y: step.y, label: step.label }];
          });
          await sleep(280);
        } else if (op === "segment") {
          setObjects((prev) => {
            const rest = prev.filter((o) => o.id !== step.id);
            return [...rest, { id: step.id, kind: "segment", x1: step.x1, y1: step.y1, x2: step.x2, y2: step.y2 }];
          });
          await sleep(300);
        } else if (op === "vline" || op === "hline") {
          setObjects((prev) => {
            const rest = prev.filter((o) => o.id !== step.id);
            return [
              ...rest,
              op === "vline"
                ? { id: step.id, kind: "vline", x: step.x, label: step.label, style: step.style }
                : { id: step.id, kind: "hline", y: step.y, label: step.label, style: step.style },
            ];
          });
          await sleep(250);
        } else if (op === "done") {
          break;
        }
      }
    };

    (async () => {
      setStatusText("Drawing…");
      await playSteps(plot.steps, "drawing");
      if (!alive || cancelRef.current) return;

      setPhase("verifying");
      setStatusText("Checking the graph…");
      setSayLine("");
      await sleep(700);

      const ok = plot.verification?.ok !== false;
      if (!ok && plot.correction?.steps?.length) {
        setPhase("correcting");
        setStatusText("Fixing a mistake…");
        setSayLine(plot.correction.reason ? `Correction: ${plot.correction.reason}` : "");
        await playSteps(plot.correction.steps, "correcting");
        if (!alive || cancelRef.current) return;
        setPhase("final");
        setStatusText("Graph updated");
      } else if (!ok) {
        setPhase("warning");
        setStatusText("Graph may need review");
        setSayLine((plot.verification?.issues || []).slice(0, 2).join(" "));
      } else {
        setPhase("final");
        setStatusText("Graph ready");
      }
    })();

    return () => {
      alive = false;
      cancelRef.current = true;
    };
  }, [plot, xMin, xMax]);

  if (!plot) return null;

  const w = size.w;
  const h = size.h;
  const xTicks = 5;
  const yTicks = 4;

  const pathFrom = (pts) => {
    if (!pts?.length) return "";
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`)
      .join(" ");
  };

  return (
    <div className="gp-player" ref={wrapRef}>
      <div className="gp-player-head">
        <div>
          <strong>{plot.title || "Graph"}</strong>
          <span className="gp-player-sub">{plot.concept?.replace(/_/g, " ")}</span>
        </div>
        <span className={`gp-player-status gp-status-${phase}`}>{statusText}</span>
      </div>

      <svg className="gp-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={plot.title || "Graph"}>
        {/* grid */}
        {canvas.grid !== false &&
          Array.from({ length: xTicks + 1 }).map((_, i) => {
            const x = xMin + ((xMax - xMin) * i) / xTicks;
            return <line key={`vx${i}`} className="gp-grid" x1={sx(x)} y1={PAD.t} x2={sx(x)} y2={h - PAD.b} />;
          })}
        {canvas.grid !== false &&
          Array.from({ length: yTicks + 1 }).map((_, i) => {
            const y = yMin + ((yMax - yMin) * i) / yTicks;
            return <line key={`hy${i}`} className="gp-grid" x1={PAD.l} y1={sy(y)} x2={w - PAD.r} y2={sy(y)} />;
          })}

        {/* axes */}
        <line className="gp-axis" x1={PAD.l} y1={sy(0) >= PAD.t && sy(0) <= h - PAD.b ? sy(0) : h - PAD.b} x2={w - PAD.r} y2={sy(0) >= PAD.t && sy(0) <= h - PAD.b ? sy(0) : h - PAD.b} />
        <line className="gp-axis" x1={sx(0) >= PAD.l && sx(0) <= w - PAD.r ? sx(0) : PAD.l} y1={PAD.t} x2={sx(0) >= PAD.l && sx(0) <= w - PAD.r ? sx(0) : PAD.l} y2={h - PAD.b} />

        {/* labels */}
        <text className="gp-label" x={w / 2} y={h - 8} textAnchor="middle">{canvas.xLabel || "x"}</text>
        <text className="gp-label" x={14} y={h / 2} textAnchor="middle" transform={`rotate(-90 14 ${h / 2})`}>{canvas.yLabel || "y"}</text>

        {objects.map((o) => {
          if (o.kind === "curve" || o.kind === "poly") {
            return <path key={o.id} className="gp-curve" d={pathFrom(o.points)} fill="none" />;
          }
          if (o.kind === "point") {
            return (
              <g key={o.id}>
                <circle className="gp-point" cx={sx(o.x)} cy={sy(o.y)} r={4.5} />
                {o.label ? (
                  <text className="gp-point-label" x={sx(o.x) + 8} y={sy(o.y) - 8}>{o.label}</text>
                ) : null}
              </g>
            );
          }
          if (o.kind === "segment") {
            return (
              <line key={o.id} className="gp-curve" x1={sx(o.x1)} y1={sy(o.y1)} x2={sx(o.x2)} y2={sy(o.y2)} />
            );
          }
          if (o.kind === "vline") {
            return (
              <g key={o.id}>
                <line
                  className={o.style === "dashed" ? "gp-guide dashed" : "gp-guide"}
                  x1={sx(o.x)} y1={PAD.t} x2={sx(o.x)} y2={h - PAD.b}
                />
                {o.label ? <text className="gp-point-label" x={sx(o.x) + 4} y={PAD.t + 12}>{o.label}</text> : null}
              </g>
            );
          }
          if (o.kind === "hline") {
            return (
              <g key={o.id}>
                <line
                  className={o.style === "dashed" ? "gp-guide dashed" : "gp-guide"}
                  x1={PAD.l} y1={sy(o.y)} x2={w - PAD.r} y2={sy(o.y)}
                />
                {o.label ? <text className="gp-point-label" x={PAD.l + 4} y={sy(o.y) - 6}>{o.label}</text> : null}
              </g>
            );
          }
          return null;
        })}
      </svg>

      {sayLine ? <div className="gp-say">{sayLine}</div> : null}
    </div>
  );
}
