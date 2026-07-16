/*
  SUPABASE SETUP — run these in the SQL editor:

  create table if not exists vault_files (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    file_name text not null,
    file_type text not null check (file_type in ('audio','doc','visual','idea_voice','idea_text')),
    file_url text,
    title text not null default '',
    tags text[] not null default '{}',
    duration_seconds integer,
    text_content text,
    file_size_bytes integer,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
  );

  alter table vault_files enable row level security;
  create policy "Users manage own vault files" on vault_files for all using (auth.uid() = user_id);

  alter table project_tracks add column if not exists vault_file_id uuid references vault_files(id) on delete set null;

  -- Storage: create a bucket called "vault" with 50MB file size limit, public access
  -- Go to Storage → New bucket, name: "vault", public: true
*/

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Wordmark } from '../components/Logo'

/* ── Types ── */

interface VaultFile {
  id: string
  user_id: string
  file_name: string
  file_type: 'audio' | 'doc' | 'visual' | 'idea_voice' | 'idea_text'
  file_url: string | null
  title: string
  tags: string[]
  duration_seconds: number | null
  text_content: string | null
  file_size_bytes: number | null
  created_at: string
  updated_at: string
}

type ActiveTab = 'audio' | 'docs' | 'visuals' | 'ideas'
type SortOrder = 'newest' | 'oldest'

/* ── Helpers ── */

function formatDur(sec: number | null): string {
  if (!sec || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function getAudioDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      const d = Math.round(a.duration)
      URL.revokeObjectURL(a.src)
      resolve(isFinite(d) ? d : 0)
    }
    a.onerror = () => resolve(0)
    a.src = URL.createObjectURL(file)
  })
}

function matchesSearch(f: VaultFile, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return (
    f.title.toLowerCase().includes(lower) ||
    f.file_name.toLowerCase().includes(lower) ||
    f.tags.some(t => t.toLowerCase().includes(lower))
  )
}

/* ── Simple TagInput (no forwardRef needed here) ── */

function SimpleTagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
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
      let cur = tags
      parts.slice(0, -1).forEach(p => {
        const t = p.trim()
        if (t && !cur.includes(t)) cur = [...cur, t]
      })
      onChange(cur)
      setInput(parts[parts.length - 1])
    } else {
      setInput(val)
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, padding: '7px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 42, cursor: 'text' }}
    >
      {tags.map(tag => (
        <span key={tag} style={{ background: '#1a1a1a', border: '0.5px solid #333', borderRadius: 5, padding: '3px 8px', fontSize: 12, color: '#ccc', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {tag}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter(t => t !== tag)) }}
            style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
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
        placeholder={tags.length === 0 ? 'Add tags…' : ''}
        style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13, flex: 1, minWidth: 80, fontFamily: 'inherit' }}
      />
    </div>
  )
}

/* ── VaultMiniPlayer ── */

interface MiniPlayerHandle { toggle: () => void }

