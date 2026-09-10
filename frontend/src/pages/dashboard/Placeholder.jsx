/**
 * Generic "coming soon" content for dashboard nav items that aren't built yet.
 * Each nav page passes its title/description; you'll replace these with real
 * pages as you design each interface.
 */
export default function Placeholder({ title, description, emoji = "🚧" }) {
  return (
    <div className="home">
      <div className="home-head">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="placeholder-card">
        <div className="placeholder-emoji">{emoji}</div>
        <h3>Coming soon</h3>
        <p>This section is being built. Send the design and it'll be wired up here.</p>
      </div>
    </div>
  );
}
