import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ChatDrawer } from '../components/ChatDrawer'
import { AGENTS } from '../lib/agents'
import type { Agent } from '../lib/agents'
import type { Label, Release } from '../types'

interface LinkedRollout {
  id: string
  release_title: string
  created_at: string
}

function computeStatus(dropDate: string | null, stored: string | null): 'upcoming' | 'out_now' | 'archived' {
  if (stored === 'archived') return 'archived'
  if (!dropDate) return 'upcoming'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return new Date(dropDate + 'T00:00:00') > today ? 'upcoming' : 'out_now'
}

function StatusBadge({ status }: { status: 'upcoming' | 'out_now' | 'archived' }) {
  const config = {
    upcoming: { bg: '#C8FF00', color: '#000', label: 'Upcoming' },
    out_now:  { bg: '#1D9E75', color: '#fff', label: 'Out Now' },
    archived: { bg: '#333333', color: '#888888', label: 'Archived' },
  }[status]
  return (
    <span style={{ background: config.bg, color: config.color, fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', borderRadius: 6, padding: '4px 10px' }}>
      {config.label}
    </span>
  )
}

const AI_ACTIONS = [
  { agentType: 'marketing', color: '#C8FF00', label: 'Ask Maya about this release',  subLabel: 'Chat with Maya',   promptSuffix: 'Can you help me think through marketing for this?' },
  { agentType: 'anr',       color: '#7B61FF', label: 'Ask Marcus for feedback',       subLabel: 'Chat with Marcus', promptSuffix: "I'd love your honest feedback on this." },
  { agentType: 'sync',      color: '#FF3B8B', label: 'Ask Jordan about sync',         subLabel: 'Chat with Jordan', promptSuffix: 'Are there any good sync opportunities for this?' },
]

export function ReleaseDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [release, setRelease]   = useState<Release | null>(null)
  const [rollout, setRollout]   = useState<LinkedRollout | null>(null)
  const [label, setLabel]       = useState<Label | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null)
  const [chatPrompt, setChatPrompt]   = useState('')

  useEffect(() => {
    if (!user || !id) return
    Promise.all([
      supabase.from('releases').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('labels').select('*').eq('user_id', user.id).single(),
      supabase.from('rollouts').select('id,release_title,created_at').eq('release_id', id).eq('user_id', user.id).maybeSingle(),
    ]).then(([releaseRes, labelRes, rolloutRes]) => {
      if (!releaseRes.data) { setNotFound(true); setLoading(false); return }
      setRelease(releaseRes.data as Release)
      setLabel(labelRes.data)
      setRollout(rolloutRes.data as LinkedRollout | null)
      setLoading(false)
    })
  }, [user, id])

  function openChat(agentType: string, prompt: string) {
    const agent = AGENTS.find(a => a.type === agentType)
    if (agent) { setChatPrompt(prompt); setActiveAgent(agent) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #222', borderTopColor: '#C8FF00', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (notFound || !release) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: '#555', fontSize: 14 }}>Release not found.</p>
      <button onClick={() => navigate('/app/releases')} style={{ background: 'transparent', border: '1px solid #333', borderRadius: 8, padding: '10px 18px', color: '#888', cursor: 'pointer', fontSize: 13 }}>
        ← Back to Catalog
      </button>
    </div>
  )

  const status = computeStatus(release.drop_date, release.status)
  const formattedDate = release.drop_date
    ? new Date(release.drop_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const releaseContext = `"${release.title}", a ${release.type}${release.drop_date ? ` dropping on ${release.drop_date}` : ''}${release.notes ? `. Context: ${release.notes}` : ''}`
  const rolloutParams  = `?releaseId=${release.id}&title=${encodeURIComponent(release.title)}&type=${encodeURIComponent(release.type)}&date=${release.drop_date ?? ''}`

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      <style>{`
        .detail-grid { display: grid; grid-template-columns: 280px 1fr; gap: 40px; align-items: start; }
        @media (max-width: 768px) { .detail-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Top bar */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 60, borderBottom: '0.5px solid #1a1a1a', position: 'sticky', top: 0, background: '#0A0A0A', zIndex: 50 }}>
        <button onClick={() => navigate('/app/releases')} style={{ background: 'transparent', border: 'none', color: '#666666', cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Catalog
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '3px', color: '#C8FF00' }}>LABYL</span>
        <div style={{ width: 60 }} />
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div className="detail-grid">

          {/* LEFT: Artwork + metadata */}
          <div>
            <div style={{ borderRadius: 12, overflow: 'hidden', background: '#111111', marginBottom: 20, aspectRatio: '1', position: 'relative' }}>
              {release.artwork_url ? (
                <img src={release.artwork_url} alt={release.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333333" strokeWidth="1.5">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              )}
            </div>

            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.3px', marginBottom: 10 }}>{release.title}</h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#888888', background: '#222222', borderRadius: 4, padding: '3px 8px', fontWeight: 600 }}>{release.type}</span>
              <StatusBadge status={status} />
            </div>

            {formattedDate && <p style={{ fontSize: 13, color: '#666666', marginBottom: 16 }}>{formattedDate}</p>}

            {release.platforms && release.platforms.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#444444', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>Platforms</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {release.platforms.map(p => (
                    <span key={p} style={{ fontSize: 11, color: '#666666', border: '1px solid #222222', borderRadius: 6, padding: '3px 8px' }}>{p}</span>
                  ))}
                </div>
              </div>
            )}

            {release.external_link && (
              <a href={release.external_link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#C8FF00', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Listen →
              </a>
            )}
          </div>

          {/* RIGHT: Rollout + AI actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Rollout Plan */}
            <div style={{ background: '#111111', border: '1px solid #1e1e1e', borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', marginBottom: 16, letterSpacing: '-0.2px' }}>Rollout Plan</h2>
              {rollout ? (
                <div>
                  <p style={{ fontSize: 13, color: '#666666', marginBottom: 16, lineHeight: 1.5 }}>
                    You have an active rollout plan for this release.
                  </p>
                  <button
                    onClick={() => navigate(`/app/rollout/${rollout.id}`)}
                    style={{ background: '#C8FF00', color: '#000000', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    View Full Rollout →
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: '#555555', marginBottom: 16, lineHeight: 1.5 }}>
                    No rollout plan yet. Build a week-by-week marketing plan with your AI team.
                  </p>
                  <button
                    onClick={() => navigate(`/app/rollout/new${rolloutParams}`)}
                    style={{ background: '#C8FF00', color: '#000000', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Create Rollout Plan
                  </button>
                </div>
              )}
            </div>

            {/* AI Team Quick Actions */}
            <div style={{ background: '#111111', border: '1px solid #1e1e1e', borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', marginBottom: 6, letterSpacing: '-0.2px' }}>AI Team Quick Actions</h2>
              <p style={{ fontSize: 12, color: '#555555', marginBottom: 20 }}>Chat with your team, pre-loaded with this release's context.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {AI_ACTIONS.map(({ agentType, color, label, subLabel, promptSuffix }) => (
                  <button
                    key={agentType}
                    onClick={() => openChat(agentType, `I want to discuss my release: ${releaseContext}. ${promptSuffix}`)}
                    style={{ background: '#0f0f0f', border: '1px solid #222222', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s ease', width: '100%' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#333333')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#222222')}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>{label}</p>
                      <p style={{ fontSize: 11, color: '#555555', marginTop: 3 }}>{subLabel}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>

      {label && (
        <ChatDrawer
          agent={activeAgent}
          label={label}
          initialPrompt={chatPrompt}
          onClose={() => { setActiveAgent(null); setChatPrompt('') }}
        />
      )}
    </div>
  )
}
