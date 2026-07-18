import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, Note } from '../../api/client'
import { renderMarkdown } from '../../lib/markdown'
import { formatDateTime } from '../../lib/format'
import { selectionText, sentenceAround } from '../../lib/selection'
import CardModal, { CardModalInitial } from '../../components/CardModal'
import KanjiPopover from '../../components/KanjiPopover'

const SINGLE_KANJI_RE = /^[一-鿿]$/

interface FloatBtn {
  x: number
  y: number
  word: string
  sentence: string
}

export default function NoteViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [note, setNote] = useState<Note | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [float, setFloat] = useState<FloatBtn | null>(null)
  const [modal, setModal] = useState<CardModalInitial | null>(null)
  const [prefilling, setPrefilling] = useState(false)
  const [kanjiChar, setKanjiChar] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!id) return
    api
      .getNote(id)
      .then(setNote)
      .catch((e) => setError(String(e)))
  }, [id])

  const html = useMemo(() => (note ? renderMarkdown(note.content) : ''), [note])

  function handleMouseUp() {
    // wait for the selection to settle after mouseup
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setFloat(null)
        return
      }
      if (!articleRef.current?.contains(sel.anchorNode)) {
        setFloat(null)
        return
      }
      const word = selectionText(sel)
      if (!word || word.length > 30 || word.includes('\n')) {
        setFloat(null)
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      const wrap = wrapRef.current!.getBoundingClientRect()
      setFloat({
        x: rect.left + rect.width / 2 - wrap.left,
        y: rect.top - wrap.top,
        word,
        sentence: sentenceAround(sel, word),
      })
    }, 0)
  }

  async function addCard() {
    if (!float || !note) return
    setPrefilling(true)
    const { word, sentence } = float
    let reading: string | null = null
    let meaningEn: string | null = null
    let pos: string | null = null
    try {
      const [dict, furi] = await Promise.all([api.dictLookup(word), api.furigana(word)])
      const cand = dict.candidates.find((c) => c.word === word) ?? dict.candidates[0]
      if (cand) {
        reading = cand.reading
        meaningEn = cand.glosses.length ? cand.glosses.join(' / ') : null
        pos = cand.pos
      }
      if (!reading) {
        reading = furi.segments.map((s) => s.reading ?? s.surface).join('')
      }
    } catch {
      /* dictionary is best-effort; open the modal anyway */
    }
    setPrefilling(false)
    setFloat(null)
    setModal({
      type: 'vocab',
      word,
      reading,
      meaning_en: meaningEn,
      pos,
      example: sentence,
      source_note_id: note.id,
      source_note_title: note.title,
      tags: [],
    })
  }

  async function handleDelete() {
    if (!note) return
    if (!window.confirm(`確定要刪除「${note.title}」嗎？`)) return
    await api.deleteNote(note.id)
    navigate('/notes')
  }

  if (error) return <div className="page"><p className="muted">{error}</p></div>
  if (!note) return <div className="page"><p className="muted">載入中…</p></div>

  return (
    <div className="page" ref={wrapRef} style={{ position: 'relative' }}>
      <div className="page-head">
        <h1 className="note-title">{note.title}</h1>
        <div className="btn-group">
          <Link to={`/notes/${note.id}/edit`} className="btn">
            編輯
          </Link>
          <button className="btn btn-danger" onClick={handleDelete}>
            刪除
          </button>
        </div>
      </div>
      <div className="note-card-meta">
        {note.tags.map((t) => (
          <span key={t} className="chip chip-small">
            {t}
          </span>
        ))}
        <span className="muted">更新於 {formatDateTime(note.updated_at)}</span>
      </div>
      <article
        className="prose"
        ref={articleRef}
        onMouseUp={handleMouseUp}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {float && (
        <div className="float-btn-group" style={{ left: float.x, top: float.y }}>
          <button
            className="float-add-btn"
            onMouseDown={(e) => e.preventDefault() /* keep the selection */}
            onClick={addCard}
            disabled={prefilling}
          >
            {prefilling ? '查詢中…' : `＋ 加入卡片「${float.word.length > 8 ? float.word.slice(0, 8) + '…' : float.word}」`}
          </button>
          {SINGLE_KANJI_RE.test(float.word) && (
            <button
              className="float-add-btn float-kanji-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setKanjiChar(float.word)
                setFloat(null)
              }}
            >
              漢字資訊
            </button>
          )}
        </div>
      )}

      {kanjiChar && <KanjiPopover char={kanjiChar} onClose={() => setKanjiChar(null)} />}

      {modal && (
        <CardModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  )
}
