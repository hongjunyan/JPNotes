import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, api } from '../../api/client'
import { speakJa, ttsAvailable } from '../../lib/tts'
import KanjiPopover from '../../components/KanjiPopover'

const KANJI_RE = /[一-鿿]/

const RATINGS: { value: 1 | 2 | 3 | 4; label: string; hint: string; className: string }[] = [
  { value: 1, label: '忘記', hint: '重新開始', className: 'rate-again' },
  { value: 2, label: '困難', hint: '間隔縮短', className: 'rate-hard' },
  { value: 3, label: '記得', hint: '正常間隔', className: 'rate-good' },
  { value: 4, label: '簡單', hint: '間隔加長', className: 'rate-easy' },
]

export default function ReviewPage() {
  const [queue, setQueue] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [flipped, setFlipped] = useState(false)
  const [doneCount, setDoneCount] = useState(0)
  const [error, setError] = useState('')
  const [kanjiChar, setKanjiChar] = useState<string | null>(null)

  useEffect(() => {
    api
      .reviewQueue()
      .then((res) => setQueue(res.cards))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const current = queue[0] ?? null
  const remaining = queue.length
  const kanjiChars = useMemo(
    () => (current ? [...new Set([...current.word].filter((ch) => KANJI_RE.test(ch)))] : []),
    [current],
  )

  async function rate(rating: 1 | 2 | 3 | 4) {
    if (!current) return
    try {
      await api.rateCard(current.id, rating)
    } catch (e) {
      setError(String(e))
      return
    }
    setFlipped(false)
    setQueue((q) => {
      const rest = q.slice(1)
      // Again: the card is due again today, keep it at the end of this session
      return rating === 1 ? [...rest, q[0]] : rest
    })
    if (rating !== 1) setDoneCount((n) => n + 1)
  }

  // keyboard: space=flip, 1-4=rate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return
      if (e.code === 'Space') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        void rate(Number(e.key) as 1 | 2 | 3 | 4)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, flipped])

  if (loading) return <div className="page"><p className="muted">載入中…</p></div>
  if (error) return <div className="page"><p className="status-msg">{error}</p></div>

  if (!current) {
    return (
      <div className="page review-done">
        <h1>🎉 今日複習完成</h1>
        <p className="muted">
          {doneCount > 0 ? `完成了 ${doneCount} 張卡片。` : '目前沒有到期的卡片。'}
        </p>
        <p>
          <Link to="/cards" className="btn">
            瀏覽卡片
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="page review-page">
      <div className="review-progress muted">
        剩餘 {remaining} 張 ・ 已完成 {doneCount} 張
      </div>

      <div className={`review-card ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
        <div className="review-front">
          <span className={`type-badge type-badge-${current.type}`}>
            {current.type === 'vocab' ? '單字' : '文法'}
          </span>
          <div className="review-word">
            {current.word}
            {ttsAvailable() && (
              <button
                className="tts-btn"
                title="發音"
                onClick={(e) => {
                  e.stopPropagation()
                  speakJa(current.word)
                }}
              >
                🔊
              </button>
            )}
          </div>
          {!flipped && <div className="muted review-hint">點擊或按空白鍵翻面</div>}
        </div>

        {flipped && (
          <div className="review-back">
            {current.reading && <div className="review-reading">{current.reading}</div>}
            {current.meaning_zh && <div className="review-meaning">{current.meaning_zh}</div>}
            {current.meaning_en && <div className="review-meaning-en">{current.meaning_en}</div>}
            {current.pos && <div className="muted review-pos">{current.pos}</div>}
            {current.example && (
              <div className="review-example">
                {current.example}
                {ttsAvailable() && (
                  <button
                    className="tts-btn"
                    title="唸例句"
                    onClick={(e) => {
                      e.stopPropagation()
                      speakJa(current.example!)
                    }}
                  >
                    🔊
                  </button>
                )}
              </div>
            )}
            {kanjiChars.length > 0 && (
              <div className="kanji-chip-row">
                {kanjiChars.map((ch) => (
                  <button
                    key={ch}
                    className="chip chip-small kanji-chip"
                    title={`漢字資訊：${ch}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setKanjiChar(ch)
                    }}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
            {current.source_note_id && (
              <Link to={`/notes/${current.source_note_id}`} className="muted source-link">
                來源：{current.source_note_title ?? '筆記'} ↗
              </Link>
            )}
          </div>
        )}
      </div>

      {kanjiChar && <KanjiPopover char={kanjiChar} onClose={() => setKanjiChar(null)} />}

      {flipped ? (
        <div className="rate-row">
          {RATINGS.map((r) => (
            <button key={r.value} className={`rate-btn ${r.className}`} onClick={() => rate(r.value)}>
              <span className="rate-label">{r.label}</span>
              <span className="rate-hint">{r.hint}</span>
              <span className="rate-key">{r.value}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rate-row">
          <button className="btn btn-primary rate-flip" onClick={() => setFlipped(true)}>
            翻面（Space）
          </button>
        </div>
      )}
    </div>
  )
}
