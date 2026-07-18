import { useEffect, useState } from 'react'
import { Card, CardPayload, CardType, api } from '../api/client'
import TagInput from './TagInput'

export interface CardModalInitial extends Partial<CardPayload> {
  id?: number
  source_note_title?: string | null
}

interface Props {
  initial: CardModalInitial
  onClose: () => void
  onSaved: (card: Card) => void
  onDeleted?: (id: number) => void
}

export default function CardModal({ initial, onClose, onSaved, onDeleted }: Props) {
  const isEdit = initial.id != null
  const [type, setType] = useState<CardType>(initial.type ?? 'vocab')
  const [word, setWord] = useState(initial.word ?? '')
  const [reading, setReading] = useState(initial.reading ?? '')
  const [meaningZh, setMeaningZh] = useState(initial.meaning_zh ?? '')
  const [meaningEn, setMeaningEn] = useState(initial.meaning_en ?? '')
  const [pos, setPos] = useState(initial.pos ?? '')
  const [example, setExample] = useState(initial.example ?? '')
  const [tags, setTags] = useState<string[]>(initial.tags ?? [])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function lookupDict() {
    if (!word.trim()) return
    setBusy(true)
    try {
      const res = await api.dictLookup(word.trim())
      const cand = res.candidates[0]
      if (!cand) {
        setStatus('字典查無此字')
      } else {
        if (!reading && cand.reading) setReading(cand.reading)
        if (!meaningEn && cand.glosses.length) setMeaningEn(cand.glosses.join(' / '))
        if (!pos && cand.pos) setPos(cand.pos)
        setStatus('')
      }
    } catch (e) {
      setStatus(`字典查詢失敗：${e}`)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!word.trim()) {
      setStatus('請輸入單字/文型')
      return
    }
    setBusy(true)
    setStatus('')
    const payload: CardPayload = {
      type,
      word: word.trim(),
      reading: reading.trim() || null,
      meaning_zh: meaningZh.trim() || null,
      meaning_en: meaningEn.trim() || null,
      pos: pos.trim() || null,
      example: example.trim() || null,
      source_note_id: initial.source_note_id ?? null,
      tags,
    }
    try {
      const card = isEdit ? await api.updateCard(initial.id!, payload) : await api.createCard(payload)
      onSaved(card)
    } catch (e) {
      setStatus(`儲存失敗：${e}`)
      setBusy(false)
    }
  }

  async function remove() {
    if (initial.id == null) return
    if (!window.confirm(`確定要刪除卡片「${word}」嗎？`)) return
    setBusy(true)
    try {
      await api.deleteCard(initial.id)
      onDeleted?.(initial.id)
    } catch (e) {
      setStatus(`刪除失敗：${e}`)
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{isEdit ? '編輯卡片' : '加入卡片'}</h2>

        <div className="field-row">
          <label className={`type-option ${type === 'vocab' ? 'type-active' : ''}`}>
            <input type="radio" checked={type === 'vocab'} onChange={() => setType('vocab')} />
            單字
          </label>
          <label className={`type-option ${type === 'grammar' ? 'type-active' : ''}`}>
            <input type="radio" checked={type === 'grammar'} onChange={() => setType('grammar')} />
            文法
          </label>
        </div>

        <div className="field">
          <label>{type === 'vocab' ? '單字' : '文型'}</label>
          <div className="field-inline">
            <input value={word} onChange={(e) => setWord(e.target.value)} placeholder={type === 'vocab' ? '食べる' : '〜ばするほど'} />
            <button className="btn" onClick={lookupDict} disabled={busy || !word.trim()} title="用字典自動帶入讀音與英文釋義">
              字典
            </button>
          </div>
        </div>

        <div className="field">
          <label>讀音（假名）</label>
          <input value={reading} onChange={(e) => setReading(e.target.value)} placeholder="たべる" />
        </div>

        <div className="field">
          <label>中文意思</label>
          <input value={meaningZh} onChange={(e) => setMeaningZh(e.target.value)} placeholder="吃" />
        </div>

        <div className="field">
          <label>英文釋義</label>
          <input value={meaningEn} onChange={(e) => setMeaningEn(e.target.value)} placeholder="to eat" />
        </div>

        <div className="field">
          <label>詞性</label>
          <input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="Ichidan verb" />
        </div>

        <div className="field">
          <label>例句</label>
          <textarea value={example} onChange={(e) => setExample(e.target.value)} rows={2} />
        </div>

        <div className="field">
          <label>標籤</label>
          <TagInput value={tags} onChange={setTags} />
        </div>

        {initial.source_note_title && (
          <p className="muted modal-source">來源筆記：{initial.source_note_title}</p>
        )}
        {status && <p className="status-msg">{status}</p>}

        <div className="modal-actions">
          {isEdit && (
            <button className="btn btn-danger" onClick={remove} disabled={busy}>
              刪除
            </button>
          )}
          <span className="modal-actions-spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? '處理中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}
