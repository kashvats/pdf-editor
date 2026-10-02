// PDF Security Parser Abstraction
// Isolates library internals and parses PDF structures safely without executing code

const lib = () => import('@cantoo/pdf-lib')

export async function parsePdfDocument(bytes, options = {}) {
  const { PDFDocument } = await lib()
  const { password } = options

  try {
    const doc = await PDFDocument.load(bytes, {
      password,
      ignoreEncryption: !password,
      throwOnInvalidObject: false,
      updateMetadata: false
    })
    return { doc, encrypted: doc.isEncrypted }
  } catch (err) {
    const msg = err?.message || ''
    if (/password|encrypt/i.test(msg)) {
      return { doc: null, encrypted: true, error: 'Document is password-protected or encrypted.' }
    }
    return { doc: null, encrypted: false, error: msg }
  }
}
