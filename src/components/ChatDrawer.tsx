import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Agent } from '../lib/agents'
import type { Label } from '../types'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatDrawerProps {
  agent: Agent | null
  label: Label
  onClose: () => void
  initialPrompt?: string
}

export function ChatDrawer({ agent, label, onClose, initialPrompt }: ChatDrawerProps) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isOpen = agent !== null

  // Load conversation history whenever agent changes
  useEffect(() => {
    if (!agent || !user) return
    setMessages([])
    setLoadingHistory(true)

    supabase
      .from('ai_conversations')
      .select('messages')
      .eq('user_id', user.id)
      .eq('agent_type', agent.type)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.messages && Array.isArray(data.messages)) {
          setMessages(data.messages as ChatMessage[])
        }
        setLoadingHistory(false)
      })
  }, [agent?.type, user])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when drawer opens, pre-fill initialPrompt if provided
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
        if (initialPrompt) setInput(initialPrompt)
      }, 300)
    } else {
      setInput('')
    }
  }, [isOpen, initialPrompt])

  async function handleSend(e?: FormEvent) {
    e?.preventDefault()
    if (!input.trim() || loading || !agent) return

    const userMsg: ChatMessage = { role: 'user', content: input.trim() }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

      const res = await fetch(`${supabaseUrl}/functions/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          agentType: agent.type,
          labelName: label.name,
          genres: label.genre,
          artistName: label.artist_name ?? '',
          careerStage: label.career_stage ?? '',
          longTermGoals: label.long_term_goals ?? [],
        }),
      })

      if (!res.ok) throw new Error(`Chat failed: ${res.status}`)
      if (!res.body) throw new Error('No response body')

      // Add an empty assistant bubble — tokens will fill it in
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])
      setLoading(false) // hide typing dots; streaming text is the indicator now

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        // Update the last message in place as each chunk arrives
        setMessages(prev => {
          const arr = [...prev]
          arr[arr.length - 1] = { role: 'assistant', content: accumulated }
          return arr
        })
      }

      // Persist the full conversation once streaming is done
      const final = [...updated, { role: 'assistant' as const, content: accumulated }]
      await supabase.from('ai_conversations').upsert(
        {
          user_id: user?.id,
          agent_type: agent.type,
          messages: final,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,agent_type' }
      )
    } catch (err) {
      console.error('Chat error:', err)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '42%',
          minWidth: '420px',
          height: '100vh',
          background: '#0f0f0f',
          borderLeft: '0.5px solid #222222',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {agent && (
          <>
            {/* Header */}
            <div style={styles.drawerHeader}>
              <div style={styles.drawerHeaderLeft}>
                <span style={{ ...styles.agentDot, background: agent.color }} />
                <div>
                  <p style={styles.drawerAgentName}>{agent.personName}</p>
                  <p style={styles.drawerSubtext}>{agent.role}</p>
                </div>
              </div>
              <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div style={styles.messagesArea}>
              {loadingHistory ? (
                <div style={styles.centered}>
                  <Spinner />
                </div>
              ) : (
                <>
                  {/* Auto-greeting always shown first */}
                  <div
                    style={{
                      ...styles.messageBubble,
                      alignSelf: 'flex-start',
                      background: '#141414',
                      border: '1px solid #1e1e1e',
                      borderRadius: '12px 12px 12px 2px',
                    }}
                  >
                    <span style={{ ...styles.bubbleDot, background: agent.color }} />
                    <p style={styles.messageText}>
                      {agent.greeting.replace(/\{artistName\}/g, label.artist_name || label.name)}
                    </p>
                  </div>

                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        ...styles.messageBubble,
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        background: msg.role === 'user' ? '#1a1a1a' : '#141414',
                        border: msg.role === 'user' ? '1px solid #2a2a2a' : '1px solid #1e1e1e',
                        borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      }}
                    >
                      {msg.role === 'assistant' && (
                        <span style={{ ...styles.bubbleDot, background: agent.color }} />
                      )}
                      <div style={styles.messageText}>
                        {msg.role === 'assistant'
                          ? <MarkdownText text={msg.content} />
                          : msg.content}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div style={{ ...styles.messageBubble, alignSelf: 'flex-start', background: '#141414', border: '1px solid #1e1e1e', borderRadius: '12px 12px 12px 2px' }}>
                      <span style={{ ...styles.bubbleDot, background: agent.color }} />
                      <TypingDots color={agent.color} />
                    </div>
                  )}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div style={styles.inputArea}>
              <form onSubmit={handleSend} style={styles.inputForm}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Ask ${agent.personName} anything…`}
                  rows={1}
                  style={styles.textarea}
                  onInput={e => {
                    const el = e.currentTarget
                    el.style.height = 'auto'
                    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
                  }}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  style={{
                    ...styles.sendBtn,
                    opacity: loading || !input.trim() ? 0.4 : 1,
                    cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
              <p style={styles.inputHint}>Press Enter to send · Shift+Enter for new line</p>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/** Renders the subset of markdown Claude actually uses in chat responses */
function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <>
      {lines.map((line, li) => {
        // Bullet list item
        const bullet = line.match(/^(\s*[-*])\s+(.*)/)
        if (bullet) {
          return (
            <p key={li} style={{ margin: '2px 0', paddingLeft: 12, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: '#C8FF00' }}>·</span>
              <InlineMarkdown text={bullet[2]} />
            </p>
          )
        }

        // Numbered list item
        const numbered = line.match(/^(\d+)\.\s+(.*)/)
        if (numbered) {
          return (
            <p key={li} style={{ margin: '2px 0', paddingLeft: 18, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: '#888', fontSize: 12 }}>{numbered[1]}.</span>
              <InlineMarkdown text={numbered[2]} />
            </p>
          )
        }

        // Empty line → small gap
        if (!line.trim()) return <div key={li} style={{ height: 6 }} />

        // Regular paragraph
        return <p key={li} style={{ margin: '2px 0' }}><InlineMarkdown text={line} /></p>
      })}
    </>
  )
}

/** Handles inline **bold**, *italic*, and `code` within a single line */
function InlineMarkdown({ text }: { text: string }) {
  // Split on **bold**, *italic*, `code` tokens
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)

  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.startsWith('**') && tok.endsWith('**')) {
          return <strong key={i} style={{ color: '#fff', fontWeight: 600 }}>{tok.slice(2, -2)}</strong>
        }
        if (tok.startsWith('*') && tok.endsWith('*')) {
          return <em key={i} style={{ color: '#ccc' }}>{tok.slice(1, -1)}</em>
        }
        if (tok.startsWith('`') && tok.endsWith('`')) {
          return (
            <code key={i} style={{ background: '#1e1e1e', color: '#C8FF00', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>
              {tok.slice(1, -1)}
            </code>
          )
        }
        return <span key={i}>{tok}</span>
      })}
    </>
  )
}

