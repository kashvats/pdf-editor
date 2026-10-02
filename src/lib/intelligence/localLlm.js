// Local Generative Intelligence Engine
// Operates on retrieved structured knowledge and relevant chunks.
// Never emits placeholder distractors or unverified questions.

export function generateQuizFromKnowledge(chunks, entities, count = 5) {
  const quiz = []
  if (!chunks.length || entities.length < 4) return []

  // Candidates: distinct entities that appear in informative chunks
  for (let i = 0; i < entities.length && quiz.length < count; i++) {
    const ent = entities[i]
    if (!ent.name || ent.name.length < 3) continue

    const relatedChunk = chunks.find(c => c.text && c.text.includes(ent.name) && c.text.length > 40 && !c.isHeading)
    if (!relatedChunk) continue

    // Find other genuine entities from the document to act as plausible distractors
    const candidateDistractors = entities
      .filter(e => e.id !== ent.id && e.name.toLowerCase() !== ent.name.toLowerCase() && e.name.length > 2)
      .map(e => e.name)

    // Ensure we have at least 3 genuine distractors from the document text
    if (candidateDistractors.length < 3) {
      continue // Skip question if we cannot form real plausible options
    }

    const uniqueDistractors = Array.from(new Set(candidateDistractors)).slice(0, 3)
    if (uniqueDistractors.length < 3) continue

    const options = [ent.name, ...uniqueDistractors].sort(() => Math.random() - 0.5)

    let questionText = ''
    if (ent.type === 'Metric') {
      questionText = `In the section regarding "${relatedChunk.text.slice(0, 90).replace(/[.,;:()]/g, '')}…", what specific metric or figure is reported?`
    } else if (ent.type === 'Company' || ent.type === 'Organization') {
      questionText = `Which organization or entity is referenced in the context of: "${relatedChunk.text.slice(0, 85)}…"?`
    } else if (ent.type === 'Technology') {
      questionText = `Which technology or framework is specified on Page ${relatedChunk.page} for this workflow?`
    } else if (ent.type === 'Regulation') {
      questionText = `Which regulatory or compliance standard is cited in the document?`
    } else {
      questionText = `According to Page ${relatedChunk.page}, which concept is described as: "${relatedChunk.text.slice(0, 90)}…"?`
    }

    quiz.push({
      id: `q_${quiz.length + 1}`,
      question: questionText,
      options,
      answer: ent.name,
      sourcePage: relatedChunk.page,
      sourcePages: [relatedChunk.page],
      explanation: `According to Page ${relatedChunk.page}: "${relatedChunk.text.length > 160 ? relatedChunk.text.slice(0, 160) + '…' : relatedChunk.text}"`,
      evidence: relatedChunk.text
    })
  }

  return quiz
}

export function generateFlashcards(entities, chunks) {
  const flashcards = []
  if (!entities.length || !chunks.length) return []

  const priorityEntities = entities.filter(e => ['Concept', 'Technology', 'Regulation', 'Company', 'Metric'].includes(e.type))
  const targetList = priorityEntities.length >= 3 ? priorityEntities : entities

  targetList.forEach(ent => {
    // Find the most informative chunk that defines or discusses this entity
    const chunk = chunks.find(c => c.text && c.text.includes(ent.name) && c.text.length > 30 && !c.isHeading)
    if (chunk) {
      // Extract the specific sentence mentioning the entity
      const sentences = chunk.text.split(/(?<=[.?!])\s+/).filter(s => s.includes(ent.name))
      const definition = sentences[0] || chunk.text
      const pages = (ent.sourcePages && ent.sourcePages.length)
        ? ent.sourcePages
        : (ent.pages && ent.pages.length)
          ? ent.pages
          : [chunk.page]

      flashcards.push({
        id: `fc_${ent.id}`,
        front: ent.name,
        type: ent.type,
        back: definition.trim(),
        page: pages[0],
        sourcePages: pages
      })
    }
  })

  return flashcards.slice(0, 12)
}