const VaultMiniPlayer = forwardRef<MiniPlayerHandle, { file: VaultFile; onClose: () => void; onNext?: () => void; onPrev?: () => void; onPlayStateChange?: (playing: boolean) => void }>(
function VaultMiniPlayer({ file, onClose, onNext, onPrev, onPlayStateChange }, ref) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  // Create ONE persistent audio element for the lifetime of the player
  useEffect(() => {
    const a = new Audio()
    a.onloadedmetadata = () => setDuration(a.duration)
    a.ontimeupdate    = () => setCurrent(a.currentTime)
    a.onended         = () => { setPlaying(false); onPlayStateChange?.(false) }
    audioRef.current  = a
    return () => { a.pause(); a.src = ''; audioRef.current = null }
  }, []) // eslint-disable-line

  // Swap src whenever the file changes — changing src stops the previous track atomically
  useEffect(() => {
    const a = audioRef.current
    if (!a || !file.file_url) return
    a.pause()
    a.src         = file.file_url
    a.currentTime = 0
    setCurrent(0)
    setDuration(0)
    setPlaying(false)
    onPlayStateChange?.(false)
    a.play()
      .then(() => { setPlaying(true); onPlayStateChange?.(true) })
      .catch(() => {})
  }, [file]) // eslint-disable-line

  // Media Session — update handlers whenever file/callbacks change
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: file.title,
      artist: '',
      album: 'Vault',
      artwork: [],
    })
    navigator.mediaSession.setActionHandler('play', () => {
      audioRef.current?.play().then(() => { setPlaying(true); onPlayStateChange?.(true) }).catch(() => {})
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      audioRef.current?.pause(); setPlaying(false); onPlayStateChange?.(false)
    })
    navigator.mediaSession.setActionHandler('seekbackward', ({ seekOffset }) => skip(-(seekOffset ?? 15)))
    navigator.mediaSession.setActionHandler('seekforward',  ({ seekOffset }) => skip(seekOffset ?? 15))
    navigator.mediaSession.setActionHandler('nexttrack',     onNext ?? null as unknown as () => void)
    navigator.mediaSession.setActionHandler('previoustrack', onPrev ?? null as unknown as () => void)
    return () => {
      try {
        navigator.mediaSession.setActionHandler('nexttrack',     null as unknown as () => void)
        navigator.mediaSession.setActionHandler('previoustrack', null as unknown as () => void)
      } catch { /* ignore */ }
    }
  }, [file, onNext, onPrev]) // eslint-disable-line

  useImperativeHandle(ref, () => ({ toggle: togglePlay })) // eslint-disable-line

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
      setPlaying(false)
      onPlayStateChange?.(false)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    } else {
      a.play().then(() => {
        setPlaying(true)
        onPlayStateChange?.(true)
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
      }).catch(() => {})
    }
  }

  function seek(e: ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current
    if (!a) return
    const t = parseFloat(e.target.value)
    a.currentTime = t
    setCurrent(t)
  }

  function skip(delta: number) {
    const a = audioRef.current
    if (!a) return
    a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + delta))
  }

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 72, background: 'rgba(10,10,10,0.95)', borderTop: '0.5px solid #222', backdropFilter: 'blur(20px)', zIndex: 100, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16 }}>
      {/* Title */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.title}</p>
        <p style={{ fontSize: 10, color: '#555' }}>{formatDur(Math.round(current))} / {formatDur(Math.round(duration))}</p>
      </div>

      {/* Skip back */}
      <button onClick={() => skip(-15)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-3.7" />
          <text x="8" y="14" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">15</text>
        </svg>
      </button>

      {/* Play/Pause */}
      <button onClick={togglePlay} style={{ background: 'transparent', border: '1px solid #333', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#C8FF00', flexShrink: 0 }}>
        {playing
          ? <svg width="11" height="11" viewBox="0 0 24 24" fill="#C8FF00"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          : <svg width="11" height="11" viewBox="0 0 24 24" fill="#C8FF00"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        }
      </button>

      {/* Skip forward */}
      <button onClick={() => skip(15)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-.49-3.7" />
          <text x="8" y="14" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">15</text>
        </svg>
      </button>

      {/* Progress scrubber */}
      <input type="range" min={0} max={duration || 1} step={0.1} value={current} onChange={seek}
        style={{ flex: 2, maxWidth: 300, accentColor: '#C8FF00', cursor: 'pointer' }} />

      {/* Dismiss */}
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
    </div>
  )
})

/* ── AudioRow ── */

function AudioRow({ file, onPlay, isPlaying, onDelete, onRename, onTagsChange, inProjects }: {
  file: VaultFile
  onPlay: () => void
  isPlaying: boolean
  onDelete: () => void
  onRename: (title: string) => void
  onTagsChange: (tags: string[]) => void
  inProjects: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(file.title)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function outside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [menuOpen])

  function saveTitle() {
    const t = editTitle.trim()
    if (t && t !== file.title) onRename(t)
    setEditingTitle(false)
  }

  function download() {
    if (!file.file_url) return
    const a = document.createElement('a')
    a.href = file.file_url
    a.download = file.file_name
    a.click()
  }

  return (
    <div style={{ background: '#0d0d0d', border: '0.5px solid #1a1a1a', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        {/* Waveform icon */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
          {[10, 18, 14, 22, 16].map((h, i) => (
            <div key={i} style={{ width: 3, height: h, background: '#C8FF00', borderRadius: 2, opacity: isPlaying ? 1 : 0.6 }} />
          ))}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setEditTitle(file.title) } }}
              style={{ background: '#1a1a1a', border: '1px solid #C8FF00', borderRadius: 4, padding: '3px 7px', fontSize: 13, color: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit' }} />
          ) : (
            <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.title}</p>
          )}
          <p style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
            {formatDur(file.duration_seconds)}{file.duration_seconds ? ' · ' : ''}{formatDate(file.created_at)}
          </p>
          {file.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {file.tags.map(tag => (
                <span key={tag} style={{ background: '#1a1a1a', color: '#555', fontSize: 11, borderRadius: 4, padding: '2px 8px' }}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* In Projects badge */}
        {inProjects && (
          <span style={{ background: '#1a1a1a', color: '#555', fontSize: 10, borderRadius: 4, padding: '3px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}>In Projects</span>
        )}

        {/* Play button */}
        <button onClick={onPlay} style={{ background: 'transparent', border: '1px solid #222', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          {isPlaying
            ? <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            : <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          }
        </button>

        {/* Three-dot menu */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'transparent', border: '1px solid #1e1e1e', borderRadius: 5, color: '#3a3a3a', cursor: 'pointer', padding: '2px 7px', fontSize: 13, letterSpacing: '2px', lineHeight: 1.2 }}>···</button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: 4, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.8)', zIndex: 50 }}>
              <button onClick={() => { setShowTagInput(s => !s); setMenuOpen(false) }} style={mitem}>Add tags</button>
              <button onClick={() => { setEditingTitle(true); setMenuOpen(false) }} style={mitem}>Rename</button>
              <button onClick={() => { download(); setMenuOpen(false) }} style={mitem}>Download</button>
              <button onClick={() => { onDelete(); setMenuOpen(false) }} style={{ ...mitem, color: '#FF3B3B' }}>Delete</button>
            </div>
          )}
        </div>
      </div>

      {/* Inline tag input */}
      {showTagInput && (
        <div style={{ padding: '0 16px 12px' }}>
          <SimpleTagInput tags={file.tags} onChange={tags => { onTagsChange(tags); }} />
        </div>
      )}
    </div>
  )
}

/* ── DocRow ── */

function DocRow({ file, onDelete, onRename, onTagsChange }: {
  file: VaultFile
  onDelete: () => void
  onRename: (title: string) => void
  onTagsChange: (tags: string[]) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(file.title)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function outside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [menuOpen])

  const ext = file.file_name.split('.').pop()?.toLowerCase() ?? ''
  const iconColor = ext === 'pdf' ? '#FF4444' : (ext === 'txt' || ext === 'docx' || ext === 'doc') ? '#4488FF' : '#555'
  const extLabel = ext.toUpperCase()

  function saveTitle() {
    const t = editTitle.trim()
    if (t && t !== file.title) onRename(t)
    setEditingTitle(false)
  }

  function download() {
    if (!file.file_url) return
    const a = document.createElement('a')
    a.href = file.file_url
    a.download = file.file_name
    a.click()
  }

  return (
    <div style={{ background: '#0d0d0d', border: '0.5px solid #1a1a1a', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        {/* Doc icon */}
        <div style={{ flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setEditTitle(file.title) } }}
              style={{ background: '#1a1a1a', border: '1px solid #C8FF00', borderRadius: 4, padding: '3px 7px', fontSize: 13, color: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit' }} />
          ) : (
            <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.title}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ background: '#1a1a1a', color: '#555', fontSize: 10, borderRadius: 4, padding: '2px 6px' }}>{extLabel}</span>
            {file.file_size_bytes ? <span style={{ fontSize: 11, color: '#555' }}>{formatSize(file.file_size_bytes)}</span> : null}
            <span style={{ fontSize: 11, color: '#555' }}>· {formatDate(file.created_at)}</span>
          </div>
          {file.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {file.tags.map(tag => (
                <span key={tag} style={{ background: '#1a1a1a', color: '#555', fontSize: 11, borderRadius: 4, padding: '2px 8px' }}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Three-dot menu */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'transparent', border: '1px solid #1e1e1e', borderRadius: 5, color: '#3a3a3a', cursor: 'pointer', padding: '2px 7px', fontSize: 13, letterSpacing: '2px', lineHeight: 1.2 }}>···</button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: 4, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.8)', zIndex: 50 }}>
              <button onClick={() => { if (file.file_url) window.open(file.file_url, '_blank'); setMenuOpen(false) }} style={mitem}>Preview</button>
              <button onClick={() => { download(); setMenuOpen(false) }} style={mitem}>Download</button>
              <button onClick={() => { setShowTagInput(s => !s); setMenuOpen(false) }} style={mitem}>Add tags</button>
              <button onClick={() => { setEditingTitle(true); setMenuOpen(false) }} style={mitem}>Rename</button>
              <button onClick={() => { onDelete(); setMenuOpen(false) }} style={{ ...mitem, color: '#FF3B3B' }}>Delete</button>
            </div>
          )}
        </div>
      </div>

      {showTagInput && (
        <div style={{ padding: '0 16px 12px' }}>
          <SimpleTagInput tags={file.tags} onChange={onTagsChange} />
        </div>
      )}
    </div>
  )
}

/* ── VisualItem ── */

function VisualItem({ file, onDelete, onTagsChange, onOpenLightbox }: {
  file: VaultFile
  onDelete: () => void
  onTagsChange: (tags: string[]) => void
  onOpenLightbox: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function outside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [menuOpen])

  function download() {
    if (!file.file_url) return
    const a = document.createElement('a')
    a.href = file.file_url
    a.download = file.file_name
    a.click()
  }

  return (
    <div style={{ breakInside: 'avoid', marginBottom: 10, position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false) }}>
      {file.file_url && (
        <img src={file.file_url} alt={file.title} onClick={onOpenLightbox}
          style={{ width: '100%', display: 'block', borderRadius: 8 }} />
      )}
      {hovered && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 10 }}
          onClick={onOpenLightbox}>
          <div ref={menuRef} style={{ position: 'relative', alignSelf: 'flex-end' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'rgba(0,0,0,0.7)', border: '0.5px solid #333', borderRadius: 5, color: '#ccc', cursor: 'pointer', padding: '2px 8px', fontSize: 13, letterSpacing: '2px', lineHeight: 1.2 }}>···</button>
            {menuOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: 4, minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.8)', zIndex: 50 }}>
                <button onClick={() => { download(); setMenuOpen(false) }} style={mitem}>Download</button>
                <button onClick={() => { setShowTagInput(s => !s); setMenuOpen(false) }} style={mitem}>Add tags</button>
                <button onClick={() => { onDelete(); setMenuOpen(false) }} style={{ ...mitem, color: '#FF3B3B' }}>Delete</button>
              </div>
            )}
          </div>
          <p style={{ fontSize: 11, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.file_name}</p>
        </div>
      )}
      {showTagInput && (
        <div style={{ padding: 8, background: '#0d0d0d', borderTop: '0.5px solid #1a1a1a' }}>
          <SimpleTagInput tags={file.tags} onChange={onTagsChange} />
        </div>
      )}
    </div>
  )
}

