import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ChatDrawer } from '../components/ChatDrawer'
import { AGENTS } from '../lib/agents'
import type { Label } from '../types'

/* ── Types ────────────────────────────────────────────────────── */

interface RolloutData {
  releaseTitle: string
  releaseType: string
  dropDate: string
  artworkFile: File | null
  artworkPreview: string | null
  audioFile: File | null
  audioName: string | null
  goals: string[]
  platforms: string[]
  additionalNotes: string
}

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

const RELEASE_TYPES = ['Single', 'EP', 'Album', 'Mixtape']
const GOAL_OPTIONS = [
  'Get on playlists',
  'Grow my fanbase',
  'Make money',
  'Get a sync placement',
  'Build buzz before an album',
  'Go viral on TikTok',
]
const PLATFORM_OPTIONS = ['Spotify', 'Apple Music', 'TikTok', 'Instagram', 'YouTube', 'Twitter/X']

/* ── Main Page ───────────────────────────────────────────────── */

export function RolloutNew() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [plan, setPlan] = useState<RolloutPlan | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [label, setLabel] = useState<Label | null>(null)
  const [chatPrompt, setChatPrompt] = useState('')
  const [chatOpen, setChatOpen] = useState(false)

  const [data, setData] = useState<RolloutData>({
    releaseTitle: '',
    releaseType: '',
    dropDate: '',
    artworkFile: null,
    artworkPreview: null,
    audioFile: null,
    audioName: null,
    goals: [],
    platforms: [],
    additionalNotes: '',
  })

  useEffect(() => {
    if (!user) return
    supabase.from('labels').select('*').eq('user_id', user.id).single()
      .then(({ data }) => setLabel(data))
  }, [user])

  async function handleBuild() {
    setGenerating(true)
    setGenError('')
    setStep(3)
    try {
      const { data: resp, error } = await supabase.functions.invoke('chat', {
        body: {
          mode: 'rollout',
          labelName: label?.name ?? 'the label',
          artistName: label?.artist_name ?? 'the artist',
          genres: label?.genre ?? [],
          releaseTitle: data.releaseTitle,
          releaseType: data.releaseType || 'Single',
          dropDate: data.dropDate || 'TBD',
          goals: data.goals,
          platforms: data.platforms,
          additionalNotes: data.additionalNotes,
        },
      })
      if (error) throw new Error(error.message)
      if (!resp?.plan) throw new Error('No plan returned')
      setPlan(resp.plan as RolloutPlan)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setGenError(msg)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!user || !plan) return
    setSaving(true)
    setSaveError('')

    let artworkUrl: string | null = null
    let audioUrl: string | null = null

    if (data.artworkFile) {
      const ext = data.artworkFile.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('artwork').upload(path, data.artworkFile)
      if (error) {
        console.error('Artwork upload failed:', error.message)
      } else {
        const { data: u } = supabase.storage.from('artwork').getPublicUrl(path)
        artworkUrl = u.publicUrl
      }
    }

    if (data.audioFile) {
      const ext = data.audioFile.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('audio').upload(path, data.audioFile)
      if (!error) {
        const { data: u } = supabase.storage.from('audio').getPublicUrl(path)
        audioUrl = u.publicUrl
      }
    }

    const { error } = await supabase.from('rollouts').insert({
      user_id: user.id,
      release_title: data.releaseTitle,
      release_type: data.releaseType || null,
      drop_date: data.dropDate || null,
      artwork_url: artworkUrl,
      audio_url: audioUrl,
      goals: data.goals,
      platforms: data.platforms,
      plan,
    })

    setSaving(false)
    if (error) {
      setSaveError(error.message)
    } else {
      navigate('/dashboard')
    }
  }

  function handleGenerate(task: RolloutTask) {
    const assetType = task.help_type ?? 'content'
    const prompt = `Generate a ${assetType} for "${data.releaseTitle}"${data.releaseType ? `, a ${data.releaseType}` : ''}${data.dropDate ? ` dropping on ${data.dropDate}` : ''}.\n\nTask context: ${task.description}${task.platform ? `\n\nPlatform: ${task.platform}` : ''}`
    setChatPrompt(prompt)
    setChatOpen(true)
  }

  const marketingAgent = AGENTS.find(a => a.type === 'marketing')!

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <header style={styles.topBar}>
        <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          HQ
        </button>
        <div style={styles.stepIndicator}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                ...styles.stepDot,
                background: n < step ? '#C8FF00' : n === step ? '#C8FF00' : '#222',
                opacity: n === step ? 1 : n < step ? 0.5 : 0.3,
              }} />
              {n < 3 && <div style={{ width: 32, height: 1, background: n < step ? '#C8FF00' : '#222', opacity: 0.4 }} />}
            </div>
          ))}
        </div>
        <div style={{ width: 60 }} />
      </header>

      {/* Content */}
      <div style={styles.content}>
        {step === 1 && (
          <Step1
            data={data}
            setData={setData}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2
            data={data}
            setData={setData}
            onBack={() => setStep(1)}
            onBuild={handleBuild}
          />
        )}
        {step === 3 && generating && <GeneratingState />}
        {step === 3 && !generating && genError && (
          <div style={styles.centered}>
            <p style={{ color: '#ff4444', marginBottom: 16 }}>{genError}</p>
            <button onClick={() => setStep(2)} style={styles.btnSecondary}>Try again</button>
          </div>
        )}
        {step === 3 && !generating && plan && (
          <PlanView
            plan={plan}
            data={data}
            label={label}
            saving={saving}
            saveError={saveError}
            onSave={handleSave}
            onStartOver={() => { setStep(1); setPlan(null) }}
            onGenerate={handleGenerate}
          />
        )}
      </div>

      {/* Marketing AI drawer for Generate tasks */}
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

