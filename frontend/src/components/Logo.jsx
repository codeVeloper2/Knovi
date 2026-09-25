/**
 * Knovi logo mark.
 *
 * The brand name "Knovi" is intentionally NOT part of the logo artwork.
 * Use this component wherever the Knovi logo is needed.
 */
export function LogoMark({ size = 38, className }) {
  return (
    <img
      src="/knovi-mark.png"
      width={size}
      height={size}
      className={className}
      alt="Knovi"
      draggable="false"
    />
  );
}

export function KnoAILogo({ size = 40, className }) {
  return (
    <img
      src="/knoai-logo.png"
      width={size}
      height={size}
      className={className}
      alt="KnoAI"
      draggable="false"
    />
  );
}

export default function Logo({ size = 38, className }) {
  return <LogoMark size={size} className={className} />;
}
