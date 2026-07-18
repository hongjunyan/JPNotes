import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, NoteListItem, TagOut } from '../../api/client'
import { formatDateTime } from '../../lib/format'
import SearchInput from '../../components/SearchInput'

export default function NotesListPage() {
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [items, setItems] = useState<NoteListItem[]>([])
  const [tags, setTags] = useState<TagOut[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listTags().then(setTags).catch(() => setTags([]))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true)
      api
        .listNotes({ q: query || undefined, tag: activeTag || undefined })
        .then((res) => setItems(res.items))
        .catch(() => setItems([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query, activeTag])

  return (
    <div className="page">
      <div className="page-head">
        <h1>筆記</h1>
        <Link to="/notes/new" className="btn btn-primary">
          ＋ 新筆記
        </Link>
      </div>

      <SearchInput placeholder="搜尋筆記（標題、內文、假名）…" onSearch={setQuery} />

      {tags.length > 0 && (
        <div className="tag-row">
          {tags.map((t) => (
            <button
              key={t.id}
              className={`chip ${activeTag === t.name ? 'chip-active' : ''}`}
              onClick={() => setActiveTag(activeTag === t.name ? null : t.name)}
            >
              {t.name}
              <span className="chip-count">{t.note_count}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="muted">載入中…</p>
      ) : items.length === 0 ? (
        <p className="muted">{query || activeTag ? '沒有符合的筆記。' : '還沒有筆記，點「新筆記」開始吧。'}</p>
      ) : (
        <ul className="note-list">
          {items.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className="note-card">
                <div className="note-card-title">{n.title}</div>
                {n.excerpt && <div className="note-card-excerpt">{n.excerpt}</div>}
                <div className="note-card-meta">
                  {n.tags.map((t) => (
                    <span key={t} className="chip chip-small">
                      {t}
                    </span>
                  ))}
                  <span className="muted">{formatDateTime(n.updated_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
