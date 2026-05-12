import { useEffect, useRef, useState, useCallback } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/* ── Types ── */

interface InspirationItem {
  id: string
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
}

/* ── Helpers ── */

function computeType(count: number, stored: string): string {
  if (count <= 1) return 'Single'
  if (count <= 6) return 'EP'
  return stored === 'mixtape' ? 'Mixtape' : 'Album'
}

function formatDur(sec: number | null): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function getAudioDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const dur = Math.round(audio.duration)
      URL.revokeObjectURL(audio.src)
      resolve(isFinite(dur) ? dur : 0)
    }
    audio.onerror = () => resolve(0)
    audio.src = URL.createObjectURL(file)
  })
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

/* ── Add Track Modal ── */

function AddTrackModal({ projectId, userId, onClose, onAdded }: {
  projectId: string
  userId: string
  onClose: () => void
  onAdded: (t: ProjectTrack) => void
}) {
  const audioRef = useRef<HTMLInputElement>(null)
  const artRef   = useRef<HTMLInputElement>(null)

  const [title, setTitle]           = useState('')
  const [audioFile, setAudioFile]   = useState<File | null>(null)
  const [artFile, setArtFile]       = useState<File | null>(null)
  const [artPreview, setArtPreview] = useState<string | null>(null)
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  function handleAudio(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setAudioFile(f)
  }

  function handleArt(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setArtFile(f)
    setArtPreview(URL.createObjectURL(f))
  }

  async function handleAdd() {
    if (!title.trim() || !audioFile) return
    setSaving(true)
    setError('')

    // Upload audio
    const audioExt = audioFile.name.split('.').pop()
    const audioPath = `${userId}/projects/${Date.now()}.${audioExt}`
    const { error: audioErr } = await supabase.storage.from('audio').upload(audioPath, audioFile)
    if (audioErr) { setError('Audio upload failed: ' + audioErr.message); setSaving(false); return }
    const { data: audioData } = supabase.storage.from('audio').getPublicUrl(audioPath)
    const audioUrl = audioData.publicUrl

    // Upload artwork (optional)
    let artworkUrl: string | null = null
    if (artFile) {
      const artExt = artFile.name.split('.').pop()
      const artPath = `${userId}/tracks/${Date.now()}.${artExt}`
      const { error: artErr } = await supabase.storage.from('artwork').upload(artPath, artFile)
      if (!artErr) {
        const { data: artData } = supabase.storage.from('artwork').getPublicUrl(artPath)
        artworkUrl = artData.publicUrl
      }
    }

    // Detect duration
    const duration = await getAudioDuration(audioFile)

    // Get current track count for position
    const { count } = await supabase.from('project_tracks').select('*', { count: 'exact', head: true }).eq('project_id', projectId)
    const position = count ?? 0

    const { data, error: insertErr } = await supabase.from('project_tracks').insert({
      project_id: projectId,
      user_id: userId,
      title: title.trim(),
      audio_url: audioUrl,
      artwork_url: artworkUrl,
      notes: notes.trim() || null,
      position,
      duration_seconds: duration > 0 ? duration : null,
    }).select().single()

    setSaving(false)
    if (insertErr) { setError(insertErr.message); return }

    // Update project updated_at
    await supabase.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId)

    onAdded(data as ProjectTrack)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '0.5px solid #222', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 24, letterSpacing: '-0.3px' }}>Add Track</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title */}
          <div>
            <label style={ml}>TRACK TITLE *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Untitled"
              autoFocus
              style={mi}
              onFocus={e => (e.target.style.borderColor = '#C8FF00')}
              onBlur={e => (e.target.style.borderColor = '#222')}
            />
          </div>

          {/* Audio */}
          <div>
            <label style={ml}>AUDIO FILE * <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>.mp3 .wav</span></label>
            <div
              onClick={() => audioRef.current?.click()}
              style={{ background: '#0f0f0f', border: `1px solid ${audioFile ? '#C8FF00' : '#222'}`, borderRadius: 8, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={audioFile ? '#C8FF00' : '#444'} strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span style={{ fontSize: 13, color: audioFile ? '#C8FF00' : '#444' }}>
                {audioFile ? audioFile.name : 'Choose audio file'}
              </span>
            </div>
            <input ref={audioRef} type="file" accept=".mp3,.wav,audio/*" onChange={handleAudio} style={{ display: 'none' }} />
          </div>

          {/* Artwork */}
          <div>
            <label style={ml}>TRACK ARTWORK <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional</span></label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div
                onClick={() => artRef.current?.click()}
                style={{ width: 56, height: 56, borderRadius: 8, background: '#0f0f0f', border: '1px solid #222', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                {artPreview
                  ? <img src={artPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                }
              </div>
              <p style={{ fontSize: 12, color: '#444' }}>Click to upload artwork for this track</p>
            </div>
            <input ref={artRef} type="file" accept="image/*" onChange={handleArt} style={{ display: 'none' }} />
          </div>

          {/* Notes */}
          <div>
            <label style={ml}>NOTES <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Production notes, lyric ideas, anything relevant"
              rows={3}
              style={{ ...mi, resize: 'vertical', lineHeight: 1.5 }}
              onFocus={e => (e.target.style.borderColor = '#C8FF00')}
              onBlur={e => (e.target.style.borderColor = '#222')}
            />
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#FF4444', marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#888', borderRadius: 8, padding: '10px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleAdd}
            disabled={!title.trim() || !audioFile || saving}
            style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: !title.trim() || !audioFile || saving ? 'not-allowed' : 'pointer', opacity: !title.trim() || !audioFile || saving ? 0.5 : 1, transition: 'opacity 0.15s' }}
          >
            {saving ? 'Uploading…' : 'Add to Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
const ml: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: 8 }
const mi: React.CSSProperties = { background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit', transition: 'border-color 0.15s' }

/* ── Track Row ── */

function TrackRow({ track, index, isActive, isPlaying, onPlay, onDelete, onUpdate, dragHandlers }: {
  track: ProjectTrack
  index: number
  isActive: boolean
  isPlaying: boolean
  onPlay: () => void
  onDelete: () => void
  onUpdate: (t: ProjectTrack) => void
  dragHandlers: {
    onDragStart: () => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: () => void
    isDragOver: boolean
  }
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [editNotes, setEditNotes] = useState(track.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(track.title)
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
    if (!trimmed || trimmed === track.title) { setEditingTitle(false); return }
    await supabase.from('project_tracks').update({ title: trimmed }).eq('id', track.id)
    onUpdate({ ...track, title: trimmed })
    setEditingTitle(false)
  }

  const hasNotes = !!track.notes

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
          background: isActive ? 'rgba(200,255,0,0.05)' : dragHandlers.isDragOver ? 'rgba(255,255,255,0.03)' : 'transparent',
          borderRadius: 8, border: `0.5px solid ${dragHandlers.isDragOver ? '#333' : isActive ? 'rgba(200,255,0,0.2)' : 'transparent'}`,
          transition: 'all 0.1s ease', cursor: 'default',
        }}
      >
        {/* Drag handle */}
        <div style={{ cursor: 'grab', color: '#333', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 2px' }}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" /><circle cx="7" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" /><circle cx="7" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" /><circle cx="7" cy="13" r="1.5" />
          </svg>
        </div>

        {/* Track number */}
        <span style={{ fontSize: 11, color: isActive ? '#C8FF00' : '#444', fontWeight: 600, width: 18, textAlign: 'right', flexShrink: 0 }}>{index + 1}</span>

        {/* Artwork */}
        <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#1a1a1a', border: '0.5px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {track.artwork_url
            ? <img src={track.artwork_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          }
        </div>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              autoFocus
              style={{ background: '#1a1a1a', border: '1px solid #C8FF00', borderRadius: 4, padding: '3px 6px', fontSize: 13, color: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit' }}
            />
          ) : (
            <p style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#C8FF00' : '#fff', letterSpacing: '-0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {track.title}
            </p>
          )}
          {track.duration_seconds != null && (
            <p style={{ fontSize: 10, color: '#444', marginTop: 2 }}>{formatDur(track.duration_seconds)}</p>
          )}
        </div>

        {/* Notes icon */}
        <button
          onClick={() => { setEditNotes(track.notes ?? ''); setNotesOpen(o => !o) }}
          title={hasNotes ? 'View notes' : 'Add notes'}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={hasNotes ? '#C8FF00' : '#333'} strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" /><line x1="13" y1="17" x2="8" y2="17" />
          </svg>
        </button>

        {/* Play button */}
        <button
          onClick={onPlay}
          style={{ background: isActive && isPlaying ? 'rgba(200,255,0,0.15)' : 'transparent', border: `1px solid ${isActive ? '#C8FF00' : '#222'}`, borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
        >
          {isActive && isPlaying ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#C8FF00"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill={isActive ? '#C8FF00' : '#555'}><polygon points="5 3 19 12 5 21 5 3" /></svg>
          )}
        </button>

        {/* Three-dot menu */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{ background: 'transparent', border: '1px solid #222', borderRadius: 5, color: '#444', cursor: 'pointer', padding: '2px 7px', fontSize: 13, letterSpacing: '2px', lineHeight: 1.2 }}
          >···</button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: 4, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.7)', zIndex: 50 }}>
              <button onClick={() => { setEditingTitle(true); setMenuOpen(false) }} style={mi2}>Edit title</button>
              <button onClick={() => { setEditNotes(track.notes ?? ''); setNotesOpen(true); setMenuOpen(false) }} style={mi2}>
                {hasNotes ? 'Edit notes' : 'Add notes'}
              </button>
              <button onClick={() => { onDelete(); setMenuOpen(false) }} style={{ ...mi2, color: '#FF3B3B' }}>Remove from project</button>
            </div>
          )}
        </div>
      </div>

      {/* Inline notes panel */}
      {notesOpen && (
        <div style={{ margin: '4px 0 8px 56px', background: '#0f0f0f', border: '0.5px solid #222', borderRadius: 8, padding: 14 }}>
          <textarea
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="Production notes, lyric ideas, anything relevant…"
            rows={3}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#ccc', fontSize: 13, lineHeight: 1.6, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setNotesOpen(false)} style={{ background: 'transparent', border: '1px solid #333', color: '#666', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            <button onClick={saveNotes} disabled={savingNotes} style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingNotes ? 0.6 : 1 }}>
              {savingNotes ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
const mi2: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#ccc', fontSize: 13, padding: '8px 12px', cursor: 'pointer', borderRadius: 5 }

/* ── Audio Player ── */

function AudioPlayer({ tracks, activeIdx, onSetIdx }: {
  tracks: ProjectTrack[]
  activeIdx: number | null
  onSetIdx: (idx: number | null) => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [seeking] = useState(false)
  const progressRef = useRef<HTMLDivElement>(null)

  const activeTrack = activeIdx !== null ? tracks[activeIdx] : null

  // Load new track when activeIdx changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || activeIdx === null || !tracks[activeIdx]) return
    audio.src = tracks[activeIdx].audio_url
    audio.volume = volume
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx])

  function handleTimeUpdate() {
    const audio = audioRef.current
    if (!audio || seeking) return
    setCurrentTime(audio.currentTime)
    setDuration(audio.duration || 0)
  }

  function handleEnded() {
    if (activeIdx !== null && activeIdx < tracks.length - 1) {
      onSetIdx(activeIdx + 1)
    } else {
      setIsPlaying(false)
      setCurrentTime(0)
    }
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || activeIdx === null) return
    if (isPlaying) { audio.pause(); setIsPlaying(false) }
    else { audio.play(); setIsPlaying(true) }
  }

  function prev() {
    if (activeIdx === null) return
    if (currentTime > 3) {
      const audio = audioRef.current
      if (audio) { audio.currentTime = 0; setCurrentTime(0) }
    } else if (activeIdx > 0) {
      onSetIdx(activeIdx - 1)
    }
  }

  function next() {
    if (activeIdx === null) return
    if (activeIdx < tracks.length - 1) onSetIdx(activeIdx + 1)
  }

  function seekClick(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current
    if (!audio || !progressRef.current || !duration) return
    const rect = progressRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newTime = pct * duration
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  function handleVolumeChange(e: ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  if (activeIdx === null || !activeTrack) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10,10,10,0.97)', borderTop: '0.5px solid #1e1e1e', backdropFilter: 'blur(16px)', zIndex: 100, padding: '12px 24px' }}>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Track info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 200, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', background: '#1a1a1a', border: '0.5px solid #222', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {activeTrack.artwork_url
              ? <img src={activeTrack.artwork_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            }
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTrack.title}</p>
            <p style={{ fontSize: 10, color: '#444' }}>{activeIdx + 1} / {tracks.length}</p>
          </div>
        </div>

        {/* Controls */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={prev} style={pbtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" /></svg>
            </button>
            <button onClick={togglePlay} style={{ ...pbtn, width: 36, height: 36, borderRadius: '50%', background: '#C8FF00', color: '#000', border: 'none' }}>
              {isPlaying
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              }
            </button>
            <button onClick={next} style={pbtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 500 }}>
            <span style={{ fontSize: 10, color: '#444', width: 30, textAlign: 'right', flexShrink: 0 }}>{formatTime(currentTime)}</span>
            <div
              ref={progressRef}
              onClick={seekClick}
              style={{ flex: 1, height: 3, background: '#222', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
            >
              <div style={{ width: `${progress}%`, height: '100%', background: '#C8FF00', borderRadius: 2, transition: seeking ? 'none' : 'width 0.1s linear' }} />
            </div>
            <span style={{ fontSize: 10, color: '#444', width: 30, flexShrink: 0 }}>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 130, justifyContent: 'flex-end', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            {volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
            {volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
          </svg>
          <input
            type="range" min={0} max={1} step={0.01} value={volume}
            onChange={handleVolumeChange}
            style={{ width: 80, accentColor: '#C8FF00', cursor: 'pointer' }}
          />
        </div>
      </div>
    </div>
  )
}
const pbtn: React.CSSProperties = { background: 'transparent', border: '1px solid #222', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888', transition: 'border-color 0.15s, color 0.15s' }

/* ── Inspiration Board ── */

function InspirationBoard({ project, onUpdate }: {
  project: Project
  onUpdate: (items: InspirationItem[]) => void
}) {
  const { user } = useAuth()
  const imgRef = useRef<HTMLInputElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [addingLink, setAddingLink] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!addMenuOpen) return
    function outside(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false); setAddingLink(false)
      }
    }
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
    setUploading(true)
    setAddMenuOpen(false)
    const ext = f.name.split('.').pop()
    const path = `${user.id}/projects/inspo/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('artwork').upload(path, f)
    if (!error) {
      const { data } = supabase.storage.from('artwork').getPublicUrl(path)
      const newItem: InspirationItem = { id: crypto.randomUUID(), type: 'image', url: data.publicUrl, created_at: new Date().toISOString() }
      await saveItems([...project.inspiration_items, newItem])
    }
    setUploading(false)
    e.target.value = ''
  }

  async function handleAddLink() {
    let url = linkInput.trim()
    if (!url) return
    if (!url.startsWith('http')) url = 'https://' + url
    const newItem: InspirationItem = { id: crypto.randomUUID(), type: 'link', url, created_at: new Date().toISOString() }
    await saveItems([...project.inspiration_items, newItem])
    setLinkInput('')
    setAddingLink(false)
    setAddMenuOpen(false)
  }

  async function deleteItem(id: string) {
    await saveItems(project.inspiration_items.filter(i => i.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Inspiration</h2>
          <p style={{ fontSize: 11, color: '#555' }}>Images, links, references — the vibe for this project.</p>
        </div>
        <div ref={addMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setAddMenuOpen(o => !o); setAddingLink(false) }}
            style={{ background: '#1a1a1a', border: '0.5px solid #333', color: '#ccc', borderRadius: 7, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {uploading ? '…' : '+ Add'}
          </button>
          {addMenuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#111', border: '0.5px solid #222', borderRadius: 10, padding: 6, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.7)', zIndex: 50 }}>
              <button
                onClick={() => imgRef.current?.click()}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#ccc', fontSize: 13, padding: '9px 12px', cursor: 'pointer', borderRadius: 6 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                Upload image
              </button>
              <button
                onClick={() => setAddingLink(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#ccc', fontSize: 13, padding: '9px 12px', cursor: 'pointer', borderRadius: 6 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                Add link
              </button>
              {addingLink && (
                <div style={{ padding: '8px 10px', borderTop: '0.5px solid #1e1e1e', marginTop: 4 }}>
                  <input
                    placeholder="https://..."
                    value={linkInput}
                    onChange={e => setLinkInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddLink()}
                    autoFocus
                    style={{ background: '#0f0f0f', border: '1px solid #333', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={handleAddLink}
                    disabled={!linkInput.trim()}
                    style={{ marginTop: 8, background: '#C8FF00', border: 'none', color: '#000', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: linkInput.trim() ? 'pointer' : 'not-allowed', opacity: linkInput.trim() ? 1 : 0.5, width: '100%' }}
                  >Add Link</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} style={{ display: 'none' }} />

      {project.inspiration_items.length === 0 ? (
        <div style={{ background: '#0d0d0d', border: '1px dashed #222', borderRadius: 10, padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#444' }}>No inspiration yet</p>
          <p style={{ fontSize: 12, color: '#333', marginTop: 4 }}>Add images and links that capture the vibe</p>
        </div>
      ) : (
        <div style={{ columns: 2, columnGap: 8 }}>
          {project.inspiration_items.map(item =>
            item.type === 'image' ? (
              <InspoImage key={item.id} item={item} onClick={() => setLightboxSrc(item.url)} onDelete={() => deleteItem(item.id)} />
            ) : (
              <InspoLink key={item.id} item={item} onDelete={() => deleteItem(item.id)} />
            )
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setLightboxSrc(null)}
        >
          <img src={lightboxSrc} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
          <button
            onClick={() => setLightboxSrc(null)}
            style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}
          >×</button>
        </div>
      )}
    </div>
  )
}

function InspoImage({ item, onClick, onDelete }: { item: InspirationItem; onClick: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{ position: 'relative', breakInside: 'avoid', marginBottom: 8, borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <img src={item.url} alt="" style={{ width: '100%', display: 'block', borderRadius: 8 }} />
      {hovered && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 10, borderRadius: 8 }}>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            style={{ background: 'rgba(0,0,0,0.7)', border: '0.5px solid #333', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

function InspoLink({ item, onDelete }: { item: InspirationItem; onDelete: () => void }) {
  const domain = getDomain(item.url)
  const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`
  return (
    <div style={{ breakInside: 'avoid', marginBottom: 8, background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src={faviconUrl} alt="" style={{ width: 16, height: 16, borderRadius: 2, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      <p style={{ flex: 1, fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{domain}</p>
      <a href={item.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#444', display: 'flex', flexShrink: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
      </a>
      <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: '#333', cursor: 'pointer', display: 'flex', flexShrink: 0, padding: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
      </button>
    </div>
  )
}

/* ── Main Page ── */

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [tracks, setTracks] = useState<ProjectTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showAddTrack, setShowAddTrack] = useState(false)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [converting, setConverting] = useState(false)

  // Drag state
  const dragFromRef = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!user || !id) return
    Promise.all([
      supabase.from('projects').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('project_tracks').select('*').eq('project_id', id).eq('user_id', user.id).order('position'),
    ]).then(([projRes, tracksRes]) => {
      if (!projRes.data) { setNotFound(true); setLoading(false); return }
      setProject(projRes.data as Project)
      setTracks((tracksRes.data as ProjectTrack[]) ?? [])
      setLoading(false)
    })
  }, [user, id])

  // Auto update project type when track count changes
  useEffect(() => {
    if (!project || !id) return
    const count = tracks.length
    let newType = project.type
    if (count <= 1) newType = 'single'
    else if (count <= 6) newType = 'ep'
    else if (project.type !== 'album' && project.type !== 'mixtape') newType = 'album'
    if (newType !== project.type) {
      supabase.from('projects').update({ type: newType }).eq('id', id)
      setProject(p => p ? { ...p, type: newType } : p)
    }
  }, [tracks.length, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragStart = useCallback((idx: number) => {
    dragFromRef.current = idx
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }, [])

  const handleDrop = useCallback(async (toIdx: number) => {
    const fromIdx = dragFromRef.current
    if (fromIdx === null || fromIdx === toIdx) { dragFromRef.current = null; setDragOverIdx(null); return }
    const reordered = [...tracks]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const withPositions = reordered.map((t, i) => ({ ...t, position: i }))
    setTracks(withPositions)
    // Update active index if needed
    setActiveIdx(prev => {
      if (prev === null) return null
      if (prev === fromIdx) return toIdx
      if (fromIdx < toIdx && prev > fromIdx && prev <= toIdx) return prev - 1
      if (fromIdx > toIdx && prev >= toIdx && prev < fromIdx) return prev + 1
      return prev
    })
    dragFromRef.current = null
    setDragOverIdx(null)
    // Save positions
    await Promise.all(withPositions.map(t => supabase.from('project_tracks').update({ position: t.position }).eq('id', t.id)))
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
      if (idx < prev) return prev - 1
      return prev
    })
  }

  async function convertToRelease() {
    if (!project || !user) return
    setConverting(true)
    const firstArtwork = tracks.find(t => t.artwork_url)?.artwork_url ?? null
    const typeMap: Record<string, string> = { single: 'Single', ep: 'EP', album: 'Album', mixtape: 'Mixtape' }
    const { data, error } = await supabase.from('releases').insert({
      user_id: user.id,
      title: project.name,
      type: typeMap[project.type] ?? 'Single',
      drop_date: project.target_drop_date,
      artwork_url: firstArtwork,
      status: 'upcoming',
    }).select().single()
    if (error) { setConverting(false); return }
    // Mark project as released
    await supabase.from('projects').update({ status: 'released' }).eq('id', project.id)
    setProject(p => p ? { ...p, status: 'released' } : p)
    const params = `?releaseId=${data.id}&title=${encodeURIComponent(project.name)}&type=${encodeURIComponent(typeMap[project.type] ?? 'Single')}&date=${project.target_drop_date ?? ''}`
    setConverting(false)
    navigate(`/app/rollout/new${params}`)
  }

  // Sync isPlaying from audio player state (passed back via callbacks if needed)
  function handleSetIdx(idx: number | null) {
    setActiveIdx(idx)
    setIsPlaying(idx !== null)
  }

  function handlePlayTrack(idx: number) {
    if (activeIdx === idx) {
      setIsPlaying(p => !p)
    } else {
      setActiveIdx(idx)
      setIsPlaying(true)
    }
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

  const typeLabel = computeType(tracks.length, project.type)
  const showTypeToggle = tracks.length >= 7
  const formattedDate = project.target_drop_date
    ? new Date(project.target_drop_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', paddingBottom: activeIdx !== null ? 90 : 0 }}>
      <style>{`
        .proj-detail-grid { display: grid; grid-template-columns: 60fr 40fr; gap: 40px; align-items: start; }
        @media (max-width: 860px) { .proj-detail-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Top bar */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 60, borderBottom: '0.5px solid #1a1a1a', position: 'sticky', top: 0, background: '#0A0A0A', zIndex: 50 }}>
        <button onClick={() => navigate('/app/projects')} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Projects
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '3px', color: '#C8FF00' }}>LABYL</span>
        <button
          onClick={convertToRelease}
          disabled={converting || tracks.length === 0}
          style={{ background: 'transparent', border: `1px solid ${tracks.length > 0 ? '#C8FF00' : '#333'}`, color: tracks.length > 0 ? '#C8FF00' : '#444', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: tracks.length > 0 ? 'pointer' : 'default', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
        >
          {converting ? 'Creating…' : 'Ready to drop? Start Rollout →'}
        </button>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 40px' }}>
        <div className="proj-detail-grid">

          {/* LEFT — Tracklist */}
          <div>
            {/* Project header */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>{project.name}</h1>
                {project.status === 'released'
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#1D9E75', borderRadius: 5, padding: '3px 9px', letterSpacing: '0.5px' }}>RELEASED</span>
                  : <span style={{ fontSize: 10, fontWeight: 700, color: '#888', background: '#1a1a1a', border: '1px solid #222', borderRadius: 5, padding: '3px 9px', letterSpacing: '0.5px' }}>{typeLabel.toUpperCase()}</span>
                }
              </div>
              {formattedDate && <p style={{ fontSize: 13, color: '#555' }}>Target drop: {formattedDate}</p>}

              {/* Album / Mixtape toggle */}
              {showTypeToggle && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: '#555' }}>7+ tracks —</span>
                  {(['album', 'mixtape'] as const).map(t => (
                    <button
                      key={t}
                      onClick={async () => {
                        await supabase.from('projects').update({ type: t }).eq('id', project.id)
                        setProject(p => p ? { ...p, type: t } : p)
                      }}
                      style={{ background: project.type === t ? 'rgba(200,255,0,0.1)' : 'transparent', border: `1px solid ${project.type === t ? '#C8FF00' : '#333'}`, color: project.type === t ? '#C8FF00' : '#555', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tracks header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#444', letterSpacing: '1px' }}>
                TRACKLIST · {tracks.length} {tracks.length === 1 ? 'TRACK' : 'TRACKS'}
              </p>
              <button
                onClick={() => setShowAddTrack(true)}
                style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                + Add Track
              </button>
            </div>

            {/* Track list */}
            {tracks.length === 0 ? (
              <div style={{ background: '#0d0d0d', border: '1px dashed #1e1e1e', borderRadius: 10, padding: '40px 20px', textAlign: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="1.2" style={{ marginBottom: 10 }}>
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
                <p style={{ fontSize: 13, color: '#444' }}>No tracks yet</p>
                <p style={{ fontSize: 12, color: '#333', marginTop: 4 }}>Add your first track to get started</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                    dragHandlers={{
                      onDragStart: () => handleDragStart(i),
                      onDragOver: (e: React.DragEvent) => handleDragOver(e, i),
                      onDrop: () => handleDrop(i),
                      isDragOver: dragOverIdx === i,
                    }}
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
      <AudioPlayer
        tracks={tracks}
        activeIdx={activeIdx}
        onSetIdx={handleSetIdx}
      />

      {/* Add Track Modal */}
      {showAddTrack && user && (
        <AddTrackModal
          projectId={project.id}
          userId={user.id}
          onClose={() => setShowAddTrack(false)}
          onAdded={t => {
            setTracks(ts => [...ts, t])
            setShowAddTrack(false)
          }}
        />
      )}
    </div>
  )
}
