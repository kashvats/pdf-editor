# Topic Intelligence & Route Persistence Design Specification

## Executive Summary
This specification defines the architectural refactoring of the Document Intelligence subsystem and application routing/persistence in EditPDF. The core objectives are:
1. **Content-First Semantic Topic Discovery**: Chunk and embed cleaned document content first, cluster semantically related passages using bounded centroid clustering, and infer canonical topics from clusters. Headings, TOC, and chapters serve as supporting evidence.
2. **Many-to-Many Topic/Cluster Mapping & Soft Membership**: Allow a chunk or cluster to support multiple topics with confidence/membership scores (`topicMemberships: [{ topicId, confidence }]`), and map topics to multiple cluster IDs (`TopicNode.clusterIds: string[]`, `TopicClusterRecord.candidateTopicIds: string[]`).
3. **Structured Traceability (`TopicClusterRecord`)**: Persist `candidateLabels`, `coherenceScore`, `confidence`, `chunkIds`, and `pageDistribution` without duplicating raw vector storage.
4. **Authoritative Root Topic Schema**:
   ```typescript
   rootTopic: {
     id: string;
     label: string;
     summary: string;
     confidence: number;
     sourcePages: number[];
     evidenceChunkIds: string[];
     synthetic: boolean;
   }
   ```
   Synthesize overall document subject; if confidence is low, fall back conservatively to document-level subject rather than inventing a confident topic.
5. **Pre-Processing OCR Check**: Check text density and extraction quality. If empty or image-only, run OCR before topic extraction with full progress and cancellation support.
6. **Structure-Aware Semantic Chunking**: Preserve sentence and paragraph boundaries, avoid crossing major headings, target 150–300 words with small overlap, and retain source/bbox mapping and definitions.
7. **Bounded, Deterministic Clustering**: Bounded incremental centroid clustering with a configurable maximum active centroid count (e.g. 40–60) and deterministic sorting/seeding to avoid unbounded $k$ and quadratic slowdowns.
8. **Evidenced Semantic Relationships**: Semantic predicate entailment supported by source sentence evidence (does not require literal word matching). Strictly reject co-occurrence alone. Vocabulary includes: `uses`, `requires`, `depends_on`, `causes`, `enables`, `prevents`, `protects_against`, `part_of`, `example_of`, `contrasts_with`, `leads_to`, `defines`, `contains`, `identifies`, `affects`, `supports`, `mitigates`, `compares_with`.
9. **Mind Map Structural Invariants**: Strict tree (one root, one primary parent per non-root, zero cycles, zero duplicates). Branch size target 3–8 with hard max 8; overflow grouping creates nodes explicitly marked `synthetic: true` without fake citations.
10. **Precise Source Anchoring**: Store `pdfPageIndex`, `displayPageLabel`, `chunkId`, `textStart`, `textEnd`, and `bbox` for exact passage highlighting.
11. **Pipeline & Cache Versioning**: Persist `schemaVersion`, `pipelineVersion`, `embeddingModelId`, `embeddingModelVersion`, and `documentFingerprint`. Invalidate incompatible cache.
12. **Safe IndexedDB Persistence**: Catch `QuotaExceededError`, monitor quotas, avoid vector duplication, clean old caches, and continue gracefully with user notice if persistence fails.
13. **Fine-Grained Processing Lifecycle**: Stages: `loading` → `extracting` → `ocr` → `cleaning` → `structure` → `chunking` → `embeddings` → `clustering` → `topics` → `topic-validation` → `root-detection` → `relations` → `mindmap` → `quality-validation` → `persisting` → `ready`. Cancellation works during all heavy stages.
14. **Loop-Free Quality Gate**: At most one controlled refinement; if still low quality, transition to `PARTIAL_READY` with actionable warnings rather than looping.
15. **Actionable Quality Report**: Reports `topicCount`, `visibleTopicCount`, `noiseRatio`, `duplicateRate`, `clusterCoherence`, `rootConfidence`, `evidencedEdgeRatio`, `genericEdgeRatio`, `orphanTopicCount`, `mindmapDepth`, `syntheticGroupingCount`, and `warnings[]`.
16. **Consistent Canonical Route Names**: `/document-intelligence?tab=knowledge-graph` and `/document-intelligence?tab=mind-map`. URL is primary source of truth; Back/Forward takes precedence over sessionStorage.
17. **Asset-Safe SPA Fallback**: Deep routes rewrite to `/index.html` while missing assets (`/assets/*`) return real 404s across Vite, Cloudflare Pages/Netlify, Vercel, Nginx, and S3.
18. **Grounded Quiz Generation**: Grounded strictly in topic chunks; if insufficient evidence, display: `"Not enough source information to generate a high-quality quiz for this topic."`
19. **Real-Document Verification Matrix**: Validated against real multi-page textbooks, scanned PDFs, research papers, and technical manuals.
