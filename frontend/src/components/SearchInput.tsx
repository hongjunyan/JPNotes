import { useRef } from 'react'

interface Props {
  placeholder?: string
  onSearch: (value: string) => void
}

/**
 * IME-safe search box.
 *
 * Kept uncontrolled so React never rewrites the input's value mid-composition —
 * a controlled rewrite while a Japanese/Chinese IME is composing closes the
 * candidate menu. The query callback is also held back until composition ends,
 * so no re-render storm happens while converting.
 */
export default function SearchInput({ placeholder, onSearch }: Props) {
  const composing = useRef(false)
  return (
    <input
      className="search-input"
      type="search"
      placeholder={placeholder}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(e) => {
        composing.current = false
        onSearch(e.currentTarget.value)
      }}
      onChange={(e) => {
        if (!composing.current) onSearch(e.target.value)
      }}
    />
  )
}
