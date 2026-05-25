import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ChatDrawer } from '../components/ChatDrawer'
import { AGENTS } from '../lib/agents'
import type { Label } from '../types'

interface RolloutTask {
  title: string
  description: string
  platform: string | null
  ai_can_help: boolean
  help_type: string | null
}

interface RolloutWeek {
  week: string
  theme: string
  tasks: RolloutTask[]
}

interface RolloutPlan {
  weeks: RolloutWeek[]
}

interface Rollout {
  id: string
  release_title: string
  release_type: string | null
  drop_date: string | null
  artwork_url: string | null
  release_id: string | null
  goals: string[]
  platforms: string[]
  plan: RolloutPlan
  created_at: string
}

const RELEASE_TYPES = ['Single', 'EP', 'Album', 'Mixtape']
const GOAL_OPTIONS = [
  'Get on playlists',
  'Grow my fanbase',
  'Make money',
  'Get a sync placement',
  'Build buzz before an album',
  'Go viral on TikTok',
]

export function RolloutView() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const artworkRef = useRef<HTMLInputElement>(null)

  const [rollout, setRollout] = useState<Rollout | null>(null)
  const [label, setLabel] = useState<Label | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Editable fields
  const [editedTitle, setEditedTitle] = useState('')
  const [editedReleaseType, setEditedReleaseType] = useState('')
  const [editedDropDate, setEditedDropDate] = useState('')
  const [editedGoals, setEditedGoals] = useState<string[]>([])
  const [editedArtworkFile, setEditedArtworkFile] = useState<File | null>(null)
  const [editedArtworkPreview, setEditedArtworkPreview] = useState<string | null>(null)
  const [editedPlan, setEditedPlan] = useState<RolloutPlan | null>(null)

  const [linkedRelease, setLinkedRelease] = useState<{ id: string; status: string; artwork_url: string | null } | null>(null)

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [chatPrompt, setChatPrompt] = useState('')
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    if (!user || !id) return
    Promise.all([
      supabase.from('rollouts').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('labels').select('*').eq('user_id', user.id).single(),
    ]).then(([rolloutRes, labelRes]) => {
      if (!rolloutRes.data) { setNotFound(true); setLoading(false); return }
      setRollout(rolloutRes.data as Rollout)
      setLabel(labelRes.data)
      setLoading(false)
    })
  }, [user, id])

  useEffect(() => {
    if (!rollout?.release_id) return
    supabase.from('releases').select('id,status,artwork_url').eq('id', rollout.release_id).single()
      .then(({ data }) => { if (data) setLinkedRelease(data as typeof linkedRelease) })
  }, [rollout?.release_id])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  function enterEditMode() {
    if (!rollout) return
    setEditedTitle(rollout.release_title)
    setEditedReleaseType(rollout.release_type ?? '')
    setEditedDropDate(rollout.drop_date ?? '')
    setEditedGoals(rollout.goals ?? [])
    setEditedArtworkFile(null)
    setEditedArtworkPreview(null)
    setEditedPlan(JSON.parse(JSON.stringify(rollout.plan)))
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setEditedArtworkFile(null)
    setEditedArtworkPreview(null)
    setEditedPlan(null)
  }

  function handleArtworkChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setEditedArtworkFile(file)
    setEditedArtworkPreview(URL.createObjectURL(file))
  }

  function toggleGoal(g: string) {
    setEditedGoals(gs => gs.includes(g) ? gs.filter(x => x !== g) : [...gs, g])
  }

  async function handleSaveEdits() {
    if (!rollout || !editedPlan || !user) return
    setSaving(true)

    let artworkUrl = rollout.artwork_url
    if (editedArtworkFile) {
      const ext = editedArtworkFile.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('artwork').upload(path, editedArtworkFile)
      if (!error) {
        const { data: u } = supabase.storage.from('artwork').getPublicUrl(path)
        artworkUrl = u.publicUrl
      } else {
        console.error('Artwork upload failed:', error.message)
      }
    }

    const { error } = await supabase.from('rollouts').update({
      release_title: editedTitle,
      release_type: editedReleaseType || null,
      drop_date: editedDropDate || null,
      goals: editedGoals,
      artwork_url: artworkUrl,
      plan: editedPlan,
    }).eq('id', rollout.id)

    setSaving(false)
    if (!error) {
      setRollout(r => r ? {
        ...r,
        release_title: editedTitle,
        release_type: editedReleaseType || null,
        drop_date: editedDropDate || null,
        goals: editedGoals,
        artwork_url: artworkUrl,
        plan: editedPlan,
      } : r)
      setIsEditing(false)
      setEditedPlan(null)
      setEditedArtworkFile(null)
      setEditedArtworkPreview(null)
      setToast('Rollout updated')
    }
  }

  function updateWeekTheme(wi: number, theme: string) {
    setEditedPlan(p => {
      if (!p) return p
      return { ...p, weeks: p.weeks.map((w, i) => i === wi ? { ...w, theme } : w) }
    })
  }

  function updateTask(wi: number, ti: number, field: 'title' | 'description', value: string) {
    setEditedPlan(p => {
      if (!p) return p
      return {
        ...p,
        weeks: p.weeks.map((w, i) => i !== wi ? w : {
          ...w,
          tasks: w.tasks.map((t, j) => j === ti ? { ...t, [field]: value } : t),
        }),
      }
    })
  }

  function deleteTask(wi: number, ti: number) {
    setEditedPlan(p => {
      if (!p) return p
      return {
        ...p,
        weeks: p.weeks.map((w, i) => i !== wi ? w : {
          ...w, tasks: w.tasks.filter((_, j) => j !== ti),
        }),
      }
    })
  }

  function addTask(wi: number) {
    const newTask: RolloutTask = { title: 'New task', description: '', platform: null, ai_can_help: false, help_type: null }
    setEditedPlan(p => {
      if (!p) return p
      return {
        ...p,
        weeks: p.weeks.map((w, i) => i !== wi ? w : { ...w, tasks: [...w.tasks, newTask] }),
      }
    })
  }

  function handleGenerate(task: RolloutTask) {
    if (!rollout) return
    const assetType = task.help_type ?? 'content'
    const prompt = `Generate a ${assetType} for "${rollout.release_title}"${rollout.release_type ? `, a ${rollout.release_type}` : ''}${rollout.drop_date ? ` dropping on ${rollout.drop_date}` : ''}.\n\nTask context: ${task.description}${task.platform ? `\n\nPlatform: ${task.platform}` : ''}`
    setChatPrompt(prompt)
    setChatOpen(true)
  }

  const marketingAgent = AGENTS.find(a => a.type === 'marketing')!
  const displayPlan = isEditing ? editedPlan : rollout?.plan
  const displayArtwork = isEditing && editedArtworkPreview ? editedArtworkPreview : rollout?.artwork_url
  const displayTitle = isEditing ? editedTitle : rollout?.release_title
  const displayReleaseType = isEditing ? editedReleaseType : rollout?.release_type
  const displayDropDate = isEditing ? editedDropDate : rollout?.drop_date
  const displayGoals = isEditing ? editedGoals : (rollout?.goals ?? [])

  const todayDate = new Date().toISOString().split('T')[0]
  const isLive = !!rollout?.drop_date && rollout.drop_date <= todayDate

  const formattedDate = displayDropDate
    ? new Date(displayDropDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.spinner} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (notFound || !rollout) {
    return (
      <div style={styles.loadingPage}>
        <p style={{ color: '#555', fontSize: 14 }}>Rollout not found.</p>
        <button onClick={() => navigate('/app/dashboard')} style={{ ...styles.backBtn, marginTop: 16 }}>← Back to HQ</button>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <header style={styles.topBar}>
        <button onClick={() => isEditing ? cancelEdit() : navigate(rollout?.release_id ? `/app/releases/${rollout.release_id}` : '/app/dashboard')} style={styles.backBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {isEditing ? 'Cancel' : rollout?.release_id ? 'Release' : 'HQ'}
        </button>
        <span style={styles.topBarLabel}>{isEditing ? 'Editing Plan' : 'Rollout Plan'}</span>
        {isEditing ? (
          <button onClick={handleSaveEdits} disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        ) : (
          <button onClick={enterEditMode} style={styles.editBtn}>Edit Plan</button>
        )}
      </header>

      <div style={styles.content}>
        {isLive && (
          <div style={{ maxWidth: 680, margin: '0 auto 24px', background: 'rgba(29,158,117,0.1)', border: '0.5px solid rgba(29,158,117,0.3)', borderRadius: 14, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            {(linkedRelease?.artwork_url ?? rollout.artwork_url) && (
              <img src={linkedRelease?.artwork_url ?? rollout.artwork_url ?? ''} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1D9E75', letterSpacing: '0.5px' }}>● THIS RELEASE IS LIVE</span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{rollout.release_title}</p>
              <p style={{ fontSize: 12, color: '#555' }}>Dropped {new Date(rollout.drop_date! + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
            {linkedRelease && (
              <button
                onClick={() => navigate(`/app/releases/${linkedRelease.id}`)}
                style={{ background: '#1D9E75', border: 'none', color: '#fff', borderRadius: 8, padding: '9px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                View in Catalog →
              </button>
            )}
          </div>
        )}
        <div style={styles.planContainer}>
          {/* Plan header */}
          <div style={styles.planHeader}>
            <div style={styles.planHeaderLeft}>
              {/* Artwork */}
              {isEditing ? (
                <div
                  onClick={() => artworkRef.current?.click()}
                  style={{
                    ...styles.planArtwork,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    position: 'relative',
                    background: '#1a1a1a',
                    border: '1px solid #222',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {displayArtwork ? (
                    <img src={displayArtwork} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <input ref={artworkRef} type="file" accept="image/*" onChange={handleArtworkChange} style={{ display: 'none' }} />
                </div>
              ) : displayArtwork ? (
                <img src={displayArtwork} alt="Artwork" style={styles.planArtwork} />
              ) : (
                <div style={styles.artworkPlaceholder}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              )}

              <div style={{ flex: 1 }}>
                {/* Release type */}
                {isEditing ? (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {RELEASE_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => setEditedReleaseType(t)}
                        style={{
                          ...styles.typeChip,
                          background: editedReleaseType === t ? '#C8FF00' : 'transparent',
                          color: editedReleaseType === t ? '#000' : '#555',
                          borderColor: editedReleaseType === t ? '#C8FF00' : '#333',
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                ) : displayReleaseType ? (
                  <p style={styles.planReleaseType}>{displayReleaseType}</p>
                ) : null}

                {/* Title */}
                {isEditing ? (
                  <input
                    value={editedTitle}
                    onChange={e => setEditedTitle(e.target.value)}
                    style={styles.editableTitle}
                    onFocus={e => (e.target.style.borderColor = '#C8FF00')}
                    onBlur={e => (e.target.style.borderColor = '#222')}
                  />
                ) : (
                  <h1 style={styles.planTitle}>{displayTitle}</h1>
                )}

                {/* Drop date */}
                {isEditing ? (
                  <input
                    type="date"
                    value={editedDropDate}
                    onChange={e => setEditedDropDate(e.target.value)}
                    style={styles.dateInput}
                  />
                ) : (
                  formattedDate && <p style={styles.planMeta}>{formattedDate}</p>
                )}
              </div>
            </div>

            {/* Goals */}
            {isEditing ? (
              <div style={styles.editGoalsPanel}>
                <p style={styles.editGoalsLabel}>Goals</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {GOAL_OPTIONS.map(g => {
                    const active = editedGoals.includes(g)
                    return (
                      <button
                        key={g}
                        onClick={() => toggleGoal(g)}
                        style={{
                          ...styles.goalToggle,
                          background: active ? 'rgba(200,255,0,0.07)' : 'transparent',
                          borderColor: active ? '#C8FF00' : '#222',
                          color: active ? '#C8FF00' : '#555',
                        }}
                      >
                        {active && <span style={{ marginRight: 6 }}>✓</span>}{g}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : displayGoals.length > 0 ? (
              <div style={styles.planGoalPills}>
                {displayGoals.slice(0, 3).map(g => (
                  <span key={g} style={styles.goalPill}>{g}</span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Week cards */}
          <div style={styles.timeline}>
            {displayPlan?.weeks.map((week, wi) =>
              isEditing ? (
                <EditableWeekCard
                  key={wi}
                  week={week}
                  weekIdx={wi}
                  onThemeChange={updateWeekTheme}
                  onTaskChange={updateTask}
                  onTaskDelete={deleteTask}
                  onTaskAdd={addTask}
                />
              ) : (
                <WeekCard key={wi} week={week} onGenerate={handleGenerate} />
              )
            )}
          </div>
        </div>
      </div>

      {toast && <div style={styles.toast}>{toast}</div>}

      {label && (
        <ChatDrawer
          agent={chatOpen ? marketingAgent : null}
          label={label}
          initialPrompt={chatPrompt}
          onClose={() => { setChatOpen(false); setChatPrompt('') }}
        />
      )}
    </div>
  )
}

/* ── Editable week/task components ── */

function EditableWeekCard({
  week, weekIdx, onThemeChange, onTaskChange, onTaskDelete, onTaskAdd,
}: {
  week: RolloutWeek
  weekIdx: number
  onThemeChange: (wi: number, theme: string) => void
  onTaskChange: (wi: number, ti: number, field: 'title' | 'description', value: string) => void
  onTaskDelete: (wi: number, ti: number) => void
  onTaskAdd: (wi: number) => void
}) {
  const isDropWeek = week.week.toLowerCase().includes('drop') || week.week.toLowerCase().includes('release')
  return (
    <div style={{ ...styles.weekCard, borderColor: isDropWeek ? 'rgba(200,255,0,0.3)' : '#1e1e1e' }}>
      <div style={styles.weekCardHeader}>
        <div style={{ flex: 1, marginRight: 12 }}>
          <p style={{ ...styles.weekLabel, color: isDropWeek ? '#C8FF00' : '#555' }}>{week.week}</p>
          <input
            value={week.theme}
            onChange={e => onThemeChange(weekIdx, e.target.value)}
            style={styles.editableTheme}
            onFocus={e => (e.target.style.borderColor = '#C8FF00')}
            onBlur={e => (e.target.style.borderColor = '#222')}
          />
        </div>
        {isDropWeek && <span style={styles.dropBadge}>DROP</span>}
      </div>
      <div style={styles.taskList}>
        {week.tasks.map((task, ti) => (
          <EditableTaskRow
            key={ti}
            task={task}
            weekIdx={weekIdx}
            taskIdx={ti}
            onTaskChange={onTaskChange}
            onTaskDelete={onTaskDelete}
          />
        ))}
        <button
          onClick={() => onTaskAdd(weekIdx)}
          style={styles.addTaskBtn}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#888' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.color = '#444' }}
        >
          + Add task
        </button>
      </div>
    </div>
  )
}

function EditableTaskRow({
  task, weekIdx, taskIdx, onTaskChange, onTaskDelete,
}: {
  task: RolloutTask
  weekIdx: number
  taskIdx: number
  onTaskChange: (wi: number, ti: number, field: 'title' | 'description', value: string) => void
  onTaskDelete: (wi: number, ti: number) => void
}) {
  return (
    <div style={{ ...styles.taskRow, gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {task.platform && <span style={{ ...styles.platformBadge, alignSelf: 'flex-start' }}>{task.platform}</span>}
        <input
          value={task.title}
          onChange={e => onTaskChange(weekIdx, taskIdx, 'title', e.target.value)}
          style={styles.editableInput}
          onFocus={e => (e.target.style.borderColor = '#C8FF00')}
          onBlur={e => (e.target.style.borderColor = '#222')}
        />
        <textarea
          value={task.description}
          onChange={e => onTaskChange(weekIdx, taskIdx, 'description', e.target.value)}
          rows={2}
          style={styles.editableTextarea}
          onFocus={e => (e.target.style.borderColor = '#C8FF00')}
          onBlur={e => (e.target.style.borderColor = '#222')}
        />
      </div>
      <button
        onClick={() => onTaskDelete(weekIdx, taskIdx)}
        style={styles.trashBtn}
        aria-label="Delete task"
        onMouseEnter={e => (e.currentTarget.style.color = '#FF3B3B')}
        onMouseLeave={e => (e.currentTarget.style.color = '#333')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6M9 6V4h6v2" />
        </svg>
      </button>
    </div>
  )
}

/* ── Read-only components ── */

function WeekCard({ week, onGenerate }: { week: RolloutWeek; onGenerate: (t: RolloutTask) => void }) {
  const isDropWeek = week.week.toLowerCase().includes('drop') || week.week.toLowerCase().includes('release')
  return (
    <div style={{ ...styles.weekCard, borderColor: isDropWeek ? 'rgba(200,255,0,0.3)' : '#1e1e1e' }}>
      <div style={styles.weekCardHeader}>
        <div>
          <p style={{ ...styles.weekLabel, color: isDropWeek ? '#C8FF00' : '#555' }}>{week.week}</p>
          <p style={styles.weekTheme}>{week.theme}</p>
        </div>
        {isDropWeek && <span style={styles.dropBadge}>DROP</span>}
      </div>
      <div style={styles.taskList}>
        {week.tasks.map((task, i) => (
          <TaskRow key={i} task={task} onGenerate={() => onGenerate(task)} />
        ))}
      </div>
    </div>
  )
}

function TaskRow({ task, onGenerate }: { task: RolloutTask; onGenerate: () => void }) {
  return (
    <div style={styles.taskRow}>
      <div style={styles.taskLeft}>
        <div style={styles.taskTop}>
          <p style={styles.taskTitle}>{task.title}</p>
          {task.platform && <span style={styles.platformBadge}>{task.platform}</span>}
        </div>
        <p style={styles.taskDesc}>{task.description}</p>
      </div>
      {task.ai_can_help && (
        <button onClick={onGenerate} style={styles.generateBtn}>Generate →</button>
      )}
    </div>
  )
}

/* ── Styles ── */
const styles: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column' },
  loadingPage: { minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  spinner: { width: 24, height: 24, borderRadius: '50%', border: '2px solid #222', borderTopColor: '#C8FF00', animation: 'spin 0.8s linear infinite' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: '60px', borderBottom: '0.5px solid #1a1a1a', flexShrink: 0 },
  backBtn: { background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', padding: 0, minWidth: 70 },
  topBarLabel: { fontSize: '13px', fontWeight: 600, color: '#444', letterSpacing: '0.3px' },
  editBtn: { background: 'transparent', border: '1px solid #C8FF00', color: '#C8FF00', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minWidth: 90 },
  saveBtn: { background: '#C8FF00', border: 'none', color: '#000', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minWidth: 120, transition: 'opacity 0.15s ease' },
  content: { flex: 1, display: 'flex', justifyContent: 'center', padding: '48px 24px 80px' },
  planContainer: { width: '100%', maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '20px' },
  planHeader: { background: '#111', border: '0.5px solid #222', borderRadius: '12px', padding: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' },
  planHeaderLeft: { display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1, minWidth: 0 },
  planArtwork: { width: '72px', height: '72px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 },
  artworkPlaceholder: { width: '72px', height: '72px', borderRadius: '8px', background: '#1a1a1a', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  planReleaseType: { fontSize: '11px', letterSpacing: '2px', color: '#C8FF00', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' },
  planTitle: { fontSize: '22px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.5px', marginBottom: '4px' },
  planMeta: { fontSize: '13px', color: '#555' },
  editableTitle: { fontSize: '20px', fontWeight: 700, color: '#FFFFFF', background: '#0f0f0f', border: '1px solid #222', borderRadius: '6px', padding: '6px 10px', outline: 'none', width: '100%', fontFamily: 'inherit', letterSpacing: '-0.3px', transition: 'border-color 0.15s ease', marginBottom: 6 },
  dateInput: { background: '#0f0f0f', border: '1px solid #222', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: '#FFFFFF', outline: 'none', colorScheme: 'dark', marginTop: 4 },
  typeChip: { padding: '4px 10px', borderRadius: '6px', border: '1px solid', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', letterSpacing: '0.5px' },
  editGoalsPanel: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 },
  editGoalsLabel: { fontSize: '10px', fontWeight: 700, color: '#444', letterSpacing: '1.5px', textTransform: 'uppercase' },
  goalToggle: { padding: '7px 12px', borderRadius: '7px', border: '1px solid', fontSize: '12px', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease' },
  planGoalPills: { display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' },
  goalPill: { fontSize: '11px', color: '#555', border: '1px solid #222', borderRadius: '20px', padding: '4px 10px' },
  timeline: { display: 'flex', flexDirection: 'column', gap: '12px' },
  weekCard: { background: '#111', border: '0.5px solid', borderRadius: '12px', padding: '20px 24px' },
  weekCardHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' },
  weekLabel: { fontSize: '11px', letterSpacing: '1.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' },
  weekTheme: { fontSize: '15px', fontWeight: 600, color: '#FFFFFF', letterSpacing: '-0.2px' },
  dropBadge: { fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: '#000', background: '#C8FF00', borderRadius: '4px', padding: '3px 8px', flexShrink: 0 },
  taskList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  taskRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', paddingTop: '12px', borderTop: '0.5px solid #1a1a1a' },
  taskLeft: { flex: 1, minWidth: 0 },
  taskTop: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' },
  taskTitle: { fontSize: '13px', fontWeight: 600, color: '#FFFFFF' },
  platformBadge: { fontSize: '10px', color: '#555', border: '1px solid #222', borderRadius: '4px', padding: '2px 7px', flexShrink: 0 },
  taskDesc: { fontSize: '12px', color: '#666', lineHeight: 1.5 },
  generateBtn: { background: 'rgba(200,255,0,0.08)', color: '#C8FF00', border: '1px solid rgba(200,255,0,0.2)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' },
  editableTheme: { fontSize: '15px', fontWeight: 600, color: '#FFFFFF', background: 'transparent', border: '1px solid #222', borderRadius: '6px', padding: '5px 8px', outline: 'none', width: '100%', fontFamily: 'inherit', transition: 'border-color 0.15s ease' },
  editableInput: { fontSize: '13px', fontWeight: 600, color: '#FFFFFF', background: '#0f0f0f', border: '1px solid #222', borderRadius: '6px', padding: '7px 10px', outline: 'none', width: '100%', fontFamily: 'inherit', transition: 'border-color 0.15s ease' },
  editableTextarea: { fontSize: '12px', color: '#aaa', background: '#0f0f0f', border: '1px solid #222', borderRadius: '6px', padding: '7px 10px', outline: 'none', width: '100%', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', transition: 'border-color 0.15s ease' },
  addTaskBtn: { background: 'transparent', border: '1px dashed #222', borderRadius: '6px', color: '#444', fontSize: '12px', fontWeight: 500, cursor: 'pointer', padding: '9px 14px', width: '100%', textAlign: 'left', marginTop: 4, transition: 'border-color 0.15s ease, color 0.15s ease' },
  trashBtn: { background: 'transparent', border: 'none', color: '#333', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'flex-start', flexShrink: 0, marginTop: 2, transition: 'color 0.15s ease' },
  toast: { position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', background: '#C8FF00', color: '#000', fontWeight: 600, fontSize: '13px', borderRadius: '8px', padding: '10px 20px', zIndex: 200, pointerEvents: 'none' },
}
