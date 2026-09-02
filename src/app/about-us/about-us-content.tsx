'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function AboutUsContent() {
  const [menuOpen, setMenuOpen] = useState(false)

  function scrollTo(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (href.startsWith('#')) {
      const target = document.querySelector(href)
      if (target) {
        e.preventDefault()
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        history.pushState(null, '', href)
      }
    }
  }

  const navAnchors = [
    { href: '#problem', label: 'The Problem' },
    { href: '#features', label: 'Features' },
    { href: '#how-it-works', label: 'How It Works' },
    { href: '#who', label: "Who It's For" },
    { href: '#pricing', label: 'Pricing' },
  ]

  return (
    <div className="about-root">
      {/* Skip link for accessibility */}
      <a href="#about-main-content" className="about-skip-link">
        Skip to main content
      </a>

      {/* ===== HEADER ===== */}
      <header className="about-site-header" role="banner">
        <div className="about-container about-nav">
          <Link href="/" className="about-logo" aria-label="ePTW Home">
            <span className="about-logo-mark" aria-hidden="true">
              eP
            </span>
            ePTW
          </Link>
          <nav
            className="about-nav-links"
            role="navigation"
            aria-label="Main navigation"
          >
            {navAnchors.map((a) => (
              <a key={a.href} href={a.href} onClick={(e) => scrollTo(e, a.href)}>
                {a.label}
              </a>
            ))}
          </nav>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link
              href="/"
              className="about-btn about-btn-secondary"
              style={{ padding: '8px 16px' }}
            >
              Login
            </Link>
            <a
              href="#cta"
              className="about-btn about-btn-primary"
              style={{ padding: '8px 16px' }}
              onClick={(e) => scrollTo(e, '#cta')}
            >
              Request Demo
            </a>
            <button
              className="about-menu-toggle"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              ☰
            </button>
          </div>
        </div>
        <div
          className={`about-mobile-menu about-container${
            menuOpen ? ' about-active' : ''
          }`}
        >
          {navAnchors.map((a) => (
            <a
              key={a.href}
              href={a.href}
              onClick={(e) => {
                setMenuOpen(false)
                scrollTo(e, a.href)
              }}
            >
              {a.label}
            </a>
          ))}
        </div>
      </header>

      <main id="about-main-content" role="main">
        {/* ===== HERO ===== */}
        <section
          className="about-hero about-section"
          style={{ padding: '80px 0 64px' }}
          aria-label="Hero"
        >
          <div className="about-container about-hero-content">
            <div className="about-hero-text">
              <p
                className="about-section-label"
                style={{ color: '#f0a17a' }}
              >
                Electronic Permit to Work System
              </p>
              <h1>
                Digitalise Your <span>Permit to Work</span> Process in
                Malaysia
              </h1>
              <p>
                A smarter, faster and more accountable way to manage
                workplace permits. From contractor PTW to HIRARC/JHA
                verification and digital approvals — all in one system.
              </p>
              <div className="about-hero-buttons">
                <a
                  href="#cta"
                  className="about-btn about-btn-primary"
                  style={{ fontSize: '1rem', padding: '14px 28px' }}
                  onClick={(e) => scrollTo(e, '#cta')}
                >
                  Request Demo
                </a>
                <Link
                  href="/"
                  className="about-btn about-btn-outline-light"
                  style={{ fontSize: '1rem', padding: '14px 28px' }}
                >
                  Login
                </Link>
              </div>
              <div className="about-hero-stats">
                <div className="about-hero-stat">
                  <strong>100%</strong>
                  <span>Digital permits</span>
                </div>
                <div className="about-hero-stat">
                  <strong>6-step</strong>
                  <span>Approval workflow</span>
                </div>
                <div className="about-hero-stat">
                  <strong>RM0</strong>
                  <span>to start (Free plan)</span>
                </div>
              </div>
            </div>
            <div className="about-hero-visual" aria-hidden="true">
              <div className="about-permit-card">
                <span className="about-badge">● Approved</span>
                <h4>Hot Work Permit — PTW-2024-0042</h4>
                <p className="about-permit-meta">
                  Contractor: ABC Engineering · Area: Plant B
                </p>
                <div className="about-permit-progress">
                  <span className="about-dot"></span>
                  <span>HIRARC verified</span>
                  <span style={{ marginLeft: 'auto' }}>→</span>
                  <span>Approved by HSE</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== PROBLEM ===== */}
        <section
          className="about-section"
          id="problem"
          aria-labelledby="about-problem-title"
        >
          <div className="about-container">
            <p className="about-section-label">The Problem</p>
            <h2 className="about-section-title" id="about-problem-title">
              Paper-based PTW is holding your company back
            </h2>
            <p className="about-section-subtitle">
              Manual processes create unnecessary risk, delay critical work,
              and make safety compliance a nightmare for Malaysian industries.
            </p>
            <div className="about-problem-grid">
              <div className="about-problem-card">
                <div className="about-icon" aria-hidden="true">
                  📄
                </div>
                <h4>Paper-based PTW</h4>
                <p>Forms get lost, damaged, or forgotten — creating safety gaps.</p>
              </div>
              <div className="about-problem-card">
                <div className="about-icon" aria-hidden="true">
                  ✋
                </div>
                <h4>Manual approval</h4>
                <p>Chasing signatures slows down work and frustrates contractors.</p>
              </div>
              <div className="about-problem-card">
                <div className="about-icon" aria-hidden="true">
                  📁
                </div>
                <h4>Missing documents</h4>
                <p>HIRARC/JHA not attached or incomplete — risking non-compliance.</p>
              </div>
              <div className="about-problem-card">
                <div className="about-icon" aria-hidden="true">
                  🔍
                </div>
                <h4>Difficult tracking</h4>
                <p>No real-time visibility of active permits across your facility.</p>
              </div>
              <div className="about-problem-card">
                <div className="about-icon" aria-hidden="true">
                  🧾
                </div>
                <h4>Poor audit visibility</h4>
                <p>Digging through paper files wastes hours during DOSH audits.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== WORKFLOW / SOLUTION ===== */}
        <section
          className="about-section about-workflow"
          id="workflow"
          aria-labelledby="about-workflow-title"
        >
          <div className="about-container">
            <p className="about-section-label">ePTW Solution</p>
            <h2 className="about-section-title" id="about-workflow-title">
              One clear digital workflow from creation to closure
            </h2>
            <p className="about-section-subtitle">
              Every permit follows a structured, auditable path — no shortcuts,
              no chaos, complete accountability.
            </p>
            <div className="about-workflow-steps">
              <div className="about-workflow-step">
                <span className="about-step-num" aria-hidden="true">
                  1
                </span>
                <h5>Create</h5>
                <p>Contractor submits permit digitally</p>
              </div>
              <div className="about-workflow-step">
                <span className="about-step-num" aria-hidden="true">
                  2
                </span>
                <h5>Assess</h5>
                <p>HIRARC/JHA verification</p>
              </div>
              <div className="about-workflow-step">
                <span className="about-step-num" aria-hidden="true">
                  3
                </span>
                <h5>Approve</h5>
                <p>Multi-level digital approval</p>
              </div>
              <div className="about-workflow-step">
                <span className="about-step-num" aria-hidden="true">
                  4
                </span>
                <h5>Execute</h5>
                <p>Work is carried out safely</p>
              </div>
              <div className="about-workflow-step">
                <span className="about-step-num" aria-hidden="true">
                  5
                </span>
                <h5>Close</h5>
                <p>Permit closure &amp; sign-off</p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== FEATURES ===== */}
        <section
          className="about-section"
          id="features"
          aria-labelledby="about-features-title"
        >
          <div className="about-container">
            <p className="about-section-label">Key Features</p>
            <h2 className="about-section-title" id="about-features-title">
              Built for real industrial environments
            </h2>
            <p className="about-section-subtitle">
              Every feature is designed to solve a specific pain point in permit
              management.
            </p>
            <div className="about-features-grid">
              <div className="about-feature-card">
                <div className="about-feature-icon" aria-hidden="true">
                  🔥
                </div>
                <h4>Contractor PTW</h4>
                <p>Full permit lifecycle for external contractors and internal teams.</p>
              </div>
              <div className="about-feature-card">
                <div className="about-feature-icon" aria-hidden="true">
                  📋
                </div>
                <h4>HIRARC / JHA</h4>
                <p>Structured hazard identification and risk assessment built in — DOSH compliant.</p>
              </div>
              <div className="about-feature-card">
                <div className="about-feature-icon" aria-hidden="true">
                  ✍️
                </div>
                <h4>Digital Approval</h4>
                <p>Multi-level approval workflow with digital signatures and automated routing.</p>
              </div>
              <div className="about-feature-card">
                <div className="about-feature-icon" aria-hidden="true">
                  🔐
                </div>
                <h4>Role-Based Access</h4>
                <p>Contractor, approver, HSE, and admin — each sees only what they need.</p>
              </div>
              <div className="about-feature-card">
                <div className="about-feature-icon" aria-hidden="true">
                  📄
                </div>
                <h4>PDF Permit</h4>
                <p>Auto-generated PDF permits for printing, sharing, or record-keeping.</p>
              </div>
              <div className="about-feature-card">
                <div className="about-feature-icon" aria-hidden="true">
                  📊
                </div>
                <h4>Permit Dashboard</h4>
                <p>Real-time overview of all permits, statuses, and bottlenecks at a glance.</p>
              </div>
              <div className="about-feature-card">
                <div className="about-feature-icon" aria-hidden="true">
                  🕒
                </div>
                <h4>Audit Trail</h4>
                <p>Every action logged — who did what, when, and from where. Audit-ready.</p>
              </div>
              <div className="about-feature-card">
                <div className="about-feature-icon" aria-hidden="true">
                  📱
                </div>
                <h4>Mobile-Friendly</h4>
                <p>Works on any device — phone, tablet, or desktop. Access from anywhere.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section
          className="about-section about-how-it-works"
          id="how-it-works"
          aria-labelledby="about-how-title"
        >
          <div className="about-container">
            <p className="about-section-label" style={{ color: '#f0a17a' }}>
              How It Works
            </p>
            <h2 className="about-section-title" id="about-how-title">
              From submission to audit-ready record
            </h2>
            <p className="about-section-subtitle">
              Six simple steps. Zero paper. Complete accountability for your
              safety team.
            </p>
            <div className="about-steps-vertical">
              <div className="about-step-item">
                <span className="about-step-dot" aria-hidden="true">
                  1
                </span>
                <div>
                  <h5>Contractor submits permit</h5>
                  <p>
                    Fill in the digital form, attach required documents like
                    HIRARC/JHA, and submit online.
                  </p>
                </div>
              </div>
              <div className="about-step-item">
                <span className="about-step-dot" aria-hidden="true">
                  2
                </span>
                <div>
                  <h5>HIRARC/JHA verification</h5>
                  <p>
                    HSE verifies hazard identification and risk assessment
                    completeness and accuracy.
                  </p>
                </div>
              </div>
              <div className="about-step-item">
                <span className="about-step-dot" aria-hidden="true">
                  3
                </span>
                <div>
                  <h5>Competent person reviews</h5>
                  <p>
                    Technical reviewers assess the work scope and safety controls
                    before approval.
                  </p>
                </div>
              </div>
              <div className="about-step-item">
                <span className="about-step-dot" aria-hidden="true">
                  4
                </span>
                <div>
                  <h5>Approval workflow</h5>
                  <p>
                    Multi-level digital approval with automated routing and
                    notifications.
                  </p>
                </div>
              </div>
              <div className="about-step-item">
                <span className="about-step-dot" aria-hidden="true">
                  5
                </span>
                <div>
                  <h5>Work execution</h5>
                  <p>
                    Permit is active and visible. Status updates in real-time for
                    all stakeholders.
                  </p>
                </div>
              </div>
              <div className="about-step-item">
                <span className="about-step-dot" aria-hidden="true">
                  6
                </span>
                <div>
                  <h5>Permit closure &amp; audit record</h5>
                  <p>
                    Close the permit, store the complete digital record, and stay
                    audit-ready 24/7.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== WHO IT'S FOR ===== */}
        <section
          className="about-section"
          id="who"
          aria-labelledby="about-who-title"
        >
          <div className="about-container">
            <p className="about-section-label">Who It&apos;s For</p>
            <h2 className="about-section-title" id="about-who-title">
              Built for Malaysian industry standards
            </h2>
            <p className="about-section-subtitle">
              ePTW is designed for any organisation in Malaysia that manages
              workplace permits and prioritises safety compliance.
            </p>
            <div className="about-who-list">
              <span className="about-who-tag">🏭 Manufacturing</span>
              <span className="about-who-tag">
                💧 Wastewater / Water Treatment
              </span>
              <span className="about-who-tag">🛢️ Oil &amp; Gas</span>
              <span className="about-who-tag">🏗️ Construction</span>
              <span className="about-who-tag">⚡ Utilities</span>
              <span className="about-who-tag">🏢 Facilities Management</span>
              <span className="about-who-tag">⚙️ Industrial Plants</span>
            </div>
            <div
              style={{
                marginTop: 32,
                background: 'var(--asurface)',
                borderRadius: 12,
                padding: 24,
                border: '1px solid var(--aborder)',
                maxWidth: 640,
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  color: 'var(--anavy)',
                  marginBottom: 6,
                }}
              >
                Why ePTW?
              </p>
              <p style={{ color: 'var(--atext-secondary)' }}>
                Less paperwork. Better control. Stronger compliance. That&apos;s
                the bottom line for safety-critical industries in Malaysia.
              </p>
            </div>
          </div>
        </section>

        {/* ===== PRICING ===== */}
        <section
          className="about-section"
          id="pricing"
          style={{
            background: 'var(--asurface)',
            borderTop: '1px solid var(--aborder)',
            borderBottom: '1px solid var(--aborder)',
          }}
          aria-labelledby="about-pricing-title"
        >
          <div className="about-container">
            <p className="about-section-label">Pricing</p>
            <h2 className="about-section-title" id="about-pricing-title">
              Simple, transparent pricing for Malaysian businesses
            </h2>
            <p className="about-section-subtitle">
              Free for small teams. Pro at RM149/month (or RM1,490/year) for
              your complete digital PTW system.
            </p>
            <div className="about-pricing-card">
              <p
                style={{
                  fontWeight: 600,
                  color: 'var(--anavy)',
                  marginBottom: 4,
                }}
              >
                ePTW Pro
              </p>
              <div className="about-price">
                RM149 <small>/ month</small>
              </div>
              <p
                style={{
                  marginBottom: 8,
                  fontSize: '0.9rem',
                  color: 'var(--atext-secondary)',
                }}
              >
                or <strong>RM1,490 / year</strong> — save RM298/year
              </p>
              <p className="about-price-note">
                Free plan also available — full core PTW workflow, no
                attachment storage.
              </p>
              <ul
                style={{
                  listStyle: 'none',
                  textAlign: 'left',
                  margin: '16px 0 24px',
                  fontSize: '0.9rem',
                  color: 'var(--atext-secondary)',
                }}
              >
                <li style={{ padding: '6px 0' }}>✓ Unlimited permits</li>
                <li style={{ padding: '6px 0' }}>✓ Unlimited contractors</li>
                <li style={{ padding: '6px 0' }}>✓ Full audit trail</li>
                <li style={{ padding: '6px 0' }}>✓ HIRARC/JHA module</li>
                <li style={{ padding: '6px 0' }}>✓ Photo/document attachments (5 GB)</li>
                <li style={{ padding: '6px 0' }}>✓ Mobile-friendly access</li>
              </ul>
              <a
                href="#cta"
                className="about-btn about-btn-primary"
                style={{ width: '100%' }}
                onClick={(e) => scrollTo(e, '#cta')}
              >
                Get Started
              </a>
            </div>
            <p
              style={{
                textAlign: 'center',
                marginTop: 16,
                fontSize: '0.85rem',
                color: 'var(--atext-muted)',
              }}
            >
              Need enterprise features or volume pricing?{' '}
              <a
                href="#cta"
                style={{ color: 'var(--aaccent)' }}
                onClick={(e) => scrollTo(e, '#cta')}
              >
                Request a demo
              </a>{' '}
              today.
            </p>
          </div>
        </section>

        {/* ===== FINAL CTA ===== */}
        <section
          className="about-cta-section"
          id="cta"
          aria-labelledby="about-cta-title"
        >
          <div className="about-container">
            <h2 id="about-cta-title">
              Ready to move from paper permits to digital?
            </h2>
            <p>
              Join forward-thinking companies across Malaysia using ePTW to
              streamline their permit to work process.
            </p>
            <Link href="/" className="about-btn about-btn-white">
              Get Started / Request Demo
            </Link>
          </div>
        </section>
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="about-site-footer" role="contentinfo">
        <div className="about-container">
          <div>
            <strong style={{ color: 'white' }}>ePTW</strong> — Electronic Permit
            to Work System
          </div>
          <div>Malaysia 🇲🇾 · © 2026 ePTW. All rights reserved.</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link href="/">Login</Link>
            <a href="#cta" onClick={(e) => scrollTo(e, '#cta')}>
              Contact
            </a>
            <a href="#pricing" onClick={(e) => scrollTo(e, '#pricing')}>
              Pricing
            </a>
            <Link href="/privacy-policy">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
