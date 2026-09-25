/**
 * Knovi custom HTML5 video player.
 * Features: play/pause, scrub bar, volume, playback speed, fullscreen, time display.
 * Progress is saved to the backend every 10 seconds during playback.
 */
import { useCallback, useEffect, useRef, useState } from "react";

function formatTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, "0");
  return `${m}:${sec}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayer({ src, poster, onProgress, onEnded, startAt = 0 }) {
  const videoRef   = useRef(null);
  const containerRef = useRef(null);
  const progressRef = useRef(null);
  const hideTimer  = useRef(null);

  const [playing,   setPlaying]   = useState(false);
  const [current,   setCurrent]   = useState(0);
  const [duration,  setDuration]  = useState(0);
  const [volume,    setVolume]    = useState(1);
  const [muted,     setMuted]     = useState(false);
  const [speed,     setSpeed]     = useState(1);
  const [showSpeed, setShowSpeed] = useState(false);
  const [fullscreen,setFullscreen]= useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffered,  setBuffered]  = useState(0);

  // ── Setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;

    function onLoaded() {
      setDuration(v.duration || 0);
      if (startAt > 5) v.currentTime = startAt;
    }
    function onTimeUpdate() {
      setCurrent(v.currentTime);
      if (v.buffered.length > 0 && v.duration) {
        setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
      }
    }
    function onPlay()  { setPlaying(true);  }
    function onPause() { setPlaying(false); }
    function onEndedEv() {
      setPlaying(false);
      onEnded?.();
    }

    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate",     onTimeUpdate);
    v.addEventListener("play",           onPlay);
    v.addEventListener("pause",          onPause);
    v.addEventListener("ended",          onEndedEv);

    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate",     onTimeUpdate);
      v.removeEventListener("play",           onPlay);
      v.removeEventListener("pause",          onPause);
      v.removeEventListener("ended",          onEndedEv);
    };
  }, [src, startAt, onEnded]);

  // ── Save progress every 10s ─────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      if (videoRef.current && onProgress) {
        onProgress(Math.floor(videoRef.current.currentTime), Math.floor(videoRef.current.duration || 0));
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [playing, onProgress]);

  // ── Auto-hide controls ────────────────────────────────────────────
  function resetHideTimer() {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    if (playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }

  // ── Playback controls ─────────────────────────────────────────────
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
    resetHideTimer();
  }

  function seek(e) {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * (v.duration || 0);
    resetHideTimer();
  }

  function changeVolume(e) {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) videoRef.current.volume = val;
    setMuted(val === 0);
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function changeSpeed(s) {
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
    setShowSpeed(false);
  }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  }

  // Fullscreen change from browser ESC key
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  if (!src) {
    return (
      <div className="vp-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <p>No video available for this lesson.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`vp-container ${fullscreen ? "vp-fullscreen" : ""}`}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => playing && setShowControls(false)}
      onClick={togglePlay}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        className="vp-video"
        preload="metadata"
        onClick={e => e.stopPropagation()}
      />

      {/* Big play button overlay when paused */}
      {!playing && (
        <div className="vp-big-play" onClick={e => { e.stopPropagation(); togglePlay(); }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="white">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </div>
      )}

      {/* Controls bar */}
      <div className={`vp-controls ${showControls || !playing ? "visible" : ""}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="vp-progress" ref={progressRef} onClick={seek}>
          {/* Buffer track */}
          <div className="vp-buffer" style={{ width: `${buffered}%` }} />
          {/* Played track */}
          <div className="vp-played" style={{ width: `${pct}%` }} />
          {/* Scrubber knob */}
          <div className="vp-knob" style={{ left: `${pct}%` }} />
        </div>

        {/* Bottom row */}
        <div className="vp-bottom">
          {/* Left: play + volume + time */}
          <div className="vp-left">
            <button type="button" className="vp-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              )}
            </button>

            {/* Volume */}
            <div className="vp-vol-wrap">
              <button type="button" className="vp-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
                {muted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    {volume > 0.5 ? <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/> : <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>}
                  </svg>
                )}
              </button>
              <input
                type="range" min="0" max="1" step="0.05"
                value={muted ? 0 : volume}
                onChange={changeVolume}
                className="vp-vol-slider"
                aria-label="Volume"
                onClick={e => e.stopPropagation()}
              />
            </div>

            <span className="vp-time">
              {formatTime(current)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right: speed + fullscreen */}
          <div className="vp-right">
            {/* Playback speed */}
            <div className="vp-speed-wrap">
              <button type="button" className="vp-btn vp-speed-btn" onClick={e => { e.stopPropagation(); setShowSpeed(s => !s); }}>
                {speed}×
              </button>
              {showSpeed && (
                <div className="vp-speed-menu" onClick={e => e.stopPropagation()}>
                  {SPEEDS.map(s => (
                    <button key={s} type="button"
                      className={`vp-speed-item ${speed === s ? "active" : ""}`}
                      onClick={() => changeSpeed(s)}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button type="button" className="vp-btn" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {fullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
