import * as pdfjsLib from 'pdfjs-dist'

// Standard Vite + Node compatible worker URL
if (pdfjsLib?.GlobalWorkerOptions) {
  if (typeof window !== 'undefined') {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.mjs'
    }
  } else {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.mjs'
    }
  }
}

export default pdfjsLib
