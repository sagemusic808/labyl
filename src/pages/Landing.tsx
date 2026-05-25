import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AGENTS } from '../lib/agents'
import { Wordmark, IconMark } from '../components/Logo'

type WaitlistStatus = 'idle' | 'loading' | 'success' | 'duplicate' | 'error'

function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<WaitlistStatus>('idle')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')

    const { error } = await supabase
      .from('waitlist')
      .insert({ email: email.trim().toLowerCase() })

    if (error) {
      setStatus(error.code === '23505' ? 'duplicate' : 'error')
    } else {
      setStatus('success')
    }
  }

  if (status === 'success') {
    return <p style={formStyles.successMsg}>You're on the list. We'll be in touch.</p>
  }

  if (status === 'duplicate') {
    return <p style={formStyles.duplicateMsg}>You're already on the list.</p>
  }

  return (
    <form onSubmit={handleSubmit} style={formStyles.form} className="l-waitlist-form">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        style={formStyles.input}
        onFocus={e => (e.currentTarget.style.borderColor = '#C8FF00')}
        onBlur={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        style={{ ...formStyles.btn, opacity: status === 'loading' ? 0.7 : 1 }}
      >
        {status === 'loading' ? 'Joining...' : 'Join the waitlist'}
      </button>
    </form>
  )
}

const STEPS = [
  {
    icon: '🏛️',
    num: '01',
    title: 'Found your label',
    desc: 'Name it, brand it, make it yours in minutes.',
  },
  {
    icon: '🤝',
    num: '02',
    title: 'Meet your AI team',
    desc: 'Six specialists ready to work the moment you sign up.',
  },
  {
    icon: '🚀',
    num: '03',
    title: 'Run your career',
    desc: 'Rollout plans, contracts, distribution — all in one place.',
  },
]

