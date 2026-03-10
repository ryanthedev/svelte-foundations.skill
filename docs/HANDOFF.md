# Handoff: svelte-foundations Plugin v0.3.0

**Date:** 2026-03-10
**Branch:** `feature/expand-plugin-v0.3.0`
**Commits:** 4 (813cf0a → 854dba3)

## What Was Built

The plugin went from 3 skills / 551-line browser script to 6 skills / 1833-line browser script with 15 modes.

### Phase 1 (v0.2.0) — Browser Enhancements + Shared Infrastructure
- Shadow DOM piercing (`resolveElement` with `--pierce`)
- `form` mode (fill, select, submit, read) for web component forms
- `wait` mode (navigation, selector, idle)
- `vite.sh` dev server utility
- Shared references: svelte5-patterns.md, sveltekit-checklist.md, interaction-patterns.md

### Phase 2 (v0.3.0) — New Skills
- `sk-diagnose` — error diagnosis with 22-pattern database
- `sk-coding` — coding guidance with migration guide + workflow checklist
- `sk-a11y-audit` — accessibility auditing via browser AX tree

### Post-Plan — Advanced Browser Capabilities
- Element targeting: `--match-text`, `--visible`, `--nth` filters
- `click --all` with `--aria-expanded` filter
- New modes: `scroll`, `dismiss`, `extract`, `collect`
- Evaluate improvements: auto-IIFE, `--file`, `--json`, `--expression`, auto-injected helpers

## Test Results (Live Testing Against flightsearch-lem-svelte)

### What Works Well

| Feature | Test Result |
|---------|------------|
| `form --action fill/select` with `--pierce` | Auro combobox fill+select works reliably in 2 calls |
| `--match-text` + `--visible` | Found "Find flights" button (1 of 13 `fs-auro-button` elements) on first try |
| `scroll --by` / `scroll --to-selector` | Both work for navigating flight results |
| `wait --idle` | Reliable detection of page settle after SPA navigation |
| `click --all` | Successfully clicked all 10 price expand buttons in one call |
| `evaluate` with auto-injected `querySelectorAllDeep` | Shadow DOM walking is now a one-liner |
| Full search flow | 9 tool calls (down from original 46) |

### Known Gotchas

#### 1. `form --action submit` targets wrong element when multiple match
**Problem:** `form --action submit --selector 'fs-auro-button'` clicked the first matching button ("Continue"), not "Find flights". The page had 13 `fs-auro-button` elements, 10 invisible.
**Workaround:** Use `click` with `--match-text 'Find flights' --visible` instead of `form --action submit`.
**Fix needed:** `form --action submit` should accept `--match-text` and `--visible` filters (it already passes them to `resolveElement` but the pattern isn't documented in SKILL.md).

#### 2. `dismiss` doesn't find close buttons in shadow DOM
**Problem:** The Auro dialog's close button (X) is inside deep shadow DOM. `dismiss` searched for `button[aria-label*=close]` but only in light DOM. Escape key also didn't work (custom dialog ignores it).
**Workaround:** Click the X by coordinates (`click --x 828 --y 124`).
**Fix needed:** `dismiss` should use `querySelectorAllDeep` to search shadow DOMs for close buttons. Also consider checking the visible X/close button positions in the dialog's bounding rect corners.

#### 3. `click --all` with toggle panels can accidentally select fares
**Problem:** On the flight results page, `click --all --selector 'button' --match-text 'One way from'` expanded all fare panels, but one of the clicks landed on a fare class button instead of just the chevron. This triggered fare selection and a modal.
**Workaround:** Be more precise with selectors, or use `collect` mode which handles the click-read-close loop.
**Fix needed:** The chevron (expand/collapse) and the fare class buttons (Saver/Main/Premium/First) are both `button` elements in the same area. Need either: (a) a more specific selector for the chevron only, or (b) `click --all` should verify element identity after clicking (comparing pre/post state).

#### 4. `collect` read-selector misses shadow DOM content
**Problem:** `collect --read-selector '.fare-selector'` couldn't find the fare breakdown elements because they're inside unnamed shadow DOM containers. The `TEXT_CONTENT_DEEP_JS` helper exists but the read-selector didn't match any elements in light DOM.
**Workaround:** Use `evaluate` with custom JS to read `document.body.innerText` and parse fare data from the text.
**Fix needed:** `collect`'s read step should fall back to reading `document.body.innerText` changes (diff before/after click) when `--read-selector` matches nothing.

#### 5. `extract` returns empty strings for shadow DOM elements
**Problem:** `extract --selector 'flight-line' --pierce` returned `["","",...]` because the text lives inside shadow roots.
**Status:** Fixed in this build — `TEXT_CONTENT_DEEP_JS` now walks shadow roots for text extraction. Not re-tested after the fix.

#### 6. Variable collisions in `evaluate` (fixed)
**Problem:** Sequential `evaluate` calls sharing the page context caused `Identifier 'results' has already been declared` errors.
**Status:** Fixed — auto-IIFE wrapping now isolates each evaluation.

#### 7. `--expression` flag didn't exist for evaluate (fixed)
**Problem:** `evaluate --expression 'JS'` failed with "Unknown option". Had to use positional arg.
**Status:** Fixed — `--expression` is now an alias for the positional argument.

## Architecture Notes

- `cdp-browser.js` is a single-file CDP client with no dependencies (Node 22+ native WebSocket/fetch)
- Each mode is an `async function modeX(client, args)` — terminal (calls `process.exit`)
- `resolveElement` is the central helper: CSS selector → coordinates. Has two paths: fast DOM path and shadow DOM pierce path via `Runtime.evaluate`
- `dispatchClick` is the shared click primitive: coordinates → mouse events
- Filter flags (`--match-text`, `--visible`, `--nth`) are applied inside `resolveElement` when any filter is present, using a page-side JS function that collects all matches, filters, and returns coordinates
- Large outputs go to `/tmp` via `emitOutput` — prevents stdout from blowing up subagent context windows

## Follow-Up Items

- [ ] Fix `dismiss` shadow DOM close button detection
- [ ] Fix `collect` fallback for when read-selector matches nothing in shadow DOM
- [ ] Re-test `extract` with `TEXT_CONTENT_DEEP_JS` fix against flight-line elements
- [ ] Add `collect` recipes to interaction-patterns.md for common accordion/expandable patterns
- [ ] Document `--match-text` + `--visible` pattern in SKILL.md interact workflow (it's the primary way to target buttons now)
- [ ] Test sk-diagnose, sk-coding, sk-a11y-audit skills against live app (not yet tested)
- [ ] Bump plugin.json version if shipping these post-plan improvements
