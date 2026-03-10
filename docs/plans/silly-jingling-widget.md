# Plan: Expand svelte-foundations Plugin (v0.1.0 → v0.3.0)

**Created:** 2026-03-10
**Status:** in-progress

## Context

The svelte-foundations plugin at `/Users/r/repos/svelte.skills` has 3 skills (svelte-docs, sveltekit-docs, browser) but lacks the diagnosis, coding guidance, and accessibility auditing skills that make the reference react-native-foundations plugin (at `~/repos/react-native.skill`, v0.4.0, 9 skills) so effective.

We tested the browser skill against a real SvelteKit app (`~/repos/as/flightsearch-lem-svelte`) and found:
- Browser form interaction worked but took 46 tool calls (~4 min) — too slow
- Code review found real issues: SSR state leaks, store subscription leaks, missing error pages, Svelte 4/5 migration gaps
- No shadow DOM support in cdp-browser.js (custom Auro web components use shadow DOM)

## Constraints

- New modes added to existing cdp-browser.js (not separate scripts)
- Follow exact SKILL.md format from existing skills (YAML frontmatter: name, description, allowed-tools)
- Subagent dispatch for all large data (screenshots, DOM trees, AX trees)
- Error pattern database seeded with ~22 patterns (8 from today's findings + 14 from common Vite/SvelteKit errors)
- Node 22+ requirement for cdp-browser.js (native WebSocket/fetch)

## Chosen Approach

2-phase build. Phase 1: browser enhancements + shared infrastructure. Phase 2: new skills (sk-diagnose, sk-coding, sk-a11y-audit).

---

## Implementation Checklist

### Phase 1: Browser Enhancements + Shared Infrastructure (v0.2.0)

- [ ] Add shadow DOM support to `cdp-browser.js`
- [ ] Add `form` mode to `cdp-browser.js`
- [ ] Add `wait` mode to `cdp-browser.js`
- [ ] Refactor `dispatchClick` helper and `resolveElement` helper
- [ ] Update `parseArgs` with new flags
- [ ] Update `printUsage` with new modes
- [ ] Update browser `SKILL.md` with new commands
- [ ] Create `skills/_shared/scripts/vite.sh`
- [ ] Create `skills/_shared/references/svelte5-patterns.md`
- [ ] Create `skills/_shared/references/sveltekit-checklist.md`
- [ ] Create `skills/browser/references/interaction-patterns.md`
- [ ] Update `.claude/settings.local.json` with new permissions
- [ ] Update `.claude-plugin/plugin.json` to v0.2.0

**Files:**
- MODIFY: `skills/browser/scripts/cdp-browser.js` (~551 → ~900 lines)
- MODIFY: `skills/browser/SKILL.md`
- CREATE: `skills/_shared/scripts/vite.sh`
- CREATE: `skills/_shared/references/svelte5-patterns.md`
- CREATE: `skills/_shared/references/sveltekit-checklist.md`
- CREATE: `skills/browser/references/interaction-patterns.md`
- MODIFY: `.claude/settings.local.json`
- MODIFY: `.claude-plugin/plugin.json`

**Details:**

#### cdp-browser.js — Shadow DOM Support

Add `QUERY_SELECTOR_DEEP_JS` constant — a JS function string injected via `Runtime.evaluate` that recursively walks shadow roots to find elements by CSS selector. Add `resolveElement(client, selector, { pierce })` helper that:
1. Tries standard `DOM.querySelector` first
2. If not found and `pierce=true`, falls back to `Runtime.evaluate` with `querySelectorDeep`
3. Returns `{ nodeId, method: "dom" }` or `{ coords, objectId, method: "shadow" }`

Refactor existing `modeClick` to use `resolveElement` with `pierce: true` as fallback. Extract `dispatchClick(client, x, y)` helper from click mode's mouse event dispatch (currently duplicated).

#### cdp-browser.js — `form` Mode

New mode with `--action` flag (fill|select|submit|read) and `--option`, `--clear` flags:

- **fill**: resolveElement (pierce) → click to focus → optionally Cmd+A/Backspace to clear → `Input.insertText`
- **select**: resolveElement (pierce) → click to open → type filter text → wait 500ms → find `[role=option]` matching `--option` text via querySelectorDeep → click it
- **submit**: resolveElement → click → optionally wait for navigation
- **read**: resolveElement → `Runtime.callFunctionOn` to get `.value`, `.checked`, `.selectedOptions`

#### cdp-browser.js — `wait` Mode

Three sub-modes via flags:

- **--navigation**: `Runtime.evaluate` with Promise that watches `MutationObserver` for URL change + 500ms DOM settle
- **--selector SEL**: `Runtime.evaluate` with Promise that uses `MutationObserver` to detect element appearance
- **--idle**: `Runtime.evaluate` with Promise that patches `fetch`, watches `MutationObserver`, resolves when both network and DOM are quiet for 500ms

All accept `--timeout` (default 10000ms).

#### cdp-browser.js — New parseArgs fields

```
action: null, option: null, clear: false,
navigation: false, idle: false, pierce: false, timeout: null
```

#### vite.sh

Location: `skills/_shared/scripts/vite.sh`. Pattern: `set -euo pipefail`, port resolution (`--port` > `VITE_PORT` env > `5173`).

Commands:
- `status`: curl `http://localhost:PORT/` with 2s timeout, exit 0 if HTTP response, exit 1 if not
- `env`: JSON output with `vite` (bool), `port`, `sveltekit` (check package.json deps), `adapter` (parse svelte.config.js)

#### svelte5-patterns.md

Quick-reference tables: Reactivity (let→$state, $:→$derived/$effect), Props (export let→$props), Events (on:click→onclick, createEventDispatcher→callback props), Slots→Snippets, Lifecycle, Stores→Runes.

#### sveltekit-checklist.md

Checkbox sections: SSR Safety, Load Functions, Form Actions, Environment Variables, Routing, Adapter & Deployment.

#### interaction-patterns.md

CDP interaction recipes for: Combobox, Date Picker, Dialog/Modal, Tab Panel, Accordion. Shadow DOM tips section.

---

### Phase 2: New Skills (v0.3.0)

- [ ] Create `skills/sk-diagnose/SKILL.md`
- [ ] Create `skills/sk-diagnose/references/error-patterns.md`
- [ ] Create `skills/sk-coding/SKILL.md`
- [ ] Create `skills/sk-coding/references/workflow-checklist.md`
- [ ] Create `skills/sk-coding/references/migration-guide.md`
- [ ] Create `skills/sk-a11y-audit/SKILL.md`
- [ ] Create `skills/sk-a11y-audit/references/a11y-checklist.md`
- [ ] Update `.claude/settings.local.json` with new skill permissions
- [ ] Update `.claude-plugin/plugin.json` to v0.3.0
- [ ] Update `CLAUDE.md` with new skills documentation

**Files:**
- CREATE: `skills/sk-diagnose/SKILL.md`
- CREATE: `skills/sk-diagnose/references/error-patterns.md`
- CREATE: `skills/sk-coding/SKILL.md`
- CREATE: `skills/sk-coding/references/workflow-checklist.md`
- CREATE: `skills/sk-coding/references/migration-guide.md`
- CREATE: `skills/sk-a11y-audit/SKILL.md`
- CREATE: `skills/sk-a11y-audit/references/a11y-checklist.md`
- MODIFY: `.claude/settings.local.json`
- MODIFY: `.claude-plugin/plugin.json`
- MODIFY: `CLAUDE.md`

**Details:**

#### sk-diagnose

YAML frontmatter: `name: sk-diagnose`, `allowed-tools: Bash, Read, Grep, Glob, Agent`

Workflow: Step 0 (vite.sh health check) → Step 1 (obtain error text — parse or capture via browser subagent) → Step 2 (pattern match against error-patterns.md) → Step 3 (doc search via subagent) → Step 4 (config check — read svelte.config.js, vite.config.ts, package.json, tsconfig.json) → Step 5 (present diagnosis: Error/Root Cause/Fix/Doc Reference/Verify)

Dependencies: `_shared` (vite.sh), `browser` (optional error capture), `refs/svelte-docs`, `refs/sveltekit-docs`

Context efficiency: vite health (80 chars, main), error pattern DB (5KB, main), screenshots (50-300KB, NEVER main), doc search (2-10KB, subagent), config files (1-3KB each, main), final diagnosis (200-500 chars, main)

#### error-patterns.md

~22 patterns organized by category:
- **Compiler Errors** (1-4): wrong $types import, createEventDispatcher in Svelte 5, mixed Svelte 4/5 syntax, prerender failure
- **SSR/Hydration** (5-7): SSR state leak, hydration mismatch, store/subscribe leak
- **Vite/Build** (8-12): HMR disconnected, circular dependency, CSS preprocessor, missing dep optimization, TS config
- **Routing/Adapter** (13-17): redirect without base path, missing +error.svelte, missing +layout, adapter config, stale adapter types
- **Environment/Security** (18-19): env var exposure, CORS/proxy errors
- **Runtime** (20-22): effect/derived infinite loop, hook execution order, component not a constructor

Each pattern: `### N. Name` / `**Match:**` (substrings) / `**Cause:**` (1-2 sentences) / `**Fix:**` (code block)

#### sk-coding

YAML frontmatter: `name: sk-coding`, `allowed-tools: Read, Grep, Glob`

Workflow: Before (identify APIs → grep docs → read files → check svelte5-patterns.md) → While (use runes, correct file conventions, SSR safety, project patterns) → After (suggest sk-a11y-audit, browser screenshot, sk-diagnose if errors)

Anti-rationalization table for skipping doc checks.

#### workflow-checklist.md

Three sections with checkboxes: Before You Code (7 items), While Coding (9 items), After Coding (5 items), Common Gotchas (10 items covering $state proxy behavior, $effect timing, form actions, SSR boundaries).

#### migration-guide.md

Side-by-side code examples for: reactive declarations → runes, props (export let → $props), events (createEventDispatcher → callback props, on:click → onclick), slots → snippets ({@render children()}), lifecycle (afterUpdate → $effect), stores → $state modules, $app/stores → $app/state, class API → mount().

#### sk-a11y-audit

YAML frontmatter: `name: sk-a11y-audit`, `allowed-tools: Bash, Read, Grep, Agent`

Workflow: Step 1 (dispatch subagent to capture AX tree via `cdp-browser.js accessibility` + check against a11y-checklist.md) → Step 2 (optional: dispatch subagent to inspect DOM ARIA attributes and compare against AX tree) → Step 3 (grep docs for accessibility best practices) → Step 4 (present report with severity levels: Critical/Warning/Info)

#### a11y-checklist.md

Sections: Required Attributes by Element Type (button, link, input, image, form, navigation, heading), Minimum Touch Target Sizes (48x48 mobile, 44x44 desktop), Valid ARIA Role Values, Common Anti-Patterns with BAD/GOOD code examples (Svelte-specific: component ARIA forwarding, use: actions for focus management, form label binding).

#### Settings & Config Updates

Add to `.claude/settings.local.json` allow array:
```
"Skill(svelte-foundations:sk-diagnose)"
"Skill(svelte-foundations:sk-coding)"
"Skill(svelte-foundations:sk-a11y-audit)"
"Bash(*/skills/_shared/scripts/*)"
```

Update `CLAUDE.md` repository structure section to include new skills and _shared directory.

---

## Test Coverage

**Level:** Per-phase manual testing against running SvelteKit app

## Test Plan

### Phase 1 Tests
- [ ] `cdp-browser.js form --action fill --selector '#fromCity' --text 'SEA'` — fills airport field in Alaska Airlines app
- [ ] `cdp-browser.js form --action select --selector '#fromCity' --option 'Seattle'` — selects from combobox suggestions
- [ ] `cdp-browser.js wait --navigation --timeout 10` — detects SvelteKit route transition after form submit
- [ ] `cdp-browser.js wait --selector '.results' --timeout 5` — waits for results to render
- [ ] `vite.sh status --port 5000` — detects running dev server
- [ ] `vite.sh env` — returns JSON with SvelteKit project info
- [ ] Full flight search flow: navigate → fill from → fill to → select dates → submit → wait → screenshot — should take ~8 tool calls (down from 46)

### Phase 2 Tests
- [ ] Trigger sk-diagnose with "diagnose this error: Cannot find module './$types'" — matches pattern 1
- [ ] Trigger sk-diagnose against the real SSR state leak in `~/repos/as/flightsearch-lem-svelte` — matches pattern 5
- [ ] Trigger sk-coding before writing a new SvelteKit component — verifies doc search workflow
- [ ] Trigger sk-a11y-audit against `http://localhost:5000/search` — produces accessibility report

## Notes

- cdp-browser.js `form --action select` needs 300-500ms delay after typing for combobox suggestions to render — this is inherent to web component behavior
- `wait --navigation` uses MutationObserver + URL change detection since SvelteKit SPA transitions don't fire `Page.loadEventFired`
- Shadow DOM piercing via `Runtime.evaluate` returns coordinates (not nodeId), so `dispatchClick` helper is needed for coordinate-based clicks
- The `resolveElement` helper should always try standard `DOM.querySelector` first for performance, falling back to shadow piercing only when needed
- vite.sh default port is 5173 but the test app uses 5000 — always allow --port override
- Error patterns in sk-diagnose are substring matches, not regex — keeps pattern matching simple and fast

## Execution Log
_Filled during /code-foundations:building_
