import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { api } from '../../api/client'
import { renderMarkdown } from '../../lib/markdown'
import TagInput from '../../components/TagInput'

export default function NoteEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const cmRef = useRef<ReactCodeMirrorRef>(null)

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
  const applyFurigana = useCallback(async (view: EditorView): Promise<boolean> => {
    const { from, to } = view.state.selection.main
    if (from === to) {
      setStatus('請先選取要注音的文字')
      return true
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
    return true
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

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        // 用 event.code 比對實體按鍵：中文/日文輸入法（IME）啟用時
        // event.key 會變成 'Process'，一般 keymap 綁 'Alt-r' 會失效。
        keydown(event, view) {
          if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyR') {
            event.preventDefault()
            void applyFurigana(view)
            return true
          }
          return false
        },
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
    [applyFurigana, uploadAndInsert],
  )

  async function handleSave() {
    setSaving(true)
    setStatus('')
    try {
      if (isNew) {
        const created = await api.createNote({ title: title || '無題', content, tags })
        navigate(`/notes/${created.id}`)
      } else {
        await api.updateNote(id!, { title, content, tags })
        navigate(`/notes/${id}`)
      }
    } catch (e) {
      setStatus(`儲存失敗：${e}`)
      setSaving(false)
    }
  }

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
          <button
            className="btn"
            title="選取文字後標注振り仮名（Alt+Shift+R）"
            onClick={() => {
              const view = cmRef.current?.view
              if (view) void applyFurigana(view)
            }}
          >
            ふりがな
          </button>
          <button className="btn" onClick={() => navigate(-1)}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>

      <TagInput value={tags} onChange={setTags} />
      {status && <p className="status-msg">{status}</p>}

      <div className="editor-panes">
        <div className="editor-pane">
          <CodeMirror
            ref={cmRef}
            value={content}
            height="100%"
            extensions={extensions}
            onChange={setContent}
            placeholder={'用 Markdown 書寫。選取漢字按 Alt+Shift+R 或「ふりがな」鈕自動注音；貼上/拖曳圖片即可插入。'}
          />
        </div>
        <div className="editor-pane preview-pane">
          <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  )
}
