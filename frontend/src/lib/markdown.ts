import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'

/** Inline rule: {漢字|かんじ} -> <ruby>漢字<rt>かんじ</rt></ruby> */
function rubyPlugin(md: MarkdownIt) {
  md.inline.ruler.before('emphasis', 'ruby', (state, silent) => {
    const src = state.src
    const start = state.pos
    if (src.charCodeAt(start) !== 0x7b /* { */) return false
    const close = src.indexOf('}', start + 1)
    if (close < 0) return false
    const body = src.slice(start + 1, close)
    const pipe = body.indexOf('|')
    if (pipe <= 0 || pipe >= body.length - 1) return false
    if (body.includes('{') || body.includes('\n')) return false
    if (!silent) {
      const token = state.push('ruby', 'ruby', 0)
      token.meta = { base: body.slice(0, pipe), rt: body.slice(pipe + 1) }
    }
    state.pos = close + 1
    return true
  })

  md.renderer.rules.ruby = (tokens, idx) => {
    const { base, rt } = tokens[idx].meta as { base: string; rt: string }
    const esc = md.utils.escapeHtml
    return `<ruby>${esc(base)}<rt>${esc(rt)}</rt></ruby>`
  }
}

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]

/**
 * Inline rule: ==text== -> <mark class="hl hl-yellow">text</mark>
 * Optional color: =={green}text== / =={blue}text== / =={pink}text==
 * Inner content is parsed as inline markdown, so ruby works inside a mark.
 */
function highlightPlugin(md: MarkdownIt) {
  md.inline.ruler.before('emphasis', 'highlight', (state, silent) => {
    const src = state.src
    const start = state.pos
    if (src.charCodeAt(start) !== 0x3d /* = */ || src.charCodeAt(start + 1) !== 0x3d) return false
    let pos = start + 2
    let color: HighlightColor = 'yellow'
    if (src.charCodeAt(pos) === 0x7b /* { */) {
      const close = src.indexOf('}', pos + 1)
      if (close < 0) return false
      const name = src.slice(pos + 1, close)
      if (!(HIGHLIGHT_COLORS as readonly string[]).includes(name)) return false
      color = name as HighlightColor
      pos = close + 1
    }
    const end = src.indexOf('==', pos)
    if (end < 0 || end === pos) return false
    const body = src.slice(pos, end)
    if (body.includes('\n')) return false
    if (!silent) {
      const open = state.push('mark_open', 'mark', 1)
      open.attrSet('class', `hl hl-${color}`)
      state.md.inline.parse(body, state.md, state.env, state.tokens)
      state.push('mark_close', 'mark', -1)
    }
    state.pos = end + 2
    return true
  })
}

export const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value
      } catch {
        /* fall through */
      }
    }
    return ''
  },
})
  .use(rubyPlugin)
  .use(highlightPlugin)

export function renderMarkdown(source: string): string {
  return md.render(source)
}

/** Strip {漢字|かんじ} markers, keeping only the base text. */
export function stripRuby(source: string): string {
  return source.replace(/\{([^{}|]+)\|[^{}|]+\}/g, '$1')
}

/** Strip ==highlight== markers (optionally with a {color} prefix), keeping the inner text. */
export function stripHighlight(source: string): string {
  return source.replace(/==(?:\{[a-z]+\})?(.+?)==/g, '$1')
}
