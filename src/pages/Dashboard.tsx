import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ChatDrawer } from '../components/ChatDrawer'
import { AGENTS } from '../lib/agents'
import type { Agent } from '../lib/agents'
import type { Label } from '../types'

interface Rollout {
  id: string
  release_title: string
  release_type: string | null
  drop_date: string | null
  artwork_url: string | null
  created_at: string
}

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [label, setLabel] = useState<Label | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null)
  const [rollouts, setRollouts] = useState<Rollout[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Rollout | null>(null)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('labels').select('*').eq('user_id', user.id).single(),
      supabase.from('rollouts').select('id,release_title,release_type,drop_date,artwork_url,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]).then(([labelRes, rolloutsRes]) => {
      setLabel(labelRes.data)
      setRollouts((rolloutsRes.data as Rollout[]) ?? [])
      setLoading(false)
    })
  }, [user])

  async function confirmDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('rollouts').delete().eq('id', deleteTarget.id)
    if (!error) {
      setRollouts(rs => rs.filter(r => r.id !== deleteTarget.id))
      setDeleteTarget(null)
    } else {
      console.error('Delete failed:', error.message)
    }
  }

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
      {/* ── Top nav ── */}
      <header style={styles.nav}>
        <div style={styles.navLeft}>
          <NavLogo label={label} />
          <span style={styles.navLabelName}>{label?.name ?? 'Your Label'}</span>
        </div>

        <div style={styles.navRight}>
          <button onClick={() => navigate('/rollout/new')} style={styles.newReleaseBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Release
          </button>
          <button style={styles.iconBtn} aria-label="Notifications">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
          <button onClick={() => navigate('/settings')} style={styles.avatarBtn} aria-label="Profile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={styles.main}>

        {/* SECTION 1 — Stats */}
        <div style={styles.statsRow}>
          {[
            { label: 'Monthly Streams', value: '—' },
            { label: 'Total Earnings', value: '—' },
            { label: 'Active Releases', value: String(rollouts.length) },
          ].map(stat => (
            <div key={stat.label} style={styles.statCard}>
              <p style={styles.statValue}>{stat.value}</p>
              <p style={styles.statLabel}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* SECTION 2 — AI Team */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Your AI Team</h2>
            <p style={styles.sectionSub}>Click any member to open a chat</p>
          </div>
          <div style={styles.agentGrid}>
            {AGENTS.map(agent => (
              <AgentCard
                key={agent.type}
                agent={agent}
                onClick={() => setActiveAgent(agent)}
              />
            ))}
          </div>
        </section>

        {/* SECTION 3 — Active Rollouts */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Active Rollouts</h2>
            {rollouts.length > 0 && (
              <button onClick={() => navigate('/rollout/new')} style={styles.newRolloutLink}>+ New</button>
            )}
          </div>
          {rollouts.length === 0 ? (
            <div style={styles.emptyCard}>
              <RolloutsIcon />
              <p style={styles.emptyTitle}>No active rollouts</p>
              <p style={styles.emptySub}>Build a week-by-week plan with your Marketing AI</p>
              <button style={styles.accentBtn} onClick={() => navigate('/rollout/new')}>
                Start Rollout
              </button>
            </div>
          ) : (
            <div style={styles.rolloutList}>
              {rollouts.map(r => (
                <RolloutRow
                  key={r.id}
                  rollout={r}
                  onDelete={() => setDeleteTarget(r)}
                />
              ))}
            </div>
          )}
        </section>

        {/* SECTION 4 — Quick Actions */}
        <section style={styles.section}>
          <div style={styles.quickActions}>
            <QuickActionCard
              icon={<UploadIcon />}
              title="Upload a Release"
              sub="Add to your catalog"
            />
            <QuickActionCard
              icon={<ContractIcon />}
              title="Generate a Contract"
              sub="Split sheets, producer deals"
              onClick={() => setActiveAgent(AGENTS.find(a => a.type === 'legal') ?? null)}
            />
            <QuickActionCard
              icon={<EarningsIcon />}
              title="View Earnings"
              sub="Track your royalties"
            />
          </div>
        </section>

      </main>

      {/* Chat drawer */}
      {label && (
        <ChatDrawer
          agent={activeAgent}
          label={label}
          onClose={() => setActiveAgent(null)}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <ConfirmDeleteModal
          releaseTitle={deleteTarget.release_title}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

/* ── Sub-components ── */

function NavLogo({ label }: { label: Label | null }) {
  const [imgError, setImgError] = useState(false)
  const fallback = label?.name?.[0]?.toUpperCase() ?? 'L'

  if (label?.logo_url && !imgError) {
    return (
      <img
        src={label.logo_url}
        alt="Label logo"
        style={styles.navLogo}
        onError={() => setImgError(true)}
      />
    )
  }
  return <div style={styles.navLogoPlaceholder}>{fallback}</div>
}

function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.agentCard,
        borderColor: hovered ? '#333333' : '#222222',
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.4)' : 'none',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div style={styles.agentCardTop}>
        <span style={{ ...styles.agentDot, background: agent.color }} />
        <div>
          <p style={styles.agentPersonName}>{agent.personName}</p>
          <p style={styles.agentRoleText}>{agent.role}</p>
        </div>
      </div>
      <p style={styles.agentDesc}>{agent.description}</p>
      <div style={styles.agentFooter}>
        <span style={styles.readyBadge}>● Ready</span>
      </div>
    </button>
  )
}

function RolloutRow({ rollout, onDelete }: { rollout: Rollout; onDelete: () => void }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const formattedDate = rollout.drop_date
    ? new Date(rollout.drop_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div
      onClick={() => navigate(`/rollout/${rollout.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...styles.rolloutRow, borderColor: hovered ? '#333' : '#1e1e1e', cursor: 'pointer' }}
    >
      <div style={styles.rolloutLeft}>
        {rollout.artwork_url ? (
          <img src={rollout.artwork_url} alt="" style={styles.rolloutArt} />
        ) : (
          <div style={styles.rolloutArtPlaceholder}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        )}
        <div>
          <p style={styles.rolloutTitle}>{rollout.release_title}</p>
          <p style={styles.rolloutMeta}>
            {rollout.release_type ?? 'Release'}{formattedDate ? ` · ${formattedDate}` : ''}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={styles.activePill}>● Active</span>

        {/* Three-dot menu */}
        <div
          ref={menuRef}
          style={{ position: 'relative' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={styles.menuBtn}
            aria-label="Options"
          >
            ···
          </button>
          {menuOpen && (
            <div style={styles.dropdown}>
              <button
                onClick={() => { navigate(`/rollout/${rollout.id}`); setMenuOpen(false) }}
                style={styles.dropdownItem}
              >
                View Plan
              </button>
              <button
                onClick={() => { onDelete(); setMenuOpen(false) }}
                style={{ ...styles.dropdownItem, color: '#FF3B3B' }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ConfirmDeleteModal({
  releaseTitle,
  onCancel,
  onConfirm,
}: {
  releaseTitle: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div style={styles.modalOverlay} onClick={onCancel}>
      <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
        <p style={styles.modalTitle}>Delete this rollout?</p>
        <p style={styles.modalSub}>
          This will permanently remove your rollout plan for <strong style={{ color: '#fff' }}>{releaseTitle}</strong>. This cannot be undone.
        </p>
        <div style={styles.modalBtns}>
          <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
          <button onClick={onConfirm} style={styles.deleteBtn}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function QuickActionCard({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.quickCard,
        borderColor: hovered ? '#C8FF00' : '#222222',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={styles.quickIcon}>{icon}</div>
      <p style={styles.quickTitle}>{title}</p>
      <p style={styles.quickSub}>{sub}</p>
    </button>
  )
}

/* ── Icons ── */
function RolloutsIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.2" style={{ marginBottom: 16 }}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="8 12 12 16 16 12" />
      <line x1="12" y1="8" x2="12" y2="16" />
    </svg>
  )
}
function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.8">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}
function ContractIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}
function EarningsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.8">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

/* ── Styles ── */
const styles: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column' },
  loadingPage: { minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  spinner: { width: 24, height: 24, borderRadius: '50%', border: '2px solid #222', borderTopColor: '#C8FF00', animation: 'spin 0.8s linear infinite' },

  // Nav
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: '60px', borderBottom: '0.5px solid #1a1a1a', background: '#0A0A0A', position: 'sticky', top: 0, zIndex: 30, flexShrink: 0 },
  navLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  navLogo: { width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' },
  navLogoPlaceholder: { width: '32px', height: '32px', borderRadius: '50%', background: '#1a1a1a', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#C8FF00' },
  navLabelName: { fontSize: '14px', fontWeight: 600, color: '#FFFFFF', letterSpacing: '-0.2px' },
  navRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  newReleaseBtn: { background: '#C8FF00', color: '#000000', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', letterSpacing: '0.2px' },
  iconBtn: { background: 'transparent', border: '1px solid #222', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#666' },
  avatarBtn: { background: '#1a1a1a', border: '1px solid #222', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888' },

  // Main
  main: { flex: 1, padding: '32px', maxWidth: '1100px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '40px' },

  // Stats
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  statCard: { background: '#111111', border: '0.5px solid #222222', borderRadius: '12px', padding: '24px 24px 20px' },
  statValue: { fontSize: '32px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-1px', marginBottom: '6px' },
  statLabel: { fontSize: '12px', color: '#888888', letterSpacing: '0.3px' },

  // Sections
  section: { display: 'flex', flexDirection: 'column', gap: '16px' },
  sectionHeader: { display: 'flex', alignItems: 'baseline', gap: '12px' },
  sectionTitle: { fontSize: '16px', fontWeight: 600, color: '#FFFFFF', letterSpacing: '-0.3px' },
  sectionSub: { fontSize: '12px', color: '#555555' },

  // Agent grid
  agentGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' },
  agentCard: { background: '#111111', border: '0.5px solid #222222', borderRadius: '12px', padding: '18px 20px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease' },
  agentCardTop: { display: 'flex', alignItems: 'center', gap: '10px' },
  agentDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: 2 },
  agentPersonName: { fontSize: '13px', fontWeight: 600, color: '#FFFFFF', lineHeight: 1.3 },
  agentRoleText: { fontSize: '11px', color: '#888888', lineHeight: 1.3 },
  agentDesc: { fontSize: '11px', color: '#555555', lineHeight: 1.5 },
  agentFooter: { marginTop: '4px' },
  readyBadge: { fontSize: '10px', color: '#3a3a3a', letterSpacing: '0.3px' },

  // Empty rollout state
  emptyCard: { background: '#111111', border: '0.5px solid #222222', borderRadius: '12px', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' },
  emptyTitle: { fontSize: '14px', fontWeight: 500, color: '#888888' },
  emptySub: { fontSize: '12px', color: '#444444', marginBottom: '16px' },
  accentBtn: { background: '#C8FF00', color: '#000000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.2px' },
  newRolloutLink: { background: 'transparent', border: 'none', color: '#C8FF00', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 },

  // Rollout list
  rolloutList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  rolloutRow: { background: '#111111', border: '0.5px solid #1e1e1e', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'border-color 0.15s ease' },
  rolloutLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  rolloutArt: { width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 },
  rolloutArtPlaceholder: { width: '40px', height: '40px', borderRadius: '6px', background: '#1a1a1a', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rolloutTitle: { fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '2px' },
  rolloutMeta: { fontSize: '11px', color: '#555' },
  activePill: { fontSize: '10px', color: '#C8FF00', letterSpacing: '0.3px' },

  // Three-dot menu
  menuBtn: { background: 'transparent', border: '1px solid #222', borderRadius: '6px', color: '#555', cursor: 'pointer', padding: '2px 8px', fontSize: '16px', lineHeight: 1, display: 'flex', alignItems: 'center', letterSpacing: '2px', transition: 'border-color 0.15s ease, color 0.15s ease' },
  dropdown: { position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#111111', border: '0.5px solid #222222', borderRadius: '8px', padding: '4px', zIndex: 50, minWidth: '130px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  dropdownItem: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#ccc', fontSize: '13px', fontWeight: 500, padding: '8px 12px', cursor: 'pointer', borderRadius: '5px' },

  // Delete modal
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalCard: { background: '#111111', border: '0.5px solid #222222', borderRadius: '14px', padding: '28px', maxWidth: '380px', width: '90%' },
  modalTitle: { fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '10px' },
  modalSub: { fontSize: '13px', color: '#666', lineHeight: 1.6, marginBottom: '24px' },
  modalBtns: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  cancelBtn: { background: 'transparent', border: '1px solid #333', color: '#888', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
  deleteBtn: { background: '#FF3B3B', border: 'none', color: '#fff', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },

  // Quick actions
  quickActions: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' },
  quickCard: { background: '#111111', border: '0.5px solid #222222', borderRadius: '12px', padding: '20px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'border-color 0.15s ease' },
  quickIcon: { marginBottom: '6px' },
  quickTitle: { fontSize: '13px', fontWeight: 600, color: '#FFFFFF' },
  quickSub: { fontSize: '11px', color: '#555555' },
}
