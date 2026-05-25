import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Wordmark } from '../components/Logo'

const GENRES = ['Hip-Hop', 'R&B', 'Pop', 'Afrobeats', 'Drill', 'Lo-Fi', 'Indie', 'Electronic', 'Other']

interface LabelData {
  id: string
  artist_name: string | null
  name: string
  genre: string[]
  logo_url: string | null
}

export function Settings() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const logoRef = useRef<HTMLInputElement>(null)

  const [label, setLabel] = useState<LabelData | null>(null)
  const [loading, setLoading] = useState(true)

  // Editable fields
  const [artistName, setArtistName] = useState('')
  const [labelName, setLabelName] = useState('')
  const [genres, setGenres] = useState<string[]>([])
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoError, setLogoError] = useState(false)

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!user) return
    supabase.from('labels').select('*').eq('user_id', user.id).single().then(({ data }) => {
      if (data) {
        const l = data as LabelData
        setLabel(l)
        setArtistName(l.artist_name ?? '')
        setLabelName(l.name ?? '')
        setGenres(l.genre ?? [])
      }
      setLoading(false)
    })
  }, [user])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setLogoError(false)
  }

  function toggleGenre(g: string) {
    setGenres(gs => gs.includes(g) ? gs.filter(x => x !== g) : [...gs, g])
  }

  async function handleSave() {
    if (!user || !label) return
    setSaving(true)

    let logoUrl = label.logo_url
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `${user.id}/logos/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('artwork').upload(path, logoFile)
      if (!error) {
        const { data: u } = supabase.storage.from('artwork').getPublicUrl(path)
        logoUrl = u.publicUrl
      } else {
        console.error('Logo upload failed:', error.message)
      }
    }

    const { error } = await supabase.from('labels').update({
      artist_name: artistName,
      name: labelName,
      genre: genres,
      logo_url: logoUrl,
    }).eq('id', label.id)

    setSaving(false)
    if (!error) {
      setLabel(l => l ? { ...l, artist_name: artistName, name: labelName, genre: genres, logo_url: logoUrl } : l)
      setLogoFile(null)
      setToast('Changes saved')
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/app/login')
  }

  const displayLogo = logoPreview ?? label?.logo_url
  const initials = (artistName || label?.artist_name || label?.name || 'L')[0].toUpperCase()

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.spinner} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <button onClick={() => navigate('/app/dashboard')} style={styles.backBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div>
          <Wordmark width={120} />
          <p style={styles.pageSubtitle}>Settings</p>
        </div>
      </header>

      <div style={styles.content}>

        {/* Section 1 — Profile Picture */}
        <div style={styles.card}>
          <div style={styles.avatarSection}>
            {displayLogo && !logoError ? (
              <img
                src={displayLogo}
                alt="Logo"
                style={styles.avatarImg}
                onError={() => setLogoError(true)}
              />
            ) : (
              <div style={styles.avatarPlaceholder}>{initials}</div>
            )}
            <button onClick={() => logoRef.current?.click()} style={styles.changePhotoBtn}>
              Change Photo
            </button>
            <input
              ref={logoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleLogoChange}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Section 2 — Label Info */}
        <div style={styles.card}>
          <p style={styles.cardLabel}>Label Info</p>
          <div style={styles.fields}>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Artist Name</label>
              <input
                type="text"
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                placeholder="Your artist name"
                style={styles.input}
                onFocus={e => (e.target.style.borderColor = '#C8FF00')}
                onBlur={e => (e.target.style.borderColor = '#222222')}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Label Name</label>
              <input
                type="text"
                value={labelName}
                onChange={e => setLabelName(e.target.value)}
                placeholder="Your label name"
                style={styles.input}
                onFocus={e => (e.target.style.borderColor = '#C8FF00')}
                onBlur={e => (e.target.style.borderColor = '#222222')}
              />
            </div>
          </div>
        </div>

        {/* Section 3 — Your Sound */}
        <div style={styles.card}>
          <p style={styles.cardLabel}>Your Sound</p>
          <div style={styles.genreGrid}>
            {GENRES.map(g => {
              const active = genres.includes(g)
              return (
                <button
                  key={g}
                  onClick={() => toggleGenre(g)}
                  style={{
                    ...styles.genreChip,
                    background: active ? 'rgba(200,255,0,0.08)' : 'transparent',
                    borderColor: active ? '#C8FF00' : '#222222',
                    color: active ? '#C8FF00' : '#555555',
                  }}
                >
                  {g}
                </button>
              )
            })}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        {/* Danger Zone */}
        <div style={styles.divider} />
        <div style={styles.card}>
          <p style={styles.dangerLabel}>Account</p>
          <button onClick={handleSignOut} style={styles.logOutBtn}>
            Log Out
          </button>
        </div>

      </div>

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column' },
  loadingPage: { minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  spinner: { width: 24, height: 24, borderRadius: '50%', border: '2px solid #222', borderTopColor: '#C8FF00', animation: 'spin 0.8s linear infinite' },

  header: { padding: '28px 32px 24px', borderBottom: '0.5px solid #1a1a1a', display: 'flex', alignItems: 'flex-start', gap: 16 },
  backBtn: { background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', padding: 0, marginTop: 4, flexShrink: 0 },
  pageTitle: { fontSize: '22px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.5px', marginBottom: 4 },
  pageSubtitle: { fontSize: '13px', color: '#888888' },

  content: { flex: 1, padding: '32px', maxWidth: '600px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' },

  card: { background: '#111111', border: '0.5px solid #222222', borderRadius: '12px', padding: '24px' },
  cardLabel: { fontSize: '11px', fontWeight: 700, color: '#444', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 16 },

  // Avatar
  avatarSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  avatarImg: { width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '1px solid #222' },
  avatarPlaceholder: { width: 96, height: 96, borderRadius: '50%', background: '#1a1a1a', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 700, color: '#C8FF00' },
  changePhotoBtn: { background: 'transparent', border: 'none', color: '#C8FF00', fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0 },

  // Fields
  fields: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  fieldLabel: { fontSize: '12px', fontWeight: 600, color: '#555', letterSpacing: '0.3px' },
  input: { background: '#111111', border: '1px solid #222222', borderRadius: '8px', padding: '11px 14px', fontSize: '14px', color: '#FFFFFF', outline: 'none', transition: 'border-color 0.15s ease', fontFamily: 'inherit' },

  // Genres
  genreGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  genreChip: { padding: '8px 14px', borderRadius: '8px', border: '1px solid', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease' },

  // Save
  saveBtn: { background: '#C8FF00', color: '#000000', border: 'none', borderRadius: '10px', padding: '14px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', width: '100%', transition: 'opacity 0.15s ease', letterSpacing: '0.2px' },

  // Danger zone
  divider: { height: '0.5px', background: '#1a1a1a', margin: '8px 0' },
  dangerLabel: { fontSize: '11px', fontWeight: 700, color: '#888', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 16 },
  logOutBtn: { background: 'transparent', border: '1px solid #FF3B3B', color: '#FF3B3B', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },

  // Toast
  toast: { position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', background: '#C8FF00', color: '#000', fontWeight: 600, fontSize: '13px', borderRadius: '8px', padding: '10px 20px', zIndex: 200, pointerEvents: 'none' },
}