export function generateTopicFlashcards(topicEntity, chunks = [], relationships = []) {
  if (!topicEntity) return []
  const name = topicEntity.name || topicEntity.title || 'Topic'
  const summary = topicEntity.summary || ''
  const page = topicEntity.pdfPageNumber || topicEntity.sourcePages?.[0] || 1
  const displayLabel = topicEntity.displayPageLabel || String(page)

  const cards = []

  // Card 1: Core Definition / Overview
  if (summary && summary.length >= 20 && !/Summary unavailable/i.test(summary)) {
    cards.push({
      id: `fc_${topicEntity.id || name}_def`,
      front: `What is ${name}?`,
      back: summary,
      type: 'Definition',
      page,
      displayPageLabel: displayLabel
    })
  }

  // Card 2+: Key Points
  const keyPoints = topicEntity.keyPoints || []
  keyPoints.slice(0, 3).forEach((kp, idx) => {
    cards.push({
      id: `fc_${topicEntity.id || name}_kp_${idx}`,
      front: `Key point regarding ${name} (#${idx + 1}):`,
      back: kp,
      type: 'Key Concept',
      page,
      displayPageLabel: displayLabel
    })
  })

  // Card 3+: Semantic relationships
  const rels = (relationships || []).filter(r => (r.sourceId === topicEntity.id || r.targetId === topicEntity.id) && r.evidence)
  rels.slice(0, 2).forEach((r, idx) => {
    const isSource = r.sourceId === topicEntity.id
    const otherName = isSource ? r.targetName : r.sourceName
    const pred = r.predicate.replace(/_/g, ' ')
    cards.push({
      id: `fc_${topicEntity.id || name}_rel_${idx}`,
      front: `How does ${name} relate to ${otherName}?`,
      back: `${name} ${pred} ${otherName}.\nEvidence: "${r.evidence}"`,
      type: 'Relationship',
      page: r.pages?.[0] || page,
      displayPageLabel: displayLabel
    })
  })

  // Fallback: If still under 2 cards, use grounded chunks
  if (cards.length < 2) {
    const chunkById = new Map((chunks || []).map(c => [c.id, c]))
    const sourceIds = Array.from(new Set([...(topicEntity.sourceChunkIds || []), ...(topicEntity.evidenceChunkIds || [])]))
    const gChunks = sourceIds.map(id => chunkById.get(id)).filter(c => c && c.text && !c.isHeading)
    for (let i = 0; i < gChunks.length && cards.length < 3; i++) {
      const c = gChunks[i]
      const sents = (c.text || '').split(/(?<=[.?!])\s+/).filter(s => s.trim().length >= 30)
      if (sents[0] && !cards.some(card => card.back === sents[0].trim())) {
        cards.push({
          id: `fc_${topicEntity.id || name}_chunk_${i}`,
          front: `Concept Context: ${name}`,
          back: sents[0].trim(),
          type: 'Context',
          page: c.page,
          displayPageLabel: c.displayPageLabel || String(c.page)
        })
      }
    }
  }

  return cards
}

export function explainConceptSimply(conceptName, relatedChunks) {
  if (!relatedChunks || !relatedChunks.length) {
    return {
      title: conceptName,
      summary: `Reference to ${conceptName} found in document.`,
      sourcePages: [1],
      sources: [1],
      pages: [1],
      evidence: ''
    }
  }

  const primaryChunk = relatedChunks[0]
  const allPages = Array.from(new Set(relatedChunks.map(c => c.page))).sort((a, b) => a - b)

  return {
    title: conceptName,
    summary: primaryChunk.text,
    sourcePages: allPages,
    sources: allPages,
    pages: allPages,
    evidence: primaryChunk.text
  }
}

