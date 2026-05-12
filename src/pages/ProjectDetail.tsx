import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/* ── Types ── */

interface TrackVersion {
  id: string
  track_id: string
  user_id: string
  version_name: string
  audio_url: string
  is_active: boolean
  created_at: string
}

interface Project {
  id: string
  user_id: string
  name: string
  target_drop_date: string | null
  type: string
  cover_art_url: string | null
  inspiration_items: InspirationItem[]
  status: string
}

interface InspirationItem {
  id: string
  type: 'image' | 'link'
  url: string
  created_at: string
}

interface ProjectTrack {
  id: string
  project_id: string
  user_id: string
  title: string
  audio_url: string
  artwork_url: string | null
  notes: string | null
  position: number
  duration_seconds: number | null
  features: string[]
  active_version_id: string | null
  track_versions: TrackVersion[]
}

/* ── Helpers ── */

function computeType(count: number, stored: string): string {
  if (count <= 1) return 'Single'
  if (count <= 6) return 'EP'
  return stored === 'mixtape' ? 'Mixtape' : 'Album'
}

function formatDur(sec: number | null): string {
  if (!sec) return ''
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`
}

function formatTime(sec: number): string {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

async function getAudioDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => { const d = Math.round(a.duration); URL.revokeObjectURL(a.src); resolve(isFinite(d) ? d : 0) }
    a.onerror = () => resolve(0)
    a.src = URL.createObjectURL(file)
  })
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

function formatTrackTitle(title: string, features: string[]): string {
  if (!features || features.length === 0) return title
  return `${title} (ft. ${features.join(', ')})`
}

function getActiveVersion(track: ProjectTrack): TrackVersion | null {
  const versions = track.track_versions ?? []
  if (!versions.length) return null
  return track.active_version_id
    ? (versions.find(v => v.id === track.active_version_id) ?? versions[0])
    : versions[0]
}

function getActiveAudioUrl(track: ProjectTrack): string {
  return getActiveVersion(track)?.audio_url ?? track.audio_url
}

/* ── Tag Input ── */

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function commit(val: string) {
    const v = val.trim().replace(/,+$/, '')
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput('')
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (val.includes(',')) {
      const parts = val.split(',')
      parts.slice(0, -1).forEach(p => { const t = p.trim(); if (t && !tags.includes(t)) tags = [...tags, t] })
      onChange(tags)
      setInput(parts[parts.length - 1])
    } else {
      setInput(val)
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, padding: '7px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 42, cursor: 'text', transition: 'border-color 0.15s' }}
      onFocus={() => {}} onBlur={() => {}}
    >
      {tags.map(tag => (
        <span key={tag} style={{ background: '#1a1a1a', border: '0.5px solid #333', borderRadius: 5, padding: '3px 8px', fontSize: 12, color: '#ccc', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {tag}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter(t => t !== tag)) }}
            style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={handleChange}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(input) }
          else if (e.key === 'Backspace' && !input && tags.length > 0) onChange(tags.slice(0, -1))
        }}
        placeholder={tags.length === 0 ? 'Add a featured artist' : ''}
        style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13, flex: 1, minWidth: 100, fontFamily: 'inherit' }}
      />
    </div>
  )
}

/* ── Cover Art Upload ── */

function CoverArtUpload({ project, onUpdate }: { project: Project; onUpdate: (url: string) => void }) {
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hovered, setHovered] = useState(false)

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !user) return
    setUploading(true)
    const ext = f.name.split('.').pop()
    const path = `${user.id}/projects/${project.id}.${ext}`
    const { error } = await supabase.storage.from('artwork').upload(path, f, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('artwork').getPublicUrl(path)
      await supabase.from('projects').update({ cover_art_url: data.publicUrl, updated_at: new Date().toISOString() }).eq('id', project.id)
      onUpdate(data.publicUrl)
    }
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{ width: 220, height: 220, borderRadius: 14, overflow: 'hidden', position: 'relative', background: '#111', border: '0.5px solid #1e1e1e', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', cursor: project.cover_art_url ? 'default' : 'pointer', flexShrink: 0 }}
        onClick={() => !project.cover_art_url && fileRef.current?.click()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {project.cover_art_url ? (
          <>
            <img src={project.cover_art_url} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {hovered && (
              <div
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 10, cursor: 'pointer' }}
                onClick={() => fileRef.current?.click()}
              >
                <div style={{ background: 'rgba(0,0,0,0.85)', border: '0.5px solid #333', borderRadius: 7, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, color: '#ccc', fontSize: 12 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                  </svg>
                  Edit cover
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'linear-gradient(135deg, #0f0f0f 0%, #141414 100%)' }}>
            {uploading ? (
              <p style={{ fontSize: 12, color: '#444' }}>Uploading…</p>
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                </svg>
                <p style={{ fontSize: 11, color: '#383838', letterSpacing: '0.5px', fontWeight: 600 }}>ADD COVER</p>
              </>
            )}
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
    </div>
  )
}

/* ── Manage Versions Modal ── */

function ManageVersionsModal({ track, onClose, onTrackUpdated }: {
  track: ProjectTrack
  onClose: () => void
  onTrackUpdated: (t: ProjectTrack) => void
}) {
  const { user } = useAuth()
  const [versions, setVersions] = useState<TrackVersion[]>(track.track_versions ?? [])
  const [activeId, setActiveId] = useState<string | null>(track.active_version_id ?? versions[0]?.id ?? null)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => previewRef.current?.pause(), [])

  function togglePreview(v: TrackVersion) {
    if (previewingId === v.id) {
      previewRef.current?.pause()
      setPreviewingId(null)
    } else {
      if (!previewRef.current) previewRef.current = new Audio()
      previewRef.current.pause()
      previewRef.current.src = v.audio_url
      previewRef.current.play()
      previewRef.current.onended = () => setPreviewingId(null)
      setPreviewingId(v.id)
    }
  }

  async function setActive(v: TrackVersion) {
    await supabase.from('project_tracks').update({ active_version_id: v.id }).eq('id', track.id)
    setActiveId(v.id)
    onTrackUpdated({ ...track, active_version_id: v.id, track_versions: versions })
  }

  async function deleteVersion(v: TrackVersion) {
    if (versions.length <= 1) return
    await supabase.from('track_versions').delete().eq('id', v.id)
    const remaining = versions.filter(x => x.id !== v.id)
    let newActiveId = activeId
    if (activeId === v.id) {
      newActiveId = remaining[0]?.id ?? null
      await supabase.from('project_tracks').update({ active_version_id: newActiveId }).eq('id', track.id)
      setActiveId(newActiveId)
    }
    setVersions(remaining)
    onTrackUpdated({ ...track, active_version_id: newActiveId, track_versions: remaining })
  }

  async function uploadVersion() {
    if (!newName.trim() || !newFile || !user) return
    setUploading(true); setUploadErr('')
    const ext = newFile.name.split('.').pop()
    const path = `${user.id}/project-tracks/${track.id}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('audio').upload(path, newFile)
    if (error) { setUploadErr(error.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('audio').getPublicUrl(path)
    const { data: vData } = await supabase.from('track_versions').insert({
      track_id: track.id, user_id: user.id, version_name: newName.trim(), audio_url: urlData.publicUrl, is_active: false,
    }).select().single()
    if (vData) {
      const nv = vData as TrackVersion
      const newVersions = [...versions, nv]
      setVersions(newVersions)
      onTrackUpdated({ ...track, active_version_id: activeId, track_versions: newVersions })
    }
    setUploading(false); setNewName(''); setNewFile(null); setShowForm(false)
  }

  const displayActiveId = activeId ?? versions[0]?.id

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '0.5px solid #222', borderRadius: 16, padding: 28, width: '100%', maxWidth: 500, maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px' }}>
              {formatTrackTitle(track.title, track.features ?? [])} — Versions
            </h2>
            <p style={{ fontSize: 12, color: '#555', marginTop: 3 }}>{versions.length} version{versions.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {versions.map(v => {
            const isActive = v.id === displayActiveId
            const isPrev = previewingId === v.id
            return (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: isActive ? 'rgba(200,255,0,0.04)' : '#0d0d0d', border: `0.5px solid ${isActive ? 'rgba(200,255,0,0.18)' : '#1a1a1a'}`, borderRadius: 8, transition: 'all 0.15s' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{v.version_name}</p>
                  <p style={{ fontSize: 10, color: '#444' }}>{new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>

                {/* Preview */}
                <button onClick={() => togglePreview(v)} style={{ background: 'transparent', border: `1px solid ${isPrev ? '#C8FF00' : '#222'}`, borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'border-color 0.15s' }}>
                  {isPrev
                    ? <svg width="9" height="9" viewBox="0 0 24 24" fill="#C8FF00"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                    : <svg width="9" height="9" viewBox="0 0 24 24" fill="#555"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  }
                </button>

                {/* Active badge / Set Active */}
                {isActive ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#C8FF00', background: 'rgba(200,255,0,0.1)', border: '1px solid rgba(200,255,0,0.25)', borderRadius: 5, padding: '3px 9px', flexShrink: 0, letterSpacing: '0.3px' }}>Active</span>
                ) : (
                  <button onClick={() => setActive(v)} style={{ fontSize: 11, fontWeight: 600, color: '#777', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', transition: 'border-color 0.15s, color 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#C8FF00'; e.currentTarget.style.color = '#C8FF00' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#777' }}
                  >Set Active</button>
                )}

                {/* Delete */}
                <button onClick={() => deleteVersion(v)} disabled={versions.length <= 1}
                  style={{ background: 'transparent', border: 'none', color: versions.length <= 1 ? '#1e1e1e' : '#2e2e2e', cursor: versions.length <= 1 ? 'default' : 'pointer', padding: 4, display: 'flex', flexShrink: 0, transition: 'color 0.15s' }}
                  onMouseEnter={e => { if (versions.length > 1) e.currentTarget.style.color = '#FF3B3B' }}
                  onMouseLeave={e => { e.currentTarget.style.color = versions.length <= 1 ? '#1e1e1e' : '#2e2e2e' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                </button>
              </div>
            )
          })}
        </div>

        {/* Upload form */}
        {showForm ? (
          <div style={{ marginTop: 18, background: '#0d0d0d', border: '0.5px solid #1e1e1e', borderRadius: 10, padding: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#444', letterSpacing: '1px', marginBottom: 12 }}>NEW VERSION</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Version name (e.g. Mixed, Mastered)" value={newName} onChange={e => setNewName(e.target.value)}
                style={{ background: '#111', border: '1px solid #222', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
                onFocus={e => (e.target.style.borderColor = '#C8FF00')} onBlur={e => (e.target.style.borderColor = '#222')} />
              <div onClick={() => fileInputRef.current?.click()} style={{ background: '#111', border: `1px solid ${newFile ? '#C8FF00' : '#222'}`, borderRadius: 7, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={newFile ? '#C8FF00' : '#444'} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                <span style={{ fontSize: 13, color: newFile ? '#C8FF00' : '#444' }}>{newFile ? newFile.name : 'Choose audio file'}</span>
              </div>
              <input ref={fileInputRef} type="file" accept=".mp3,.wav,audio/*" onChange={e => setNewFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
            </div>
            {uploadErr && <p style={{ fontSize: 12, color: '#FF4444', marginTop: 8 }}>{uploadErr}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setNewName(''); setNewFile(null) }} style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#666', borderRadius: 7, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button onClick={uploadVersion} disabled={!newName.trim() || !newFile || uploading}
                style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: !newName.trim() || !newFile || uploading ? 'not-allowed' : 'pointer', opacity: !newName.trim() || !newFile || uploading ? 0.5 : 1 }}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)} style={{ marginTop: 18, width: '100%', background: '#C8FF00', border: 'none', color: '#000', borderRadius: 9, padding: '12px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + Upload New Version
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Add Track Modal ── */

function AddTrackModal({ projectId, userId, onClose, onAdded }: {
  projectId: string
  userId: string
  onClose: () => void
  onAdded: (t: ProjectTrack) => void
}) {
  const audioInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle]           = useState('')
  const [audioFile, setAudioFile]   = useState<File | null>(null)
  const [versionName, setVersionName] = useState('Original')
  const [features, setFeatures]     = useState<string[]>([])
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  async function handleAdd() {
    if (!title.trim() || !audioFile) return
    setSaving(true); setError('')

    // 1. Get position
    const { count } = await supabase.from('project_tracks').select('*', { count: 'exact', head: true }).eq('project_id', projectId)
    const position = count ?? 0

    // 2. Get duration
    const duration = await getAudioDuration(audioFile)

    // 3. Insert track (audio_url placeholder)
    const { data: trackData, error: trackErr } = await supabase.from('project_tracks').insert({
      project_id: projectId, user_id: userId, title: title.trim(),
      audio_url: '', features, notes: notes.trim() || null, position,
      duration_seconds: duration > 0 ? duration : null,
    }).select().single()
    if (trackErr || !trackData) { setError(trackErr?.message ?? 'Error creating track'); setSaving(false); return }

    const trackId = (trackData as ProjectTrack).id

    // 4. Upload audio
    const ext = audioFile.name.split('.').pop()
    const path = `${userId}/project-tracks/${trackId}-${Date.now()}.${ext}`
    const { error: audioErr } = await supabase.storage.from('audio').upload(path, audioFile)
    if (audioErr) { setError('Audio upload failed: ' + audioErr.message); setSaving(false); return }
    const { data: urlData } = supabase.storage.from('audio').getPublicUrl(path)
    const audioUrl = urlData.publicUrl

    // 5. Create track_version
    const { data: vData } = await supabase.from('track_versions').insert({
      track_id: trackId, user_id: userId,
      version_name: versionName.trim() || 'Original',
      audio_url: audioUrl, is_active: true,
    }).select().single()
    const version = vData as TrackVersion | null

    // 6. Update track with audio_url + active_version_id
    await supabase.from('project_tracks').update({ audio_url: audioUrl, active_version_id: version?.id ?? null }).eq('id', trackId)

    // 7. Bump project updated_at
    await supabase.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId)

    setSaving(false)
    onAdded({
      ...trackData as ProjectTrack,
      audio_url: audioUrl,
      features,
      active_version_id: version?.id ?? null,
      track_versions: version ? [version] : [],
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '0.5px solid #222', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 24, letterSpacing: '-0.3px' }}>Add Track</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Title */}
          <div>
            <label style={lbl}>TRACK TITLE *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Untitled" autoFocus
              style={inp} onFocus={e => (e.target.style.borderColor = '#C8FF00')} onBlur={e => (e.target.style.borderColor = '#222')} />
          </div>

          {/* Audio */}
          <div>
            <label style={lbl}>AUDIO FILE * <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>.mp3 .wav</span></label>
            <div onClick={() => audioInputRef.current?.click()}
              style={{ background: '#0f0f0f', border: `1px solid ${audioFile ? '#C8FF00' : '#222'}`, borderRadius: 8, padding: '11px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'border-color 0.15s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={audioFile ? '#C8FF00' : '#444'} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              <span style={{ fontSize: 13, color: audioFile ? '#C8FF00' : '#444' }}>{audioFile ? audioFile.name : 'Choose audio file'}</span>
            </div>
            <input ref={audioInputRef} type="file" accept=".mp3,.wav,audio/*" onChange={e => setAudioFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
          </div>

          {/* Version name */}
          <div>
            <label style={lbl}>VERSION NAME</label>
            <input value={versionName} onChange={e => setVersionName(e.target.value)} placeholder="e.g. Demo, Mixed, Mastered"
              style={inp} onFocus={e => (e.target.style.borderColor = '#C8FF00')} onBlur={e => (e.target.style.borderColor = '#222')} />
          </div>

          {/* Features */}
          <div>
            <label style={lbl}>FEATURES <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional · press enter or comma to add</span></label>
            <TagInput tags={features} onChange={setFeatures} />
          </div>

          {/* Notes */}
          <div>
            <label style={lbl}>NOTES <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Production notes, lyric ideas, anything relevant" rows={3}
              style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }}
              onFocus={e => (e.target.style.borderColor = '#C8FF00')} onBlur={e => (e.target.style.borderColor = '#222')} />
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#FF4444', marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#888', borderRadius: 8, padding: '10px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleAdd} disabled={!title.trim() || !audioFile || saving}
            style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: !title.trim() || !audioFile || saving ? 'not-allowed' : 'pointer', opacity: !title.trim() || !audioFile || saving ? 0.5 : 1, transition: 'opacity 0.15s' }}>
            {saving ? 'Uploading…' : 'Add to Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: 8 }
const inp: React.CSSProperties = { background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit', transition: 'border-color 0.15s' }

/* ── Track Row ── */

function TrackRow({ track, index, isActive, isPlaying, onPlay, onDelete, onUpdate, onManageVersions, dragHandlers }: {
  track: ProjectTrack
  index: number
  isActive: boolean
  isPlaying: boolean
  onPlay: () => void
  onDelete: () => void
  onUpdate: (t: ProjectTrack) => void
  onManageVersions: () => void
  dragHandlers: {
    onDragStart: () => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: () => void
    isDragOver: boolean
  }
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [editNotes, setEditNotes]   = useState(track.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [menuOpen, setMenuOpen]     = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle]   = useState(track.title)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function outside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [menuOpen])

  async function saveNotes() {
    setSavingNotes(true)
    const trimmed = editNotes.trim() || null
    await supabase.from('project_tracks').update({ notes: trimmed }).eq('id', track.id)
    setSavingNotes(false)
    onUpdate({ ...track, notes: trimmed })
    setNotesOpen(false)
  }

  async function saveTitle() {
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === track.title) { setEditingTitle(false); setEditTitle(track.title); return }
    await supabase.from('project_tracks').update({ title: trimmed }).eq('id', track.id)
    onUpdate({ ...track, title: trimmed })
    setEditingTitle(false)
  }

  const activeVersion = getActiveVersion(track)
  const displayTitle  = formatTrackTitle(track.title, track.features ?? [])
  const hasNotes      = !!track.notes
  const versionCount  = track.track_versions?.length ?? 0

  return (
    <div>
      <div
        draggable
        onDragStart={dragHandlers.onDragStart}
        onDragOver={dragHandlers.onDragOver}
        onDrop={dragHandlers.onDrop}
        onDragEnd={dragHandlers.onDrop}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          background: isActive ? 'rgba(200,255,0,0.04)' : dragHandlers.isDragOver ? 'rgba(255,255,255,0.02)' : 'transparent',
          borderRadius: 8, border: `0.5px solid ${dragHandlers.isDragOver ? '#2a2a2a' : isActive ? 'rgba(200,255,0,0.15)' : 'transparent'}`,
          transition: 'all 0.1s ease',
        }}
      >
        {/* Drag handle */}
        <div style={{ cursor: 'grab', color: '#2a2a2a', flexShrink: 0, padding: '0 2px', display: 'flex', alignItems: 'center' }}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" /><circle cx="7" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" /><circle cx="7" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" /><circle cx="7" cy="13" r="1.5" />
          </svg>
        </div>

        {/* Number */}
        <span style={{ fontSize: 11, color: isActive ? '#C8FF00' : '#3a3a3a', fontWeight: 600, width: 18, textAlign: 'right', flexShrink: 0 }}>{index + 1}</span>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
              onBlur={saveTitle} onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setEditTitle(track.title) } }}
              style={{ background: '#1a1a1a', border: '1px solid #C8FF00', borderRadius: 4, padding: '3px 7px', fontSize: 13, color: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit' }} />
          ) : (
            <p style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#C8FF00' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.1px' }}>{displayTitle}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            {activeVersion && (
              <span style={{ fontSize: 10, color: '#3a3a3a', fontWeight: 500 }}>{activeVersion.version_name}</span>
            )}
            {versionCount > 1 && (
              <span style={{ fontSize: 10, color: '#2e2e2e' }}>· {versionCount} versions</span>
            )}
            {track.duration_seconds != null && (
              <span style={{ fontSize: 10, color: '#3a3a3a' }}>{formatDur(track.duration_seconds)}</span>
            )}
          </div>
        </div>

        {/* Notes icon */}
        <button onClick={() => { setEditNotes(track.notes ?? ''); setNotesOpen(o => !o) }} title={hasNotes ? 'View notes' : 'Add notes'}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={hasNotes ? '#C8FF00' : '#2a2a2a'} strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" /><line x1="13" y1="17" x2="8" y2="17" />
          </svg>
        </button>

        {/* Play */}
        <button onClick={onPlay}
          style={{ background: isActive && isPlaying ? 'rgba(200,255,0,0.12)' : 'transparent', border: `1px solid ${isActive ? '#C8FF00' : '#222'}`, borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}>
          {isActive && isPlaying
            ? <svg width="10" height="10" viewBox="0 0 24 24" fill="#C8FF00"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            : <svg width="10" height="10" viewBox="0 0 24 24" fill={isActive ? '#C8FF00' : '#555'}><polygon points="5 3 19 12 5 21 5 3" /></svg>
          }
        </button>

        {/* Three-dot menu */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(o => !o)}
            style={{ background: 'transparent', border: '1px solid #1e1e1e', borderRadius: 5, color: '#3a3a3a', cursor: 'pointer', padding: '2px 7px', fontSize: 13, letterSpacing: '2px', lineHeight: 1.2, transition: 'border-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#666' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.color = '#3a3a3a' }}
          >···</button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#111', border: '0.5px solid #1e1e1e', borderRadius: 8, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.8)', zIndex: 50 }}>
              <button onClick={() => { setEditingTitle(true); setMenuOpen(false) }} style={mitem}>Edit title</button>
              <button onClick={() => { setEditNotes(track.notes ?? ''); setNotesOpen(true); setMenuOpen(false) }} style={mitem}>{hasNotes ? 'Edit notes' : 'Add notes'}</button>
              <button onClick={() => { onManageVersions(); setMenuOpen(false) }} style={mitem}>Manage Versions {versionCount > 1 ? `(${versionCount})` : ''}</button>
              <button onClick={() => { onDelete(); setMenuOpen(false) }} style={{ ...mitem, color: '#FF3B3B' }}>Remove from project</button>
            </div>
          )}
        </div>
      </div>

      {/* Inline notes */}
      {notesOpen && (
        <div style={{ margin: '4px 0 8px 50px', background: '#0d0d0d', border: '0.5px solid #1a1a1a', borderRadius: 8, padding: 14 }}>
          <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Production notes, lyric ideas, anything relevant…" rows={3} autoFocus
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#bbb', fontSize: 13, lineHeight: 1.6, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setNotesOpen(false)} style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#555', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            <button onClick={saveNotes} disabled={savingNotes} style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingNotes ? 0.6 : 1 }}>
              {savingNotes ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
const mitem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#ccc', fontSize: 13, padding: '8px 12px', cursor: 'pointer', borderRadius: 5 }

/* ── Audio Player ── */

function AudioPlayer({ tracks, activeIdx, onSetIdx }: {
  tracks: ProjectTrack[]
  activeIdx: number | null
  onSetIdx: (idx: number | null) => void
}) {
  const audioRef   = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying]   = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]       = useState(0)
  const [volume, setVolume]           = useState(1)

  const activeTrack = activeIdx !== null ? tracks[activeIdx] : null

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || activeIdx === null || !tracks[activeIdx]) return
    audio.src = getActiveAudioUrl(tracks[activeIdx])
    audio.volume = volume
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx])

  function handleTimeUpdate() {
    const a = audioRef.current
    if (!a) return
    setCurrentTime(a.currentTime)
    setDuration(a.duration || 0)
  }

  function handleEnded() {
    if (activeIdx !== null && activeIdx < tracks.length - 1) onSetIdx(activeIdx + 1)
    else { setIsPlaying(false); setCurrentTime(0) }
  }

  function togglePlay() {
    const a = audioRef.current
    if (!a || activeIdx === null) return
    if (isPlaying) { a.pause(); setIsPlaying(false) } else { a.play(); setIsPlaying(true) }
  }

  function prev() {
    if (activeIdx === null) return
    const a = audioRef.current
    if (a && currentTime > 3) { a.currentTime = 0; setCurrentTime(0) }
    else if (activeIdx > 0) onSetIdx(activeIdx - 1)
  }

  function next() {
    if (activeIdx !== null && activeIdx < tracks.length - 1) onSetIdx(activeIdx + 1)
  }

  function seekClick(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current
    if (!a || !progressRef.current || !duration) return
    const rect = progressRef.current.getBoundingClientRect()
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration
  }

  function handleVolume(e: ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  if (activeIdx === null || !activeTrack) return null

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(8,8,8,0.97)', borderTop: '0.5px solid #1a1a1a', backdropFilter: 'blur(20px)', zIndex: 100, padding: '10px 24px' }}>
      <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleTimeUpdate} onEnded={handleEnded} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 20 }}>

        {/* Track info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 190, flexShrink: 0, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 5, overflow: 'hidden', background: '#1a1a1a', border: '0.5px solid #222', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.5"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatTrackTitle(activeTrack.title, activeTrack.features ?? [])}</p>
            <p style={{ fontSize: 10, color: '#3a3a3a', marginTop: 1 }}>{getActiveVersion(activeTrack)?.version_name ?? ''} · {activeIdx + 1}/{tracks.length}</p>
          </div>
        </div>

        {/* Controls + progress */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={prev} style={pBtn}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" /></svg>
            </button>
            <button onClick={togglePlay} style={{ ...pBtn, width: 34, height: 34, background: '#C8FF00', border: 'none', color: '#000', borderRadius: '50%' }}>
              {isPlaying
                ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              }
            </button>
            <button onClick={next} style={pBtn}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 480 }}>
            <span style={{ fontSize: 10, color: '#3a3a3a', width: 28, textAlign: 'right', flexShrink: 0 }}>{formatTime(currentTime)}</span>
            <div ref={progressRef} onClick={seekClick} style={{ flex: 1, height: 3, background: '#1e1e1e', borderRadius: 2, cursor: 'pointer' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#C8FF00', borderRadius: 2, transition: 'width 0.1s linear' }} />
            </div>
            <span style={{ fontSize: 10, color: '#3a3a3a', width: 28, flexShrink: 0 }}>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: 120, justifyContent: 'flex-end', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2e2e2e" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />{volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}</svg>
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={handleVolume}
            style={{ width: 72, accentColor: '#C8FF00', cursor: 'pointer' }} />
        </div>
      </div>
    </div>
  )
}
const pBtn: React.CSSProperties = { background: 'transparent', border: '1px solid #1e1e1e', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#666', transition: 'border-color 0.15s' }

/* ── Inspiration Board ── */

function InspirationBoard({ project, onUpdate }: { project: Project; onUpdate: (items: InspirationItem[]) => void }) {
  const { user } = useAuth()
  const imgRef      = useRef<HTMLInputElement>(null)
  const addMenuRef  = useRef<HTMLDivElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [linkInput, setLinkInput]     = useState('')
  const [addingLink, setAddingLink]   = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!addMenuOpen) return
    function outside(e: MouseEvent) { if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) { setAddMenuOpen(false); setAddingLink(false) } }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [addMenuOpen])

  async function saveItems(items: InspirationItem[]) {
    await supabase.from('projects').update({ inspiration_items: items, updated_at: new Date().toISOString() }).eq('id', project.id)
    onUpdate(items)
  }

  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !user) return
    setUploading(true); setAddMenuOpen(false)
    const ext = f.name.split('.').pop()
    const path = `${user.id}/projects/inspo/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('artwork').upload(path, f)
    if (!error) {
      const { data } = supabase.storage.from('artwork').getPublicUrl(path)
      await saveItems([...project.inspiration_items, { id: crypto.randomUUID(), type: 'image', url: data.publicUrl, created_at: new Date().toISOString() }])
    }
    setUploading(false); e.target.value = ''
  }

  async function handleAddLink() {
    let url = linkInput.trim()
    if (!url) return
    if (!url.startsWith('http')) url = 'https://' + url
    await saveItems([...project.inspiration_items, { id: crypto.randomUUID(), type: 'link', url, created_at: new Date().toISOString() }])
    setLinkInput(''); setAddingLink(false); setAddMenuOpen(false)
  }

  async function deleteItem(id: string) {
    await saveItems(project.inspiration_items.filter(i => i.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Inspiration</h2>
          <p style={{ fontSize: 11, color: '#444' }}>Images, links, references — the vibe.</p>
        </div>
        <div ref={addMenuRef} style={{ position: 'relative' }}>
          <button onClick={() => { setAddMenuOpen(o => !o); setAddingLink(false) }}
            style={{ background: '#1a1a1a', border: '0.5px solid #2a2a2a', color: '#aaa', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {uploading ? '…' : '+ Add'}
          </button>
          {addMenuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#111', border: '0.5px solid #1e1e1e', borderRadius: 10, padding: 6, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.8)', zIndex: 50 }}>
              <button onClick={() => imgRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#ccc', fontSize: 13, padding: '9px 12px', cursor: 'pointer', borderRadius: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                Upload image
              </button>
              <button onClick={() => setAddingLink(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#ccc', fontSize: 13, padding: '9px 12px', cursor: 'pointer', borderRadius: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                Add link
              </button>
              {addingLink && (
                <div style={{ padding: '8px 10px', borderTop: '0.5px solid #1a1a1a', marginTop: 4 }}>
                  <input placeholder="https://…" value={linkInput} onChange={e => setLinkInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddLink()} autoFocus
                    style={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit' }} />
                  <button onClick={handleAddLink} disabled={!linkInput.trim()}
                    style={{ marginTop: 8, background: '#C8FF00', border: 'none', color: '#000', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: linkInput.trim() ? 'pointer' : 'not-allowed', opacity: linkInput.trim() ? 1 : 0.5, width: '100%' }}>Add</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} style={{ display: 'none' }} />

      {project.inspiration_items.length === 0 ? (
        <div style={{ background: '#0a0a0a', border: '1px dashed #1a1a1a', borderRadius: 10, padding: '36px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#333' }}>Add images and links that capture the vibe</p>
        </div>
      ) : (
        <div style={{ columns: 2, columnGap: 8 }}>
          {project.inspiration_items.map(item =>
            item.type === 'image'
              ? <InspoImage key={item.id} item={item} onClick={() => setLightboxSrc(item.url)} onDelete={() => deleteItem(item.id)} />
              : <InspoLink key={item.id} item={item} onDelete={() => deleteItem(item.id)} />
          )}
        </div>
      )}

      {lightboxSrc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.96)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightboxSrc(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>×</button>
        </div>
      )}
    </div>
  )
}

function InspoImage({ item, onClick, onDelete }: { item: InspirationItem; onClick: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ position: 'relative', breakInside: 'avoid', marginBottom: 8, borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={onClick}>
      <img src={item.url} alt="" style={{ width: '100%', display: 'block', borderRadius: 8 }} />
      {hovered && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.48)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 8, borderRadius: 8 }}>
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            style={{ background: 'rgba(0,0,0,0.7)', border: '0.5px solid #2a2a2a', color: '#fff', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

function InspoLink({ item, onDelete }: { item: InspirationItem; onDelete: () => void }) {
  const domain = getDomain(item.url)
  return (
    <div style={{ breakInside: 'avoid', marginBottom: 8, background: '#0d0d0d', border: '0.5px solid #1a1a1a', borderRadius: 8, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <img src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`} alt="" style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      <p style={{ flex: 1, fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{domain}</p>
      <a href={item.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#2e2e2e', display: 'flex', flexShrink: 0 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
      </a>
      <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: '#2a2a2a', cursor: 'pointer', display: 'flex', flexShrink: 0, padding: 0, transition: 'color 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#FF3B3B')} onMouseLeave={e => (e.currentTarget.style.color = '#2a2a2a')}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
      </button>
    </div>
  )
}

