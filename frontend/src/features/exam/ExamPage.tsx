import { useEffect, useState } from 'react'
import { CardType, ExamQuestion, TagOut, api } from '../../api/client'

type Stage = 'setup' | 'quiz' | 'result'

interface Answer {
  selected: number
}

const COUNTS = [5, 10, 20]

export default function ExamPage() {
  const [stage, setStage] = useState<Stage>('setup')
  const [typeFilter, setTypeFilter] = useState<CardType | 'all'>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [count, setCount] = useState(10)
  const [tags, setTags] = useState<TagOut[]>([])
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [qIndex, setQIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    api.listTags().then((all) => setTags(all.filter((t) => t.card_count > 0))).catch(() => setTags([]))
  }, [])

  async function start() {
    setStarting(true)
    setError('')
    try {
      const res = await api.examGenerate({
        type: typeFilter === 'all' ? undefined : typeFilter,
        tag: tag ?? undefined,
        count,
      })
      setQuestions(res.questions)
      setAnswers([])
      setQIndex(0)
      setSelected(null)
      setStage('quiz')
    } catch (e) {
      setError(String(e).replace(/^Error: API \d+:\s*/, ''))
    } finally {
      setStarting(false)
    }
  }

  function choose(idx: number) {
    if (selected !== null) return
    setSelected(idx)
    setAnswers((a) => [...a, { selected: idx }])
  }

  function next() {
    if (qIndex + 1 >= questions.length) {
      setStage('result')
    } else {
      setQIndex((i) => i + 1)
      setSelected(null)
    }
  }

  // keyboard: 1-4 choose, Enter/Space next
  useEffect(() => {
    if (stage !== 'quiz') return
    const onKey = (e: KeyboardEvent) => {
      if (selected === null && ['1', '2', '3', '4'].includes(e.key)) {
        choose(Number(e.key) - 1)
      } else if (selected !== null && (e.key === 'Enter' || e.code === 'Space')) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, selected, qIndex, questions.length])

  if (stage === 'setup') {
    return (
      <div className="page exam-page">
        <h1>考試</h1>
        <p className="muted">從卡片庫自選範圍出選擇題，成績不影響複習排程。</p>

        <div className="exam-field">
          <span className="exam-label">範圍</span>
          <div className="tag-row">
            {(
              [
                ['all', '全部'],
                ['vocab', '單字'],
                ['grammar', '文法'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={`chip ${typeFilter === key ? 'chip-active' : ''}`}
                onClick={() => setTypeFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="exam-field">
            <span className="exam-label">標籤（可不選）</span>
            <div className="tag-row">
              {tags.map((t) => (
                <button
                  key={t.id}
                  className={`chip ${tag === t.name ? 'chip-active' : ''}`}
                  onClick={() => setTag(tag === t.name ? null : t.name)}
                >
                  {t.name}
                  <span className="chip-count">{t.card_count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="exam-field">
          <span className="exam-label">題數</span>
          <div className="tag-row">
            {COUNTS.map((n) => (
              <button key={n} className={`chip ${count === n ? 'chip-active' : ''}`} onClick={() => setCount(n)}>
                {n} 題
              </button>
            ))}
          </div>
        </div>

        {error && <p className="status-msg">{error}</p>}
        <button className="btn btn-primary exam-start" onClick={start} disabled={starting}>
          {starting ? '出題中…' : '開始測驗'}
        </button>
      </div>
    )
  }

  if (stage === 'quiz') {
    const q = questions[qIndex]
    return (
      <div className="page exam-page">
        <div className="review-progress muted">
          第 {qIndex + 1} / {questions.length} 題
        </div>
        <div className="exam-card">
          <div className="muted exam-direction">
            {q.direction === 'word2meaning' ? '這個詞是什麼意思？' : '哪個詞是這個意思？'}
          </div>
          <div className={`exam-prompt ${q.direction === 'meaning2word' ? 'exam-prompt-meaning' : ''}`}>
            {q.prompt}
            {selected !== null && q.direction === 'word2meaning' && q.reading && (
              <span className="exam-reading">（{q.reading}）</span>
            )}
          </div>
          <div className="exam-choices">
            {q.choices.map((choice, i) => {
              let cls = 'exam-choice'
              if (selected !== null) {
                if (i === q.answer) cls += ' choice-correct'
                else if (i === selected) cls += ' choice-wrong'
                else cls += ' choice-dim'
              }
              return (
                <button key={i} className={cls} onClick={() => choose(i)}>
                  <span className="rate-key">{i + 1}</span>
                  {choice}
                </button>
              )
            })}
          </div>
          {selected !== null && (
            <div className="exam-next-row">
              <span className={selected === q.answer ? 'exam-ok' : 'exam-ng'}>
                {selected === q.answer ? '✓ 答對了' : '✗ 答錯了'}
              </span>
              <button className="btn btn-primary" onClick={next}>
                {qIndex + 1 >= questions.length ? '看成績' : '下一題（Enter）'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // result
  const correct = answers.filter((a, i) => a.selected === questions[i].answer).length
  const pct = Math.round((correct / questions.length) * 100)
  const wrong = questions
    .map((q, i) => ({ q, a: answers[i] }))
    .filter(({ q, a }) => a.selected !== q.answer)

  return (
    <div className="page exam-page">
      <div className="exam-result-head">
        <h1>
          {correct} / {questions.length}
        </h1>
        <div className={`exam-score ${pct >= 80 ? 'exam-ok' : pct >= 60 ? '' : 'exam-ng'}`}>{pct} 分</div>
      </div>

      {wrong.length > 0 && (
        <>
          <h2 className="exam-review-title">答錯檢討</h2>
          <ul className="exam-wrong-list">
            {wrong.map(({ q, a }, i) => (
              <li key={i} className="exam-wrong-item">
                <div className="exam-wrong-prompt">
                  {q.prompt}
                  {q.reading && q.direction === 'word2meaning' && <span className="muted">（{q.reading}）</span>}
                </div>
                <div className="exam-ng">你的答案：{q.choices[a.selected]}</div>
                <div className="exam-ok">正確答案：{q.choices[q.answer]}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="btn-group exam-result-actions">
        <button className="btn btn-primary" onClick={start}>
          再考一次
        </button>
        <button className="btn" onClick={() => setStage('setup')}>
          重新設定
        </button>
      </div>
    </div>
  )
}