export function generateTopicSummary(topicEntity, chunks, relationships = []) {
  if (!topicEntity) return null

  const name = topicEntity.name || topicEntity.title
  const nameLower = name.toLowerCase()
  const aliases = (topicEntity.aliases || []).map(a => a.toLowerCase())

  // Build chunk index for O(1) lookup by id
  const chunkById = new Map((chunks || []).map(c => [c.id, c]))

  // Layer 1: Grounded chunks via sourceChunkIds (most authoritative — these were the actual
  // evidence chunks that caused this topic to be discovered)
  const sourceIds = new Set([
    ...(topicEntity.sourceChunkIds || []),
    ...(topicEntity.evidenceChunkIds || [])
  ])
  const groundedChunks = Array.from(sourceIds)
    .map(id => chunkById.get(id))
    .filter(c => c && c.text && !c.isHeading && c.text.length >= 25)

  // Layer 2: Case-insensitive name/alias match across all chunks
  function mentionsTopic(text) {
    const tl = text.toLowerCase()
    return tl.includes(nameLower) || aliases.some(a => a.length > 4 && tl.includes(a))
  }
  const matchedChunks = groundedChunks.length
    ? groundedChunks
    : (chunks || []).filter(c => c.text && !c.isHeading && c.text.length >= 25 && mentionsTopic(c.text))

  // Layer 3: Semantic page fallback — any body chunks on the same pages as the topic
  let evidenceChunks = matchedChunks
  if (!evidenceChunks.length && (topicEntity.sourcePages || []).length) {
    const pageSet = new Set(topicEntity.sourcePages)
    evidenceChunks = (chunks || []).filter(c =>
      c.text && !c.isHeading && c.text.length >= 40 && pageSet.has(c.page || c.pdfPageNumber)
    )
  }

  // Extract key sentences: prefer sentences that mention the topic or aliases
  const keySentences = []
  const allSentences = []
  for (const c of evidenceChunks.slice(0, 6)) {
    const sents = c.text.split(/(?<=[.?!])\s+/)
    for (const s of sents) {
      const clean = s.trim()
      if (clean.length < 25 || clean.length > 300) continue
      if (mentionsTopic(clean)) {
        if (!keySentences.some(k => k === clean)) keySentences.push(clean)
      } else if (!allSentences.some(k => k === clean)) {
        allSentences.push(clean)
      }
    }
  }

  // Build extractive summary: best sentence first, then additional key points
  const summaryPool = [...keySentences, ...allSentences]
  const primaryOverview = summaryPool[0] ||
    (evidenceChunks[0]?.text ? evidenceChunks[0].text.slice(0, 220).trim() : '')
  const keyPoints = summaryPool.slice(1, 5).filter(s => s !== primaryOverview)

  // Find graph connections for this topic
  const connectedEdges = (relationships || []).filter(r =>
    r.sourceId === topicEntity.id || r.targetId === topicEntity.id
  )
  const connections = connectedEdges.map(r => {
    const isSource = r.sourceId === topicEntity.id
    return {
      type: r.type || r.predicate,
      targetName: isSource ? r.targetName : r.sourceName,
      direction: isSource ? 'outgoing' : 'incoming',
      evidence: r.evidence
    }
  })

  const allPages = (topicEntity.sourcePages?.length)
    ? topicEntity.sourcePages
    : (topicEntity.pages?.length)
      ? topicEntity.pages
      : Array.from(new Set(evidenceChunks.map(c => c.page))).sort((a, b) => a - b)

  // Build per-page display references
  const displayPageLabel = topicEntity.displayPageLabel
  const pdfPageNumber = topicEntity.pdfPageNumber || allPages[0]

  return {
    name,
    type: topicEntity.type || 'Concept',
    summary: primaryOverview,
    keyPoints,
    connections,
    sourcePages: allPages.length ? allPages : [1],
    pages: allPages.length ? allPages : [1],
    pdfPageNumber,
    displayPageLabel,
    evidenceChunkCount: evidenceChunks.length
  }
}

