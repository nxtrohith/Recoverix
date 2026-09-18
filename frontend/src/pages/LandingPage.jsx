import { Link } from 'react-router-dom';
import truckHero from '../assets/truck-hero.png';
import './LandingPage.css';

const FEATURES = [
  {
    title: 'Piggyback Recovery',
    description: 'Attach misplaced packages to trucks already en route.',
    icon: 'truck',
  },
  {
    title: 'Live Route Graph',
    description: 'Telangana hub network on a map.',
    icon: 'graph',
  },
  {
    title: 'Driver Coordination',
    description: 'Call drivers via voice when incidents fire.',
    icon: 'phone',
  },
  {
    title: 'Incident Lifecycle',
    description: 'Detect → Analyze → Assign → Confirm → Resolve',
    icon: 'flow',
  },
];

const STEPS = [
  { num: '01', label: 'Detect' },
  { num: '02', label: 'Analyze' },
  { num: '03', label: 'Assign' },
  { num: '04', label: 'Confirm' },
  { num: '05', label: 'Resolve' },
];

function FeatureIcon({ type }) {
  if (type === 'truck') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7V10z" />
        <circle cx="7" cy="17" r="1.5" />
        <circle cx="17" cy="17" r="1.5" />
      </svg>
    );
  }
  if (type === 'graph') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="5" r="2" />
        <circle cx="19" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
        <path d="M7 11.5 10.5 6.5M14 6.5 17.5 11M17.5 13 14 17.5M10.5 17.5 7 13" />
      </svg>
    );
  }
  if (type === 'phone') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M8 4h3l1 4-2 1a10 10 0 0 0 4 4l1-2 4 1v3a2 2 0 0 1-2 2A12 12 0 0 1 6 6a2 2 0 0 1 2-2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="5" cy="7" r="2" />
      <circle cx="19" cy="7" r="2" />
      <circle cx="5" cy="17" r="2" />
      <circle cx="19" cy="17" r="2" />
      <path d="M7 7h10M5 9v6M19 9v6M7 17h10" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          SH-205
        </Link>
        <nav className="landing-nav-links" aria-label="Primary">
          <a href="#top" className="is-active">
            Home
          </a>
          <a href="#features">About</a>
          <a href="#process">Product</a>
          <a href="#cta">Contact</a>
        </nav>
        <Link to="/dashboard" className="landing-btn landing-btn-primary landing-nav-cta">
          Open Dashboard
        </Link>
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-hero-copy">
          <h1>Recover misplaced shipments</h1>
          <p className="landing-hero-sub">
            Piggyback recovery on trucks already on the road.
          </p>
          <div className="landing-hero-actions">
            <Link to="/dashboard" className="landing-btn landing-btn-primary">
              Open Dashboard
            </Link>
            <a href="#process" className="landing-btn landing-btn-ghost">
              How it works
            </a>
          </div>
        </div>
        <div className="landing-hero-media">
          <img
            src={truckHero}
            alt="Freight truck on the highway at sunset"
            width={720}
            height={900}
          />
        </div>
      </section>

      <section className="landing-features" id="features">
        <h2>Built for operators who move freight.</h2>
        <div className="landing-feature-grid">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="landing-feature-card">
              <div className={`landing-feature-visual landing-feature-visual-${feature.icon}`}>
                <FeatureIcon type={feature.icon} />
              </div>
              <div className="landing-feature-body">
                <span className="landing-feature-icon" aria-hidden>
                  <FeatureIcon type={feature.icon} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-process" id="process">
        <h2>Progress in our recovery process</h2>
        <ol className="landing-steps">
          {STEPS.map((step, i) => (
            <li key={step.num} className="landing-step">
              {i > 0 ? <span className="landing-step-connector" aria-hidden /> : null}
              <div className="landing-step-card">
                <span className="landing-step-num">{step.num}</span>
                <span className="landing-step-label">{step.label}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className="landing-stats">
          <div className="landing-stats-lead">
            <p className="landing-stats-kicker">Define our achievement</p>
            <p className="landing-stats-highlight">Fast operator recovery</p>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-value">91</span>
            <span className="landing-stat-label">Hubs Mapped</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-value">Live</span>
            <span className="landing-stat-label">Graph Scoring</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-value">Driver</span>
            <span className="landing-stat-label">Notify on Assign</span>
          </div>
        </div>
      </section>

      <section className="landing-cta" id="cta">
        <h2>Ready to recover the next misplaced shipment?</h2>
        <p>Join SH-205 and turn routing mishaps into recovered value.</p>
        <Link to="/dashboard" className="landing-btn landing-btn-primary landing-btn-lg">
          Open Dashboard
        </Link>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <strong>SH-205</strong>
          <span>Intelligent Shipment Piggybacking</span>
        </div>
        <nav className="landing-footer-links" aria-label="Footer">
          <a href="#features">Product</a>
          <a href="#process">Recovery</a>
          <a href="#cta">Contact</a>
        </nav>
        <p className="landing-footer-copy">© 2026 SH-205. All rights reserved.</p>
      </footer>
    </div>
  );
}