function Spinner() {
  return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #222', borderTopColor: '#C8FF00', animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function TypingDots({ color }: { color: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%', background: color,
            animation: `bounce 1.2s ease ${i * 0.2}s infinite`,
            display: 'inline-block',
          }}
        />
      ))}
      <style>{`@keyframes bounce { 0%,80%,100%{opacity:0.3;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  drawerHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '24px 24px 20px',
    borderBottom: '0.5px solid #1e1e1e',
    flexShrink: 0,
  },
  drawerHeaderLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  agentDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: 4,
  },
  drawerAgentName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#FFFFFF',
    marginBottom: 3,
  },
  drawerSubtext: {
    fontSize: '12px',
    color: '#555555',
    lineHeight: 1.4,
    maxWidth: '280px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#555',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    transition: 'color 0.15s ease',
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  centered: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  emptyChat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    flex: 1,
    gap: '10px',
    textAlign: 'center',
    padding: '40px',
  },
  emptyChatDot: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    marginBottom: '8px',
    opacity: 0.8,
  },
  emptyChatTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#FFFFFF',
  },
  emptyChatSub: {
    fontSize: '13px',
    color: '#444444',
    maxWidth: '220px',
    lineHeight: 1.5,
  },
  messageBubble: {
    padding: '12px 14px',
    maxWidth: '85%',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  bubbleDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
    marginBottom: 2,
  },
  messageText: {
    fontSize: '14px',
    color: '#E0E0E0',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  inputArea: {
    padding: '16px 20px 20px',
    borderTop: '0.5px solid #1e1e1e',
    flexShrink: 0,
  },
  inputForm: {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    background: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: '10px',
    padding: '11px 14px',
    fontSize: '14px',
    color: '#FFFFFF',
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    overflowY: 'auto',
    transition: 'border-color 0.15s ease',
  },
  sendBtn: {
    background: '#C8FF00',
    color: '#000000',
    border: 'none',
    borderRadius: '10px',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.15s ease',
  },
  inputHint: {
    fontSize: '11px',
    color: '#333333',
    marginTop: '8px',
    textAlign: 'center',
  },
}
