// Central Model Manager & Hardware Detection

export async function detectHardwareCapabilities() {
  const caps = {
    webgpu: false,
    wasm: typeof WebAssembly !== 'undefined',
    simd: false,
    threads: navigator.hardwareConcurrency || 4,
    deviceMemory: navigator.deviceMemory || 4,
    recommendedBackend: 'WASM'
  }

  // Detect WebGPU
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter()
      if (adapter) {
        caps.webgpu = true
        caps.recommendedBackend = 'WebGPU (Hardware Accelerated)'
      }
    } catch {
      caps.webgpu = false
    }
  }

  // Detect WebAssembly SIMD
  if (caps.wasm) {
    try {
      caps.simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11]))
    } catch {
      caps.simd = false
    }
  }

  return caps
}

export const REGISTERED_MODELS = [
  {
    id: 'embeddings',
    name: 'Semantic Vector Embedding Engine',
    category: 'Embedding',
    size: '0.2 MB',
    status: 'Ready (Built-in)',
    hardware: 'WebGPU / WASM / SIMD',
    description: '128-dimensional dense semantic hashing & vector space for instant client-side RAG'
  },
  {
    id: 'ner',
    name: 'Specialized Named Entity Recognition',
    category: 'Information Extraction',
    size: '0.1 MB',
    status: 'Ready (Built-in)',
    hardware: 'CPU / WASM',
    description: 'Extracts people, companies, tech, locations, products, regulations and metrics'
  },
  {
    id: 'relations',
    name: 'Predicate & Semantic Relation Extractor',
    category: 'Knowledge Graph',
    size: '0.1 MB',
    status: 'Ready (Built-in)',
    hardware: 'CPU / WASM',
    description: 'Discovers part_of, depends_on, causes, supports, and creates knowledge edges'
  },
  {
    id: 'local_llm',
    name: 'Optional Local LLM (On-Device Generation)',
    category: 'Generative',
    size: 'Optional / On-Demand',
    status: 'Available',
    hardware: 'WebGPU / WebLLM',
    description: 'Generates quizzes, flashcards, and plain-English explanations using retrieved chunks'
  }
]
