import { Link } from "react-router-dom";
import { LogoMark } from "../../components/Logo";

const LAST_UPDATED = "25 September 2026";

export default function Terms() {
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
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/login">Log in</Link>
        </nav>
      </header>

      <main className="legal-content">
        <h1>Terms of Service</h1>
        <p className="legal-meta">Last updated: {LAST_UPDATED}</p>
        <p>
          Welcome to Knovi. These Terms govern your use of the Knovi website and application
          (the “Service”). By creating an account or using Knovi, you agree to these Terms and our{" "}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>

        <h2>1. What Knovi is</h2>
        <p>
          Knovi is an educational platform that combines an adaptive AI tutor with peer learning.
          Students can work through concepts with AI support, discover other learners, message
          matched peers, share tutorials, and take part in learning challenges.
        </p>

        <h2>2. Eligibility &amp; accounts</h2>
        <ul>
          <li>You must provide accurate account information and keep it up to date.</li>
          <li>You are responsible for activity under your account and for keeping your login secure.</li>
          <li>
            If you are under the age of digital consent in your country, use Knovi only with
            appropriate parental or guardian involvement.
          </li>
        </ul>

        <h2>3. Learning agreement (community rules)</h2>
        <p>When you finish onboarding you agree to use Knovi respectfully and for learning. In particular:</p>
        <ul>
          <li>
            <strong>Learn with integrity</strong> — Use AI to understand and grow, not to complete
            graded work dishonestly or to bypass real learning.
          </li>
          <li>
            <strong>Respect your peers</strong> — No harassment, mockery, pressure, or abuse.
            Treat other students as partners.
          </li>
          <li>
            <strong>Keep it private</strong> — Do not share other people’s photos, messages, or
            personal details outside Knovi.
          </li>
          <li>
            <strong>Show up as yourself</strong> — Use a real name and a photo you are comfortable
            with so others can recognise you in a learning context.
          </li>
        </ul>

        <h2>4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for anything illegal, harmful, or unrelated to education</li>
          <li>Harass, threaten, or exploit other users, especially minors</li>
          <li>Upload malware, attempt to break into accounts, or disrupt the platform</li>
          <li>Scrape, resell, or misuse AI outputs or peer content at scale</li>
          <li>Impersonate others or misrepresent your identity in a way that harms students</li>
        </ul>
        <p>
          We may suspend or terminate accounts that violate these rules or put other learners at risk.
        </p>

        <h2>5. AI tutor</h2>
        <ul>
          <li>
            AI responses can be wrong or incomplete. Treat the tutor as a study aid, not as a
            substitute for teachers, textbooks, or official curriculum authority.
          </li>
          <li>
            You remain responsible for how you use AI help in schoolwork. Academic honesty rules
            at your school still apply.
          </li>
          <li>
            Session content may be processed by our AI provider solely to deliver tutoring features,
            as described in the Privacy Policy.
          </li>
        </ul>

        <h2>6. Peer features (Discover, chat, challenges)</h2>
        <ul>
          <li>Match requests and messaging are for learning collaboration, not spam or solicitation.</li>
          <li>Challenge mode is for practice and friendly competition — not bullying or cheating.</li>
          <li>
            Content you post in chat, tutorials, or profiles must be appropriate for a student
            learning environment.
          </li>
        </ul>

        <h2>7. Your content</h2>
        <p>
          You keep ownership of content you create (for example tutorials or messages). By posting
          on Knovi you grant us a limited licence to host, display, and deliver that content so the
          Service works (e.g. showing your tutorial to other students, delivering chat messages).
        </p>

        <h2>8. Our service</h2>
        <p>
          We provide Knovi “as is”. Features may change, break, or be unavailable at times. We do
          not guarantee continuous uptime, perfect AI accuracy, or specific learning outcomes.
        </p>

        <h2>9. Termination</h2>
        <p>
          You may stop using Knovi at any time. We may restrict or close accounts that violate these
          Terms, harm other users, or abuse the Service. Provisions that should survive (such as
          content licences already granted, limitation of liability, and dispute terms) will continue
          after termination.
        </p>

        <h2>10. Limitation of liability</h2>
        <p>
          To the fullest extent allowed by law, Knovi and its contributors are not liable for
          indirect, incidental, or consequential damages arising from your use of the Service,
          including reliance on AI-generated content or interactions with other users.
        </p>

        <h2>11. Changes</h2>
        <p>
          We may update these Terms as the product evolves. Continued use after changes means you
          accept the updated Terms. Material changes will be reflected by the “Last updated” date
          on this page.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about these Terms: use the contact details on our project repository or the
          support channel listed in the app when available.
        </p>

        <p className="legal-footer-note">
          Related: <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </main>
    </div>
  );
}