/* ── Step 1: Release Info ─────────────────────────────────────── */

function Step1({
  data,
  setData,
  onNext,
}: {
  data: RolloutData
  setData: React.Dispatch<React.SetStateAction<RolloutData>>
  onNext: () => void
}) {
  const artworkRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLInputElement>(null)

  function handleArtwork(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setData(d => ({ ...d, artworkFile: file, artworkPreview: URL.createObjectURL(file) }))
  }

  function handleAudio(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setData(d => ({ ...d, audioFile: file, audioName: file.name }))
  }

  const canContinue = data.releaseTitle.trim().length > 0

  return (
    <div style={styles.formCard}>
      <p style={styles.stepLabel}>Step 1 of 3</p>
      <h1 style={styles.heading}>Release info</h1>
      <p style={styles.subtext}>Tell us what you're dropping.</p>

      <div style={styles.fields}>
        {/* Title */}
        <div style={styles.field}>
          <label style={styles.label}>Release title</label>
          <input
            autoFocus
            type="text"
            value={data.releaseTitle}
            onChange={e => setData(d => ({ ...d, releaseTitle: e.target.value }))}
            placeholder="e.g. Midnight Drive"
            style={styles.input}
            onFocus={e => (e.target.style.borderColor = '#C8FF00')}
            onBlur={e => (e.target.style.borderColor = '#2a2a2a')}
          />
        </div>

        {/* Release type */}
        <div style={styles.field}>
          <label style={styles.label}>Release type</label>
          <div style={styles.chipRow}>
            {RELEASE_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setData(d => ({ ...d, releaseType: t }))}
                style={{
                  ...styles.chip,
                  background: data.releaseType === t ? '#C8FF00' : 'transparent',
                  color: data.releaseType === t ? '#000' : '#fff',
                  borderColor: data.releaseType === t ? '#C8FF00' : '#2a2a2a',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Drop date */}
        <div style={styles.field}>
          <label style={styles.label}>Drop date</label>
          <input
            type="date"
            value={data.dropDate}
            onChange={e => setData(d => ({ ...d, dropDate: e.target.value }))}
            style={{ ...styles.input, colorScheme: 'dark' }}
            onFocus={e => (e.target.style.borderColor = '#C8FF00')}
            onBlur={e => (e.target.style.borderColor = '#2a2a2a')}
          />
        </div>

        {/* Artwork */}
        <div style={styles.field}>
          <label style={styles.label}>Artwork <span style={{ color: '#444' }}>(optional)</span></label>
          <div
            onClick={() => artworkRef.current?.click()}
            style={{
              ...styles.uploadArea,
              borderColor: data.artworkPreview ? '#C8FF00' : '#2a2a2a',
              padding: data.artworkPreview ? '0' : '20px',
              height: data.artworkPreview ? '120px' : 'auto',
              overflow: 'hidden',
            }}
          >
            {data.artworkPreview ? (
              <img src={data.artworkPreview} alt="Artwork" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={styles.uploadInner}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span style={styles.uploadText}>Click to upload artwork</span>
              </div>
            )}
          </div>
          <input ref={artworkRef} type="file" accept="image/*" onChange={handleArtwork} style={{ display: 'none' }} />
        </div>

        {/* Audio */}
        <div style={styles.field}>
          <label style={styles.label}>Audio file <span style={{ color: '#444' }}>(optional)</span></label>
          <div
            onClick={() => audioRef.current?.click()}
            style={{ ...styles.uploadArea, borderColor: data.audioFile ? '#C8FF00' : '#2a2a2a' }}
          >
            {data.audioFile ? (
              <div style={styles.uploadInner}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth="2">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
                <span style={{ color: '#C8FF00', fontSize: 13 }}>{data.audioName}</span>
              </div>
            ) : (
              <div style={styles.uploadInner}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
                <span style={styles.uploadText}>Click to upload .mp3 or .wav</span>
              </div>
            )}
          </div>
          <input ref={audioRef} type="file" accept=".mp3,.wav,audio/*" onChange={handleAudio} style={{ display: 'none' }} />
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!canContinue}
        style={{ ...styles.btnPrimary, opacity: canContinue ? 1 : 0.4, cursor: canContinue ? 'pointer' : 'not-allowed' }}
      >
        Continue
      </button>
    </div>
  )
}

