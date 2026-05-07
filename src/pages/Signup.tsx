import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function Signup() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // If a session exists immediately, email confirmation is disabled — go straight to onboarding
    if (data.session) {
      navigate('/onboarding')
    } else {
      // Email confirmation required — show a message instead
      setConfirmSent(true)
      setLoading(false)
    }
  }

  if (confirmSent) {
    return (
      <div style={styles.page}>
        <div style={styles.card} className="animate-fade-in">
          <div style={styles.logo}>LABYL</div>
          <h1 style={styles.title}>Check your email</h1>
          <p style={styles.subtitle}>
            We sent a confirmation link to <strong style={{ color: '#fff' }}>{email}</strong>.
            Click it to activate your account, then sign in.
          </p>
          <Link to="/login" style={{ ...styles.btnPrimary, display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '24px' }}>
            Go to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card} className="animate-fade-in">
        <div style={styles.logo}>LABYL</div>
        <h1 style={styles.title}>Start your label</h1>
        <p style={styles.subtitle}>Create an account to get started</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@yourlabel.com"
              required
              style={styles.input}
              onFocus={e => (e.target.style.borderColor = '#C8FF00')}
              onBlur={e => (e.target.style.borderColor = '#333')}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              minLength={8}
              style={styles.input}
              onFocus={e => (e.target.style.borderColor = '#C8FF00')}
              onBlur={e => (e.target.style.borderColor = '#333')}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={loading ? { ...styles.btnPrimary, opacity: 0.6 } : styles.btnPrimary}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={styles.footerText}>
          Already have an account?{' '}
          <Link to="/login" style={styles.link}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0A0A0A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    background: '#111111',
    border: '0.5px solid #222222',
    borderRadius: '12px',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
  },
  logo: {
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '4px',
    color: '#C8FF00',
    marginBottom: '32px',
  },
  title: {
    fontSize: '26px',
    fontWeight: 600,
    color: '#FFFFFF',
    marginBottom: '6px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#888888',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#888888',
    letterSpacing: '0.3px',
  },
  input: {
    background: '#0A0A0A',
    border: '1px solid #333333',
    borderRadius: '8px',
    padding: '12px 14px',
    fontSize: '14px',
    color: '#FFFFFF',
    outline: 'none',
    transition: 'border-color 0.15s ease',
    width: '100%',
  },
  error: {
    fontSize: '13px',
    color: '#ff4444',
    background: 'rgba(255,68,68,0.08)',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255,68,68,0.2)',
  },
  btnPrimary: {
    background: '#C8FF00',
    color: '#000000',
    border: 'none',
    borderRadius: '8px',
    padding: '13px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: '4px',
    letterSpacing: '0.3px',
    transition: 'opacity 0.15s ease',
  },
  footerText: {
    fontSize: '13px',
    color: '#666666',
    textAlign: 'center',
    marginTop: '24px',
  },
  link: {
    color: '#C8FF00',
    textDecoration: 'none',
    fontWeight: 500,
  },
}