/* ── TextNoteModal ── */

function TextNoteModal({ file, onClose, onSave }: {
  file: VaultFile
  onClose: () => void
  onSave: (content: string, title: string) => void
}) {
  const [content, setContent] = useState(file.text_content ?? '')
  const [title, setTitle] = useState(file.title)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '0.5px solid #222', borderRadius: 16, padding: 28, width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '90vh', overflowY: 'auto' }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Note title"
          style={{ background: 'transparent', border: 'none', borderBottom: '0.5px solid #222', outline: 'none', fontSize: 20, fontWeight: 700, color: '#fff', padding: '0 0 12px', fontFamily: 'inherit', width: '100%' }} />
        <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)}
          placeholder="Write your idea here…" rows={14}
          style={{ background: '#0d0d0d', border: '0.5px solid #1a1a1a', borderRadius: 8, padding: 16, fontSize: 14, color: '#ccc', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, width: '100%' }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#888', borderRadius: 8, padding: '10px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onSave(content, title.trim() || file.title)} style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ── IdeaCard ── */

function IdeaCard({ file, isPlaying, onPlay, onDelete, onRename, onTagsChange, onEdit }: {
  file: VaultFile
  isPlaying: boolean
  onPlay: () => void
  onDelete: () => void
  onRename: (title: string) => void
  onTagsChange: (tags: string[]) => void
  onEdit: (content: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(file.title)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function outside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [menuOpen])

  function saveTitle() {
    const t = editTitle.trim()
    if (t && t !== file.title) onRename(t)
    setEditingTitle(false)
  }

  if (file.file_type === 'idea_voice') {
    return (
      <div style={{ background: '#0d0d0d', border: '0.5px solid #1a1a1a', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'transparent', border: '1px solid #1e1e1e', borderRadius: 5, color: '#3a3a3a', cursor: 'pointer', padding: '2px 7px', fontSize: 13, letterSpacing: '2px', lineHeight: 1.2 }}>···</button>
            {menuOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: 4, minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.8)', zIndex: 50 }}>
                <button onClick={() => { setEditingTitle(true); setMenuOpen(false) }} style={mitem}>Rename</button>
                <button onClick={() => { setShowTagInput(s => !s); setMenuOpen(false) }} style={mitem}>Add tags</button>
                <button onClick={() => { onDelete(); setMenuOpen(false) }} style={{ ...mitem, color: '#FF3B3B' }}>Delete</button>
              </div>
            )}
          </div>
        </div>

        {editingTitle ? (
          <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setEditTitle(file.title) } }}
            style={{ background: '#1a1a1a', border: '1px solid #C8FF00', borderRadius: 4, padding: '3px 7px', fontSize: 13, color: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit', marginBottom: 8 }} />
        ) : (
          <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{file.title}</p>
        )}
        <p style={{ fontSize: 11, color: '#555', marginBottom: 12 }}>{formatDur(file.duration_seconds)} · {formatDate(file.created_at)}</p>

        {file.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {file.tags.map(tag => (
              <span key={tag} style={{ background: '#1a1a1a', color: '#555', fontSize: 11, borderRadius: 4, padding: '2px 8px' }}>{tag}</span>
            ))}
          </div>
        )}

        <button onClick={onPlay} style={{ background: 'transparent', border: '1px solid #222', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          {isPlaying
            ? <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            : <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          }
        </button>

        {showTagInput && (
          <div style={{ marginTop: 10 }}>
            <SimpleTagInput tags={file.tags} onChange={onTagsChange} />
          </div>
        )}
      </div>
    )
  }

  // idea_text
  const preview = (file.text_content ?? '').split('\n').slice(0, 2).join('\n')

  return (
    <div style={{ background: '#0d0d0d', border: '0.5px solid #1a1a1a', borderRadius: 12, padding: 16, cursor: 'pointer' }}
      onClick={() => onEdit(file.text_content ?? '')}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="13" y1="17" x2="8" y2="17" />
        </svg>
        <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'transparent', border: '1px solid #1e1e1e', borderRadius: 5, color: '#3a3a3a', cursor: 'pointer', padding: '2px 7px', fontSize: 13, letterSpacing: '2px', lineHeight: 1.2 }}>···</button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: 4, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.8)', zIndex: 50 }}>
              <button onClick={() => { onEdit(file.text_content ?? ''); setMenuOpen(false) }} style={mitem}>Edit</button>
              <button onClick={() => { navigator.clipboard.writeText(file.text_content ?? ''); setMenuOpen(false) }} style={mitem}>Copy text</button>
              <button onClick={() => { setShowTagInput(s => !s); setMenuOpen(false) }} style={mitem}>Add tags</button>
              <button onClick={() => { onDelete(); setMenuOpen(false) }} style={{ ...mitem, color: '#FF3B3B' }}>Delete</button>
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 6 }}>{file.title}</p>
      {preview && <p style={{ fontSize: 11, color: '#555', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{preview}</p>}
      <p style={{ fontSize: 11, color: '#3a3a3a', marginTop: 8 }}>{formatDate(file.created_at)}</p>

      {file.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {file.tags.map(tag => (
            <span key={tag} style={{ background: '#1a1a1a', color: '#555', fontSize: 11, borderRadius: 4, padding: '2px 8px' }}>{tag}</span>
          ))}
        </div>
      )}

      {showTagInput && (
        <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
          <SimpleTagInput tags={file.tags} onChange={onTagsChange} />
        </div>
      )}
    </div>
  )
}

