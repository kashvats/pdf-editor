# PDF Security Scanner & Sanitizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first PDF Security Scanner & Sanitizer that inspects PDFs structurally for active and dangerous content inside an isolated Web Worker, provides Standard (fresh-context AST cleanse) and Maximum Safety (rebuild/flatten) sanitization with mandatory post-scan verification, and hardens application CSP and HTTP security headers.

**Architecture:** Untrusted PDF bytes pass preflight resource budgets into an isolated Web Worker. The worker traverses the PDF indirect object graph with cycle and recursion limits, producing structured findings and tri-state safe checks without executing anything. The sanitizer offers Standard mode (fresh-context reachable object rebuild omitting prohibited active capabilities) or Maximum Safety (clean container reconstruction from rendered pages). Output undergoes a mandatory re-scan in the worker against the shared `SanitizationPolicy`, and downloads are blocked if any prohibited active features remain.

**Tech Stack:** React 18, Vite 5, `@cantoo/pdf-lib` / `pdf-lib`, Web Workers, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-01-pdf-security-scanner-and-sanitizer-design.md`

## Global Constraints
- Worker is an execution-containment / fault-isolation boundary, not an OS sandbox; never pass tokens, secrets, or app state into the worker.
- Never execute PDF JavaScript, never use `eval()`, never auto-execute PDF actions, never auto-navigate external URIs, and never auto-open/download embedded files.
- Fail closed: parser errors or resource limit breaches report `SCAN_PARTIAL`, `SCAN_FAILED`, or `RESOURCE_LIMIT_EXCEEDED`—never a clean bill of health.
- Honest copy: never display "Virus Free", "100% Safe", or "No Malware". Use: *"No potentially unsafe PDF features were detected by this scanner."*
- Post-sanitization re-scan is mandatory: verify removed active features are absent before allowing download.
- Deliver CSP via both `index.html` and production headers (`_headers`, `vercel.json`).
- One shared Security workspace/engine powering both `/pdf-security-scanner` and `/sanitize-pdf`.

## Review Focus
- Malicious circular reference graph: objects referencing each other must not cause an infinite recursion stack overflow or loop.
- Stream decompression bombs: streams with extreme expansion ratios or excessive decoded byte counts must be halted during decoding before exhausting browser memory.
- Obfuscated/indirect actions: actions located inside nested dictionaries, page-level `/AA`, or field-level widget `/AA` must be detected and removed.
- Fail-closed on parser errors: corrupted or truncated PDFs must transition to `SCAN_PARTIAL` or `SCAN_FAILED` and recommend Maximum Safety mode if render preflight passes.
- Post-sanitization gate: if a simulated active action survives sanitization, the download button must remain locked.

---

### Task 1: Security Types, Capability Model & Resource Guards

**Files:**
- Create: `src/lib/securityScanner/types.js`
- Create: `src/lib/securityScanner/resourceGuards.js`
- Test: `test/securityGuards.test.js`

**Interfaces:**
- Produces:
  `checkPreflightLimits(bytes: Uint8Array, config?: ResourceConfig): { allowed: boolean; reason?: string }`
  `createTraversalTracker(config?: ResourceConfig): TraversalTracker`
  `checkStreamExpansion(compressedSize: number, decompressedSize: number, totalDecodedBytes: number, config?: ResourceConfig): boolean`
  `checkImageLimits(width: number, height: number, config?: ResourceConfig): { allowed: boolean; reason?: string }`
  `createDefaultSanitizationPolicy(mode?: 'standard' | 'maximum_safety'): SanitizationPolicy`

- [ ] **Step 1: Write the failing test**

```javascript
// test/securityGuards.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkPreflightLimits,
  createTraversalTracker,
  checkStreamExpansion,
  checkImageLimits
} from '../src/lib/securityScanner/resourceGuards.js'
import { createDefaultSanitizationPolicy } from '../src/lib/securityScanner/types.js'

