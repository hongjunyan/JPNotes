/** Speak Japanese text with the browser's Web Speech API. */

let cachedVoice: SpeechSynthesisVoice | null = null

function pickJaVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  const voices = window.speechSynthesis?.getVoices() ?? []
  cachedVoice =
    voices.find((v) => v.lang === 'ja-JP') ?? voices.find((v) => v.lang.startsWith('ja')) ?? null
  return cachedVoice
}

// voice list often loads asynchronously
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    cachedVoice = null
  })
}

export function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speakJa(text: string): void {
  if (!ttsAvailable() || !text.trim()) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'ja-JP'
  const voice = pickJaVoice()
  if (voice) utter.voice = voice
  utter.rate = 0.9
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
}
