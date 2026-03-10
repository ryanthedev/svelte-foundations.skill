# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Claude Code plugin (`svelte-foundations`) that provides documentation search and browser automation skills:
- **svelte-docs** — searches official Svelte documentation
- **sveltekit-docs** — searches official SvelteKit documentation
- **browser** — controls Chrome/Chromium via CDP for screenshots, DOM inspection, accessibility trees, click/type/navigate, and JS evaluation

## Repository Structure

```
.claude-plugin/plugin.json   — Plugin metadata (name, version, description)
.claude/settings.local.json  — Permission allowlist for the skills
skills/
  svelte-docs/SKILL.md       — Skill definition (trigger words, workflow, search strategy)
  svelte-docs/MANIFEST.md    — Index of all Svelte doc files by section and title
  sveltekit-docs/SKILL.md    — Skill definition for SvelteKit
  sveltekit-docs/MANIFEST.md — Index of all SvelteKit doc files by section and title
  browser/SKILL.md           — Browser automation skill (CDP-based)
  browser/scripts/browser.sh — Chrome lifecycle management (ensure, status, url)
  browser/scripts/cdp-browser.js — CDP client (screenshot, dom, accessibility, click, type, navigate, evaluate)
refs/
  svelte-docs/               — Local copy of Svelte docs (markdown, organized by numbered sections)
  sveltekit-docs/            — Local copy of SvelteKit docs (markdown, organized by numbered sections)
```

## How the Skills Work

Each skill (defined in `SKILL.md`) follows the same pattern:
1. Read `MANIFEST.md` to locate relevant files by title/section
2. Grep the docs directory for specific terms if needed
3. Read matched files and cite the filename

Doc skills are restricted to `Read`, `Grep`, and `Glob` tools. The browser skill uses `Bash`, `Read`, and `Agent` (set in `.claude/settings.local.json`).

## Key Conventions

- MANIFEST.md files are the primary index — they map filenames to titles for each doc section. Keep these in sync when docs are updated.
- Doc files use YAML frontmatter with `title` (and sometimes `tags`).
- Svelte docs sections: introduction, runes, template-syntax, styling, special-elements, runtime, misc, reference, legacy.
- SvelteKit docs sections: getting-started, core-concepts, build-and-deploy, advanced, best-practices, appendix, reference.
- `98-reference/` in both doc sets contains API reference. Svelte's has a `.generated/` subdirectory for auto-generated error/warning lists.
- `99-legacy/` (Svelte only) covers deprecated Svelte 3/4 APIs.

## Updating Docs

When refreshing documentation from upstream, regenerate the corresponding MANIFEST.md to reflect any added/removed/renamed files.