export function Landing() {
  return (
    <div style={styles.root}>
      <style>{`
        @keyframes orbFloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(80px, -60px) scale(1.08); }
          66% { transform: translate(-40px, 40px) scale(0.95); }
        }
        @keyframes orbFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-70px, 50px) scale(1.06); }
          66% { transform: translate(50px, -30px) scale(0.97); }
        }
        @keyframes orbFloat3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, 60px) scale(1.05); }
        }
        * { box-sizing: border-box; }

        .l-logo-mobile { display: none; }
        .l-logo-desktop { display: flex; align-items: center; }
        @media (max-width: 768px) {
          .l-logo-desktop { display: none !important; }
          .l-logo-mobile { display: flex !important; align-items: center; }
          .l-nav { padding: 18px 20px !important; }
          .l-headline { font-size: 36px !important; letter-spacing: -1px !important; }
          .l-section { padding: 60px 20px !important; }
          .l-pitch { padding: 60px 20px !important; }
          .l-footer { padding: 24px 20px !important; }
          .l-section-headline { font-size: 24px !important; }
          .l-team-grid {
            grid-template-columns: 1fr !important;
          }
          .l-team-card { padding: 24px !important; }
          .l-steps-row {
            grid-template-columns: 1fr !important;
          }
          .l-waitlist-form {
            flex-direction: column !important;
            max-width: 100% !important;
          }
          .l-waitlist-form input {
            width: 100% !important;
          }
          .l-waitlist-form button {
            width: 100% !important;
            text-align: center !important;
          }
        }
      `}</style>

      {/* Background orbs */}
      <div style={styles.orbPurple} />
      <div style={styles.orbGreen} />
      <div style={styles.orbPurple2} />

      {/* Nav */}
      <nav style={styles.nav} className="l-nav">
        {/* Desktop: full wordmark · Mobile: icon only */}
        <span className="l-logo-desktop"><Wordmark height={32} /></span>
        <span className="l-logo-mobile"><IconMark size={28} rx={8} /></span>
        <Link to="/app/login" style={styles.navLink}>Sign in →</Link>
      </nav>

      {/* SECTION 1 — HERO */}
      <section style={styles.hero}>
        <p style={styles.heroBadge}>Independent music, professional power</p>
        <h1 style={styles.headline} className="l-headline">You are the label.</h1>
        <p style={styles.subtext}>
          Labyl gives independent artists a full AI-powered label team — marketing, legal, distribution, A&R, sync, and analytics. No label deal needed. Ever.
        </p>
        <div style={styles.formWrap}>
          <WaitlistForm />
          <p style={styles.noSpam}>No spam. Just your invite when we're ready.</p>
        </div>
      </section>

      {/* SECTION 2 — THE TEAM */}
      <section style={styles.section} className="l-section">
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionHeadline} className="l-section-headline">Your AI team. Ready on day one.</h2>
          <p style={styles.sectionSubtext}>
            Six specialists who know your sound, your goals, and your career.
          </p>
          <div style={styles.teamGrid} className="l-team-grid">
            {AGENTS.map(agent => (
              <div key={agent.type} style={styles.teamCard} className="l-team-card">
                <div style={styles.teamCardTop}>
                  <span style={{ ...styles.teamDot, background: agent.color }} />
                  <div>
                    <p style={styles.teamName}>{agent.personName}</p>
                    <p style={styles.teamRole}>{agent.role}</p>
                  </div>
                </div>
                <p style={styles.teamDesc}>{agent.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3 — HOW IT WORKS */}
      <section style={styles.section} className="l-section">
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionHeadline} className="l-section-headline">How Labyl works</h2>
          <div style={styles.stepsRow} className="l-steps-row">
            {STEPS.map(step => (
              <div key={step.num} style={styles.stepCard}>
                <span style={styles.stepIcon}>{step.icon}</span>
                <p style={styles.stepNum}>{step.num}</p>
                <p style={styles.stepTitle}>{step.title}</p>
                <p style={styles.stepDesc}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4 — THE PITCH */}
      <section style={styles.pitchSection} className="l-pitch">
        <div style={styles.pitchInner}>
          <h2 style={styles.pitchHeadline}>Independent doesn't mean alone.</h2>
          <p style={styles.pitchSubtext}>
            Labyl was built so artists never have to choose between creative freedom and professional support. You get both.
          </p>
          <WaitlistForm />
        </div>
      </section>

      {/* FOOTER */}
      <footer style={styles.footer} className="l-footer">
        <span>© 2025 Labyl</span>
        <span>Built for independent artists.</span>
      </footer>
    </div>
  )
}

const formStyles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    gap: '10px',
    width: '100%',
    maxWidth: '460px',
  },
  input: {
    flex: 1,
    background: '#111111',
    border: '1px solid #2a2a2a',
    borderRadius: '10px',
    padding: '13px 16px',
    fontSize: '14px',
    color: '#FFFFFF',
    outline: 'none',
    transition: 'border-color 0.15s ease',
    minWidth: 0,
  },
  btn: {
    background: '#C8FF00',
    color: '#000000',
    border: 'none',
    borderRadius: '10px',
    padding: '13px 20px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    letterSpacing: '0.2px',
    flexShrink: 0,
    transition: 'opacity 0.15s ease',
  },
  successMsg: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#C8FF00',
    letterSpacing: '0.2px',
  },
  duplicateMsg: {
    fontSize: '15px',
    color: '#888888',
  },
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    background: '#0A0A0A',
    minHeight: '100vh',
    overflowX: 'hidden',
    position: 'relative',
    fontFamily: 'inherit',
  },
  orbPurple: {
    position: 'fixed',
    top: '-10%',
    left: '-15%',
    width: '700px',
    height: '700px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(100,40,200,0.22) 0%, transparent 70%)',
    filter: 'blur(80px)',
    animation: 'orbFloat1 22s ease-in-out infinite',
    pointerEvents: 'none',
    zIndex: 0,
  },
  orbGreen: {
    position: 'fixed',
    bottom: '-15%',
    right: '-10%',
    width: '650px',
    height: '650px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,160,80,0.18) 0%, transparent 70%)',
    filter: 'blur(80px)',
    animation: 'orbFloat2 28s ease-in-out infinite',
    pointerEvents: 'none',
    zIndex: 0,
  },
  orbPurple2: {
    position: 'fixed',
    top: '40%',
    right: '5%',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(120,50,220,0.12) 0%, transparent 70%)',
    filter: 'blur(60px)',
    animation: 'orbFloat3 18s ease-in-out infinite',
    pointerEvents: 'none',
    zIndex: 0,
  },
  nav: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 48px',
    borderBottom: '0.5px solid #1a1a1a',
    background: 'rgba(10,10,10,0.8)',
    backdropFilter: 'blur(12px)',
  },
  navLogo: {
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '4px',
    color: '#C8FF00',
  },
  navLink: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#888888',
    textDecoration: 'none',
    transition: 'color 0.15s ease',
  },
  hero: {
    position: 'relative',
    zIndex: 1,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '120px 24px 80px',
    gap: '0',
  },
  heroBadge: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: '#C8FF00',
    background: 'rgba(200,255,0,0.08)',
    border: '1px solid rgba(200,255,0,0.15)',
    borderRadius: '100px',
    padding: '6px 16px',
    marginBottom: '32px',
  },
  headline: {
    fontSize: 'clamp(56px, 7vw, 96px)',
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-2px',
    lineHeight: 1.0,
    marginBottom: '24px',
  },
  subtext: {
    fontSize: '17px',
    color: '#888888',
    maxWidth: '480px',
    lineHeight: 1.65,
    marginBottom: '40px',
  },
  formWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    width: '100%',
  },
  noSpam: {
    fontSize: '12px',
    color: '#444444',
  },
  section: {
    position: 'relative',
    zIndex: 1,
    padding: '100px 24px',
    borderTop: '0.5px solid #1a1a1a',
  },
  sectionInner: {
    maxWidth: '900px',
    margin: '0 auto',
    textAlign: 'center',
  },
  sectionHeadline: {
    fontSize: 'clamp(28px, 3.5vw, 44px)',
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-1px',
    marginBottom: '14px',
  },
  sectionSubtext: {
    fontSize: '16px',
    color: '#888888',
    marginBottom: '56px',
    lineHeight: 1.6,
  },
  teamGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
    textAlign: 'left',
  },
  teamCard: {
    background: '#111111',
    border: '1px solid #222222',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  teamCardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  teamDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  teamName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#FFFFFF',
    lineHeight: 1.2,
  },
  teamRole: {
    fontSize: '11px',
    color: '#555555',
    lineHeight: 1.3,
  },
  teamDesc: {
    fontSize: '12px',
    color: '#666666',
    lineHeight: 1.5,
  },
  stepsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
    marginTop: '0',
  },
  stepCard: {
    background: '#111111',
    border: '1px solid #222222',
    borderRadius: '12px',
    padding: '28px 24px',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  stepIcon: {
    fontSize: '24px',
    marginBottom: '4px',
    display: 'block',
  },
  stepNum: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '2px',
    color: '#C8FF00',
    marginBottom: '4px',
  },
  stepTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#FFFFFF',
    lineHeight: 1.3,
  },
  stepDesc: {
    fontSize: '13px',
    color: '#666666',
    lineHeight: 1.55,
  },
  pitchSection: {
    position: 'relative',
    zIndex: 1,
    padding: '120px 24px',
    borderTop: '0.5px solid #1a1a1a',
    textAlign: 'center',
  },
  pitchInner: {
    maxWidth: '600px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0',
  },
  pitchHeadline: {
    fontSize: 'clamp(32px, 4vw, 56px)',
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-1.5px',
    lineHeight: 1.1,
    marginBottom: '20px',
  },
  pitchSubtext: {
    fontSize: '16px',
    color: '#888888',
    lineHeight: 1.65,
    marginBottom: '40px',
    maxWidth: '480px',
  },
  footer: {
    position: 'relative',
    zIndex: 1,
    padding: '28px 48px',
    borderTop: '0.5px solid #1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#444444',
  },
}