export function generateQuestionsForTopic(topicEntity, chunks, allEntities = [], count = 3) {
  if (!topicEntity) return []
  const name = topicEntity.name || topicEntity.title
  const nameLower = name.toLowerCase()
  const aliases = (topicEntity.aliases || []).map(a => a.toLowerCase())

  // Use sourceChunkIds first (same strategy as generateTopicSummary)
  const chunkById = new Map((chunks || []).map(c => [c.id, c]))
  const sourceIds = new Set([...(topicEntity.sourceChunkIds || []), ...(topicEntity.evidenceChunkIds || [])])
  const groundedChunks = Array.from(sourceIds).map(id => chunkById.get(id)).filter(c => c && c.text && !c.isHeading && c.text.length > 25)

  function mentionsTopic(text) {
    const tl = text.toLowerCase()
    return tl.includes(nameLower) || aliases.some(a => a.length > 4 && tl.includes(a))
  }
  const relatedChunks = groundedChunks.length
    ? groundedChunks
    : chunks.filter(c => c.text && c.text.length > 25 && !c.isHeading && mentionsTopic(c.text))

  if (!relatedChunks.length) return []

  const questions = []

  // Find real distractors from other entities
  const sameTypeDistractors = allEntities
    .filter(e => e.id !== topicEntity.id && e.type === topicEntity.type && e.name.toLowerCase() !== name.toLowerCase())
    .map(e => e.name)

  const otherDistractors = allEntities
    .filter(e => e.id !== topicEntity.id && e.name.toLowerCase() !== name.toLowerCase() && e.name.length > 2)
    .map(e => e.name)

  const candidatePool = sameTypeDistractors.length >= 3 ? sameTypeDistractors : [...sameTypeDistractors, ...otherDistractors]
  const uniqueDistractors = Array.from(new Set(candidatePool)).filter(d => d !== name).slice(0, 3)

  // Question 1: Core identification / role of this topic
  const mainChunk = relatedChunks[0]
  if (uniqueDistractors.length >= 3) {
    const options = [name, ...uniqueDistractors].sort(() => Math.random() - 0.5)
    let qText = `According to Page ${mainChunk.page}, which ${topicEntity.type || 'concept'} is described as: "${mainChunk.text.slice(0, 95).replace(/[.,;:()]/g, '')}…"?`

    questions.push({
      id: `tq_${topicEntity.id}_1`,
      question: qText,
      options,
      answer: name,
      sourcePage: mainChunk.page,
      sourcePages: [mainChunk.page],
      explanation: `Page ${mainChunk.page} describes ${name}: "${mainChunk.text.length > 150 ? mainChunk.text.slice(0, 150) + '…' : mainChunk.text}"`,
      evidence: mainChunk.text
    })
  }

  // Question 2: Factual statement question
  if (relatedChunks.length > 1 || mainChunk.text.length > 80) {
    const targetChunk = relatedChunks[1] || mainChunk
    const sentences = targetChunk.text.split(/(?<=[.?!])\s+/).filter(s => s.includes(name) && s.length > 30)
    if (sentences.length > 0) {
      const statement = sentences[0].trim()
      const otherStatements = chunks
        .filter(c => !c.text.includes(name) && c.text.length > 40 && !c.isHeading)
        .slice(0, 3)
        .map(c => c.text.split(/(?<=[.?!])\s+/)[0]?.trim())
        .filter(Boolean)

      if (otherStatements.length >= 3) {
        const statementOptions = [statement, ...otherStatements.slice(0, 3)].sort(() => Math.random() - 0.5)
        questions.push({
          id: `tq_${topicEntity.id}_2`,
          question: `Which of the following statements regarding "${name}" is explicitly stated in the document?`,
          options: statementOptions,
          answer: statement,
          sourcePage: targetChunk.page,
          sourcePages: [targetChunk.page],
          explanation: `Direct statement on Page ${targetChunk.page}: "${statement}"`,
          evidence: statement
        })
      }
    }
  }

  return questions.slice(0, count)
}

