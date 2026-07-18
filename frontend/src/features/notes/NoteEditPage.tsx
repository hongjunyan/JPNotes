import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { redo } from '@codemirror/commands'
import { EditorView, keymap } from '@codemirror/view'
import { api } from '../../api/client'
import { renderMarkdown, HIGHLIGHT_COLORS, HighlightColor } from '../../lib/markdown'
import TagInput from '../../components/TagInput'

const HL_LABELS: Record<HighlightColor, string> = {
  yellow: '黃色重點（Ctrl+Shift+H）',
  green: '綠色重點',
  blue: '藍色重點',
  pink: '粉色重點',
}

const HL_MARK_RE = /^==(?:\{([a-z]+)\})?([\s\S]+?)==$/

function wrapHighlight(text: string, color: HighlightColor): string {
  return color === 'yellow' ? `==${text}==` : `=={${color}}${text}==`
}

/** Track the app theme (data-theme on <html>) so CodeMirror follows dark mode. */
function useAppTheme(): 'light' | 'dark' {
  const read = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const [theme, setTheme] = useState<'light' | 'dark'>(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return theme
}

export default function NoteEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id
  const theme = useAppTheme()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    api.getNote(id).then((n) => {
      setTitle(n.title)
      setContent(n.content)
      setTags(n.tags)
    })
  }, [id])

  const html = useMemo(() => renderMarkdown(content), [content])

  /** Replace current selection with furigana-marked text from the backend. */
  const applyFurigana = useCallback(async (view: EditorView) => {
    const { from, to } = view.state.selection.main
    if (from === to) {
      setStatus('請先選取要注音的文字')
      return
    }
    const selected = view.state.sliceDoc(from, to)
    try {
      const res = await api.furigana(selected)
      view.dispatch({
        changes: { from, to, insert: res.marked },
        selection: { anchor: from + res.marked.length },
      })
      view.focus()
      setStatus('')
    } catch (e) {
      setStatus(`注音失敗：${e}`)
    }
  }, [])

  /** Wrap selection in ==highlight== markers; same color again removes, new color swaps. */
  const applyHighlight = useCallback((view: EditorView, color: HighlightColor) => {
    const { from, to } = view.state.selection.main
    if (from === to) {
      setStatus('請先選取要畫重點的文字')
      return
    }
    const selected = view.state.sliceDoc(from, to)
    const m = selected.match(HL_MARK_RE)
    let insert: string
    if (m) {
      const current = (m[1] ?? 'yellow') as HighlightColor
      insert = current === color ? m[2] : wrapHighlight(m[2], color)
    } else {
      insert = wrapHighlight(selected, color)
    }
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from, head: from + insert.length },
    })
    view.focus()
    setStatus('')
  }, [])

  const uploadAndInsert = useCallback(async (view: EditorView, files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    for (const file of images) {
      try {
        const img = await api.uploadImage(file)
        const pos = view.state.selection.main.head
        const snippet = `![${img.filename}](${img.url})\n`
        view.dispatch({ changes: { from: pos, insert: snippet } })
      } catch (e) {
        setStatus(`圖片上傳失敗：${e}`)
      }
    }
  }, [])

  const handleSave = useCallback(
    async (exit = true) => {
      if (saving) return
      setSaving(true)
      setStatus('')
      try {
        if (isNew) {
          const created = await api.createNote({ title: title || '無題', content, tags })
          if (exit) {
            navigate(`/notes/${created.id}`)
          } else {
            navigate(`/notes/${created.id}/edit`, { replace: true })
            setStatus('已儲存 ✓')
          }
        } else {
          await api.updateNote(id!, { title, content, tags })
          if (exit) {
            navigate(`/notes/${id}`)
          } else {
            setStatus('已儲存 ✓')
          }
        }
      } catch (e) {
        setStatus(`儲存失敗：${e}`)
      } finally {
        setSaving(false)
      }
    },
    [saving, isNew, title, content, tags, id, navigate],
  )
  const saveRef = useRef(handleSave)
  saveRef.current = handleSave

  // Shortcuts on window with capture:
  // - matched by event.code so they work while a Chinese/Japanese IME is composing
  //   (event.key becomes 'Process' then)
  // - Ctrl+Shift+F / Alt+R for furigana instead of Alt+Shift+R, because Alt+Shift is
  //   the Windows keyboard-layout switcher and swallows the combo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyS') {
        e.preventDefault()
        e.stopPropagation()
        void saveRef.current(false)
        return
      }
      const view = cmRef.current?.view
      if (!view || !view.hasFocus) return
      const furiganaCombo =
        (mod && e.shiftKey && !e.altKey && e.code === 'KeyF') ||
        (e.altKey && !mod && !e.shiftKey && e.code === 'KeyR')
      if (furiganaCombo) {
        e.preventDefault()
        e.stopPropagation()
        void applyFurigana(view)
        return
      }
      if (mod && e.shiftKey && !e.altKey && e.code === 'KeyH') {
        e.preventDefault()
        e.stopPropagation()
        applyHighlight(view, 'yellow')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [applyFurigana, applyHighlight])

  // One-way scroll sync: editor -> preview, by scroll ratio.
  const handleCreateEditor = useCallback((view: EditorView) => {
    const scroller = view.scrollDOM
    scroller.addEventListener(
      'scroll',
      () => {
        const preview = previewRef.current
        if (!preview) return
        const max = scroller.scrollHeight - scroller.clientHeight
        if (max <= 0) return
        const ratio = scroller.scrollTop / max
        preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight)
      },
      { passive: true },
    )
  }, [])

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      // CodeMirror 的 historyKeymap 只在 macOS 綁 Mod-Shift-z，Windows 上要自己補
      keymap.of([{ key: 'Mod-Shift-z', run: redo, preventDefault: true }]),
      EditorView.domEventHandlers({
        paste(event, view) {
          const files = Array.from(event.clipboardData?.files ?? [])
          if (files.some((f) => f.type.startsWith('image/'))) {
            event.preventDefault()
            void uploadAndInsert(view, files)
            return true
          }
          return false
        },
        drop(event, view) {
          const files = Array.from(event.dataTransfer?.files ?? [])
          if (files.some((f) => f.type.startsWith('image/'))) {
            event.preventDefault()
            void uploadAndInsert(view, files)
            return true
          }
          return false
        },
      }),
    ],
    [uploadAndInsert],
  )

  return (
    <div className="page page-wide">
      <div className="editor-head">
        <input
          className="title-input"
          placeholder="筆記標題"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="btn-group">
          <button className="btn" onClick={() => navigate(-1)}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>

      <TagInput value={tags} onChange={setTags} />

      <div className="editor-toolbar">
        <button
          className="tool-btn"
          title="選取文字後標注振り仮名(Ctrl+Shift+F)"
          onClick={() => {
            const view = cmRef.current?.view
            if (view) void applyFurigana(view)
          }}
        >
          <ruby>
            振<rt>ふ</rt>
          </ruby>
          り仮名
        </button>
        <span className="toolbar-divider" />
        <span className="toolbar-label">畫重點</span>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            className={`hl-swatch hl-swatch-${c}`}
            title={HL_LABELS[c]}
            onClick={() => {
              const view = cmRef.current?.view
              if (view) applyHighlight(view, c)
            }}
          />
        ))}
        {status ? (
          <span className="toolbar-status">{status}</span>
        ) : (
          <span className="toolbar-hint">選取文字後按工具鈕．Ctrl+S 儲存</span>
        )}
      </div>

      <div className="editor-panes">
        <div className="editor-pane">
          <CodeMirror
            ref={cmRef}
            value={content}
            height="100%"
            theme={theme}
            extensions={extensions}
            onChange={setContent}
            onCreateEditor={handleCreateEditor}
            basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: true }}
            placeholder={'用 Markdown 書寫。選取漢字按 Ctrl+Shift+F 自動注音；選取文字按上方色點畫重點；貼上/拖曳圖片即可插入。'}
          />
        </div>
        <div className="editor-pane preview-pane" ref={previewRef}>
          <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  )
}
