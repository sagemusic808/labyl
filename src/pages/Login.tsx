import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { IconMark } from '../components/Logo'

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Check if user has completed onboarding
    const { data: label } = await supabase
      .from('labels')
      .select('id')
      .eq('user_id', data.user.id)
      .single()

    navigate(label ? '/app/dashboard' : '/app/onboarding')
  }

  return (
    <div style={styles.page}>
      <div style={styles.card} className="animate-fade-in">
        <Link to="/" style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <IconMark size={48} rx={14} />
        </Link>
        <h1 style={styles.title}>Welcome back</h1>
        <p style={styles.subtitle}>Sign in to your label</p>

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
              placeholder="••••••••"
              required
              style={styles.input}
              onFocus={e => (e.target.style.borderColor = '#C8FF00')}
              onBlur={e => (e.target.style.borderColor = '#333')}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={loading ? { ...styles.btnPrimary, opacity: 0.6 } : styles.btnPrimary}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={styles.footerText}>
          <Link to="/" style={styles.link}>← Back to labyl.co</Link>
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
