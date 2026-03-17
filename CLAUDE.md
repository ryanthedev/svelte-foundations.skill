# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Claude Code plugin (`svelte-foundations`) that provides documentation search and browser automation commands:
- **svelte-docs** — searches official Svelte documentation
- **sveltekit-docs** — searches official SvelteKit documentation
- **browser** — controls Chrome/Chromium via CDP for screenshots, DOM inspection, accessibility trees, click/type/navigate, and JS evaluation
- **diagnose** — diagnoses SvelteKit/Svelte errors using pattern matching and docs
- **coding** — docs-first coding guidance, loads svelte-docs + sveltekit-docs
- **coding-agent** — autonomous agent that loads docs, diagnose, and browser for hands-off implementation
- **a11y-audit** — audits page accessibility via browser AX tree inspection

## Repository Structure

```
.claude-plugin/plugin.json   — Plugin metadata (name, version, description)
.claude/settings.local.json  — Permission allowlist
agents/
  coding-agent.md            — Autonomous coding agent (loads docs, diagnose, browser)
commands/                    — Slash commands (auto-discovered, user-invocable)
  svelte-docs.md             — Svelte docs search
  sveltekit-docs.md          — SvelteKit docs search
  browser.md                 — Browser automation via CDP
  diagnose.md                — Error diagnosis
  coding.md                  — Docs-first coding guidance
  a11y-audit.md              — Accessibility audit
skills/                      — Supporting files only (NO SKILL.md)
  svelte-docs/MANIFEST.md    — Index of all Svelte doc files by section and title
  sveltekit-docs/MANIFEST.md — Index of all SvelteKit doc files by section and title
  browser/scripts/browser.sh — Chrome lifecycle management (ensure, status, url)
  browser/scripts/cdp-browser.js — CDP client (screenshot, dom, accessibility, click, type, navigate, evaluate)
  _shared/scripts/vite.sh        — Vite dev server health check and environment detection
  _shared/references/            — Shared reference files (svelte5-patterns.md, sveltekit-checklist.md, workflow-checklist.md, migration-guide.md)
  diagnose/references/           — Error pattern database
  a11y-audit/references/         — A11y checklist
refs/
  svelte-docs/               — Local copy of Svelte docs (markdown, organized by numbered sections)
  sveltekit-docs/            — Local copy of SvelteKit docs (markdown, organized by numbered sections)
```

## How It Works

Commands live as flat `.md` files in `commands/` — these are auto-discovered and user-invocable as slash commands. Supporting files (references, scripts, manifests) live under `skills/{command-name}/`. There are no SKILL.md files; the command file is the single source of truth for each command's content, triggers, and `allowed-tools`.

Each doc command follows the same pattern:
1. Read `MANIFEST.md` to locate relevant files by title/section
2. Grep the docs directory for specific terms if needed
3. Read matched files and cite the filename

Doc commands are restricted to `Read`, `Grep`, and `Glob` tools. The browser command uses `Bash`, `Read`, and `Agent`. Agents are defined in `agents/` as `.md` files with `name` and `description` frontmatter.

Commands reference supporting files via `${CLAUDE_PLUGIN_ROOT}/skills/<name>/...`.

## Key Conventions

- MANIFEST.md files are the primary index — they map filenames to titles for each doc section. Keep these in sync when docs are updated.
- Doc files use YAML frontmatter with `title` (and sometimes `tags`).
- Svelte docs sections: introduction, runes, template-syntax, styling, special-elements, runtime, misc, reference, legacy.
- SvelteKit docs sections: getting-started, core-concepts, build-and-deploy, advanced, best-practices, appendix, reference.
- `98-reference/` in both doc sets contains API reference. Svelte's has a `.generated/` subdirectory for auto-generated error/warning lists.
- `99-legacy/` (Svelte only) covers deprecated Svelte 3/4 APIs.

## Updating Docs

When refreshing documentation from upstream, regenerate the corresponding MANIFEST.md to reflect any added/removed/renamed files.
