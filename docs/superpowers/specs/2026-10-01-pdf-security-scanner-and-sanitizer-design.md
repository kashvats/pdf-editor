# PDF Security Scanner & Sanitizer Design Specification

## Executive Summary
This specification defines the architectural design for a local-first, privacy-preserving **PDF Security Scanner & Sanitizer** in EditPDF. The feature treats every uploaded PDF as untrusted input, structural-scans for active or dangerous PDF features inside a dedicated Web Worker (execution containment boundary), presents risk-ranked findings and safe checks without executing anything, and provides both **Standard Sanitization** and **Maximum Safety (Rebuild/Flatten)** modes with mandatory post-sanitization re-scanning.

The system adheres strictly to the rule:
> **Treat every uploaded PDF as untrusted input. Inspect potentially dangerous content, but never execute it.**
> Do not market this as guaranteed "virus removal" or "100% Malware Free". Wording is strictly centered on detecting and neutralizing "potentially unsafe PDF features".

---

## 1. Architecture, Worker Containment & Resource Limits

### 1.1 Worker Isolation & Execution Containment
The Web Worker is **not** an operating-system sandbox; it is an **execution-containment and fault-isolation boundary** designed to:
1. Isolate CPU-intensive parsing loops, decompression bombs, and recursion hazards from freezing the main React UI thread.
2. Provide hard termination (`worker.terminate()`) on timeout, cancellation, or memory safety limit violations.
3. Eliminate application-level attack surface: the worker receives only raw `ArrayBuffer` input and returns pure JSON-serializable `PdfSecurityFinding` arrays via `postMessage`. It does not receive application secrets, auth tokens, or private workspace data.
4. Restrict network actions: the security worker code makes zero network requests based on PDF-controlled data (no external entity resolution, no fetching of URL actions, no remote stream resolution).

```
Untrusted PDF (ArrayBuffer)
          ↓
[Dedicated Worker Pipeline: pdfSecurity.worker.js]
  ├── Preflight Limits & Quota Validation
  ├── Zero-Execution Parsing (Strictly disable Scripting, Actions, External Loading)
  ├── Recursive AST & Indirect Object Graph Traversal (Catalog, Pages, Annotations, AcroForm, Names, Outlines)
  ├── Structural Risk Detection (JS, Launch, OpenAction, AA, URI, SubmitForm, ImportData, GoToR, EmbeddedFiles, XFA)
  └── Fail-Closed Assessment (SCAN_COMPLETE | SCAN_PARTIAL | SCAN_FAILED | RESOURCE_LIMIT_EXCEEDED)
          ↓
Security Findings & Assessment (Sent to UI via postMessage)
          ↓
[Sanitization Pipeline (in Worker)]
  ├── Mode A: Standard Sanitization (Recursive structural stripping & neutralization)
  └── Mode B: Maximum Safety (Rebuilds new PDF from clean rendered page raster canvases)
          ↓
[Mandatory Post-Sanitization Verification Scan]
  ├── Verify all prohibited active features are 100% absent
  └── Block download if any prohibited features remain
```

### 1.2 Configurable Total Resource Budgets & Anti-Bomb Protection
Malicious PDFs may intentionally attempt to exhaust browser memory and CPU. The scanner enforces strict document-wide and per-object limits:
- **Maximum File Size**: 150 MB configurable upper bound (large files checked before processing; large files must complete within budget or fail gracefully without crashing/freezing the app).
- **Maximum Traversal Object Count**: 50,000 indirect objects.
- **Maximum Traversal Depth & Cycle Detection**: 24 levels deep, accompanied by `visitedRefs = new Set<string>()` to detect and break circular references immediately.
- **Decompression-Bomb Protection**:
  - Enforced *during* stream decoding: byte output counter stops decompression immediately if output exceeds:
    - Maximum decoded bytes per stream: 30 MB.
    - Maximum cumulative decoded stream bytes across document: 150 MB.
    - Expansion ratio > 100x relative to compressed chunk size.
- **Maximum Embedded File Size**: 25 MB per attachment; 60 MB total cumulative.
- **Maximum Image Dimensions & Decoded Memory**:
  - Adaptive limits: target DPI 150 (scaled to 120/96 on high pixel areas).
  - Maximum estimated decoded RGBA bitmap memory per image: calculated dynamically from `navigator.deviceMemory` (min 48 MB default, max 128 MB ceiling).
- **Stage-Aware Execution Budgets & Progress-Aware Watchdog**:
  - Structural scan budget: 15 seconds.
  - Sanitization / Maximum Safety rendering budget: 30 seconds.
  - Watchdog heartbeat: worker sends a heartbeat message every 1 second. The watchdog is progress-aware and background-tab / document visibility aware: does not blindly kill after 3 missed beats if tab is hidden/throttled or progress events are actively flowing. Only terminates if worker stops responding during active execution or hard stage budget is breached.

