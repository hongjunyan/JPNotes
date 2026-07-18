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
}).use(rubyPlugin)

export function renderMarkdown(source: string): string {
  return md.render(source)
}

/** Strip {漢字|かんじ} markers, keeping only the base text. */
export function stripRuby(source: string): string {
  return source.replace(/\{([^{}|]+)\|[^{}|]+\}/g, '$1')
}
