// Local Generative Intelligence Engine
// Operates on retrieved structured knowledge and relevant chunks.

export function generateQuizFromKnowledge(chunks, entities, count = 4) {
  const quiz = []
  if (!chunks.length) return []

  // Create questions based on key entities and concepts
  for (let i = 0; i < entities.length && quiz.length < count; i++) {
    const ent = entities[i]
    if (ent.type === 'Metric' || ent.type === 'Date' || ent.type === 'Technology' || ent.type === 'Company' || ent.type === 'Concept') {
      const relatedChunk = chunks.find(c => c.text.includes(ent.name))
      if (!relatedChunk) continue

      // Generate wrong distractors
      const otherEntities = entities.filter(e => e.type === ent.type && e.name !== ent.name).map(e => e.name)
      const distractors = otherEntities.slice(0, 3)
      while (distractors.length < 3) {
        distractors.push(`Alternative ${ent.type} Option ${distractors.length + 1}`)
      }

      const options = [ent.name, ...distractors].sort(() => Math.random() - 0.5)

      let questionText = ''
      if (ent.type === 'Metric') questionText = `According to the document, what metric was reported regarding: "${relatedChunk.text.slice(0, 80)}…"?`
      else if (ent.type === 'Date') questionText = `What is the significance of the date ${ent.name} in this document?`
      else questionText = `Which ${ent.type} is highlighted in the section: "${relatedChunk.text.slice(0, 90)}…"?`

      quiz.push({
        id: `q_${quiz.length + 1}`,
        question: questionText,
        options,
        answer: ent.name,
        sourcePage: relatedChunk.page,
        evidence: relatedChunk.text
      })
    }
  }

  // Fallback chunk questions if entities are few
  if (quiz.length < count && chunks.length > 2) {
    const meaningful = chunks.filter(c => c.text.length > 50 && !c.isHeading)
    for (let i = 0; i < meaningful.length && quiz.length < count; i++) {
      const c = meaningful[i]
      const words = c.text.split(/\s+/).filter(w => w.length > 5)
      if (words.length > 3) {
        const keyWord = words[0].replace(/[.,;:()]/g, '')
        quiz.push({
          id: `q_${quiz.length + 1}`,
          question: `What primary subject is described in: "${c.text.slice(0, 100)}…"?`,
          options: [keyWord, 'General Overview', 'Historical Context', 'Future Outlook'].sort(() => Math.random() - 0.5),
          answer: keyWord,
          sourcePage: c.page,
          evidence: c.text
        })
      }
    }
  }

  return quiz
}

export function generateFlashcards(entities, chunks) {
  const flashcards = []

  entities.forEach(ent => {
    const chunk = chunks.find(c => c.text.includes(ent.name))
    if (chunk) {
      flashcards.push({
        id: `fc_${ent.id}`,
        front: ent.name,
        type: ent.type,
        back: chunk.text,
        page: chunk.page
      })
    }
  })

  return flashcards.slice(0, 12)
}

export function explainConceptSimply(conceptName, relatedChunks) {
  const context = relatedChunks.map(c => c.text).join(' ')
  return `### Simplified Explanation of ${conceptName}\n\nIn simple terms, **${conceptName}** is a key part of this document. It is described as:\n\n> "${relatedChunks[0]?.text || 'Relevant concept'}"\n\n**Why it matters:** It connects directly to the document's objectives without requiring deep technical knowledge. *(Source: Page ${relatedChunks[0]?.page || 1})*`
}