/* ── LightboxModal ── */

function LightboxModal({ file, onClose }: { file: VaultFile; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.96)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      {file.file_url && (
        <img src={file.file_url} alt={file.title} onClick={e => e.stopPropagation()}
          style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />
      )}
      <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>×</button>
    </div>
  )
}

/* ── UploadModal ── */

type UploadType = 'audio' | 'doc' | 'visual' | 'idea' | null
type IdeaSubtype = 'voice' | 'text' | null

function UploadModal({ onClose, onUploaded }: {
  onClose: () => void
  onUploaded: (file: VaultFile) => void
}) {
  const { user } = useAuth()
  const [selectedType, setSelectedType] = useState<UploadType>(null)
  const [ideaSubtype, setIdeaSubtype] = useState<IdeaSubtype>(null)

  // File upload state
  const [chosenFile, setChosenFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadTags, setUploadTags] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Voice memo state
  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [recBlob, setRecBlob] = useState<Blob | null>(null)
  const [recPreviewUrl, setRecPreviewUrl] = useState<string | null>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Text note state
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')

  function handleFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setChosenFile(f)
    setUploadTitle(f.name.replace(/\.[^.]+$/, ''))
    e.target.value = ''
  }

  function acceptForType(): string {
    if (selectedType === 'audio') return '.mp3,.wav,.aiff,.m4a,audio/*'
    if (selectedType === 'doc') return '.pdf,.txt,.docx,application/pdf,text/plain'
    if (selectedType === 'visual') return '.jpg,.jpeg,.png,.webp,image/*'
    return ''
  }

  async function handleUploadFile() {
    if (!chosenFile || !user || !selectedType || selectedType === 'idea') return
    setSaving(true); setError(''); setStatus('Uploading…')

    try {
      const ext = chosenFile.name.split('.').pop() ?? 'bin'
      const folderMap: Record<string, string> = { audio: 'audio', doc: 'docs', visual: 'visuals' }
      const folder = folderMap[selectedType]
      const path = `${folder}/${user.id}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('vault').upload(path, chosenFile)
      if (upErr) { setError(upErr.message); setSaving(false); setStatus(''); return }

      const { data: urlData } = supabase.storage.from('vault').getPublicUrl(path)
      const fileUrl = urlData.publicUrl

      let duration: number | null = null
      if (selectedType === 'audio') {
        setStatus('Reading duration…')
        duration = await getAudioDuration(chosenFile)
        if (duration === 0) duration = null
      }

      const fileTypeMap: Record<string, VaultFile['file_type']> = { audio: 'audio', doc: 'doc', visual: 'visual' }

      const { data, error: dbErr } = await supabase.from('vault_files').insert({
        user_id: user.id,
        file_name: chosenFile.name,
        file_type: fileTypeMap[selectedType],
        file_url: fileUrl,
        title: uploadTitle.trim() || chosenFile.name,
        tags: uploadTags,
        duration_seconds: duration,
        text_content: null,
        file_size_bytes: chosenFile.size,
      }).select().single()

      if (dbErr || !data) { setError(dbErr?.message ?? 'Failed to save'); setSaving(false); setStatus(''); return }
      setSaving(false); setStatus('')
      onUploaded(data as VaultFile)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setError(msg); setSaving(false); setStatus('')
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices) { setError('Microphone not available. Make sure you are on HTTPS.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg' })
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        setRecBlob(blob)
        setRecPreviewUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      mediaRecRef.current = mr
      setRecording(true)
      setRecSeconds(0)
      intervalRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not access microphone'
      setError(msg)
    }
  }

  function stopRecording() {
    mediaRecRef.current?.stop()
    if (intervalRef.current) clearInterval(intervalRef.current)
    setRecording(false)
  }

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    mediaRecRef.current?.stop()
  }, [])

  async function saveVoiceMemo() {
    if (!recBlob || !user) return
    setSaving(true); setError(''); setStatus('Uploading…')
    try {
      const ext = recBlob.type.includes('webm') ? 'webm' : 'ogg'
      const path = `ideas/${user.id}/${Date.now()}.${ext}`
      const file = new File([recBlob], `voice-${Date.now()}.${ext}`, { type: recBlob.type })
      const { error: upErr } = await supabase.storage.from('vault').upload(path, file)
      if (upErr) { setError(upErr.message); setSaving(false); setStatus(''); return }
      const { data: urlData } = supabase.storage.from('vault').getPublicUrl(path)
      const duration = recSeconds > 0 ? recSeconds : null

      const { data, error: dbErr } = await supabase.from('vault_files').insert({
        user_id: user.id,
        file_name: file.name,
        file_type: 'idea_voice' as VaultFile['file_type'],
        file_url: urlData.publicUrl,
        title: uploadTitle.trim() || `Voice Memo ${new Date().toLocaleTimeString()}`,
        tags: uploadTags,
        duration_seconds: duration,
        text_content: null,
        file_size_bytes: recBlob.size,
      }).select().single()

      if (dbErr || !data) { setError(dbErr?.message ?? 'Failed to save'); setSaving(false); setStatus(''); return }
      setSaving(false); setStatus('')
      onUploaded(data as VaultFile)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setError(msg); setSaving(false); setStatus('')
    }
  }

  async function saveTextNote() {
    if (!user || !noteTitle.trim()) return
    setSaving(true); setError('')
    const { data, error: dbErr } = await supabase.from('vault_files').insert({
      user_id: user.id,
      file_name: `${noteTitle.trim()}.txt`,
      file_type: 'idea_text' as VaultFile['file_type'],
      file_url: null,
      title: noteTitle.trim(),
      tags: uploadTags,
      duration_seconds: null,
      text_content: noteContent,
      file_size_bytes: null,
    }).select().single()

    if (dbErr || !data) { setError(dbErr?.message ?? 'Failed to save'); setSaving(false); return }
    setSaving(false)
    onUploaded(data as VaultFile)
  }

  const typeTiles: Array<{ key: UploadType; icon: string; label: string; accept: string }> = [
    { key: 'audio', icon: '🎵', label: 'Audio', accept: '.mp3 .wav .aiff .m4a' },
    { key: 'doc', icon: '📄', label: 'Document', accept: '.pdf .txt .docx' },
    { key: 'visual', icon: '🖼️', label: 'Visual', accept: '.jpg .png .webp' },
    { key: 'idea', icon: '💡', label: 'Idea', accept: 'voice or text' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '0.5px solid #222', borderRadius: 16, padding: 32, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Add to Vault</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: '#555', marginBottom: 28 }}>Choose a type to upload</p>

        {/* Type tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
          {typeTiles.map(tile => (
            <button key={tile.key} onClick={() => {
              setSelectedType(tile.key)
              setIdeaSubtype(null)
              setChosenFile(null)
              setUploadTitle('')
              setUploadTags([])
              setError('')
              if (tile.key !== 'idea' && tile.key !== null) {
                setTimeout(() => fileInputRef.current?.click(), 50)
              }
            }} style={{
              background: '#0d0d0d',
              border: `1px solid ${selectedType === tile.key ? '#C8FF00' : '#222'}`,
              borderRadius: 12, padding: '18px 12px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minHeight: 110
            }}>
              <span style={{ fontSize: 28 }}>{tile.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: selectedType === tile.key ? '#C8FF00' : '#fff' }}>{tile.label}</span>
              <span style={{ fontSize: 10, color: '#555' }}>{tile.accept}</span>
            </button>
          ))}
        </div>

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept={acceptForType()} onChange={handleFileChosen} style={{ display: 'none' }} />

        {/* Step 2a — file chosen for audio/doc/visual */}
        {chosenFile && selectedType && selectedType !== 'idea' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {chosenFile.name}</p>
            <div>
              <label style={flbl}>TITLE</label>
              <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="File title"
                style={finp} onFocus={e => (e.target.style.borderColor = '#C8FF00')} onBlur={e => (e.target.style.borderColor = '#222')} />
            </div>
            <div>
              <label style={flbl}>TAGS</label>
              <SimpleTagInput tags={uploadTags} onChange={setUploadTags} />
            </div>
            {status && <p style={{ fontSize: 12, color: '#888' }}>{status}</p>}
            {error && <p style={{ fontSize: 12, color: '#FF4444' }}>{error}</p>}
            <button onClick={handleUploadFile} disabled={saving || !uploadTitle.trim()} style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: saving || !uploadTitle.trim() ? 'not-allowed' : 'pointer', opacity: saving || !uploadTitle.trim() ? 0.5 : 1 }}>
              {saving ? status || 'Saving…' : 'Save to Vault'}
            </button>
          </div>
        )}

        {/* Step 2b — Idea sub-choice */}
        {selectedType === 'idea' && !ideaSubtype && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setIdeaSubtype('voice')} style={{ flex: 1, background: '#0d0d0d', border: '1px solid #222', borderRadius: 12, padding: '16px 10px', cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 24 }}>🎙️</span> Record voice memo
            </button>
            <button onClick={() => setIdeaSubtype('text')} style={{ flex: 1, background: '#0d0d0d', border: '1px solid #222', borderRadius: 12, padding: '16px 10px', cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 24 }}>📝</span> Write a note
            </button>
          </div>
        )}

        {/* Voice memo recorder */}
        {selectedType === 'idea' && ideaSubtype === 'voice' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!recBlob ? (
              <>
                {recording ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    {/* Pulsing record indicator */}
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#FF3B3B', boxShadow: '0 0 0 6px rgba(255,59,59,0.2)', animation: 'pulse 1s ease-in-out infinite' }} />
                    <style>{`@keyframes pulse { 0%,100% { box-shadow: 0 0 0 6px rgba(255,59,59,0.2); } 50% { box-shadow: 0 0 0 12px rgba(255,59,59,0.05); } }`}</style>
                    <p style={{ fontSize: 24, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                      {Math.floor(recSeconds / 60)}:{(recSeconds % 60).toString().padStart(2, '0')}
                    </p>
                    <button onClick={stopRecording} style={{ background: '#FF3B3B', border: 'none', color: '#fff', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Stop</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <button onClick={startRecording} style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: '50%', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 28 }}>🎙️</button>
                    <p style={{ fontSize: 13, color: '#555' }}>Tap to start recording</p>
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <audio src={recPreviewUrl ?? undefined} controls style={{ width: '100%' }} />
                <div>
                  <label style={flbl}>TITLE</label>
                  <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder={`Voice Memo ${new Date().toLocaleTimeString()}`}
                    style={finp} onFocus={e => (e.target.style.borderColor = '#C8FF00')} onBlur={e => (e.target.style.borderColor = '#222')} />
                </div>
                <div>
                  <label style={flbl}>TAGS</label>
                  <SimpleTagInput tags={uploadTags} onChange={setUploadTags} />
                </div>
                {status && <p style={{ fontSize: 12, color: '#888' }}>{status}</p>}
                {error && <p style={{ fontSize: 12, color: '#FF4444' }}>{error}</p>}
                <button onClick={saveVoiceMemo} disabled={saving} style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>
                  {saving ? status || 'Saving…' : 'Save to Vault'}
                </button>
              </div>
            )}
            {error && <p style={{ fontSize: 12, color: '#FF4444' }}>{error}</p>}
          </div>
        )}

        {/* Text note */}
        {selectedType === 'idea' && ideaSubtype === 'text' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={flbl}>TITLE *</label>
              <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="Idea title"
                style={finp} onFocus={e => (e.target.style.borderColor = '#C8FF00')} onBlur={e => (e.target.style.borderColor = '#222')} />
            </div>
            <div>
              <label style={flbl}>CONTENT</label>
              <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="Write your idea here…" rows={6} autoFocus
                style={{ ...finp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                onFocus={e => (e.target.style.borderColor = '#C8FF00')} onBlur={e => (e.target.style.borderColor = '#222')} />
            </div>
            <div>
              <label style={flbl}>TAGS</label>
              <SimpleTagInput tags={uploadTags} onChange={setUploadTags} />
            </div>
            {error && <p style={{ fontSize: 12, color: '#FF4444' }}>{error}</p>}
            <button onClick={saveTextNote} disabled={saving || !noteTitle.trim()} style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: saving || !noteTitle.trim() ? 'not-allowed' : 'pointer', opacity: saving || !noteTitle.trim() ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save to Vault'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const mitem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#ccc', fontSize: 13, padding: '8px 12px', cursor: 'pointer', borderRadius: 5 }
const flbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: 8 }
const finp: React.CSSProperties = { background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit', transition: 'border-color 0.15s' }

/* ── Tab content components ── */

function AudioTab({ files, playingFile, miniPlaying, onPlay, onDelete, onRename, onTagsChange, inProjectIds }: {
  files: VaultFile[]
  playingFile: VaultFile | null
  miniPlaying?: boolean
  onPlay: (f: VaultFile) => void
  onDelete: (f: VaultFile) => void
  onRename: (f: VaultFile, title: string) => void
  onTagsChange: (f: VaultFile, tags: string[]) => void
  inProjectIds: Set<string>
}) {
  if (files.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: 12 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.2">
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>No audio files yet</p>
        <p style={{ fontSize: 13, color: '#555' }}>Upload your first track</p>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {files.map(f => (
        <AudioRow key={f.id} file={f}
          isPlaying={playingFile?.id === f.id && !!miniPlaying}
          onPlay={() => onPlay(f)}
          onDelete={() => onDelete(f)}
          onRename={title => onRename(f, title)}
          onTagsChange={tags => onTagsChange(f, tags)}
          inProjects={inProjectIds.has(f.id)}
        />
      ))}
    </div>
  )
}

function DocsTab({ files, onDelete, onRename, onTagsChange }: {
  files: VaultFile[]
  onDelete: (f: VaultFile) => void
  onRename: (f: VaultFile, title: string) => void
  onTagsChange: (f: VaultFile, tags: string[]) => void
}) {
  if (files.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: 12 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>No documents yet</p>
        <p style={{ fontSize: 13, color: '#555' }}>Upload PDFs, text files, and more</p>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {files.map(f => (
        <DocRow key={f.id} file={f}
          onDelete={() => onDelete(f)}
          onRename={title => onRename(f, title)}
          onTagsChange={tags => onTagsChange(f, tags)}
        />
      ))}
    </div>
  )
}

function VisualsTab({ files, onDelete, onTagsChange, onOpenLightbox }: {
  files: VaultFile[]
  onDelete: (f: VaultFile) => void
  onTagsChange: (f: VaultFile, tags: string[]) => void
  onOpenLightbox: (f: VaultFile) => void
}) {
  if (files.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: 12 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>No visuals yet</p>
        <p style={{ fontSize: 13, color: '#555' }}>Upload images and artwork</p>
      </div>
    )
  }
  return (
    <div style={{ columns: 2, columnGap: 10 }}>
      {files.map(f => (
        <VisualItem key={f.id} file={f}
          onDelete={() => onDelete(f)}
          onTagsChange={tags => onTagsChange(f, tags)}
          onOpenLightbox={() => onOpenLightbox(f)}
        />
      ))}
    </div>
  )
}

function IdeasTab({ files, playingFile, miniPlaying, onPlay, onDelete, onRename, onTagsChange, onEditNote }: {
  files: VaultFile[]
  playingFile: VaultFile | null
  miniPlaying?: boolean
  onPlay: (f: VaultFile) => void
  onDelete: (f: VaultFile) => void
  onRename: (f: VaultFile, title: string) => void
  onTagsChange: (f: VaultFile, tags: string[]) => void
  onEditNote: (f: VaultFile) => void
}) {
  if (files.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: 12 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>No ideas yet</p>
        <p style={{ fontSize: 13, color: '#555' }}>Record voice memos or write text notes</p>
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {files.map(f => (
        <IdeaCard key={f.id} file={f}
          isPlaying={playingFile?.id === f.id && !!miniPlaying}
          onPlay={() => onPlay(f)}
          onDelete={() => onDelete(f)}
          onRename={title => onRename(f, title)}
          onTagsChange={tags => onTagsChange(f, tags)}
          onEdit={() => onEditNote(f)}
        />
      ))}
    </div>
  )
}

/* ── SearchResults ── */

function SearchResults({ audioFiles, docFiles, visualFiles, ideaFiles, playingFile, onPlay, onDelete, onRename, onTagsChange, onOpenLightbox, onEditNote, inProjectIds }: {
  audioFiles: VaultFile[]
  docFiles: VaultFile[]
  visualFiles: VaultFile[]
  ideaFiles: VaultFile[]
  playingFile: VaultFile | null
  onPlay: (f: VaultFile) => void
  onDelete: (f: VaultFile) => void
  onRename: (f: VaultFile, title: string) => void
  onTagsChange: (f: VaultFile, tags: string[]) => void
  onOpenLightbox: (f: VaultFile) => void
  onEditNote: (f: VaultFile) => void
  inProjectIds: Set<string>
}) {
  const groups = [
    { label: 'Audio', files: audioFiles },
    { label: 'Docs', files: docFiles },
    { label: 'Visuals', files: visualFiles },
    { label: 'Ideas', files: ideaFiles },
  ].filter(g => g.files.length > 0)

  if (groups.length === 0) {
    return <p style={{ color: '#555', fontSize: 14, textAlign: 'center', padding: '60px 0' }}>No results found.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {groups.map(group => (
        <div key={group.label}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#444', letterSpacing: '1px', marginBottom: 12 }}>{group.label.toUpperCase()}</p>
          {group.label === 'Audio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.files.map(f => (
                <AudioRow key={f.id} file={f}
                  isPlaying={playingFile?.id === f.id}
                  onPlay={() => onPlay(f)}
                  onDelete={() => onDelete(f)}
                  onRename={title => onRename(f, title)}
                  onTagsChange={tags => onTagsChange(f, tags)}
                  inProjects={inProjectIds.has(f.id)}
                />
              ))}
            </div>
          )}
          {group.label === 'Docs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.files.map(f => (
                <DocRow key={f.id} file={f}
                  onDelete={() => onDelete(f)}
                  onRename={title => onRename(f, title)}
                  onTagsChange={tags => onTagsChange(f, tags)}
                />
              ))}
            </div>
          )}
          {group.label === 'Visuals' && (
            <div style={{ columns: 2, columnGap: 10 }}>
              {group.files.map(f => (
                <VisualItem key={f.id} file={f}
                  onDelete={() => onDelete(f)}
                  onTagsChange={tags => onTagsChange(f, tags)}
                  onOpenLightbox={() => onOpenLightbox(f)}
                />
              ))}
            </div>
          )}
          {group.label === 'Ideas' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {group.files.map(f => (
                <IdeaCard key={f.id} file={f}
                  isPlaying={playingFile?.id === f.id}
                  onPlay={() => onPlay(f)}
                  onDelete={() => onDelete(f)}
                  onRename={title => onRename(f, title)}
                  onTagsChange={tags => onTagsChange(f, tags)}
                  onEdit={() => onEditNote(f)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Main VaultPage ── */

export function Vault() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [files, setFiles] = useState<VaultFile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('audio')
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [showUpload, setShowUpload] = useState(false)
  const [playingFile, setPlayingFile] = useState<VaultFile | null>(null)
  const [miniPlaying, setMiniPlaying] = useState(false)
  const [lightboxFile, setLightboxFile] = useState<VaultFile | null>(null)
  const [editingNote, setEditingNote] = useState<VaultFile | null>(null)
  const [inProjectIds, setInProjectIds] = useState<Set<string>>(new Set())
  const miniPlayerRef = useRef<MiniPlayerHandle>(null)

  useEffect(() => {
    if (!user) return
    async function load() {
      const [vRes, pRes] = await Promise.all([
        supabase.from('vault_files').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
        supabase.from('project_tracks').select('vault_file_id').not('vault_file_id', 'is', null),
      ])
      setFiles((vRes.data ?? []) as VaultFile[])
      setInProjectIds(new Set((pRes.data ?? []).map((r: { vault_file_id: string | null }) => r.vault_file_id).filter((id): id is string => Boolean(id))))
      setLoading(false)
    }
    load()
  }, [user])

  // Computed filtered lists
  const sorted = [...files].sort((a, b) =>
    sortOrder === 'newest'
      ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const audioFiles = sorted.filter(f => f.file_type === 'audio' && matchesSearch(f, search))
  const docFiles = sorted.filter(f => f.file_type === 'doc' && matchesSearch(f, search))
  const visualFiles = sorted.filter(f => f.file_type === 'visual' && matchesSearch(f, search))
  const ideaFiles = sorted.filter(f => (f.file_type === 'idea_voice' || f.file_type === 'idea_text') && matchesSearch(f, search))

  async function deleteFile(file: VaultFile) {
    await supabase.from('vault_files').delete().eq('id', file.id)
    if (file.file_url) {
      // Best-effort storage delete — ignore errors
      const url = new URL(file.file_url)
      const pathParts = url.pathname.split('/object/public/vault/')
      if (pathParts.length > 1) {
        await supabase.storage.from('vault').remove([pathParts[1]])
      }
    }
    setFiles(fs => fs.filter(f => f.id !== file.id))
    if (playingFile?.id === file.id) setPlayingFile(null)
  }

  async function renameFile(file: VaultFile, newTitle: string) {
    await supabase.from('vault_files').update({ title: newTitle, updated_at: new Date().toISOString() }).eq('id', file.id)
    setFiles(fs => fs.map(f => f.id === file.id ? { ...f, title: newTitle } : f))
  }

  async function updateTags(file: VaultFile, tags: string[]) {
    await supabase.from('vault_files').update({ tags, updated_at: new Date().toISOString() }).eq('id', file.id)
    setFiles(fs => fs.map(f => f.id === file.id ? { ...f, tags } : f))
  }

  async function updateNote(file: VaultFile, content: string, title: string) {
    await supabase.from('vault_files').update({ text_content: content, title, updated_at: new Date().toISOString() }).eq('id', file.id)
    setFiles(fs => fs.map(f => f.id === file.id ? { ...f, text_content: content, title } : f))
    setEditingNote(null)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #222', borderTopColor: '#C8FF00', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const tabs: ActiveTab[] = ['audio', 'docs', 'visuals', 'ideas']

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', paddingBottom: playingFile ? 88 : 0 }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 60, borderBottom: '0.5px solid #1a1a1a', position: 'sticky', top: 0, background: '#0A0A0A', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Wordmark height={20} />
          <nav style={{ display: 'flex', gap: 2 }}>
            <button onClick={() => navigate('/app/dashboard')} style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '5px 10px', borderRadius: 6 }}>HQ</button>
            <button onClick={() => navigate('/app/projects')} style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '5px 10px', borderRadius: 6 }}>Projects</button>
            <button style={{ background: 'rgba(200,255,0,0.08)', border: 'none', color: '#C8FF00', fontSize: 13, fontWeight: 600, cursor: 'default', padding: '5px 10px', borderRadius: 6 }}>Vault</button>
            <button onClick={() => navigate('/app/releases')} style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '5px 10px', borderRadius: 6 }}>Catalog</button>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Page title */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 6 }}>Vault</h1>
          <p style={{ fontSize: 13, color: '#888' }}>Your files. Stored, organized, ready.</p>
        </div>

        {/* Top bar: tabs + search + upload */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          {/* Tab pills */}
          <div style={{ display: 'flex', gap: 0 }}>
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: activeTab === tab ? '#fff' : '#555',
                fontSize: 14, fontWeight: activeTab === tab ? 600 : 500,
                padding: '6px 16px',
                borderBottom: `2px solid ${activeTab === tab ? '#C8FF00' : 'transparent'}`,
                textTransform: 'capitalize', transition: 'color 0.15s'
              }}>
                {tab === 'docs' ? 'Docs' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Search + sort + upload */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files and tags…"
                style={{ background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: '8px 12px 8px 32px', fontSize: 13, color: '#fff', outline: 'none', width: 220, fontFamily: 'inherit' }} />
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value as SortOrder)}
              style={{ background: '#111', border: '0.5px solid #222', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#666', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <button onClick={() => setShowUpload(true)}
              style={{ background: '#C8FF00', border: 'none', color: '#000', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              + Upload
            </button>
          </div>
        </div>

        {/* Tab content */}
        {search ? (
          <SearchResults
            audioFiles={audioFiles}
            docFiles={docFiles}
            visualFiles={visualFiles}
            ideaFiles={ideaFiles}
            playingFile={playingFile}
            onPlay={f => { if (playingFile?.id === f.id) miniPlayerRef.current?.toggle(); else { setPlayingFile(f); setMiniPlaying(true) } }}
            onDelete={deleteFile}
            onRename={renameFile}
            onTagsChange={updateTags}
            onOpenLightbox={f => setLightboxFile(f)}
            onEditNote={f => setEditingNote(f)}
            inProjectIds={inProjectIds}
          />
        ) : (
          <>
            {activeTab === 'audio' && (
              <AudioTab files={audioFiles} playingFile={playingFile} miniPlaying={miniPlaying} onPlay={f => { if (playingFile?.id === f.id) miniPlayerRef.current?.toggle(); else { setPlayingFile(f); setMiniPlaying(true) } }}
                onDelete={deleteFile} onRename={renameFile} onTagsChange={updateTags} inProjectIds={inProjectIds} />
            )}
            {activeTab === 'docs' && (
              <DocsTab files={docFiles} onDelete={deleteFile} onRename={renameFile} onTagsChange={updateTags} />
            )}
            {activeTab === 'visuals' && (
              <VisualsTab files={visualFiles} onDelete={deleteFile} onTagsChange={updateTags} onOpenLightbox={f => setLightboxFile(f)} />
            )}
            {activeTab === 'ideas' && (
              <IdeasTab files={ideaFiles} playingFile={playingFile} miniPlaying={miniPlaying} onPlay={f => { if (playingFile?.id === f.id) miniPlayerRef.current?.toggle(); else { setPlayingFile(f); setMiniPlaying(true) } }}
                onDelete={deleteFile} onRename={renameFile} onTagsChange={updateTags} onEditNote={f => setEditingNote(f)} />
            )}
          </>
        )}
      </main>

      {/* Mini player */}
      {playingFile && (() => {
        const audioQueue = audioFiles
        const qi = audioQueue.findIndex(f => f.id === playingFile.id)
        return (
          <VaultMiniPlayer
            ref={miniPlayerRef}
            file={playingFile}
            onClose={() => { setPlayingFile(null); setMiniPlaying(false) }}
            onPlayStateChange={setMiniPlaying}
            onNext={qi >= 0 && qi < audioQueue.length - 1 ? () => { setPlayingFile(audioQueue[qi + 1]); setMiniPlaying(true) } : undefined}
            onPrev={qi > 0 ? () => { setPlayingFile(audioQueue[qi - 1]); setMiniPlaying(true) } : undefined}
          />
        )
      })()}

      {/* Modals */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={f => { setFiles(fs => [f, ...fs]); setShowUpload(false) }}
        />
      )}
      {lightboxFile && <LightboxModal file={lightboxFile} onClose={() => setLightboxFile(null)} />}
      {editingNote && (
        <TextNoteModal
          file={editingNote}
          onClose={() => setEditingNote(null)}
          onSave={(content, title) => updateNote(editingNote, content, title)}
        />
      )}
    </div>
  )
}
