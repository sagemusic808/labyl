export interface Label {
  id: string
  user_id: string
  artist_name: string
  name: string
  tagline: string | null
  genre: string[]
  logo_url: string | null
  career_stage: string | null
  long_term_goals: string[] | null
  created_at: string
}

export interface Release {
  id: string
  user_id: string
  title: string
  type: string
  drop_date: string | null
  artwork_url: string | null
  audio_url: string | null
  platforms: string[] | null
  external_link: string | null
  notes: string | null
  status: string | null
  created_at: string
}
