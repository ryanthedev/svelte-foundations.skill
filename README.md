# svelte-foundations

A Claude Code plugin for Svelte and SvelteKit development. Search official docs, drive Chrome via CDP, diagnose errors, write Svelte 5 code with doc-grounded research, and audit accessibility.

## Install

From the [RTD marketplace](https://github.com/ryanthedev/rtd-claude-inn):

```bash
/plugin marketplace add ryanthedev/rtd-claude-inn
/plugin install svelte-foundations@rtd
```

Or directly from source:

```bash
claude plugin add ryanthedev/svelte-foundations.skill
```

Bundles official Svelte and SvelteKit documentation. No npm install, no build step.

## Commands

### /svelte-foundations:svelte-docs

Grep-first search across bundled Svelte documentation. Runes, template syntax, reactivity, lifecycle, components, stores, transitions, actions.

```
"How do $derived runes work?"
"What's the syntax for {#each} blocks?"
```

### /svelte-foundations:sveltekit-docs

Same approach for SvelteKit. Routing, load functions, form actions, hooks, adapters, SSR, and the full API reference.

```
"How do SvelteKit form actions work?"
"What options does the node adapter accept?"
```

### /svelte-foundations:browser

Drive Chrome/Chromium without leaving your editor. Screenshots, DOM inspection, accessibility tree dumps, click/type/navigate automation, JS evaluation, and HAR export for network diagnostics.

Uses CDP directly. No Playwright or Puppeteer dependency.

```
"Take a screenshot of localhost:5173"
"Click the login button"
"What's in the accessibility tree?"
"Run document.querySelectorAll('a') in the browser"
```

### /svelte-foundations:coding

Dispatches the coding agent, which autonomously researches Svelte and SvelteKit docs, writes Svelte 5 code, and verifies the result in the browser. Loads shared references (migration guide, workflow checklist, Svelte 5 patterns) before writing anything.

```
"Build a form with SvelteKit form actions"
"Migrate this component from Svelte 4 to 5"
```

### /svelte-foundations:diagnose

Matches Svelte and SvelteKit errors against known patterns. Checks Vite dev server health first, then cross-references docs and project config. Dispatches a browser subagent for error screenshots so they don't bloat your context.

```
"Why is my SvelteKit app crashing?"
"What does this Svelte warning mean?"
"Vite won't start"
```

### /svelte-foundations:a11y-audit

Captures the browser's accessibility tree via CDP and checks every element against a severity-rated checklist. Reports missing labels, broken focus order, contrast issues, and ARIA misuse.

```
"Audit accessibility on this page"
"Are my form labels correct for screen readers?"
```

## Shared Infrastructure

| Script | Purpose | Requires |
|--------|---------|----------|
| `browser.sh` | Chrome lifecycle (launch, status, navigate) | bash, Chrome/Chromium |
| `cdp-browser.js` | CDP client for all browser automation | Node 18+ |
| `vite.sh` | Vite dev server health check and port detection | bash, curl |

Shared references in `skills/_shared/references/` cover Svelte 5 patterns, migration guide, workflow checklist, and a SvelteKit development checklist.

## Requirements

- Claude Code
- Chrome or Chromium (for browser, diagnose, a11y-audit)
- Node 18+ (for CDP client)
- A Svelte or SvelteKit project

## Version

Current version: **0.4.0**

## License

MIT
