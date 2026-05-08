import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { AGENTS } from '../lib/agents'

const GENRES = ['Hip-Hop', 'R&B', 'Pop', 'Afrobeats', 'Drill', 'Lo-Fi', 'Indie', 'Electronic', 'Trap', 'Soul', 'Jazz', 'Latin', 'Other']

const CAREER_STAGES = [
  { emoji: '🎙️', title: 'Just starting out', sub: "I'm new to releasing music" },
  { emoji: '📈', title: 'Building momentum', sub: 'I have some releases out and a small following' },
  { emoji: '🔥', title: 'Growing fast', sub: "I'm gaining traction and ready to level up" },
  { emoji: '💎', title: 'Established', sub: 'I have a real fanbase and consistent releases' },
]

const LONG_TERM_GOALS = [
  { emoji: '🔑', title: 'Stay fully independent', sub: 'Own everything. Answer to no one.' },
  { emoji: '💰', title: 'Make music my full time income', sub: 'Turn passion into a sustainable career' },
  { emoji: '🎬', title: 'Get sync placements', sub: 'Film, TV, ads — get my music heard everywhere' },
  { emoji: '🌍', title: 'Build an international fanbase', sub: 'Break through borders and reach the world' },
  { emoji: '🎤', title: 'Develop other artists', sub: 'Build a roster and run a real label operation' },
  { emoji: '📱', title: 'Blow up on social media', sub: 'Dominate TikTok, Instagram, and beyond' },
  { emoji: '🎶', title: "Make art I'm proud of", sub: 'Quality over everything. Always.' },
]

interface OnboardingData {
  artistName: string
  labelName: string
  genres: string[]
  careerStage: string
  longTermGoals: string[]
  logoFile: File | null
  logoPreview: string | null
}

const slide = {
  enter: (d: number) => ({ x: d > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -48 : 48, opacity: 0 }),
}

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
}

