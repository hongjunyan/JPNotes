import { useEffect, useState } from 'react'
import { KanjiInfo, api } from '../api/client'

interface Props {
  char: string
  onClose: () => void
}

const JLPT_LABEL: Record<number, string> = { 1: 'N1', 2: 'N2', 3: 'N3', 4: 'N4', 5: 'N5' }

export default function KanjiPopover({ char, onClose }: Props) {
  const [info, setInfo] = useState<KanjiInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setInfo(null)
    setError('')
    api
      .kanjiInfo(char)
      .then(setInfo)
      .catch(() => setError(`找不到「${char}」的漢字資料`))
  }, [char])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal kanji-modal">
        <div className="kanji-glyph">{char}</div>
        {error && <p className="muted">{error}</p>}
        {info && (
          <div className="kanji-info">
            <div className="kanji-badges">
              {info.stroke_count != null && <span className="chip chip-small">{info.stroke_count} 畫</span>}
              {info.jlpt != null && <span className="chip chip-small">JLPT {JLPT_LABEL[info.jlpt] ?? info.jlpt}</span>}
              {info.grade != null && <span className="chip chip-small">小{info.grade}</span>}
              {info.freq != null && <span className="chip chip-small">頻度 #{info.freq}</span>}
            </div>
            {info.on.length > 0 && (
              <div className="kanji-row">
                <span className="kanji-label">音読み</span>
                <span className="kanji-readings">{info.on.join('、')}</span>
              </div>
            )}
            {info.kun.length > 0 && (
              <div className="kanji-row">
                <span className="kanji-label">訓読み</span>
                <span className="kanji-readings">{info.kun.join('、')}</span>
              </div>
            )}
            {info.meanings.length > 0 && (
              <div className="kanji-row">
                <span className="kanji-label">意思</span>
                <span>{info.meanings.join('; ')}</span>
              </div>
            )}
          </div>
        )}
        {!info && !error && <p className="muted">載入中…</p>}
        <div className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="btn" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
