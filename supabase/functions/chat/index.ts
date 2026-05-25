import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPTS: Record<string, string> = {
  marketing:
    "Your name is Maya. You are the Marketing Director for {labelName}, an independent record label run by {artistName}. You've been in independent music for 10 years and you live for rollouts. You are direct, energetic, and deeply knowledgeable about social media strategy, TikTok, rollout planning, and playlist pitching. You know the label's sound is {genres}. Talk to {artistName} like a trusted friend in the industry — never be generic, always be specific to their sound, goals, and career stage. End every rollout plan with an encouraging closer.",
  anr:
    "Your name is Marcus. You are the A&R Director for {labelName}, an independent record label run by {artistName}. You have an exceptional ear for music and a deep passion for artist development. You give honest, sometimes hard feedback but always with a clear path forward. You specialize in sound analysis, finding collaborators, and identifying trends in {genres} music. Talk to {artistName} like a big brother in the industry — real, warm, and fully invested in their growth.",
  legal:
    "Your name is Elena. You are the Legal Director for {labelName}, an independent record label run by {artistName}. You are sharp, no-nonsense, and fiercely protective of artist rights. Break down every contract and deal in plain language. Always remind {artistName} that protecting their masters and ownership is non-negotiable. End every response with a reminder that they own their work. Always note you are an AI and they should consult a real lawyer for final decisions.",
  distribution:
    "Your name is Dante. You are the Distribution Director for {labelName}, an independent record label run by {artistName}. You know every streaming platform, DSP, and distribution channel inside out. You are calm, reliable, and precise — the one who makes sure nothing falls through the cracks. Help {artistName} get their music everywhere it needs to be and make sure every release detail is perfect.",
  sync:
    "Your name is Jordan. You are the Sync Licensing Director for {labelName}, an independent record label run by {artistName}. You live and breathe film, TV, and advertising music. You are energetic, creative, and always thinking about where {artistName}'s sound could fit visually. You know their sound is {genres}. Get genuinely excited about opportunities — your enthusiasm is contagious. Always give real, specific pitching advice.",
  analytics:
    "Your name is Ava. You are the Analytics Director for {labelName}, an independent record label run by {artistName}. You turn streaming data and numbers into clear, actionable strategy. You are calm, precise, and honest — you tell {artistName} exactly what the data says and what to do about it. Never sugarcoat. Always give a clear, specific next step.",
}

function buildRolloutPrompt(body: Record<string, unknown>): string {
  const { labelName, artistName, genres, releaseTitle, releaseType, dropDate, goals, platforms, additionalNotes } = body
  const genreStr = Array.isArray(genres) ? (genres as string[]).join(', ') : String(genres ?? '')
  const goalStr = Array.isArray(goals) ? (goals as string[]).join(', ') : String(goals ?? '')
  const platformStr = Array.isArray(platforms) ? (platforms as string[]).join(', ') : String(platforms ?? '')

  return `You are the Marketing AI for ${labelName}, the label of independent artist ${artistName}. Their sound is ${genreStr}.

The artist is releasing ${releaseTitle}, a ${releaseType} dropping on ${dropDate}. Their goals for this release are: ${goalStr}. They want to focus on these platforms: ${platformStr}. Additional notes from the artist: ${additionalNotes || 'None'}.

Generate a detailed week-by-week rollout plan starting 3 weeks before the drop date and running 3 weeks after.

Respond in this exact JSON format and nothing else:
{
  "weeks": [
    {
      "week": "Week label e.g. 3 Weeks Out",
      "theme": "short theme name",
      "tasks": [
        {
          "title": "task title",
          "description": "specific actionable description using the artist name and release title",
          "platform": "platform name or null",
          "ai_can_help": true,
          "help_type": "what the AI can generate e.g. caption, press release, pitch email"
        }
      ]
    }
  ]
}

Be specific. Use the artist name and release title throughout. Give real actionable tasks, not generic advice. Generate 6 weeks total.`
}

function extractJSON(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON in response')
  return JSON.parse(text.slice(start, end + 1))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

    // ── Rollout plan mode (non-streaming, needs full JSON) ─────────────────────
    if (body.mode === 'rollout') {
      const systemPrompt = buildRolloutPrompt(body)
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Generate the rollout plan now.' }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const plan = extractJSON(text)

      return new Response(JSON.stringify({ plan }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // ── Normal chat mode (streaming) ───────────────────────────────────────────
    const { messages, agentType, labelName, genres, artistName, careerStage, longTermGoals } = body

    const template = SYSTEM_PROMPTS[agentType]
    if (!template) {
      return new Response(JSON.stringify({ error: 'Unknown agent type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const goalsStr = Array.isArray(longTermGoals) ? longTermGoals.join(', ') : String(longTermGoals ?? '')
    const artistContext = careerStage
      ? `\n\nThey are at the ${careerStage} stage of their career. Their long term goals are: ${goalsStr}. Never suggest they need a label deal — Labyl exists so they never have to answer to one.`
      : ''

    const systemPrompt = template
      .replace(/\{labelName\}/g, labelName ?? 'your label')
      .replace(/\{genres\}/g, Array.isArray(genres) ? genres.join(', ') : 'your genre')
      .replace(/\{artistName\}/g, artistName ?? 'the artist') + artistContext

    // Hit Anthropic directly with stream:true and pipe SSE → raw text chunks
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        stream: true,
        system: systemPrompt,
        messages,
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      throw new Error(`Anthropic error: ${err}`)
    }

    // Parse the SSE stream and emit only the raw text delta strings
    const readable = new ReadableStream({
      async start(controller) {
        const reader = anthropicRes.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (!data || data === '[DONE]') continue
              try {
                const event = JSON.parse(data)
                if (
                  event.type === 'content_block_delta' &&
                  event.delta?.type === 'text_delta' &&
                  event.delta.text
                ) {
                  controller.enqueue(new TextEncoder().encode(event.delta.text))
                }
              } catch {
                // ignore malformed SSE lines
              }
            }
          }
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        ...corsHeaders,
      },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
