import { Link } from "react-router-dom";
import { LogoMark } from "../../components/Logo";

const LAST_UPDATED = "25 September 2026";

export default function Privacy() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link to="/welcome" className="legal-brand">
          <LogoMark size={28} />
          <span>
            Kno<span className="logo-accent">vi</span>
          </span>
        </Link>
        <nav className="legal-nav">
          <Link to="/terms">Terms of Service</Link>
          <Link to="/login">Log in</Link>
        </nav>
      </header>

      <main className="legal-content">
        <h1>Privacy Policy</h1>
        <p className="legal-meta">Last updated: {LAST_UPDATED}</p>
        <p>
          Knovi (“we”, “us”, “our”) is a peer-learning platform where students learn with an adaptive
          AI tutor and connect with other students. This policy explains what information we collect,
          how we use it, and the choices you have.
        </p>

        <h2>1. Information we collect</h2>
        <h3>Account &amp; profile</h3>
        <ul>
          <li>Email address, display name, and password (or Google sign-in details via Firebase Auth)</li>
          <li>Profile photo, school grade, and subjects you can teach or want help with</li>
          <li>Learning profile preferences (how you learn best, what you struggle with, help preferences)</li>
          <li>Privacy settings (whether your profile is public, whether others can message you directly)</li>
        </ul>
        <h3>Learning activity</h3>
        <ul>
          <li>AI learning sessions: subject, topic, concept, your goals, answers, and AI-generated feedback</li>
          <li>Progress and mastery signals used to improve tutoring and recommendations</li>
          <li>Tutorials you create, save, or study, and related study session data</li>
        </ul>
        <h3>Peer features</h3>
        <ul>
          <li>Match requests, connections, and challenge participation with other students</li>
          <li>Chat messages exchanged with matched peers (so we can deliver and store conversations)</li>
        </ul>
        <h3>Technical data</h3>
        <ul>
          <li>Basic device and browser information needed to run the app securely</li>
          <li>Authentication tokens stored locally on your device (for staying signed in)</li>
        </ul>

        <h2>2. How we use your information</h2>
        <ul>
          <li>To create and manage your account and keep you signed in</li>
          <li>To power the AI tutor (including sending relevant session context to our AI provider)</li>
          <li>To match you with peers, show profiles on Discover, and enable chat and challenges</li>
          <li>To personalise learning recommendations and show progress</li>
          <li>To enforce our community agreement and keep the platform safe and educational</li>
          <li>To improve product reliability and fix issues</li>
        </ul>

        <h2>3. AI processing</h2>
        <p>
          When you use AI Learning, content from your session (such as the concept, your answers, and
          feedback context) is sent to our AI provider so the tutor can teach, quiz, and evaluate.
          We use this only to provide the learning experience — not to sell your data or train
          unrelated products on your personal identity.
        </p>

        <h2>4. Peer visibility</h2>
        <p>
          On Discover, other students may see profile information you choose to share (name, photo,
          grade, subjects). You control profile visibility and direct-message settings during
          onboarding and in Settings. Chat and challenge content is limited to the people involved
          in those conversations or matches.
        </p>

        <h2>5. Sharing</h2>
        <p>We do not sell your personal information. We share data only when needed to operate Knovi:</p>
        <ul>
          <li>
            <strong>Infrastructure providers</strong> — hosting, database, authentication, and file
            storage services that process data on our behalf
          </li>
          <li>
            <strong>AI provider</strong> — session content required to generate tutoring responses
          </li>
          <li>
            <strong>Legal requirements</strong> — if required by law or to protect users from serious harm
          </li>
        </ul>

        <h2>6. Retention</h2>
        <p>
          We keep account, learning, and messaging data while your account is active so the product
          works as intended. If you ask us to delete your account, we will remove or anonymise
          personal data associated with it, except where we must retain limited records for security
          or legal reasons.
        </p>

        <h2>7. Security</h2>
        <p>
          We use industry-standard practices such as encrypted connections (HTTPS), hashed passwords,
          and access controls. No system is perfectly secure; please use a strong unique password and
          keep your login details private.
        </p>

        <h2>8. Children &amp; students</h2>
        <p>
          Knovi is built for students. If you are under the age where you can consent to online
          services in your country, you should only use Knovi with a parent or guardian’s involvement
          as required by local law.
        </p>

        <h2>9. Your choices</h2>
        <ul>
          <li>Update profile, learning preferences, and privacy settings in the app</li>
          <li>Control who can find or message you via privacy settings</li>
          <li>Sign out or stop using the service at any time</li>
          <li>Contact us to request access to or deletion of your personal data</li>
        </ul>

        <h2>10. Contact</h2>
        <p>
          Questions about this policy or your data: use the contact details on our project repository
          or the support channel listed in the app when available.
        </p>

        <p className="legal-footer-note">
          By using Knovi you acknowledge this Privacy Policy. See also our{" "}
          <Link to="/terms">Terms of Service</Link>.
        </p>
      </main>
    </div>
  );
}