/* ── Step 2: Goals ───────────────────────────────────────────── */

function Step2({
  data,
  setData,
  onBack,
  onBuild,
}: {
  data: RolloutData
  setData: React.Dispatch<React.SetStateAction<RolloutData>>
  onBack: () => void
  onBuild: () => void
}) {
  function toggleGoal(g: string) {
    setData(d => ({ ...d, goals: d.goals.includes(g) ? d.goals.filter(x => x !== g) : [...d.goals, g] }))
  }
  function togglePlatform(p: string) {
    setData(d => ({ ...d, platforms: d.platforms.includes(p) ? d.platforms.filter(x => x !== p) : [...d.platforms, p] }))
  }

  return (
    <div style={styles.formCard}>
      <p style={styles.stepLabel}>Step 2 of 3</p>
      <h1 style={styles.heading}>What do you want from this release?</h1>
      <p style={styles.subtext}>Select everything that applies.</p>

      <div style={styles.fields}>
        {/* Goals */}
        <div style={styles.field}>
          <div style={styles.goalGrid}>
            {GOAL_OPTIONS.map(g => {
              const active = data.goals.includes(g)
              return (
                <button
                  key={g}
                  onClick={() => toggleGoal(g)}
                  style={{
                    ...styles.goalCard,
                    background: active ? 'rgba(200,255,0,0.07)' : '#0f0f0f',
                    borderColor: active ? '#C8FF00' : '#222',
                    color: active ? '#C8FF00' : '#888',
                  }}
                >
                  {active && <span style={{ marginRight: 6, fontSize: 12 }}>✓</span>}
                  {g}
                </button>
              )
            })}
          </div>
        </div>

        {/* Platforms */}
        <div style={styles.field}>
          <label style={styles.label}>Any platforms to focus on?</label>
          <div style={styles.chipRow}>
            {PLATFORM_OPTIONS.map(p => {
              const active = data.platforms.includes(p)
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  style={{
                    ...styles.chip,
                    background: active ? '#C8FF00' : 'transparent',
                    color: active ? '#000' : '#fff',
                    borderColor: active ? '#C8FF00' : '#2a2a2a',
                  }}
                >
                  {p}
                </button>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div style={styles.field}>
          <label style={styles.label}>Anything else we should know? <span style={{ color: '#444' }}>(optional)</span></label>
          <textarea
            value={data.additionalNotes}
            onChange={e => setData(d => ({ ...d, additionalNotes: e.target.value }))}
            placeholder="Tell your Marketing AI anything specific about this release"
            rows={3}
            style={styles.textarea}
            onFocus={e => (e.target.style.borderColor = '#C8FF00')}
            onBlur={e => (e.target.style.borderColor = '#2a2a2a')}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onBack} style={styles.btnSecondary}>Back</button>
        <button
          onClick={onBuild}
          disabled={data.goals.length === 0}
          style={{ ...styles.btnPrimary, flex: 1, opacity: data.goals.length > 0 ? 1 : 0.4, cursor: data.goals.length > 0 ? 'pointer' : 'not-allowed' }}
        >
          Build my rollout plan
        </button>
      </div>
    </div>
  )
}

/* ── Generating state ─────────────────────────────────────────── */

function GeneratingState() {
  return (
    <div style={styles.centered}>
      <div style={styles.pulseRing} />
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 0.4; }
          100% { transform: scale(0.8); opacity: 0.8; }
        }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
      <p style={{ color: '#C8FF00', fontSize: 14, fontWeight: 600, letterSpacing: '0.5px', animation: 'blink 2s ease infinite' }}>
        Your Marketing AI is building your plan...
      </p>
      <p style={{ color: '#444', fontSize: 12, marginTop: 8 }}>This takes about 15 seconds</p>
    </div>
  )
}