// Configurable high-depth topic quiz generator based on selected Knowledge Graph node
export function generateTopicQuiz(topicEntity, chunks, allEntities = [], relationships = [], config = {}) {
  const { count = 3, difficulty = 'medium', focus = 'mixed' } = config

  if (!topicEntity) {
    return { questions: [], error: 'No topic selected.' }
  }

  const name = topicEntity.name || topicEntity.title
  const nameLower = (name || '').toLowerCase()
  const aliases = (topicEntity.aliases || []).map(a => a.toLowerCase())

  // Multi-layer chunk resolution (sourceChunkIds -> alias match -> general fallback)
  const chunkById = new Map((chunks || []).map(c => [c.id, c]))
  const sourceIds = new Set([
    ...(topicEntity.sourceChunkIds || []),
    ...(topicEntity.evidenceChunkIds || [])
  ])
  const groundedChunks = Array.from(sourceIds)
    .map(id => chunkById.get(id))
    .filter(c => c && c.text && !c.isHeading && c.text.length >= 25)

  function mentionsTopic(text) {
    const tl = text.toLowerCase()
    return tl.includes(nameLower) || aliases.some(a => a.length > 4 && tl.includes(a))
  }

  const relatedChunks = groundedChunks.length
    ? groundedChunks
    : (chunks || []).filter(c => c.text && c.text.length > 25 && !c.isHeading && mentionsTopic(c.text))

  const connectedEdges = (relationships || []).filter(r => (r.sourceId === topicEntity.id || r.targetId === topicEntity.id) && r.evidence)

  // Insufficient source check
  if (!relatedChunks.length && !connectedEdges.length) {
    return {
      questions: [],
      error: 'Not enough source information to generate a high-quality quiz for this topic.'
    }
  }

  const totalSourceChars = relatedChunks.reduce((acc, c) => acc + c.text.length, 0)
  if (totalSourceChars < 40 && !connectedEdges.length) {
    return {
      questions: [],
      error: 'Not enough source information to generate a high-quality quiz for this topic.'
    }
  }

  const questions = []
  const allCandidateSentences = []
  for (const c of relatedChunks) {
    const sents = c.text.split(/(?<=[.?!])\s+/).filter(s => s.includes(name) && s.length > 25)
    for (const s of sents) {
      if (!allCandidateSentences.some(item => item.sentence === s.trim())) {
        allCandidateSentences.push({ sentence: s.trim(), page: c.page, fullChunk: c.text })
      }
    }
  }

  // 1. CONNECTED-TOPIC / RELATIONSHIP QUESTIONS
  // For topics with strong graph relationships, generate questions about those relationships!
  // Example: OAuth uses Access Token -> "How are OAuth and Access Token related according to the document?"
  const usedPartners = new Set()
  const maxRelQuestions = focus === 'relationships' ? count : Math.max(1, Math.floor(count / 3))

  if (focus === 'relationships' || focus === 'mixed') {
    for (const edge of connectedEdges) {
      if (questions.length >= maxRelQuestions || questions.length >= count) break
      const isSource = edge.sourceId === topicEntity.id
      const otherName = isSource ? edge.targetName : edge.sourceName
      if (!otherName || otherName === name || usedPartners.has(otherName.toLowerCase())) continue
      usedPartners.add(otherName.toLowerCase())

      const relType = edge.type

      // Create understanding-based relationship question
      const relDescriptions = {
        uses: `${name} utilizes or relies on ${otherName} to operate effectively`,
        depends_on: `${name} has a prerequisite dependency on ${otherName}`,
        causes: `${name} triggers or results in ${otherName}`,
        supports: `${name} strengthens, reinforces or sustains ${otherName}`,
        contradicts: `${name} opposes or directly conflicts with ${otherName}`,
        owned_by: `${name} is owned by or the property of ${otherName}`,
        created_by: `${name} was authored, designed, or developed by ${otherName}`,
        part_of: `${name} is an integral subsystem or component of ${otherName}`,
        related_to: `${name} is directly associated with ${otherName} in the workflow`
      }

      const correctAnswer = relDescriptions[relType] || `${name} is connected with ${otherName} (${relType})`

      // Distractors based on other relationship verbs
      const otherRelTypes = ['contradicts', 'owned_by', 'causes', 'part_of', 'depends_on', 'uses'].filter(t => t !== relType)
      const distractors = otherRelTypes.slice(0, 3).map(ot => {
        return relDescriptions[ot]?.split(name).join(name).split(otherName).join(otherName) || `${name} is not related to ${otherName}`
      })

      if (distractors.length >= 3) {
        const options = [correctAnswer, ...distractors].sort(() => Math.random() - 0.5)
        const edgePages = edge.sourcePages || [edge.page || relatedChunks[0]?.page || 1]
        questions.push({
          id: `q_rel_${edge.id || Math.random().toString(36).slice(2, 6)}`,
          topic: name,
          focus: 'Relationships',
          difficulty,
          question: `How are "${name}" and "${otherName}" related according to the document?`,
          options,
          answer: correctAnswer,
          sourcePage: edgePages[0],
          sourcePages: edgePages,
          explanation: `According to Page ${edgePages[0]}: "${edge.evidence || edge.sourceName + ' ' + edge.type + ' ' + edge.targetName}"`,
          evidence: edge.evidence || ''
        })
      }
    }
  }

  // 2. UNDERSTANDING / WHY IT MATTERS QUESTIONS
  // Analyzes why the topic is significant, its function, or definitions
  if (focus === 'understanding' || focus === 'mixed') {
    for (const item of allCandidateSentences) {
      if (questions.length >= count) break
      const sent = item.sentence

      const matchPurpose = /\b(?:is|are|provides|allows|enables|serves|protects|acts as|defined as|designed to|needed for)\s+([^.?!,;]+)/i.exec(sent)
      if (matchPurpose && matchPurpose[1].trim().length > 15) {
        const factualOutcome = matchPurpose[1].trim()
        const questionText = `Why is "${name}" significant or what is its primary function in this context?`
        const correctAnswer = `It ${factualOutcome.replace(/^to\s+/i, '')}`

        // Distractors from other chunks
        const otherActions = chunks
          .filter(c => !c.text.includes(name) && c.text.length > 40 && !c.isHeading)
          .slice(0, 6)
          .map(c => {
            const m = /\b(?:is|are|provides|allows|enables|serves|protects|acts as|designed to|needed for)\s+([^.?!,;]+)/i.exec(c.text)
            return m && m[1]?.trim().length > 15 ? `It ${m[1].trim().replace(/^to\s+/i, '')}` : null
          })
          .filter(Boolean)

        const uniqueDistractors = Array.from(new Set(otherActions)).filter(d => d !== correctAnswer).slice(0, 3)

        if (uniqueDistractors.length >= 3) {
          const options = [correctAnswer, ...uniqueDistractors].sort(() => Math.random() - 0.5)
          questions.push({
            id: `q_und_${questions.length + 1}`,
            topic: name,
            focus: 'Understanding',
            difficulty,
            question: questionText,
            options,
            answer: correctAnswer,
            sourcePage: item.page,
            sourcePages: [item.page],
            explanation: `Source excerpt from Page ${item.page}: "${sent}"`,
            evidence: sent
          })
        }
      }
    }
  }

  // 3. APPLICATION & HOW IT WORKS QUESTIONS
  // Analyzes practical implementation, precautions, effects, or methods
  if (focus === 'application' || focus === 'mixed') {
    for (const item of allCandidateSentences) {
      if (questions.length >= count) break
      const sent = item.sentence

      const matchAction = /\b(?:must|should|can|requires|recommends|in order to|prevents|causes|configures|executes)\s+([^.?!;]+)/i.exec(sent)
      if (matchAction && matchAction[1].trim().length > 15) {
        const actionOutcome = matchAction[1].trim()
        const questionText = `What is stated regarding the practical application or operation of "${name}"?`
        const correctAnswer = `The document specifies that it ${actionOutcome}`

        const otherOutcomes = chunks
          .filter(c => !c.text.includes(name) && c.text.length > 50 && !c.isHeading)
          .slice(0, 6)
          .map(c => {
            const m = /\b(?:must|should|can|requires|recommends|in order to|prevents|causes|configures|executes)\s+([^.?!;]+)/i.exec(c.text)
            return m && m[1]?.trim().length > 15 ? `The document specifies that it ${m[1].trim()}` : null
          })
          .filter(Boolean)

        const uniqueDistractors = Array.from(new Set(otherOutcomes)).filter(d => d !== correctAnswer).slice(0, 3)

        if (uniqueDistractors.length >= 3) {
          const options = [correctAnswer, ...uniqueDistractors].sort(() => Math.random() - 0.5)
          questions.push({
            id: `q_app_${questions.length + 1}`,
            topic: name,
            focus: 'Application',
            difficulty,
            question: questionText,
            options,
            answer: correctAnswer,
            sourcePage: item.page,
            sourcePages: [item.page],
            explanation: `Source statement from Page ${item.page}: "${sent}"`,
            evidence: sent
          })
        }
      }
    }
  }

  // 4. FACTUAL / TRUE STATEMENT VERIFICATION (if still needed to reach requested count)
  if (questions.length < count && allCandidateSentences.length > 0) {
    for (const item of allCandidateSentences) {
      if (questions.length >= count) break
      const statement = item.sentence
      if (statement.length < 35 || statement.length > 200) continue
      if (questions.some(q => q.evidence === statement)) continue

      const otherStatements = chunks
        .filter(c => !c.text.includes(name) && c.text.length > 40 && !c.isHeading)
        .slice(0, 6)
        .map(c => c.text.split(/(?<=[.?!])\s+/).find(s => s.length > 35 && s.length < 200)?.trim())
        .filter(Boolean)

      const uniqueDistractors = Array.from(new Set(otherStatements)).filter(s => s !== statement).slice(0, 3)

      if (uniqueDistractors.length >= 3) {
        const options = [statement, ...uniqueDistractors].sort(() => Math.random() - 0.5)
        questions.push({
          id: `q_stmt_${questions.length + 1}`,
          topic: name,
          focus: 'Verification',
          difficulty,
          question: `Which of the following findings regarding "${name}" is explicitly verified by the document?`,
          options,
          answer: statement,
          sourcePage: item.page,
          sourcePages: [item.page],
          explanation: `Page ${item.page} confirms: "${statement}"`,
          evidence: statement
        })
      }
    }
  }

  if (questions.length === 0) {
    return {
      questions: [],
      error: 'Not enough source information to generate a high-quality quiz for this topic.'
    }
  }

  return {
    questions: questions.slice(0, count),
    topic: name,
    error: null
  }
}

