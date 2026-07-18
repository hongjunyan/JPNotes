const BASE = '/api'

export interface NoteListItem {
  id: number
  title: string
  excerpt: string
  tags: string[]
  updated_at: string
}

export interface NoteListOut {
  items: NoteListItem[]
  total: number
}

export interface Note {
  id: number
  title: string
  content: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface TagOut {
  id: number
  name: string
  note_count: number
  card_count: number
}

export type CardType = 'vocab' | 'grammar'

export interface Card {
  id: number
  type: CardType
  word: string
  reading: string | null
  meaning_en: string | null
  meaning_zh: string | null
  pos: string | null
  example: string | null
  source_note_id: number | null
  source_note_title: string | null
  tags: string[]
  due_date: string
  interval: number
  ease_factor: number
  repetitions: number
  lapses: number
  last_reviewed: string | null
  created_at: string
  updated_at: string
}

export interface CardListOut {
  items: Card[]
  total: number
}

export interface CardPayload {
  type: CardType
  word: string
  reading?: string | null
  meaning_en?: string | null
  meaning_zh?: string | null
  pos?: string | null
  example?: string | null
  source_note_id?: number | null
  tags: string[]
}

export interface DictCandidate {
  word: string
  reading: string | null
  pos: string | null
  glosses: string[]
}

export interface ReviewQueueOut {
  cards: Card[]
  total: number
}

export interface ExamQuestion {
  card_id: number
  direction: 'word2meaning' | 'meaning2word'
  prompt: string
  reading: string | null
  choices: string[]
  answer: number
}

export interface StatsOverview {
  due_today: number
  total_cards: number
  total_notes: number
  reviews_today: number
  streak: number
  retention_30d: number | null
}

export interface HeatmapDay {
  date: string
  count: number
}

export interface KanjiInfo {
  literal: string
  stroke_count: number | null
  grade: number | null
  jlpt: number | null
  freq: number | null
  on: string[]
  kun: string[]
  meanings: string[]
}

export interface FuriganaResponse {
  segments: { surface: string; reading: string | null }[]
  marked: string
}

export interface ImageOut {
  id: string
  url: string
  filename: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${detail}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function json(body: unknown, method = 'POST'): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const api = {
  listNotes(params: { q?: string; tag?: string } = {}) {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.tag) qs.set('tag', params.tag)
    const suffix = qs.toString() ? `?${qs}` : ''
    return request<NoteListOut>(`/notes${suffix}`)
  },
  getNote(id: number | string) {
    return request<Note>(`/notes/${id}`)
  },
  createNote(payload: { title: string; content: string; tags: string[] }) {
    return request<Note>('/notes', json(payload))
  },
  updateNote(id: number | string, payload: { title?: string; content?: string; tags?: string[] }) {
    return request<Note>(`/notes/${id}`, json(payload, 'PUT'))
  },
  deleteNote(id: number | string) {
    return request<void>(`/notes/${id}`, { method: 'DELETE' })
  },
  listTags() {
    return request<TagOut[]>('/tags')
  },
  furigana(text: string) {
    return request<FuriganaResponse>('/dict/furigana', json({ text }))
  },
  dictLookup(word: string) {
    return request<{ candidates: DictCandidate[] }>(`/dict/lookup?word=${encodeURIComponent(word)}`)
  },
  listCards(params: { q?: string; type?: CardType; tag?: string } = {}) {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.type) qs.set('type', params.type)
    if (params.tag) qs.set('tag', params.tag)
    const suffix = qs.toString() ? `?${qs}` : ''
    return request<CardListOut>(`/cards${suffix}`)
  },
  createCard(payload: CardPayload) {
    return request<Card>('/cards', json(payload))
  },
  updateCard(id: number, payload: Partial<CardPayload>) {
    return request<Card>(`/cards/${id}`, json(payload, 'PUT'))
  },
  deleteCard(id: number) {
    return request<void>(`/cards/${id}`, { method: 'DELETE' })
  },
  reviewQueue(params: { type?: CardType; tag?: string } = {}) {
    const qs = new URLSearchParams()
    if (params.type) qs.set('type', params.type)
    if (params.tag) qs.set('tag', params.tag)
    const suffix = qs.toString() ? `?${qs}` : ''
    return request<ReviewQueueOut>(`/review/queue${suffix}`)
  },
  rateCard(id: number, rating: 1 | 2 | 3 | 4) {
    return request<Card>(`/review/${id}`, json({ rating }))
  },
  examGenerate(payload: { type?: CardType; tag?: string; count: number }) {
    return request<{ questions: ExamQuestion[] }>('/exam/generate', json(payload))
  },
  statsOverview() {
    return request<StatsOverview>('/stats/overview')
  },
  statsHeatmap(days = 182) {
    return request<HeatmapDay[]>(`/stats/heatmap?days=${days}`)
  },
  kanjiInfo(char: string) {
    return request<KanjiInfo>(`/dict/kanji/${encodeURIComponent(char)}`)
  },
  async uploadImage(file: File): Promise<ImageOut> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/images`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    return res.json()
  },
}