/* ── Plan View ────────────────────────────────────────────────── */

function PlanView({
  plan,
  data,
  label,
  saving,
  saveError,
  onSave,
  onStartOver,
  onGenerate,
}: {
  plan: RolloutPlan
  data: RolloutData
  label: Label | null
  saving: boolean
  saveError: string
  onSave: () => void
  onStartOver: () => void
  onGenerate: (task: RolloutTask) => void
}) {
  return (
    <div style={styles.planContainer}>
      {/* Plan header */}
      <div style={styles.planHeader}>
        <div style={styles.planHeaderLeft}>
          {data.artworkPreview && (
            <img src={data.artworkPreview} alt="" style={styles.planArtwork} />
          )}
          <div>
            <p style={styles.planReleaseType}>{data.releaseType || 'Release'}</p>
            <h1 style={styles.planTitle}>{data.releaseTitle}</h1>
            <p style={styles.planMeta}>
              {label?.artist_name && <span>{label.artist_name}</span>}
              {data.dropDate && <span> · {new Date(data.dropDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>}
            </p>
          </div>
        </div>
        <div style={styles.planGoalPills}>
          {data.goals.slice(0, 3).map(g => (
            <span key={g} style={styles.goalPill}>{g}</span>
          ))}
        </div>
      </div>

      {/* Week cards */}
      <div style={styles.timeline}>
        {plan.weeks.map((week, i) => (
          <WeekCard key={i} week={week} onGenerate={onGenerate} />
        ))}
      </div>

      {/* Bottom actions */}
      {saveError && <p style={{ color: '#ff4444', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{saveError}</p>}
      <div style={styles.planActions}>
        <button onClick={onStartOver} style={styles.btnSecondary}>Start Over</button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{ ...styles.btnPrimary, minWidth: 140, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving...' : 'Save Rollout'}
        </button>
      </div>
    </div>
  )
}

function WeekCard({ week, onGenerate }: { week: RolloutWeek; onGenerate: (t: RolloutTask) => void }) {
  const isDropWeek = week.week.toLowerCase().includes('drop') || week.week.toLowerCase().includes('release')
  return (
    <div style={{ ...styles.weekCard, borderColor: isDropWeek ? 'rgba(200,255,0,0.3)' : '#1e1e1e' }}>
      <div style={styles.weekCardHeader}>
        <div>
          <p style={{ ...styles.weekLabel, color: isDropWeek ? '#C8FF00' : '#555' }}>{week.week}</p>
          <p style={styles.weekTheme}>{week.theme}</p>
        </div>
        {isDropWeek && (
          <span style={styles.dropBadge}>DROP</span>
        )}
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
        <button onClick={onGenerate} style={styles.generateBtn}>
          Generate →
        </button>
      )}
    </div>
  )
}

/* ── Styles ───────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#0A0A0A',
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    height: '60px',
    borderBottom: '0.5px solid #1a1a1a',
    flexShrink: 0,
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    padding: 0,
    width: 60,
  },
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    transition: 'all 0.3s ease',
  },
  content: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 24px 80px',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 12,
    textAlign: 'center',
  },
  pulseRing: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: 'rgba(200,255,0,0.1)',
    border: '1px solid rgba(200,255,0,0.3)',
    animation: 'pulse-ring 2s ease infinite',
    marginBottom: 24,
  },
  // Form
  formCard: {
    width: '100%',
    maxWidth: '520px',
  },
  stepLabel: {
    fontSize: '11px',
    letterSpacing: '1.5px',
    color: '#444',
    textTransform: 'uppercase',
    marginBottom: 12,
    fontWeight: 600,
  },
  heading: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-0.8px',
    marginBottom: 6,
  },
  subtext: {
    fontSize: '14px',
    color: '#555',
    marginBottom: 36,
  },
  fields: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    marginBottom: '32px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#666',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  input: {
    background: '#0f0f0f',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '12px 14px',
    fontSize: '15px',
    color: '#FFFFFF',
    outline: 'none',
    transition: 'border-color 0.15s ease',
    width: '100%',
  },
  textarea: {
    background: '#0f0f0f',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '12px 14px',
    fontSize: '14px',
    color: '#FFFFFF',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    transition: 'border-color 0.15s ease',
    width: '100%',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  chip: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  uploadArea: {
    border: '1px dashed',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease',
    overflow: 'hidden',
  },
  uploadInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '20px',
  },
  uploadText: {
    fontSize: '13px',
    color: '#444',
  },
  goalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
  },
  goalCard: {
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  },
  btnPrimary: {
    background: '#C8FF00',
    color: '#000',
    border: 'none',
    borderRadius: '8px',
    padding: '13px 24px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    letterSpacing: '0.2px',
    transition: 'opacity 0.15s ease',
  },
  btnSecondary: {
    background: 'transparent',
    color: '#666',
    border: '1px solid #222',
    borderRadius: '8px',
    padding: '13px 20px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    letterSpacing: '0.2px',
    flexShrink: 0,
  },

  // Plan
  planContainer: {
    width: '100%',
    maxWidth: '760px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  planHeader: {
    background: '#111',
    border: '0.5px solid #222',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  planHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  planArtwork: {
    width: '64px',
    height: '64px',
    borderRadius: '8px',
    objectFit: 'cover',
    flexShrink: 0,
  },
  planReleaseType: {
    fontSize: '11px',
    letterSpacing: '2px',
    color: '#C8FF00',
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  planTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-0.5px',
    marginBottom: '4px',
  },
  planMeta: {
    fontSize: '13px',
    color: '#555',
  },
  planGoalPills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    justifyContent: 'flex-end',
  },
  goalPill: {
    fontSize: '11px',
    color: '#555',
    border: '1px solid #222',
    borderRadius: '20px',
    padding: '4px 10px',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  weekCard: {
    background: '#111',
    border: '0.5px solid',
    borderRadius: '12px',
    padding: '20px 24px',
  },
  weekCardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  weekLabel: {
    fontSize: '11px',
    letterSpacing: '1.5px',
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: '3px',
  },
  weekTheme: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#FFFFFF',
    letterSpacing: '-0.2px',
  },
  dropBadge: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '2px',
    color: '#000',
    background: '#C8FF00',
    borderRadius: '4px',
    padding: '3px 8px',
  },
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  taskRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    paddingTop: '12px',
    borderTop: '0.5px solid #1a1a1a',
  },
  taskLeft: {
    flex: 1,
    minWidth: 0,
  },
  taskTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
    flexWrap: 'wrap',
  },
  taskTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#FFFFFF',
  },
  platformBadge: {
    fontSize: '10px',
    color: '#555',
    border: '1px solid #222',
    borderRadius: '4px',
    padding: '2px 7px',
    flexShrink: 0,
  },
  taskDesc: {
    fontSize: '12px',
    color: '#666',
    lineHeight: 1.5,
  },
  generateBtn: {
    background: 'rgba(200,255,0,0.08)',
    color: '#C8FF00',
    border: '1px solid rgba(200,255,0,0.2)',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    transition: 'background 0.15s ease',
  },
  planActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    paddingTop: '8px',
  },
}
