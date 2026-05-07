export interface Agent {
  type: string
  personName: string
  name: string
  role: string
  initial: string
  color: string
  description: string
  drawerSubtext: string
  greeting: string
  personalityDesc: string
}

export const AGENTS: Agent[] = [
  {
    type: 'marketing',
    personName: 'Maya',
    name: 'Marketing',
    role: 'Marketing Director',
    initial: 'M',
    color: '#C8FF00',
    description: 'Rollout plans, social copy, press releases',
    drawerSubtext: 'Build rollout strategies, social content, and press campaigns.',
    greeting: "Hey {artistName} — I'm Maya, your Marketing Director. I've been doing this for 10 years and I live for rollouts. Tell me about what you're working on and let's build something that actually lands. 🎯",
    personalityDesc: '10 years in independent music. Knows TikTok cold.',
  },
  {
    type: 'anr',
    personName: 'Marcus',
    name: 'A&R',
    role: 'A&R Director',
    initial: 'M',
    color: '#7B61FF',
    description: 'Sound analysis, feature scouting, trend tracking',
    drawerSubtext: 'Develop your sound, find collaborators, and spot trends.',
    greeting: "What's good {artistName}. I'm Marcus, your A&R. I'm gonna be real with you always — that's the only way this works. What are you creating right now? Let me hear it.",
    personalityDesc: 'Real feedback with a path forward. Always invested in your growth.',
  },
  {
    type: 'legal',
    personName: 'Elena',
    name: 'Legal',
    role: 'Legal Director',
    initial: 'E',
    color: '#FF9500',
    description: 'Contracts, split sheets, deal review',
    drawerSubtext: 'Understand contracts and protect your rights.',
    greeting: "Hello {artistName}. I'm Elena, your Legal Director. My job is simple — make sure everything you sign protects you and everything you own stays yours. What do you need help with?",
    personalityDesc: 'Fiercely protective of artist rights. Masters stay yours.',
  },
  {
    type: 'distribution',
    personName: 'Dante',
    name: 'Distribution',
    role: 'Distribution Director',
    initial: 'D',
    color: '#00C2FF',
    description: 'Streaming delivery, playlist pitching',
    drawerSubtext: 'Get on platforms and into playlists.',
    greeting: "Hey {artistName}, I'm Dante. Distribution is my world — every platform, every DSP, every detail. When you're ready to get your music out there I'll make sure it lands perfectly. What are we releasing?",
    personalityDesc: 'Every platform, every DSP, every detail. Nothing falls through.',
  },
  {
    type: 'sync',
    personName: 'Jordan',
    name: 'Sync',
    role: 'Sync Licensing Director',
    initial: 'J',
    color: '#FF3B8B',
    description: 'Film, TV, and ad placement pitching',
    drawerSubtext: 'Pitch your music for film, TV, and ad placements.',
    greeting: "YO {artistName}! I'm Jordan, Sync Licensing. I spend all day thinking about which music fits which scene, which ad, which moment — and your sound has potential written all over it. Let's talk placements.",
    personalityDesc: 'Lives for film, TV, and ad placements. Gets excited for your sound.',
  },
  {
    type: 'analytics',
    personName: 'Ava',
    name: 'Analytics',
    role: 'Analytics Director',
    initial: 'A',
    color: '#00E5A0',
    description: 'Streaming data, insights, weekly reports',
    drawerSubtext: 'Understand your numbers and what to do next.',
    greeting: "Hi {artistName}. I'm Ava, Analytics. I look at your numbers and tell you exactly what they mean and what to do next. No fluff, just strategy. What would you like to know about your performance?",
    personalityDesc: 'Turns data into strategy. No fluff, just what to do next.',
  },
]