export function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // step 0 = intro, 1–6 = form steps, 7 = reveal
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [showLabelFlash, setShowLabelFlash] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [data, setData] = useState<OnboardingData>({
    artistName: '',
    labelName: '',
    genres: [],
    careerStage: '',
    longTermGoals: [],
    logoFile: null,
    logoPreview: null,
  })

  // Auto-advance intro screen
  useEffect(() => {
    if (step !== 0) return
    const t = setTimeout(() => { setDirection(1); setStep(1) }, 2800)
    return () => clearTimeout(t)
  }, [step])

  function goTo(next: number, dir = 1) {
    setDirection(dir)
    setStep(next)
  }

  function toggleGenre(g: string) {
    setData(d => ({
      ...d,
      genres: d.genres.includes(g) ? d.genres.filter(x => x !== g) : [...d.genres, g],
    }))
  }

  function toggleGoal(g: string) {
    setData(d => ({
      ...d,
      longTermGoals: d.longTermGoals.includes(g)
        ? d.longTermGoals.filter(x => x !== g)
        : [...d.longTermGoals, g],
    }))
  }

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setData(d => ({ ...d, logoFile: file, logoPreview: URL.createObjectURL(file) }))
  }

  // Step 2 → 3: show label name flash for 1 second first
  function handleStep2Next() {
    setShowLabelFlash(true)
    setTimeout(() => {
      setShowLabelFlash(false)
      goTo(3, 1)
    }, 1200)
  }

  async function handleEnterHQ() {
    if (!user) return
    setSaving(true)
    setError('')
    try {
      let logoUrl: string | null = null
      if (data.logoFile) {
        const ext = data.logoFile.name.split('.').pop()
        const path = `${user.id}/logos/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('artwork')
          .upload(path, data.logoFile, { upsert: true })
        if (!uploadErr) {
          const { data: u } = supabase.storage.from('artwork').getPublicUrl(path)
          logoUrl = u.publicUrl
        } else {
          console.warn('Logo upload failed:', uploadErr.message)
        }
      }

      const { error: dbErr } = await supabase.from('labels').insert({
        user_id: user.id,
        artist_name: data.artistName,
        name: data.labelName,
        tagline: null,
        genre: data.genres,
        logo_url: logoUrl,
        career_stage: data.careerStage,
        long_term_goals: data.longTermGoals,
      })

      if (dbErr) throw new Error(dbErr.message)

      // Fade to black then navigate
      setFadingOut(true)
      setTimeout(() => navigate('/app/dashboard'), 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div style={styles.root}>
      <BackgroundOrbs />

      {/* Step dots — visible on steps 1–7 */}
      <AnimatePresence>
        {step >= 1 && step <= 7 && (
          <motion.div
            style={styles.dots}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[1, 2, 3, 4, 5, 6, 7].map(n => (
              <div
                key={n}
                style={{
                  ...styles.dot,
                  background: n === step ? '#C8FF00' : '#2a2a2a',
                  transform: n === step ? 'scale(1.3)' : 'scale(1)',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Label flash overlay */}
      <AnimatePresence>
        {showLabelFlash && (
          <motion.div
            style={styles.flashOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.p
              style={styles.flashLabel}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              {data.labelName}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fade to black on exit */}
      <AnimatePresence>
        {fadingOut && (
          <motion.div
            style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7 }}
          />
        )}
      </AnimatePresence>

      {/* Main content */}
      <div style={styles.center}>
        <AnimatePresence mode="wait" custom={direction}>
          {step === 0 && (
            <motion.div
              key="intro"
              style={styles.introWrap}
              variants={fade}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.6 }}
            >
              <motion.p
                style={styles.logoMark}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              >
                LABYL
              </motion.p>
              <motion.p
                style={styles.introTagline}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.8 }}
              >
                Your label. Your rules.
              </motion.p>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              style={styles.stepWrap}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            >
              <StepArtistName
                data={data}
                setData={setData}
                onNext={() => goTo(2, 1)}
              />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              style={styles.stepWrap}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            >
              <StepLabelName
                data={data}
                setData={setData}
                onBack={() => goTo(1, -1)}
                onNext={handleStep2Next}
              />
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              style={styles.stepWrap}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            >
              <StepGenres
                data={data}
                toggleGenre={toggleGenre}
                onBack={() => goTo(2, -1)}
                onNext={() => goTo(4, 1)}
              />
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              style={styles.stepWrap}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            >
              <StepCareerStage
                data={data}
                setData={setData}
                onBack={() => goTo(3, -1)}
                onNext={() => goTo(5, 1)}
              />
            </motion.div>
          )}

          {step === 5 && (
            <motion.div
              key="step5"
              style={styles.stepWrap}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            >
              <StepLongTermGoals
                data={data}
                toggleGoal={toggleGoal}
                onBack={() => goTo(4, -1)}
                onNext={() => goTo(6, 1)}
              />
            </motion.div>
          )}

          {step === 6 && (
            <motion.div
              key="step6"
              style={styles.stepWrap}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            >
              <StepMeetTeam
                onBack={() => goTo(5, -1)}
                onNext={() => goTo(7, 1)}
              />
            </motion.div>
          )}

          {step === 7 && (
            <motion.div
              key="step7"
              style={styles.stepWrap}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            >
              <StepLogo
                data={data}
                fileInputRef={fileInputRef}
                onLogoChange={handleLogoChange}
                onBack={() => goTo(6, -1)}
                onNext={() => goTo(8, 1)}
              />
            </motion.div>
          )}

          {step === 8 && (
            <motion.div
              key="step8"
              style={styles.stepWrap}
              variants={fade}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.6 }}
            >
              <RevealStep
                data={data}
                saving={saving}
                error={error}
                onEnter={handleEnterHQ}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ── Background orbs ── */

function BackgroundOrbs() {
  return (
    <>
      <style>{`
        @keyframes orb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -30px) scale(1.08); }
        }
        @keyframes orb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, 40px) scale(1.05); }
        }
        @keyframes orb3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, 20px) scale(1.1); }
        }
      `}</style>
      <div style={{ ...styles.orb, ...styles.orb1 }} />
      <div style={{ ...styles.orb, ...styles.orb2 }} />
      <div style={{ ...styles.orb, ...styles.orb3 }} />
    </>
  )
}

/* ── Step 1 — Artist name ── */

function StepArtistName({
  data, setData, onNext,
}: {
  data: OnboardingData
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>
  onNext: () => void
}) {
  return (
    <div style={styles.stepContent}>
      <div style={styles.ghostWrap}>
        {data.artistName && (
          <p style={styles.ghostText} aria-hidden="true">{data.artistName}</p>
        )}
        <div style={styles.inputBlock}>
          <motion.h1
            style={styles.heading}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.4 }}
          >
            What do they call you?
          </motion.h1>
          <motion.p
            style={styles.subtext}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            Your name as an artist. How the world knows you.
          </motion.p>
          <motion.input
            autoFocus
            type="text"
            value={data.artistName}
            onChange={e => setData(d => ({ ...d, artistName: e.target.value }))}
            placeholder="Artist name"
            style={styles.lineInput}
            onFocus={e => (e.target.style.borderBottomColor = '#C8FF00')}
            onBlur={e => (e.target.style.borderBottomColor = '#333')}
            onKeyDown={e => { if (e.key === 'Enter' && data.artistName.trim()) onNext() }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          />
        </div>
      </div>
      <AnimatePresence>
        {data.artistName.trim() && (
          <motion.button
            onClick={onNext}
            style={styles.arrowBtn}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.25 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Step 2 — Label name ── */

function StepLabelName({
  data, setData, onBack, onNext,
}: {
  data: OnboardingData
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div style={styles.stepContent}>
      <div style={styles.ghostWrap}>
        {data.labelName && (
          <p style={styles.ghostText} aria-hidden="true">{data.labelName}</p>
        )}
        <div style={styles.inputBlock}>
          <motion.h1
            style={styles.heading}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.4 }}
          >
            Now name your label.
          </motion.h1>
          <motion.p
            style={styles.subtext}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            This is what the world will see on every release.
          </motion.p>
          <motion.input
            autoFocus
            type="text"
            value={data.labelName}
            onChange={e => setData(d => ({ ...d, labelName: e.target.value }))}
            placeholder="Label name"
            style={styles.lineInput}
            onFocus={e => (e.target.style.borderBottomColor = '#C8FF00')}
            onBlur={e => (e.target.style.borderBottomColor = '#333')}
            onKeyDown={e => { if (e.key === 'Enter' && data.labelName.trim()) onNext() }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          />
        </div>
      </div>
      <div style={styles.stepFooter}>
        <button onClick={onBack} style={styles.backLink}>← Back</button>
        <AnimatePresence>
          {data.labelName.trim() && (
            <motion.button
              onClick={onNext}
              style={styles.arrowBtn}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ── Step 3 — Genres ── */

function StepGenres({
  data, toggleGenre, onBack, onNext,
}: {
  data: OnboardingData
  toggleGenre: (g: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div style={styles.stepContent}>
      <motion.h1
        style={styles.heading}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4 }}
      >
        What's your sound?
      </motion.h1>
      <motion.p
        style={{ ...styles.subtext, marginBottom: 32 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        Pick everything that fits. Don't overthink it.
      </motion.p>
      <motion.div
        style={styles.genreWrap}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        {GENRES.map(g => {
          const active = data.genres.includes(g)
          return (
            <motion.button
              key={g}
              onClick={() => toggleGenre(g)}
              whileTap={{ scale: 0.94 }}
              animate={{
                background: active ? '#C8FF00' : '#111111',
                color: active ? '#000000' : '#888888',
                borderColor: active ? '#C8FF00' : '#333333',
                scale: active ? 1.03 : 1,
              }}
              transition={{ duration: 0.15 }}
              style={styles.genreChip}
            >
              {g}
            </motion.button>
          )
        })}
      </motion.div>
      <div style={styles.stepFooter}>
        <button onClick={onBack} style={styles.backLink}>← Back</button>
        <AnimatePresence>
          {data.genres.length > 0 && (
            <motion.button
              onClick={onNext}
              style={styles.arrowBtn}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ── Step 4 — Career Stage ── */

function StepCareerStage({
  data, setData, onBack, onNext,
}: {
  data: OnboardingData
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div style={styles.stepContent}>
      <motion.h1
        style={styles.heading}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4 }}
      >
        Where are you in your journey?
      </motion.h1>
      <motion.p
        style={{ ...styles.subtext, marginBottom: 28 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        Be honest. This helps your AI team meet you where you are.
      </motion.p>
      <motion.div
        style={styles.cardGrid}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        {CAREER_STAGES.map((stage, i) => {
          const active = data.careerStage === stage.title
          return (
            <motion.button
              key={stage.title}
              onClick={() => setData(d => ({ ...d, careerStage: stage.title }))}
              style={{
                ...styles.stageCard,
                borderColor: active ? '#C8FF00' : '#222222',
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.35 }}
              whileHover={{ borderColor: active ? '#C8FF00' : '#444' }}
              whileTap={{ scale: 0.98 }}
            >
              <span style={styles.stageEmoji}>{stage.emoji}</span>
              <div style={styles.stageText}>
                <p style={{ ...styles.stageTitle, color: active ? '#C8FF00' : '#FFFFFF' }}>
                  {stage.title}
                </p>
                <p style={styles.stageSub}>{stage.sub}</p>
              </div>
            </motion.button>
          )
        })}
      </motion.div>
      <div style={styles.stepFooter}>
        <button onClick={onBack} style={styles.backLink}>← Back</button>
        <AnimatePresence>
          {data.careerStage && (
            <motion.button
              onClick={onNext}
              style={styles.arrowBtn}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ── Step 5 — Long Term Goals ── */

function StepLongTermGoals({
  data, toggleGoal, onBack, onNext,
}: {
  data: OnboardingData
  toggleGoal: (g: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div style={styles.stepContent}>
      <motion.h1
        style={styles.heading}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4 }}
      >
        What are you building toward?
      </motion.h1>
      <motion.p
        style={{ ...styles.subtext, marginBottom: 28 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        This is your vision. Your AI team will always keep it in mind.
      </motion.p>
      <motion.div
        style={styles.goalsGrid}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        {LONG_TERM_GOALS.map((goal, i) => {
          const active = data.longTermGoals.includes(goal.title)
          return (
            <motion.button
              key={goal.title}
              onClick={() => toggleGoal(goal.title)}
              style={{
                ...styles.goalCard,
                borderColor: active ? '#C8FF00' : '#222222',
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.35 }}
              whileHover={{ borderColor: active ? '#C8FF00' : '#444' }}
              whileTap={{ scale: 0.98 }}
            >
              <span style={styles.goalEmoji}>{goal.emoji}</span>
              <div style={styles.goalText}>
                <p style={{ ...styles.goalTitle, color: active ? '#C8FF00' : '#FFFFFF' }}>
                  {goal.title}
                </p>
                <p style={styles.goalSub}>{goal.sub}</p>
              </div>
            </motion.button>
          )
        })}
      </motion.div>
      <div style={styles.stepFooter}>
        <button onClick={onBack} style={styles.backLink}>← Back</button>
        <AnimatePresence>
          {data.longTermGoals.length > 0 && (
            <motion.button
              onClick={onNext}
              style={styles.arrowBtn}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ── Step 6 — Meet Your Team ── */

function StepMeetTeam({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const lastCardDelay = 0.25 + (AGENTS.length - 1) * 0.15
  const footerDelay = lastCardDelay + 0.35
  const buttonDelay = footerDelay + 0.3

  return (
    <div style={{ ...styles.stepContent, minHeight: 'auto' }}>
      <motion.h1
        style={{ ...styles.heading, fontSize: 32 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4 }}
      >
        Meet your team.
      </motion.h1>
      <motion.p
        style={{ ...styles.subtext, marginBottom: 24 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        Every label needs the right people. Yours are already here.
      </motion.p>

      <div style={styles.teamGrid}>
        {AGENTS.map((agent, i) => (
          <motion.div
            key={agent.personName}
            style={styles.teamCard}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.15, duration: 0.4, ease: 'easeOut' }}
          >
            <div style={{ ...styles.teamInitial, background: `${agent.color}1a`, color: agent.color }}>
              {agent.initial}
            </div>
            <div style={styles.teamInfo}>
              <p style={styles.teamName}>{agent.personName}</p>
              <p style={styles.teamRole}>{agent.role}</p>
              <p style={styles.teamPersonalityDesc}>{agent.personalityDesc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.p
        style={styles.teamFooterText}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: footerDelay, duration: 0.5 }}
      >
        They know your sound, your goals, and your career stage. They're ready when you are.
      </motion.p>

      <motion.div
        style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: buttonDelay, duration: 0.4 }}
      >
        <motion.button
          onClick={onNext}
          style={styles.continueBtn}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Let's go →
        </motion.button>
      </motion.div>

      <motion.div
        style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: buttonDelay + 0.1, duration: 0.3 }}
      >
        <button onClick={onBack} style={styles.backLink}>← Back</button>
      </motion.div>
    </div>
  )
}

/* ── Step 7 — Logo ── */

function StepLogo({
  data, fileInputRef, onLogoChange, onBack, onNext,
}: {
  data: OnboardingData
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onLogoChange: (e: ChangeEvent<HTMLInputElement>) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div style={styles.stepContent}>
      <motion.h1
        style={styles.heading}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4 }}
      >
        Give your label a face.
      </motion.h1>
      <motion.p
        style={{ ...styles.subtext, marginBottom: 36 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        Upload a logo or we'll create one from your initials.
      </motion.p>

      <motion.div
        onClick={() => fileInputRef.current?.click()}
        style={{
          ...styles.uploadZone,
          borderColor: data.logoPreview ? '#C8FF00' : '#333',
        }}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        whileHover={{ borderColor: '#555' }}
      >
        <AnimatePresence mode="wait">
          {data.logoPreview ? (
            <motion.img
              key="preview"
              src={data.logoPreview}
              alt="Logo"
              style={styles.uploadPreview}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            />
          ) : (
            <motion.div
              key="placeholder"
              style={styles.uploadPlaceholder}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <p style={{ fontSize: 13, color: '#444', marginTop: 10 }}>Drop your logo here</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onLogoChange}
        style={{ display: 'none' }}
      />

      <div style={{ ...styles.stepFooter, flexDirection: 'column', gap: 20, alignItems: 'center' }}>
        <motion.button
          onClick={onNext}
          style={data.logoFile ? styles.continueBtn : { ...styles.continueBtn, background: '#1a1a1a', color: '#888', border: '1px solid #222' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {data.logoFile ? 'Continue' : 'Skip for now'}
        </motion.button>
        <button onClick={onBack} style={styles.backLink}>← Back</button>
      </div>
    </div>
  )
}

/* ── Step 7 — Reveal ── */

function TypewriterText({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      {text.split('').map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + i * 0.045, duration: 0.1 }}
        >
          {char === ' ' ? ' ' : char}
        </motion.span>
      ))}
    </>
  )
}

function RevealStep({
  data, saving, error, onEnter,
}: {
  data: OnboardingData
  saving: boolean
  error: string
  onEnter: () => void
}) {
  const letterDelay = data.labelName.length * 0.045 + 0.3
  const glowDelay = letterDelay + 0.4
  const buttonDelay = glowDelay + 0.6

  return (
    <div style={styles.revealWrap}>
      {/* Logo or initials */}
      <motion.div
        style={styles.revealLogoWrap}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
      >
        {data.logoPreview ? (
          <img src={data.logoPreview} alt="Logo" style={styles.revealLogo} />
        ) : (
          <div style={styles.revealLogoPlaceholder}>
            {data.labelName[0]?.toUpperCase() ?? 'L'}
          </div>
        )}

        {/* Glow pulse */}
        <motion.div
          style={styles.glowRing}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0.6, 0], scale: [0.9, 1.4, 1.6] }}
          transition={{ delay: glowDelay, duration: 1.2, ease: 'easeOut' }}
        />
      </motion.div>

      {/* Label name — typewriter */}
      <motion.h1
        style={styles.revealName}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.1 }}
      >
        <TypewriterText text={data.labelName} delay={0.5} />
      </motion.h1>

      {/* Founded by */}
      <motion.p
        style={styles.revealFounded}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: letterDelay, duration: 0.5 }}
      >
        Founded by {data.artistName}
      </motion.p>

      {/* Error */}
      {error && (
        <p style={{ color: '#ff4444', fontSize: 13, marginTop: 16 }}>{error}</p>
      )}

      {/* Enter HQ button */}
      <motion.button
        onClick={onEnter}
        disabled={saving}
        style={{ ...styles.enterBtn, opacity: saving ? 0.6 : 1 }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: buttonDelay, duration: 0.5, ease: 'easeOut' }}
        whileHover={{ scale: saving ? 1 : 1.03 }}
        whileTap={{ scale: saving ? 1 : 0.97 }}
      >
        {saving ? 'Setting up your label...' : 'Enter HQ →'}
      </motion.button>
    </div>
  )
}

/* ── Styles ── */
const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#0A0A0A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },

  // Orbs
  orb: {
    position: 'fixed',
    borderRadius: '50%',
    filter: 'blur(120px)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  orb1: {
    width: 600,
    height: 600,
    background: '#1A0533',
    top: '-20%',
    left: '-15%',
    opacity: 0.5,
    animation: 'orb1 18s ease-in-out infinite',
  },
  orb2: {
    width: 500,
    height: 500,
    background: '#001A0F',
    bottom: '-15%',
    right: '-10%',
    opacity: 0.6,
    animation: 'orb2 22s ease-in-out infinite',
  },
  orb3: {
    width: 350,
    height: 350,
    background: '#0D001A',
    top: '40%',
    right: '20%',
    opacity: 0.4,
    animation: 'orb3 26s ease-in-out infinite',
  },

  // Dots
  dots: {
    position: 'fixed',
    bottom: 36,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 8,
    zIndex: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
  },

  // Label flash
  flashOverlay: {
    position: 'fixed',
    inset: 0,
    background: '#0A0A0A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  flashLabel: {
    fontSize: 'clamp(40px, 8vw, 88px)',
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-3px',
    textAlign: 'center',
    padding: '0 24px',
  },

  // Center layout
  center: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 560,
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },

  // Intro
  introWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    textAlign: 'center',
  },
  logoMark: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '6px',
    color: '#C8FF00',
    textTransform: 'uppercase',
  },
  introTagline: {
    fontSize: 16,
    color: '#888888',
    letterSpacing: '0.3px',
  },

  // Steps
  stepWrap: {
    width: '100%',
  },
  stepContent: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 320,
    position: 'relative',
  },
  heading: {
    fontSize: 'clamp(24px, 5vw, 34px)',
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-0.8px',
    lineHeight: 1.15,
    marginBottom: 12,
  },
  subtext: {
    fontSize: 15,
    color: '#888888',
    lineHeight: 1.6,
    marginBottom: 48,
  },

  // Ghost text
  ghostWrap: {
    position: 'relative',
    flex: 1,
  },
  ghostText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: 'clamp(48px, 12vw, 100px)',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.04)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    letterSpacing: '-4px',
    userSelect: 'none',
    overflow: 'hidden',
    maxWidth: '100%',
    textOverflow: 'clip',
  },
  inputBlock: {
    position: 'relative',
    zIndex: 1,
  },
  lineInput: {
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #333',
    borderRadius: 0,
    padding: '12px 0',
    fontSize: 22,
    color: '#FFFFFF',
    outline: 'none',
    width: '100%',
    fontFamily: 'inherit',
    fontWeight: 500,
    transition: 'border-bottom-color 0.2s ease',
    caretColor: '#C8FF00',
  },

  // Arrow / continue buttons
  arrowBtn: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: '#C8FF00',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#000',
    flexShrink: 0,
  },
  stepFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 40,
  },
  backLink: {
    background: 'transparent',
    border: 'none',
    color: '#444',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
  continueBtn: {
    background: '#C8FF00',
    color: '#000',
    border: 'none',
    borderRadius: 10,
    padding: '14px 32px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.2px',
    minWidth: 200,
  },

  // Genres
  genreWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 40,
  },
  genreChip: {
    padding: '9px 18px',
    borderRadius: 100,
    border: '1px solid',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    letterSpacing: '0.2px',
    fontFamily: 'inherit',
  },

  // Meet Your Team
  teamGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 24,
  },
  teamCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: '#111111',
    border: '1px solid #222222',
    borderRadius: 12,
    padding: '12px 16px',
  },
  teamInitial: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
  },
  teamInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  teamName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#FFFFFF',
    lineHeight: 1.2,
  },
  teamRole: {
    fontSize: 12,
    color: '#888888',
    lineHeight: 1.3,
  },
  teamPersonalityDesc: {
    fontSize: 11,
    color: '#888888',
    fontStyle: 'italic',
    lineHeight: 1.4,
    marginTop: 1,
  },
  teamFooterText: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 1.6,
  },

  // Career Stage cards
  cardGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 8,
  },
  stageCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    background: '#111111',
    border: '1px solid',
    borderRadius: 12,
    padding: '16px 20px',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s ease',
  },
  stageEmoji: {
    fontSize: 24,
    flexShrink: 0,
    lineHeight: 1,
  },
  stageText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  stageTitle: {
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  stageSub: {
    fontSize: 12,
    color: '#555555',
    lineHeight: 1.4,
  },

  // Long-term goals cards
  goalsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 8,
  },
  goalCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: '#111111',
    border: '1px solid',
    borderRadius: 10,
    padding: '13px 18px',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s ease',
  },
  goalEmoji: {
    fontSize: 20,
    flexShrink: 0,
    lineHeight: 1,
  },
  goalText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  goalSub: {
    fontSize: 12,
    color: '#555555',
    lineHeight: 1.4,
  },

  // Upload
  uploadZone: {
    width: '100%',
    maxWidth: 260,
    aspectRatio: '1',
    border: '1.5px dashed',
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    margin: '0 auto 36px',
    overflow: 'hidden',
    transition: 'border-color 0.2s ease',
    background: 'rgba(255,255,255,0.02)',
  },
  uploadPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  uploadPreview: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },

  // Reveal
  revealWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 0,
    width: '100%',
  },
  revealLogoWrap: {
    position: 'relative',
    marginBottom: 32,
  },
  revealLogo: {
    width: 96,
    height: 96,
    borderRadius: 20,
    objectFit: 'cover',
    border: '1px solid #222',
    position: 'relative',
    zIndex: 1,
  },
  revealLogoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 20,
    background: '#111',
    border: '1px solid #222',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 36,
    fontWeight: 700,
    color: '#C8FF00',
    position: 'relative',
    zIndex: 1,
  },
  glowRing: {
    position: 'absolute',
    inset: -20,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(200,255,0,0.25) 0%, transparent 70%)',
    zIndex: 0,
    pointerEvents: 'none',
  },
  revealName: {
    fontSize: 'clamp(36px, 8vw, 56px)',
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-2px',
    lineHeight: 1.1,
    marginBottom: 14,
  },
  revealFounded: {
    fontSize: 15,
    color: '#555',
    marginBottom: 56,
    letterSpacing: '0.2px',
  },
  enterBtn: {
    background: '#C8FF00',
    color: '#000',
    border: 'none',
    borderRadius: 12,
    padding: '16px 40px',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.3px',
  },
}
