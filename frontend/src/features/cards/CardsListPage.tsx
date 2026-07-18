import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardType, TagOut, api } from '../../api/client'
import CardModal, { CardModalInitial } from '../../components/CardModal'
import { speakJa, ttsAvailable } from '../../lib/tts'

const TYPE_TABS: { key: CardType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'vocab', label: '單字' },
  { key: 'grammar', label: '文法' },
]

export default function CardsListPage() {
  const [query, setQuery] = useState('')
  const [typeTab, setTypeTab] = useState<CardType | 'all'>('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [items, setItems] = useState<Card[]>([])
  const [tags, setTags] = useState<TagOut[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<CardModalInitial | null>(null)

  const refreshTags = useCallback(() => {
    api.listTags().then((all) => setTags(all.filter((t) => t.card_count > 0))).catch(() => setTags([]))
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    api
      .listCards({
        q: query || undefined,
        type: typeTab === 'all' ? undefined : typeTab,
        tag: activeTag || undefined,
      })
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [query, typeTab, activeTag])

  useEffect(refreshTags, [refreshTags])

  useEffect(() => {
    const timer = setTimeout(refresh, 250)
    return () => clearTimeout(timer)
  }, [refresh])

  const today = new Date().toISOString().slice(0, 10)

  function openEdit(card: Card) {
    setModal({
      id: card.id,
      type: card.type,
      word: card.word,
      reading: card.reading,
      meaning_zh: card.meaning_zh,
      meaning_en: card.meaning_en,
      pos: card.pos,
      example: card.example,
      source_note_id: card.source_note_id,
      source_note_title: card.source_note_title,
      tags: card.tags,
    })
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>卡片</h1>
        <button className="btn btn-primary" onClick={() => setModal({})}>
          ＋ 新卡片
        </button>
      </div>

      <input
        className="search-input"
        type="search"
        placeholder="搜尋卡片（單字、讀音、意思、例句）…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="tag-row">
        {TYPE_TABS.map((t) => (
          <button
            key={t.key}
            className={`chip ${typeTab === t.key ? 'chip-active' : ''}`}
            onClick={() => setTypeTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <span className="tag-row-divider" />
        {tags.map((t) => (
          <button
            key={t.id}
            className={`chip ${activeTag === t.name ? 'chip-active' : ''}`}
            onClick={() => setActiveTag(activeTag === t.name ? null : t.name)}
          >
            {t.name}
            <span className="chip-count">{t.card_count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">載入中…</p>
      ) : items.length === 0 ? (
        <p className="muted">
          {query || activeTag || typeTab !== 'all'
            ? '沒有符合的卡片。'
            : '還沒有卡片。可以在筆記閱讀頁選取單字加入，或按「新卡片」手動建立。'}
        </p>
      ) : (
        <ul className="card-grid">
          {items.map((c) => (
            <li key={c.id} className="vocab-card" onClick={() => openEdit(c)}>
              <div className="vocab-card-head">
                <span className="vocab-word">
                  {c.reading ? (
                    <ruby>
                      {c.word}
                      <rt>{c.reading}</rt>
                    </ruby>
                  ) : (
                    c.word
                  )}
                </span>
                <span className="vocab-card-actions">
                  {ttsAvailable() && (
                    <button
                      className="tts-btn"
                      title="發音"
                      onClick={(e) => {
                        e.stopPropagation()
                        speakJa(c.word)
                      }}
                    >
                      🔊
                    </button>
                  )}
                  <span className={`type-badge type-badge-${c.type}`}>{c.type === 'vocab' ? '單字' : '文法'}</span>
                </span>
              </div>
              {(c.meaning_zh || c.meaning_en) && (
                <div className="vocab-meaning">{c.meaning_zh || c.meaning_en}</div>
              )}
              {c.example && <div className="vocab-example">{c.example}</div>}
              <div className="note-card-meta">
                {c.tags.map((t) => (
                  <span key={t} className="chip chip-small">
                    {t}
                  </span>
                ))}
                <span className={`muted ${c.due_date <= today ? 'due-now' : ''}`}>
                  {c.due_date <= today ? '待複習' : `下次 ${c.due_date}`}
                </span>
                {c.source_note_id && (
                  <Link
                    to={`/notes/${c.source_note_id}`}
                    className="muted source-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    來源 ↗
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <CardModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            refresh()
            refreshTags()
          }}
          onDeleted={() => {
            setModal(null)
            refresh()
            refreshTags()
          }}
        />
      )}
    </div>
  )
}