// Learning Progress & Topic Mastery Storage (100% on-device)
export function getTopicMastery(docName, topicName) {
  try {
    const raw = localStorage.getItem(`editpdf_mastery_${docName}`)
    if (!raw) return { status: 'not_studied', understanding: 0, answered: 0, correct: 0 }
    const data = JSON.parse(raw)
    return data[topicName] || { status: 'not_studied', understanding: 0, answered: 0, correct: 0 }
  } catch {
    return { status: 'not_studied', understanding: 0, answered: 0, correct: 0 }
  }
}

export function saveTopicMastery(docName, topicName, { correct, total }) {
  try {
    const key = `editpdf_mastery_${docName}`
    const raw = localStorage.getItem(key)
    const data = raw ? JSON.parse(raw) : {}
    const existing = data[topicName] || { answered: 0, correct: 0 }

    const newAnswered = existing.answered + total
    const newCorrect = existing.correct + correct
    const understanding = Math.round((newCorrect / Math.max(1, newAnswered)) * 100)

    let status = 'not_studied'
    if (newAnswered > 0) {
      status = (understanding >= 80 && newAnswered >= 3) ? 'mastered' : 'learning'
    }

    data[topicName] = {
      topicName,
      status,
      understanding,
      answered: newAnswered,
      correct: newCorrect,
      lastStudied: Date.now()
    }
    localStorage.setItem(key, JSON.stringify(data))
    return data[topicName]
  } catch {
    return null
  }
}

export function getAllTopicMastery(docName) {
  try {
    const raw = localStorage.getItem(`editpdf_mastery_${docName}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

