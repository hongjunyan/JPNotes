import { useState } from 'react'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
}

export default function TagInput({ value, onChange }: Props) {
  const [draft, setDraft] = useState('')

  function addTag() {
    const name = draft.trim()
    if (name && !value.includes(name)) {
      onChange([...value, name])
    }
    setDraft('')
  }

  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="chip chip-small">
          {t}
          <button className="chip-remove" onClick={() => onChange(value.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder="＋ 標籤（Enter 新增）"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            addTag()
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={addTag}
      />
    </div>
  )
}