/* ── Main Page ── */

export function ProjectDetail() {
  const { id }      = useParams<{ id: string }>()
  const { user }    = useAuth()
  const navigate    = useNavigate()

  const [project, setProject]         = useState<Project | null>(null)
  const [tracks, setTracks]           = useState<ProjectTrack[]>([])
  const [loading, setLoading]         = useState(true)
  const [notFound, setNotFound]       = useState(false)
  const [showAddTrack, setShowAddTrack] = useState(false)
  const [activeIdx, setActiveIdx]     = useState<number | null>(null)
  const [isPlaying, setIsPlaying]     = useState(false)
  const [converting, setConverting]   = useState(false)
  const [managingTrack, setManagingTrack] = useState<ProjectTrack | null>(null)

  const dragFromRef  = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!user || !id) return
    Promise.all([
      supabase.from('projects').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('project_tracks').select('*, track_versions(*)').eq('project_id', id).eq('user_id', user.id).order('position'),
    ]).then(([pRes, tRes]) => {
      if (!pRes.data) { setNotFound(true); setLoading(false); return }
      setProject(pRes.data as Project)
      setTracks((tRes.data as ProjectTrack[]) ?? [])
      setLoading(false)
    })
  }, [user, id])

  // Auto-update type when track count changes
  useEffect(() => {
    if (!project || !id) return
    const c = tracks.length
    let t = project.type
    if (c <= 1) t = 'single'
    else if (c <= 6) t = 'ep'
    else if (t !== 'album' && t !== 'mixtape') t = 'album'
    if (t !== project.type) {
      supabase.from('projects').update({ type: t }).eq('id', id)
      setProject(p => p ? { ...p, type: t } : p)
    }
  }, [tracks.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragStart = useCallback((idx: number) => { dragFromRef.current = idx }, [])
  const handleDragOver  = useCallback((e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx) }, [])
  const handleDrop      = useCallback(async (toIdx: number) => {
    const from = dragFromRef.current
    if (from === null || from === toIdx) { dragFromRef.current = null; setDragOverIdx(null); return }
    const reordered = [...tracks]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(toIdx, 0, moved)
    const wp = reordered.map((t, i) => ({ ...t, position: i }))
    setTracks(wp)
    setActiveIdx(prev => {
      if (prev === null) return null
      if (prev === from) return toIdx
      if (from < toIdx && prev > from && prev <= toIdx) return prev - 1
      if (from > toIdx && prev >= toIdx && prev < from) return prev + 1
      return prev
    })
    dragFromRef.current = null; setDragOverIdx(null)
    await Promise.all(wp.map(t => supabase.from('project_tracks').update({ position: t.position }).eq('id', t.id)))
  }, [tracks])

  async function deleteTrack(track: ProjectTrack) {
    await supabase.from('project_tracks').delete().eq('id', track.id)
    const remaining = tracks.filter(t => t.id !== track.id).map((t, i) => ({ ...t, position: i }))
    setTracks(remaining)
    await Promise.all(remaining.map(t => supabase.from('project_tracks').update({ position: t.position }).eq('id', t.id)))
    setActiveIdx(prev => {
      if (prev === null) return null
      const idx = tracks.findIndex(t => t.id === track.id)
      if (idx === prev) return null
      return idx < prev ? prev - 1 : prev
    })
  }

  async function convertToRelease() {
    if (!project || !user) return
    setConverting(true)
    const typeMap: Record<string, string> = { single: 'Single', ep: 'EP', album: 'Album', mixtape: 'Mixtape' }
    const { data, error } = await supabase.from('releases').insert({
      user_id: user.id, title: project.name, type: typeMap[project.type] ?? 'Single',
      drop_date: project.target_drop_date, artwork_url: project.cover_art_url, status: 'upcoming',
    }).select().single()
    if (error) { setConverting(false); return }
    await supabase.from('projects').update({ status: 'released' }).eq('id', project.id)
    setProject(p => p ? { ...p, status: 'released' } : p)
    const params = `?releaseId=${data.id}&title=${encodeURIComponent(project.name)}&type=${encodeURIComponent(typeMap[project.type] ?? 'Single')}&date=${project.target_drop_date ?? ''}`
    setConverting(false)
    navigate(`/app/rollout/new${params}`)
  }

  function handleSetIdx(idx: number | null) { setActiveIdx(idx); setIsPlaying(idx !== null) }
  function handlePlayTrack(idx: number) {
    if (activeIdx === idx) setIsPlaying(p => !p)
    else { setActiveIdx(idx); setIsPlaying(true) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #222', borderTopColor: '#C8FF00', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (notFound || !project) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: '#555', fontSize: 14 }}>Project not found.</p>
      <button onClick={() => navigate('/app/projects')} style={{ background: 'transparent', border: '1px solid #333', borderRadius: 8, padding: '10px 18px', color: '#888', cursor: 'pointer', fontSize: 13 }}>← Projects</button>
    </div>
  )

  const typeLabel       = computeType(tracks.length, project.type)
  const showTypeToggle  = tracks.length >= 7
  const formattedDate   = project.target_drop_date
    ? new Date(project.target_drop_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', paddingBottom: activeIdx !== null ? 90 : 0 }}>
      <style>{`.proj-detail-grid { display: grid; grid-template-columns: 60fr 40fr; gap: 40px; align-items: start; } @media (max-width: 860px) { .proj-detail-grid { grid-template-columns: 1fr !important; } }`}</style>

      {/* Top bar */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 60, borderBottom: '0.5px solid #1a1a1a', position: 'sticky', top: 0, background: '#0A0A0A', zIndex: 50 }}>
        <button onClick={() => navigate('/app/projects')} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Projects
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '3px', color: '#C8FF00' }}>LABYL</span>
        <button onClick={convertToRelease} disabled={converting || tracks.length === 0}
          style={{ background: 'transparent', border: `1px solid ${tracks.length > 0 ? '#C8FF00' : '#222'}`, color: tracks.length > 0 ? '#C8FF00' : '#333', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: tracks.length > 0 ? 'pointer' : 'default', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
          {converting ? 'Creating…' : 'Ready to drop? Start Rollout →'}
        </button>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 40px' }}>
        <div className="proj-detail-grid">

          {/* LEFT — Cover + Tracklist */}
          <div>
            {/* Cover art */}
            <CoverArtUpload
              project={project}
              onUpdate={url => setProject(p => p ? { ...p, cover_art_url: url } : p)}
            />

            {/* Album header */}
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 6, lineHeight: 1.1 }}>{project.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {project.status === 'released'
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#1D9E75', borderRadius: 5, padding: '3px 9px', letterSpacing: '0.5px' }}>RELEASED</span>
                  : <span style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>{typeLabel}</span>
                }
                {formattedDate && <span style={{ fontSize: 12, color: '#555' }}>· {formattedDate}</span>}
              </div>

              {/* Album/Mixtape toggle */}
              {showTypeToggle && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <span style={{ fontSize: 11, color: '#444' }}>7+ tracks —</span>
                  {(['album', 'mixtape'] as const).map(t => (
                    <button key={t} onClick={async () => {
                      await supabase.from('projects').update({ type: t }).eq('id', project.id)
                      setProject(p => p ? { ...p, type: t } : p)
                    }} style={{ background: project.type === t ? 'rgba(200,255,0,0.08)' : 'transparent', border: `1px solid ${project.type === t ? '#C8FF00' : '#2a2a2a'}`, color: project.type === t ? '#C8FF00' : '#555', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tracklist header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 10, borderBottom: '0.5px solid #111' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#333', letterSpacing: '1.5px' }}>
                TRACKLIST · {tracks.length} {tracks.length === 1 ? 'TRACK' : 'TRACKS'}
              </p>
              <button onClick={() => setShowAddTrack(true)}
                style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                + Add Track
              </button>
            </div>

            {/* Tracks */}
            {tracks.length === 0 ? (
              <div style={{ background: '#0a0a0a', border: '1px dashed #1a1a1a', borderRadius: 10, padding: '40px 20px', textAlign: 'center', marginTop: 8 }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1e1e1e" strokeWidth="1.2" style={{ marginBottom: 10 }}>
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
                <p style={{ fontSize: 13, color: '#333' }}>No tracks yet</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {tracks.map((track, i) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={i}
                    isActive={activeIdx === i}
                    isPlaying={activeIdx === i && isPlaying}
                    onPlay={() => handlePlayTrack(i)}
                    onDelete={() => deleteTrack(track)}
                    onUpdate={updated => setTracks(ts => ts.map(t => t.id === updated.id ? updated : t))}
                    onManageVersions={() => setManagingTrack(track)}
                    dragHandlers={{ onDragStart: () => handleDragStart(i), onDragOver: (e: React.DragEvent) => handleDragOver(e, i), onDrop: () => handleDrop(i), isDragOver: dragOverIdx === i }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT — Inspiration Board */}
          <div style={{ position: 'sticky', top: 76 }}>
            <InspirationBoard
              project={project}
              onUpdate={items => setProject(p => p ? { ...p, inspiration_items: items } : p)}
            />
          </div>
        </div>
      </main>

      {/* Audio Player */}
      <AudioPlayer tracks={tracks} activeIdx={activeIdx} onSetIdx={handleSetIdx} />

      {/* Add Track Modal */}
      {showAddTrack && user && (
        <AddTrackModal
          projectId={project.id}
          userId={user.id}
          onClose={() => setShowAddTrack(false)}
          onAdded={t => { setTracks(ts => [...ts, t]); setShowAddTrack(false) }}
        />
      )}

      {/* Manage Versions Modal */}
      {managingTrack && (
        <ManageVersionsModal
          track={managingTrack}
          onClose={() => setManagingTrack(null)}
          onTrackUpdated={updated => {
            setTracks(ts => ts.map(t => t.id === updated.id ? updated : t))
            setManagingTrack(updated)
          }}
        />
      )}
    </div>
  )
}
