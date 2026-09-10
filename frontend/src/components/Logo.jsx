/**
 * PeerUp logo mark — the blue→cyan U-turn arrow, drawn inline as SVG so it
 * stays crisp at any size and the gradient renders reliably.
 *
 * Usage:
 *   <LogoMark size={38} />                     // icon only
 *   <Logo />                                   // icon + "PeerUp" wordmark
 *   <Logo size={30} wordmark={false} />        // icon only via Logo wrapper
 */

let _gid = 0;

export function LogoMark({ size = 38, className }) {
  // Unique gradient id per instance (multiple gradients with same id break in some browsers).
  const id = `pu-grad-${(_gid += 1)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="PeerUp"
    >
      <defs>
        <linearGradient id={id} x1="150" y1="70" x2="360" y2="440" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f9bff" />
          <stop offset="0.5" stopColor="#1fbaf0" />
          <stop offset="1" stopColor="#25e7c6" />
        </linearGradient>
      </defs>
      <path
        d="M356 96 V300 A100 100 0 0 1 156 300 V300"
        stroke={`url(#${id})`}
        strokeWidth="64"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M156 300 V150"
        stroke={`url(#${id})`}
        strokeWidth="64"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M156 70 L226 168 H86 Z" fill={`url(#${id})`} />
    </svg>
  );
}

export default function Logo({ size = 38, wordmark = true }) {
  return (
    <span className="logo">
      <span className="logo-mark logo-mark--img">
        <LogoMark size={Math.round(size * 0.72)} />
      </span>
      {wordmark && (
        <span className="logo-text">
          Peer<span className="logo-accent">Up</span>
        </span>
      )}
    </span>
  );
}