test('enforces preflight file size limits', () => {
  const normalBytes = new Uint8Array(1024 * 1024) // 1MB
  assert.equal(checkPreflightLimits(normalBytes).allowed, true)

  const oversizedBytes = new Uint8Array(160 * 1024 * 1024) // 160MB
  const pre = checkPreflightLimits(oversizedBytes, { maxFileSizeBytes: 150 * 1024 * 1024 })
  assert.equal(pre.allowed, false)
  assert.ok(pre.reason.includes('exceeds'))
})

test('tracks recursion depth and breaks cyclic object loops', () => {
  const tracker = createTraversalTracker({ maxRecursionDepth: 5, maxUniqueObjects: 10 })
  assert.equal(tracker.visit('1R0', 1), true)
  assert.equal(tracker.visit('2R0', 2), true)
  assert.equal(tracker.visit('1R0', 3), false) // Already visited cycle!
  assert.equal(tracker.isCycle('1R0'), true)

  // Test depth limit
  assert.equal(tracker.visit('3R0', 6), false) // Exceeds depth 5
})

test('aborts stream decoding on extreme expansion ratio or excessive size', () => {
  // Safe stream
  assert.equal(checkStreamExpansion(1000, 5000, 5000), true)

  // Decompression bomb: 100 bytes expanding to 100,000 bytes (1000x ratio)
  assert.equal(checkStreamExpansion(100, 100000, 100000, { maxExpansionRatio: 100 }), false)

  // Cumulative budget exceeded: stream alone is ok but total decoded exceeds limit
  assert.equal(checkStreamExpansion(1000, 5000, 160 * 1024 * 1024, { maxTotalDecodedBytes: 150 * 1024 * 1024 }), false)
})

test('blocks oversized image dimensions before allocating bitmap memory', () => {
  assert.equal(checkImageLimits(1920, 1080).allowed, true)
  const huge = checkImageLimits(12000, 12000, { maxImageDimension: 6000 })
  assert.equal(huge.allowed, false)
  assert.ok(huge.reason.includes('dimension'))
})