### 1.3 Strict Fail-Closed State Machine
The scan status distinguishes clean completions from partial or failed inspections:
```typescript
export type ScanStatus =
  | 'SCAN_IDLE'
  | 'SCANNING'
  | 'SCAN_COMPLETE'           // Fully traversed without parser error or limit breach
  | 'SCAN_PARTIAL'            // Malformed/unsupported objects encountered; cannot prove clean
  | 'SCAN_FAILED'             // Parser fatal error or unreadable structure
  | 'RESOURCE_LIMIT_EXCEEDED' // Halted due to anti-bomb/resource threshold
  | 'SANITIZING'
  | 'SANITIZED'
  | 'SANITIZATION_FAILED'     // Post-scan detected remaining active features
  | 'CANCELLED';
```
**Fail-Closed Invariant**: If a scan terminates in `SCAN_PARTIAL`, `SCAN_FAILED`, or `RESOURCE_LIMIT_EXCEEDED`, the application **never** displays "No threats detected". It displays:
> *"Security scan incomplete. Some document structures could not be fully inspected. Maximum Safety may be available if render preflight succeeds."*

---

## 2. Detection Taxonomy & Structural Traversal

### 2.1 Structured Finding Schema
```typescript
export type SecuritySeverity = 'high' | 'medium' | 'low' | 'info';

export type SecurityCategory =
  | 'ActiveScripting'
  | 'AutomaticExecution'
  | 'EmbeddedContent'
  | 'InteractiveMultimedia'
  | 'DataTransmission'
  | 'StructuralAnomaly';

export interface PdfSecurityFinding {
  id: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  title: string;
  description: string;
  pdfObjectRef?: string;
  pageIndex?: number;
  removable: boolean;
  capabilities: string[];
  triggerContext: string;
  details?: {
    actionType?: string;
    target?: string;
    filename?: string;
    filesize?: number;
    declaredMimeType?: string;
    scriptSnippet?: string;
  };
}

export interface SecuritySafeCheck {
  id: string;
  label: string;
  status: 'passed' | 'failed' | 'unknown' | 'info';
}
```

### 2.2 Context-Aware Severity & Action Taxonomy
Severity is context-aware:
- `/OpenAction` resolving to a page/view destination is classified as safe/benign (not an active threat).
- `/OpenAction` resolving to `/S /JavaScript` or `/S /Launch` is elevated to HIGH risk with both `execute_javascript` / `launch_process` and `auto_execution` capabilities in a single finding (no double counting).
- `/S /URI` with `http`/`https` is classified as `external_navigation` (LOW/INFO). Dangerous schemes (`file:`, `javascript:`, `data:`, custom schemes) are elevated to HIGH.
- Actions are inspected through a recursive `inspectAction(actionRef, triggerContext)` following `/Next` action chains.
- Explicitly recognizes: `JavaScript`, `Launch`, `URI`, `SubmitForm`, `ImportData`, `GoToR`, `GoToE`, `Rendition`, and flags unknown `/S` action types as warning/informational.
- Embedded files are searched across `/Names/EmbeddedFiles`, `FileSpec` dictionaries, `/EF`, `/AF`, `FileAttachment` annotations, and `GoToE` targets.
- Name trees (`/JavaScript`, `/EmbeddedFiles`) are traversed hierarchically with `/Kids` and `/Names` leaves bounded by depth and entry counts.
- Encrypted/password-protected PDFs handle passwords ephemerally (never persisted or logged); unsupported encryption fails safely.

---

## 3. Dual Sanitization Modes & Mandatory Re-Scanning

### 3.1 Shared Capability Model & Sanitization Policy
```typescript
export type SecurityCapability =
  | 'execute_javascript'
  | 'launch_process'
  | 'external_navigation'
  | 'form_submission'
  | 'data_import'
  | 'embedded_files'
  | 'multimedia_playback'
  | 'xfa_processing'
  | 'auto_execution';

export interface SanitizationPolicy {
  mode: 'standard' | 'maximum_safety';
  prohibitedCapabilities: Set<SecurityCapability>;
  allowedUriSchemes: Set<string>; // Standard default: https, http (mailto is explicit opt-in; Maximum Safety: none)
  removeEmbeddedFiles: boolean;
  removeMultimediaAndXfa: boolean;
  flattenForms: boolean;
  preserveSignatureAppearance: boolean;
}
```

### 3.2 Standard Sanitization (Fresh Context & Full Rewrite)
- Constructs a **fresh PDFDocument context containing only sanitized, reachable objects with remapped references**, ensuring unreferenced malicious objects and prior incremental revisions are completely omitted.
- Centralized action sanitizer neutralizes prohibited capabilities.
- Unsafe URI schemes are never normalized into HTTP/HTTPS; only explicitly allowed schemes are preserved.
- Comprehensive attachment stripping across name trees, `/AF`, `FileSpec`, `/EF`, and annotations.
- Form flattening merges valid `/AP`; missing `/AP` uses trusted rendering fallback or fails closed (no generic synthesized text).
- Digital signatures: cryptographic `/Sig` verification semantics are stripped (user warned), while visual `/AP` stamps are preserved where possible.
- Fails closed if any prohibited capability cannot be cleanly severed.

