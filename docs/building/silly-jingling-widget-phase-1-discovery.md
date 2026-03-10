# Discovery: Phase 1 - Browser Enhancements + Shared Infrastructure (v0.2.0)

## Files Found

### Files to MODIFY (all exist)
- `skills/browser/scripts/cdp-browser.js` — 550 lines, 7 modes (screenshot, dom, accessibility, click, type, navigate, evaluate)
- `skills/browser/SKILL.md` — 206 lines, 4 workflows (view, inspect-dom, inspect-ax, interact)
- `.claude/settings.local.json` — 27 lines, current permissions
- `.claude-plugin/plugin.json` — 10 lines, currently v0.1.0

### Files to CREATE (none exist yet)
- `skills/_shared/scripts/vite.sh` — new file
- `skills/_shared/references/svelte5-patterns.md` — new file
- `skills/_shared/references/sveltekit-checklist.md` — new file
- `skills/browser/references/interaction-patterns.md` — new file

### Directories to CREATE
- `skills/_shared/` (and `scripts/`, `references/` subdirs)
- `skills/browser/references/`

### Dependencies verified
- `skills/browser/scripts/browser.sh` — 165 lines, exists

## Current State

### cdp-browser.js (550 lines)
- **Architecture**: Single-file CLI tool with mode-function pattern. `parseArgs()` parses CLI flags into an `args` object, `main()` dispatches to mode functions via switch.
- **Modes**: screenshot, dom, accessibility, click, type, navigate, evaluate
- **parseArgs fields**: mode, port, output, selector, x, y, text, url, format, quality, expression
- **Click mode (lines 242-297)**: Resolves element via `DOM.querySelector`, gets box model center coordinates, dispatches 3 mouse events (mouseMoved, mousePressed, mouseReleased). Mouse dispatch is inline (not extracted to helper).
- **No shadow DOM support**: Uses `DOM.querySelector` only, which cannot pierce shadow roots.
- **No form mode**: Form interactions require separate click + type calls (the 46-tool-call problem).
- **No wait mode**: Navigate uses `Page.loadEventFired` with 30s timeout; no way to wait for SPA transitions, element appearance, or network idle.
- **Infrastructure**: `connectCDP()` is a deep module (good). `emitOutput()` handles large output routing. `resolvePort()` handles port resolution.

### SKILL.md (206 lines)
- Documents 4 workflows: view, inspect-dom, inspect-ax, interact
- Interact workflow lists available commands — needs updating with new modes
- Anti-rationalization table and context efficiency table present

### settings.local.json
- Has `Bash(*/skills/*/scripts/*)` glob — this will NOT match `skills/_shared/scripts/*` because `_shared` matches `*` in path segment. Confirmed: the glob `*/skills/*/scripts/*` would match `anything/skills/_shared/scripts/vite.sh`. So existing permission should cover `_shared` scripts.
- Wait — the plan says to add `Bash(*/skills/_shared/scripts/*)`. Let me verify: the existing `Bash(*/skills/*/scripts/*)` uses `*` which matches any single path segment, so `_shared` would match. The new permission may be redundant but adds clarity.

### plugin.json
- Currently v0.1.0, needs bump to v0.2.0

## Gaps

1. **No gaps between plan assumptions and reality for file existence** — all files to modify exist, all files to create are absent as expected.
2. **Line count matches** — plan says ~551 lines, actual is 550 lines. Trivial.
3. **Click dispatch duplication** — plan says "currently duplicated" for mouse dispatch. Actual: mouse dispatch appears only once (lines 273-291 in modeClick). The plan likely means it WILL be duplicated once form mode also needs clicking. The refactoring is still valid — extracting `dispatchClick` before adding form mode avoids future duplication.
4. **Permission glob coverage** — existing `Bash(*/skills/*/scripts/*)` likely covers `_shared` already, but the plan adds an explicit `Bash(*/skills/_shared/scripts/*)` entry for clarity. No conflict.

## Prerequisites

- [x] All files to modify exist
- [x] All files to create do not yet exist (no conflicts)
- [x] Directories to create do not yet exist
- [x] browser.sh dependency exists
- [x] cdp-browser.js architecture is well-understood (mode-function pattern, parseArgs dispatch)
- [x] Plan spec is detailed enough for implementation (shadow DOM approach, form mode actions, wait mode sub-modes all specified)
- [x] No external dependencies needed (Node 22+ native WebSocket/fetch already required)

## Recommendation

**BUILD** — All prerequisites met. No gaps that would block implementation. The plan is detailed and the existing codebase is well-structured for the additions. The main work is:

1. Add ~350 lines to cdp-browser.js (shadow DOM support, form mode, wait mode, helpers, parseArgs/printUsage updates)
2. Create 4 new files (vite.sh, 3 reference docs)
3. Update SKILL.md with new commands and workflows
4. Update settings and version