test('creates default policies with correct URI defaults', () => {
  const standardPolicy = createDefaultSanitizationPolicy('standard')
  assert.equal(standardPolicy.allowedUriSchemes.has('https'), true)
  assert.equal(standardPolicy.allowedUriSchemes.has('http'), true)
  assert.equal(standardPolicy.allowedUriSchemes.has('mailto'), false) // mailto is opt-in

  const maxSafetyPolicy = createDefaultSanitizationPolicy('maximum_safety')
  assert.equal(maxSafetyPolicy.allowedUriSchemes.size, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/securityGuards.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `src/lib/securityScanner/types.js` and `resourceGuards.js`**

Implement resource configurations (max file size, max unique objects, depth limits, decompression bomb ratios, cumulative stream byte limits, max image dimensions) and traversal trackers with cycle detection.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/securityGuards.test.js`
Expected: PASS

---

### Task 2: Structural PDF Parser Abstraction & Recursive Action Traversal

**Files:**
- Create: `src/lib/securityScanner/parser.js`
- Create: `src/lib/securityScanner/scanner.js`
- Test: `test/securityScanner.test.js`

**Interfaces:**
- Produces:
  `scanPdfStructure(bytes: Uint8Array, options?: ScanOptions): Promise<ScanResult>`
  `ScanResult`: `{ status: ScanStatus, findings: PdfSecurityFinding[], safeChecks: SecuritySafeCheck[], scanCompleteness: ScanCompleteness, riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH', metadata: object }`

- [ ] **Step 1: Write the failing test**

```javascript
// test/securityScanner.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib'
import { scanPdfStructure } from '../src/lib/securityScanner/scanner.js'

test('detects JavaScript, OpenAction, and Launch actions in PDF structure', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([400, 400])

  // Inject OpenAction with JavaScript
  const jsAction = doc.context.obj({
    Type: 'Action',
    S: 'JavaScript',
    JS: PDFString.of('app.alert("Pwned!");')
  })
  const jsActionRef = doc.context.register(jsAction)
  doc.catalog.set(PDFName.of('OpenAction'), jsActionRef)

  const bytes = await doc.save()
  const result = await scanPdfStructure(bytes)

  assert.equal(result.status, 'SCAN_COMPLETE')
  assert.equal(result.riskLevel, 'HIGH')
  assert.ok(result.findings.some(f => f.category === 'ActiveScripting'))
  assert.ok(result.findings.some(f => f.category === 'AutomaticExecution'))
  assert.ok(result.safeChecks.some(c => c.id === 'no-launch' && c.status === 'passed'))
  assert.ok(result.safeChecks.some(c => c.id === 'no-xfa' && c.status === 'passed'))
  assert.equal(result.scanCompleteness.catalog, 'complete')
})

test('differentiates benign page destination OpenAction from active action', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])

  // OpenAction resolving to page view array
  doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj([page.ref, PDFName.of('Fit')]))

  const bytes = await doc.save()
  const result = await scanPdfStructure(bytes)

  assert.equal(result.status, 'SCAN_COMPLETE')
  assert.equal(result.findings.some(f => f.category === 'AutomaticExecution' && f.severity === 'high'), false)
})

test('detects embedded file attachments and external URIs', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])

  // Add Link annotation with external URI
  const uriAction = doc.context.obj({
    Type: 'Action',
    S: 'URI',
    URI: PDFString.of('https://example.com/docs')
  })
  const linkAnnot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [10, 10, 100, 30],
    A: uriAction
  })
  const linkRef = doc.context.register(linkAnnot)
  page.node.set(PDFName.of('Annots'), doc.context.obj([linkRef]))

  const bytes = await doc.save()
  const result = await scanPdfStructure(bytes)

  assert.equal(result.status, 'SCAN_COMPLETE')
  assert.ok(result.findings.some(f => f.category === 'DataTransmission' && f.details.target === 'https://example.com/docs'))
})

test('fails closed when given corrupted bytes', async () => {
  const junk = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x12, 0x34]) // Corrupted PDF
  const result = await scanPdfStructure(junk)
  assert.ok(result.status === 'SCAN_FAILED' || result.status === 'SCAN_PARTIAL')
  assert.notEqual(result.riskLevel, 'NONE')
  assert.ok(result.safeChecks.some(c => c.status === 'unknown'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/securityScanner.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `src/lib/securityScanner/parser.js` and `src/lib/securityScanner/scanner.js`**

Implement structural graph traversal:
- Parse `PDFDocument` without executing scripts or actions.
- Centralized `inspectAction(actionRef, triggerContext)` traversing `/Next` chains and evaluating capabilities (`execute_javascript`, `launch_process`, `external_navigation`, `form_submission`, `data_import`, `embedded_files`, `multimedia_playback`, `xfa_processing`, `auto_execution`).
- Traverse Catalog (`/Root`), `/OpenAction`, `/AA`, Names (`/JavaScript`, `/EmbeddedFiles`).
- Traverse `/Pages` and `/Annots` (`/Link`, `/Widget`, `/Screen`, `/RichMedia`, `/FileAttachment`, `/A`, `/AA`).
- Traverse `/AcroForm` (`/XFA`, field `/AA`, submit actions).
- Traverse `/Outlines`.
- Calculate `scanCompleteness` and tri-state safe checks (`passed`, `failed`, `unknown`, `info`).
- Fail-closed try/catch emitting `SCAN_PARTIAL` or `SCAN_FAILED`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/securityScanner.test.js`
Expected: PASS

---

### Task 3: Dual Sanitizer & Post-Scan Policy Verification Gate

**Files:**
- Create: `src/lib/securityScanner/sanitizer.js`
- Create: `src/lib/securityScanner/verifier.js`
- Test: `test/securitySanitizer.test.js`

**Interfaces:**
- Produces:
  `sanitizeStandard(bytes: Uint8Array, policy?: SanitizationPolicy): Promise<{ sanitizedBytes: Uint8Array; removedItems: string[]; preservedItems: string[] }>`
  `sanitizeMaximumSafety(bytes: Uint8Array, renderPageCallback: fn, policy?: SanitizationPolicy): Promise<{ sanitizedBytes: Uint8Array; removedItems: string[]; preservedItems: string[] }>`
  `verifySanitizedDocument(sanitizedBytes: Uint8Array, policy: SanitizationPolicy, prohibitedSourceObjects?: Set<string>): Promise<{ verified: boolean; remainingFindings: PdfSecurityFinding[]; errors: string[] }>`

- [ ] **Step 1: Write the failing test**

```javascript
// test/securitySanitizer.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib'
import { scanPdfStructure } from '../src/lib/securityScanner/scanner.js'
import { sanitizeStandard, sanitizeMaximumSafety } from '../src/lib/securityScanner/sanitizer.js'
import { verifySanitizedDocument } from '../src/lib/securityScanner/verifier.js'
import { createDefaultSanitizationPolicy } from '../src/lib/securityScanner/types.js'

test('standard sanitization strips JavaScript, OpenAction, and verifies clean output', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([400, 400])

  // Add OpenAction and JavaScript
  const jsAction = doc.context.obj({
    Type: 'Action',
    S: 'JavaScript',
    JS: PDFString.of('app.alert("Dangerous");')
  })
  const jsRef = doc.context.register(jsAction)
  doc.catalog.set(PDFName.of('OpenAction'), jsRef)

  const dirtyBytes = await doc.save()
  const policy = createDefaultSanitizationPolicy('standard')
  const { sanitizedBytes, removedItems } = await sanitizeStandard(dirtyBytes, policy)

  assert.ok(removedItems.length > 0)

  // Mandatory verification
  const verification = await verifySanitizedDocument(sanitizedBytes, policy)
  assert.equal(verification.verified, true)
  assert.equal(verification.remainingFindings.filter(f => f.severity === 'high').length, 0)

  // Verify structure
  const reScan = await scanPdfStructure(sanitizedBytes)
  assert.equal(reScan.findings.some(f => f.category === 'ActiveScripting'), false)
  assert.equal(reScan.findings.some(f => f.category === 'AutomaticExecution'), false)
})

test('maximum safety rebuilds new clean document discarding legacy objects', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([300, 500])

  const dirtyBytes = await doc.save()
  const mockRender = async (pageIndex) => ({
    width: 300,
    height: 500,
    imageBytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) // PNG magic
  })

  const policy = createDefaultSanitizationPolicy('maximum_safety')
  const { sanitizedBytes } = await sanitizeMaximumSafety(dirtyBytes, mockRender, policy)
  const reScan = await scanPdfStructure(sanitizedBytes)
  assert.equal(reScan.status, 'SCAN_COMPLETE')
  assert.equal(reScan.riskLevel, 'NONE')
  assert.equal(reScan.findings.length, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/securitySanitizer.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `src/lib/securityScanner/sanitizer.js` & `verifier.js`**

Implement:
- `sanitizeStandard`: Builds fresh PDF context with only reachable, sanitized objects, remapped references, strips prohibited capabilities, neutralizes actions and attachments.
- `sanitizeMaximumSafety`: Preflight checks, renders clean visual pages, creates fresh PDF container with zero object inheritance, enforces 100% page render success.
- `verifySanitizedDocument`: Re-scans output against policy, checks physical remnants, verifies page count and integrity.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/securitySanitizer.test.js`
Expected: PASS

---

### Task 4: Web Worker Execution Containment & Watchdog Client

**Files:**
- Create: `src/lib/workers/pdfSecurity.worker.js`
- Create: `src/lib/securityScanner/client.js`
- Test: `test/securityWorkerClient.test.js`

**Interfaces:**
- Produces:
  `scanPdfWithWorker(bytes: Uint8Array, options?: ClientOptions): Promise<ScanResult>`
  `sanitizePdfWithWorker(bytes: Uint8Array, mode: 'standard' | 'maximum', options?: SanitizeClientOptions): Promise<{ sanitizedBytes: Uint8Array; removedItems: string[]; preservedItems: string[]; verification: VerificationResult }>`
  Protocol: `{ type: 'SCAN' | 'SANITIZE' | 'CANCEL', requestId, pdfBytes, policy }`

- [ ] **Step 1: Write the failing test**

```javascript
// test/securityWorkerClient.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from '@cantoo/pdf-lib'
import { runSecurityInspectionPipeline } from '../src/lib/securityScanner/client.js'

test('runs security inspection pipeline with stage budgets and abort support', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([300, 300])
  const bytes = await doc.save()

  const result = await runSecurityInspectionPipeline(bytes, { timeoutMs: 5000 })
  assert.ok(result.status === 'SCAN_COMPLETE')
  assert.ok(Array.isArray(result.findings))
  assert.ok(Array.isArray(result.safeChecks))

  // Test AbortController cancellation
  const controller = new AbortController()
  controller.abort()
  try {
    await runSecurityInspectionPipeline(bytes, { signal: controller.signal })
    assert.fail('Should have aborted')
  } catch (err) {
    assert.equal(err.name, 'AbortError')
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/securityWorkerClient.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `src/lib/workers/pdfSecurity.worker.js` and `src/lib/securityScanner/client.js`**

Implement worker message protocol with transferable ArrayBuffers, progress heartbeats, watchdog tracking, and client worker termination/re-instantiation.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/securityWorkerClient.test.js`
Expected: PASS

---

### Task 5: Security Scanner & Sanitizer UI Workspace

**Files:**
- Create: `src/components/tools/SecurityScannerTool.jsx`
- Modify: `src/tools.jsx`
- Modify: `src/lib/router.js`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces:
  `SecurityScannerTool({ tool, initialTab, onBack })`: Unified workspace for `/pdf-security-scanner` and `/sanitize-pdf`.
  Registered in `src/tools.jsx` under `Security` group.
  Routed in `src/lib/router.js` (`/pdf-security-scanner` and `/sanitize-pdf`).

- [ ] **Step 1: Register tools in `src/tools.jsx` and routes in `src/lib/router.js`**

Add tools to `src/tools.jsx`:
- `scanner`: "PDF Security Scanner", "Inspect PDF structure for JavaScript, auto-actions, launch commands and embedded files".
- `sanitize`: "Sanitize PDF", "Remove active content, scripts, and attachments or rebuild for maximum safety".

Add route mappings in `src/lib/router.js`:
- `/pdf-security-scanner` -> `scanner`
- `/sanitize-pdf` -> `sanitize`

- [ ] **Step 2: Implement `src/components/tools/SecurityScannerTool.jsx`**

Render:
- Potential Risk gauge (`NONE DETECTED`, `LOW RISK`, `MEDIUM RISK`, `HIGH RISK`).
- Single finding cards per underlying object (no double-counting).
- Collapsible "Why this was flagged" details.
- Tri-state safe checks (`✓ Passed`, `⚠ Failed`, `? Unknown`, `ℹ Info`).
- Sanitization Mode Selector: Standard vs Maximum Safety with option checkboxes.
- Pre-sanitization digital signature and destructive-change confirmations.
- Post-sanitization summary of removed vs preserved features.
- Download button with policy-aware verification copy.

- [ ] **Step 3: Wire into `src/App.jsx`**

Render `<SecurityScannerTool tool={tool} initialTab={view === 'sanitize' ? 'sanitize' : 'scan'} onBack={goHome} />` in `toolScreen()`.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS

---

### Task 6: Website Security & Content Security Policy (CSP)

**Files:**
- Create: `public/_headers`
- Modify: `vercel.json`
- Modify: `index.html`

**Interfaces:**
- Produces:
  Authoritative production HTTP headers in `public/_headers` and `vercel.json`:
  `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security`.

- [ ] **Step 1: Add `public/_headers`**

Add Cloudflare Pages / Netlify security response headers.

- [ ] **Step 2: Update `vercel.json`**

Add Vercel security headers.

- [ ] **Step 3: Add fallback CSP meta tag in `index.html`**

Align meta tag with production policy.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS

---

### Task 7: End-to-End Acceptance Tests & Live Browser Verification

**Files:**
- Create: `test/securityE2E.test.js`
- Test: `test/securityE2E.test.js`

- [ ] **Step 1: Write comprehensive test matrix**

```javascript
// test/securityE2E.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib'
import { scanPdfStructure } from '../src/lib/securityScanner/scanner.js'
import { sanitizeStandard, sanitizeMaximumSafety } from '../src/lib/securityScanner/sanitizer.js'
import { verifySanitizedDocument } from '../src/lib/securityScanner/verifier.js'
import { createDefaultSanitizationPolicy } from '../src/lib/securityScanner/types.js'

test('E2E Matrix: Clean textbook scans with zero high-severity findings', async () => {
  const pdfPath = 'books/34. Computer Viruses, Hacking and Malware attacks for Dummies.pdf'
  if (!fs.existsSync(pdfPath)) return

  const buffer = fs.readFileSync(pdfPath)
  const result = await scanPdfStructure(new Uint8Array(buffer))

  assert.equal(result.status, 'SCAN_COMPLETE')
  assert.ok(result.safeChecks.length >= 4)
  assert.ok(result.findings.filter(f => f.severity === 'high').length === 0)
})

test('E2E Matrix: PDF with simulated malicious Launch and JS actions is detected and sanitized', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])

  // 1. Add Launch action
  const launchAction = doc.context.obj({
    Type: 'Action',
    S: 'Launch',
    F: PDFString.of('calc.exe')
  })
  page.node.set(PDFName.of('AA'), doc.context.obj({
    O: doc.context.register(launchAction)
  }))

  // 2. Add JavaScript
  const jsAction = doc.context.obj({
    Type: 'Action',
    S: 'JavaScript',
    JS: PDFString.of('this.exportDataObject({ cName: "exploit", nLaunch: 2 });')
  })
  doc.catalog.set(PDFName.of('OpenAction'), doc.context.register(jsAction))

  const dirtyBytes = await doc.save()

  // 1. Scan dirty
  const scan1 = await scanPdfStructure(dirtyBytes)
  assert.equal(scan1.riskLevel, 'HIGH')
  assert.ok(scan1.findings.some(f => f.category === 'ActiveScripting'))
  assert.ok(scan1.findings.some(f => f.category === 'AutomaticExecution'))

  // 2. Sanitize
  const policy = createDefaultSanitizationPolicy('standard')
  const { sanitizedBytes } = await sanitizeStandard(dirtyBytes, policy)

  // 3. Post-scan verification
  const verification = await verifySanitizedDocument(sanitizedBytes, policy)
  assert.equal(verification.verified, true)

  const scan2 = await scanPdfStructure(sanitizedBytes)
  assert.equal(scan2.riskLevel, 'NONE')
  assert.equal(scan2.findings.length, 0)
})
```

- [ ] **Step 2: Run all test suites**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 3: Run production build verification**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 4: Verify in live browser**

Navigate to `http://127.0.0.1:5173/pdf-security-scanner` and `http://127.0.0.1:5173/sanitize-pdf`:
- Verify tool loads with UI findings, safe checks, and sanitization controls.
- Refresh page, verify route persists.
- Test back/forward navigation.
