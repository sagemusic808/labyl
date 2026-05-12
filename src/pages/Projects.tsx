import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/* ── Types ── */

interface InspirationItem {
  type: 'image' | 'link'
  url: string
  created_at: string
}

interface Project {
  id: string
  user_id: string
  name: string
  target_drop_date: string | null
  type: string
  inspiration_items: InspirationItem[]
  status: string
  created_at: string
  updated_at: string
  project_tracks: { id: string }[]
}

/* ── Helpers ── */

function computeType(count: number, stored: string): string {
  if (count <= 1) return 'Single'
  if (count <= 6) return 'EP'
  return stored === 'mixtape' ? 'Mixtape' : 'Album'
}

function TypeBadge({ label }: { label: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: '#aaa', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '2px 7px', letterSpacing: '0.5px' }}>
      {label}
    </span>
  )
}

/* ── New Project Modal ── */

function NewProjectModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (p: Project) => void
}) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleCreate() {
    if (!name.trim() || !user) return
    setSaving(true)
    const { data, error: err } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name: name.trim(), target_drop_date: date || null, type: 'single', inspiration_items: [], status: 'in_progress' })
      .select('*, project_tracks(id)')
      .single()
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreated(data as Project)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '0.5px solid #222', borderRadius: 16, padding: 32, width: '100%', maxWidth: 440 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 6, letterSpacing: '-0.3px' }}>New Project</h2>
        <p style={{ fontSize: 13, color: '#555', marginBottom: 28 }}>Give it a name. Everything else comes later.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            ref={inputRef}
            placeholder="What are you calling this?"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, padding: '12px 14px', fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
            onFocus={e => (e.target.style.borderColor = '#C8FF00')}
            onBlur={e => (e.target.style.borderColor = '#222')}
          />
          <div>
            <label style={{ fontSize: 10, color: '#444', fontWeight: 700, letterSpacing: '1px', display: 'block', marginBottom: 8 }}>
              TENTATIVE DROP DATE — YOU CAN CHANGE THIS ANYTIME
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', outline: 'none', colorScheme: 'dark', fontFamily: 'inherit', width: '100%' }}
            />
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#FF4444', marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#888', borderRadius: 8, padding: '10px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: name.trim() && !saving ? 'pointer' : 'not-allowed', opacity: name.trim() && !saving ? 1 : 0.5, transition: 'opacity 0.15s' }}
          >
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Project Card ── */

function ProjectCard({ project, onClick, onDelete }: {
  project: Project
  onClick: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const trackCount = project.project_tracks?.length ?? 0
  const typeLabel = computeType(trackCount, project.type)
  const firstImage = project.inspiration_items?.find(i => i.type === 'image')?.url ?? null
  const formattedDate = project.updated_at
    ? new Date(project.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  useEffect(() => {
    if (!menuOpen) return
    function outside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [menuOpen])

  return (
    <div
      onClick={onClick}
      style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', border: '0.5px solid #1e1e1e', aspectRatio: '4/3', background: '#111', transition: 'border-color 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#333')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e1e1e')}
    >
      {/* Background */}
      {firstImage ? (
        <>
          <img src={firstImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0.95) 100%)' }} />
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(#181818 1px, transparent 1px), linear-gradient(90deg, #181818 1px, transparent 1px)', backgroundSize: '24px 24px', backgroundColor: '#0d0d0d' }} />
      )}

      {/* Released badge */}
      {project.status === 'released' && (
        <div style={{ position: 'absolute', top: 12, left: 12, background: '#1D9E75', color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: '1px', borderRadius: 4, padding: '3px 8px' }}>RELEASED</div>
      )}

      {/* Three-dot menu */}
      <div ref={menuRef} style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{ background: 'rgba(0,0,0,0.65)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#999', cursor: 'pointer', padding: '3px 9px', fontSize: 14, letterSpacing: '2px', lineHeight: 1.2 }}
        >···</button>
        {menuOpen && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: 4, minWidth: 120, boxShadow: '0 8px 24px rgba(0,0,0,0.7)', zIndex: 50 }}>
            <button onClick={() => { onClick(); setMenuOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#ccc', fontSize: 13, padding: '8px 12px', cursor: 'pointer', borderRadius: 5 }}>Open</button>
            <button onClick={() => { onDelete(); setMenuOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#FF3B3B', fontSize: 13, padding: '8px 12px', cursor: 'pointer', borderRadius: 5 }}>Delete</button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 16px 14px' }}>
        <div style={{ marginBottom: 6 }}><TypeBadge label={typeLabel} /></div>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px', marginBottom: 4, lineHeight: 1.2 }}>{project.name}</p>
        <p style={{ fontSize: 11, color: '#666' }}>
          {trackCount === 0 ? 'No tracks yet' : `${trackCount} track${trackCount !== 1 ? 's' : ''}`}
          {formattedDate ? ` · Updated ${formattedDate}` : ''}
        </p>
      </div>
    </div>
  )
}

/* ── Confirm Delete ── */

function ConfirmDelete({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
      <div style={{ background: '#111', border: '0.5px solid #222', borderRadius: 14, padding: 28, maxWidth: 380, width: '100%' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Delete this project?</p>
        <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, marginBottom: 24 }}>
          This will permanently delete <strong style={{ color: '#fff' }}>{name}</strong> and all its tracks. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ background: 'transparent', border: '1px solid #333', color: '#888', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ background: '#FF3B3B', border: 'none', color: '#fff', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ── */

export function Projects() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('projects')
      .select('*, project_tracks(id)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => { setProjects((data as Project[]) ?? []); setLoading(false) })
  }, [user])

  async function confirmDelete() {
    if (!deleteTarget) return
    await supabase.from('projects').delete().eq('id', deleteTarget.id)
    setProjects(ps => ps.filter(p => p.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #222', borderTopColor: '#C8FF00', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      <style>{`
        .proj-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 900px) { .proj-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 600px) { .proj-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 60, borderBottom: '0.5px solid #1a1a1a', position: 'sticky', top: 0, background: '#0A0A0A', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '3px', color: '#C8FF00' }}>LABYL</span>
          <nav style={{ display: 'flex', gap: 2 }}>
            <button onClick={() => navigate('/app/dashboard')} style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '5px 10px', borderRadius: 6 }}>HQ</button>
            <button style={{ background: 'rgba(200,255,0,0.08)', border: 'none', color: '#C8FF00', fontSize: 13, fontWeight: 600, cursor: 'default', padding: '5px 10px', borderRadius: 6 }}>Projects</button>
            <button onClick={() => navigate('/app/releases')} style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '5px 10px', borderRadius: 6 }}>Catalog</button>
          </nav>
        </div>
        <button onClick={() => setShowModal(true)} style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + New Project
        </button>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 80px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 6 }}>Projects</h1>
          <p style={{ fontSize: 13, color: '#888' }}>Your unreleased music. Private until you're ready.</p>
        </div>

        {projects.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 24px', gap: 10 }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.2" style={{ marginBottom: 10 }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>No projects yet</p>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>Start organizing your unreleased music.</p>
            <button onClick={() => setShowModal(true)} style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              New Project
            </button>
          </div>
        ) : (
          <div className="proj-grid">
            {projects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                onClick={() => navigate(`/app/projects/${p.id}`)}
                onDelete={() => setDeleteTarget(p)}
              />
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onCreated={p => { setShowModal(false); navigate(`/app/projects/${p.id}`) }}
        />
      )}

      {deleteTarget && (
        <ConfirmDelete
          name={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