### 3.3 Maximum Safety (Clean Container Rebuild)
- Dedicated render preflight checks PDF.js responsiveness and estimated memory.
- Every single page must render successfully in the isolated worker; otherwise fails reconstruction completely (never emits truncated documents).
- Builds a brand-new PDF container with zero object inheritance.
- Policy prohibits all active/interactive capabilities (`allowedUriSchemes = none`).

### 3.4 Mandatory Post-Sanitization Validation Gate
Before download:
1. Output bytes are re-scanned in the worker.
2. Checks output against `policy.prohibitedCapabilities`.
3. Performs physical-remnant verification: confirms zero prohibited source object references or stream hashes were copied into the new document store.
4. Verifies document integrity (valid structure, matching page count, renderable pages).
5. If clean: status = `SANITIZED`, download allowed with:
   > *"Sanitization complete. No features prohibited by the selected sanitization policy were detected in the output."*
6. If any prohibited capability remains: status = `SANITIZATION_FAILED`, download strictly blocked.

---

## 4. UI/UX Design, Findings Inspector & Honest Copy

- **Unified Security Workspace**: Serves `/pdf-security-scanner` (default tab: Scan) and `/sanitize-pdf` (default tab: Sanitize) with route persistence.
- **Potential Risk Gauge**: `NONE DETECTED`, `LOW RISK`, `MEDIUM RISK`, `HIGH RISK` (not malware detection).
- **Single Finding Cards**: One card per underlying object (no double counting).
- **Collapsible "Why this was flagged"**: Capability, trigger, page, object reference, removable.
- **Tri-State Safe Checks**: `✓ Passed`, `⚠ Failed`, `? Unknown`, `ℹ Info`. Partial scans show `Unknown`.
- **Dynamic Recommendation**: Based on scan completeness, removable findings, and preflight status.
- **Explicit Disclosures**: Pre-sanitization digital signature invalidation prompt and Maximum Safety destructive-change confirmation.
- **Post-Sanitize Summary**: Displays what was removed vs preserved.
- **Untrusted String Sanitization**: All PDF-derived text rendered strictly as escaped text (zero HTML injection).
- **Accessibility**: Color-independent severity icons, keyboard navigation, ARIA live regions.

---

## 5. Website Security & Content Security Policy (CSP)

- Authoritative production HTTP response headers in `public/_headers` (Netlify/Cloudflare Pages) and `vercel.json` (Vercel).
- Strict CSP:
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:;`
- Headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security: max-age=31536000`, `Permissions-Policy`.
- Documented CSP exceptions regression tested.

---

## 6. Verification Matrix & Acceptance Criteria

1. Clean PDF: Potential Risk NONE DETECTED; safe checks passed.
2. JavaScript PDF: Detects `execute_javascript`; Standard mode neutralizes; post-scan confirms 100% absence; physical-remnant test passes.
3. OpenAction PDF: Differentiates page destination (safe) from action execution (flagged); neutralizes automatic action.
4. Launch Action: Detects `launch_process`; strips action; verifies absence.
5. Embedded Attachments: Detects attachments; lists filenames as untrusted data without executing/opening; strips attachments when policy demands.
6. External URIs: Differentiates `https`/`http` from dangerous schemes (`file:`, `javascript:`, `data:`); strips dangerous schemes; preserves clean links unless user requests removal.
7. Form Actions: Detects `/SubmitForm` and field `/AA`; neutralizes data transmission; flattens appearance cleanly.
8. RichMedia/Multimedia: Detects `/RichMedia`, `/Screen`, `/Movie`; strips multimedia.
9. Corrupted/Malformed PDF: Fails closed to `SCAN_PARTIAL` or `SCAN_FAILED`; displays: *"Security scan incomplete. Some document structures could not be fully inspected. Maximum Safety may be available if render preflight succeeds."*
10. Large PDF: Completes within configured budgets or fails gracefully without freezing/crashing.
11. Decompression/Resource Bomb: Stream expansion stops when limits exceeded; cyclic object references broken; watchdog terminates worker cleanly if unresponsive.
12. Password-Protected PDF: Reports encrypted state; does not treat inability to parse as clean; decrypts cleanly when valid ephemeral password provided.
13. Scanned/Image-Only PDF: Structurally scanned normally; requires visual fidelity.
14. Digitally Signed PDF: Warns user that sanitization invalidates signature verification while preserving visual stamp appearance.
15. Post-Sanitization Gate: Automated re-scan verifies output against policy; download allowed only on full compliance; if prohibited capability remains, download is blocked.
