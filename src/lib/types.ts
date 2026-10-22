export type Stage = {
  id: string
  account_id: string
  name: string
  color: string
  position: number
  block: string
  kind: 'open' | 'won' | 'lost'
  portal_step: number | null
  hidden: boolean
}

export type Deal = {
  id: string
  account_id: string
  title: string
  stage_id: string | null
  position: number
  cover_url: string | null
  description: string | null
  drive_folder_url: string | null
  address: string | null
  category: string | null
  transaction_type: string | null
  source: string | null
  expected_commission: number | null
  listing_price: number | null
  estimate_low: number | null
  estimate_high: number | null
  estimate_date: string | null
  top_offer: number | null
  top_offer_date: string | null
  next_step: string | null
  next_step_at: string | null
  assignee_id: string | null
  custom: Record<string, unknown>
  valuo?: (import('../components/ValuoView').ValuoResult & { shared?: boolean }) | null
  intake?: { type?: 'byt' | 'dum' | 'pozemek'; values?: Record<string, unknown> } | null
  clickup_id: string | null
  portal_token: string | null
  portal_enabled: boolean
  portal_show_prices: { estimate?: boolean; listing?: boolean; offer?: boolean } | null
  portal_step_override: number | null
  portal_eta: string | null
  portal_note: string | null
  portal_links: { label: string; url: string }[] | null
  portal_stats: { views?: number; inquiries?: number; showings?: number; history?: { at: string; views: number; inquiries: number; showings: number }[] } | null
  portal_viewed_at: string | null
  portal_view_count: number
  drive_scan: unknown | null
  drive_scanned_at: string | null
  stage_changed_at: string
  listing_started_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  deal_contacts?: { role: string; position?: number; contacts: Contact | null }[]
  tasks?: { id: string; done: boolean }[]
}

export type Contact = {
  id: string
  account_id: string
  first_name: string | null
  last_name: string | null
  salutation: string | null
  phone: string | null
  email: string | null
  street: string | null
  house_no: string | null
  city: string | null
  zip: string | null
  country: string | null
  birth_date: string | null
  gender: string | null
  formality: 'vykani' | 'tykani' | null
  source: string | null
  tags: string[]
  notes: string | null
  clickup_id: string | null
  birth_number?: string | null
  dup_ignored?: boolean
  name_day?: string | null // 'MM-DD', podle jména
  status?: string | null // prodávající | kupující | klient | lead
  custom?: Record<string, unknown> | null
  created_at: string
}

export type FieldDef = {
  id: string
  account_id: string
  entity: 'deal' | 'contact'
  key: string
  label: string
  type: string
  options: string[]
  is_core: boolean
  show_card: boolean
  show_list: boolean
  show_mobile: boolean
  position: number
}

export type Task = {
  id: string
  account_id: string
  deal_id: string | null
  title: string
  done: boolean
  assignee_id: string | null
  due_at: string | null
  tags: string[]
  position: number
  created_at: string
}

export type Activity = {
  id: string
  deal_id: string | null
  type: string
  body: string | null
  data: Record<string, unknown>
  author_id: string | null
  created_at: string
}

export type Member = { user_id: string; role: string; profiles: { full_name: string | null; email: string | null } | null }
