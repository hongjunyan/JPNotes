/** Text of the current selection with ruby readings (<rt>) stripped,
 * so selecting 東京 in rendered ruby doesn't yield "東京とうきょう". */
export function selectionText(sel: Selection): string {
  if (sel.rangeCount === 0) return ''
  const frag = sel.getRangeAt(0).cloneContents()
  const div = document.createElement('div')
  div.appendChild(frag)
  div.querySelectorAll('rt').forEach((rt) => rt.remove())
  return div.textContent?.trim() ?? ''
}

const DELIMS = /[。．.!?！？\n]/

/** The sentence containing the selection, from the nearest block element. */
export function sentenceAround(sel: Selection, word: string): string {
  const node = sel.anchorNode
  if (!node) return ''
  const el = node instanceof Element ? node : node.parentElement
  const block = el?.closest('p, li, h1, h2, h3, blockquote, td') ?? el
  if (!block) return ''
  const clone = block.cloneNode(true) as Element
  clone.querySelectorAll('rt').forEach((rt) => rt.remove())
  const text = (clone.textContent ?? '').trim()
  const idx = text.indexOf(word)
  if (idx < 0) return text.slice(0, 120)
  let start = idx
  while (start > 0 && !DELIMS.test(text[start - 1])) start--
  let end = idx + word.length
  while (end < text.length && !DELIMS.test(text[end])) end++
  if (end < text.length) end++ // keep the sentence-ending punctuation
  return text.slice(start, end).trim()
}
