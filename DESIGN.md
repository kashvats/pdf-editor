# Design System: Clean Swiss Editorial / Linear

<!-- impeccable:design-schema 1 -->

## Direction
A modern Swiss editorial and Linear-inspired precision workspace: high-contrast monochrome typography, architectural 1px hairline rules, purposeful whitespace, and refined emerald accents. Every tool feels like a high-precision instrument in a modern graphic design atelier.

## Palette
- **Ground / Surface:**
  - Canvas Base: `#FFFFFF`
  - Workspace Background: `#F8FAFC`
  - Subtle Surface: `#F1F5F9`
  - Dark Workspace Shell (Top Bar): `#0F172A`
  - Editor Canvas Backdrop: `#E2E8F0`
- **Ink / Typography:**
  - Primary Ink: `#0F172A` (deep carbon, never washed out)
  - Secondary Ink: `#475569` (slate, high legibility)
  - Muted Ink: `#64748B`
  - Hairline Borders: `#E2E8F0` (1px crisp dividing rules)
  - Subtle Border: `#CBD5E1`
- **Signal / Accents:**
  - Swiss Emerald Primary: `#059669` (hover: `#047857`, soft ground: `#ECFDF5`)
  - Warning / Alert: `#D97706` (ground: `#FEF3C7`)
  - Destructive / Error: `#DC2626` (ground: `#FEE2E2`)
  - Focus Ring: `2px solid rgba(5, 150, 105, 0.4)` with 2px offset

## Typography
- **Font Stack:** -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
- **Scale & Rhythm:**
  - Display / Hero: `32px` (`line-height: 1.15`, `letter-spacing: -0.03em`, `font-weight: 700`)
  - Section Headings: `18px` (`line-height: 1.25`, `letter-spacing: -0.02em`, `font-weight: 600`)
  - Tool Card Titles: `14px` (`letter-spacing: -0.01em`, `font-weight: 600`)
  - Body Text: `13.5px` (`line-height: 1.55`, `color: #475569`)
  - Micro-Labels / Tags: `10.5px` (`letter-spacing: 0.08em`, `text-transform: uppercase`, `font-weight: 700`)
  - Numeric & Metrics: `font-variant-numeric: tabular-nums`

## Spacing & Grid
- **Module Scale:** 4px, 8px, 12px, 16px, 24px, 32px, 48px
- **Containers:** Max width `1080px` for landing/catalog with responsive padding (`24px` desktop, `16px` mobile).
- **Cards & Tools:** Uniform `1px solid var(--line)` borders with subtle `4px` corner radius, zero heavy drop shadows, crisp border transitions on hover.

## Controls & Affordances
- **Primary Buttons:** High-contrast carbon (`#0F172A`) or emerald (`#059669`) with crisp typography, 6px radius, subtle active translateY(1px).
- **Secondary / Outline Buttons:** `#FFFFFF` background with `1px solid #E2E8F0` border, `#0F172A` text, hover `#F8FAFC`.
- **Ghost Buttons:** Transparent background, slate hover `#F1F5F9`.
- **Drop Area:** Clean 1.5px dashed border (`#CBD5E1`), generous 48px vertical rhythm, clear typographic hierarchy.
- **Top Status Bar:** High-contrast dark carbon `#0F172A` with emerald status badges and crisp monochrome micro-buttons.
