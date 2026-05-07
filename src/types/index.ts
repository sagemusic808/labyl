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
