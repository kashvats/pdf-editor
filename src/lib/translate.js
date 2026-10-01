export const TRANSLATE_LANGUAGES = [
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'de', name: 'German (Deutsch)' },
  { code: 'fr', name: 'French (Français)' },
  { code: 'ru', name: 'Russian (Русский)' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'pt', name: 'Portuguese (Português)' },
  { code: 'zh', name: 'Chinese (简体中文)' },
  { code: 'ar', name: 'Arabic (العربية)' },
  { code: 'ja', name: 'Japanese (日本語)' },
  { code: 'it', name: 'Italian (Italiano)' }
]

export async function translateDocumentText(pagesText, targetLang, onProgress) {
  const translatedPages = []
  const total = pagesText.length

  for (let i = 0; i < total; i++) {
    const pageText = pagesText[i]
    const paragraphs = pageText.split('\n\n').filter(p => p.trim())
    const translatedParagraphs = []

    for (let j = 0; j < paragraphs.length; j++) {
      const p = paragraphs[j].trim()
      if (!p) continue

      let translated = p
      try {
        const cleanChunk = p.replace(/\s+/g, ' ').slice(0, 480)
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanChunk)}&langpair=autodetect|${targetLang}`
        )
        if (res.ok) {
          const json = await res.json()
          if (json?.responseData?.translatedText) {
            translated = json.responseData.translatedText
          }
        }
      } catch {
        // Keeps original if offline or rate-limited
        translated = p
      }

      translatedParagraphs.push(translated)
      onProgress?.(((i + (j + 1) / Math.max(1, paragraphs.length)) / total))
    }

    translatedPages.push(translatedParagraphs.join('\n\n'))
  }

  return translatedPages
}
