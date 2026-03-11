---
name: coding
description: SvelteKit coding guidance with docs-first workflow. Consults official
  Svelte and SvelteKit docs before writing code. Use when writing components, implementing
  features, building pages, migrating from Svelte 4, or reviewing SvelteKit code.
  Triggers on "how do I", "implement", "build a", "create a component", "SvelteKit
  pattern", "best practice", "Svelte 5 way", "runes", "before I code", "code review",
  "coding".
allowed-tools: Read, Grep, Glob, Skill
---

# Skill: coding

**On load:** Read `../../.claude-plugin/plugin.json` from this skill's base directory. Display `coding v{version}` before proceeding.

SvelteKit coding guidance that loads official docs into your context. Search docs first, then write code using Svelte 5 patterns.

---

## Step 1: Load Lenses

Load both doc skills immediately:

```
Skill(svelte-foundations:svelte-docs)
Skill(svelte-foundations:sveltekit-docs)
```

---

## Step 2: Search Docs First

Before writing any code:

1. Identify which Svelte/SvelteKit APIs and features the task involves
2. Grep `${CLAUDE_SKILL_DIR}/../../refs/svelte-docs/` and `${CLAUDE_SKILL_DIR}/../../refs/sveltekit-docs/` for those APIs
3. Read relevant doc files (max 5 most relevant)
4. Read `${CLAUDE_SKILL_DIR}/../_shared/references/svelte5-patterns.md` for migration patterns
5. Note SSR concerns, deprecation warnings, or required patterns

For migration tasks, also read:
```
Read: ${CLAUDE_SKILL_DIR}/../_shared/references/migration-guide.md
```

---

## Step 3: Write Code

Use the docs you searched in Step 2 — correct APIs, props, and patterns.

Reference `${CLAUDE_SKILL_DIR}/../_shared/references/workflow-checklist.md` items as you go.

---

## Step 4: Verify

After implementation, suggest verification:

- `/svelte-foundations:browser` to screenshot and verify rendering
- `/svelte-foundations:a11y-audit` to check accessibility
- If errors: `/svelte-foundations:diagnose` to diagnose

---

## Common Gotchas

- `$state(array)` returns a proxy — use `$state.snapshot()` for serialization or comparison
- `$effect` runs after DOM update — use `$effect.pre()` for before-update logic
- Do not set `$state` inside `$effect` that reads it (infinite loop)
- `let { prop } = $props()` must be top-level in the script block
- Use `fail(400, { errors })` for validation errors, `throw error(500)` for unexpected errors
- Code in `+page.svelte` runs on server AND client — guard browser APIs
- Load function data must be serializable (no class instances, functions, Dates, Maps, Sets)
- `on:click|preventDefault` is gone — wrap the handler instead
- Use `{#snippet}` for template reuse within a file, `.svelte` component for cross-file reuse
- `$store` auto-subscribe still works but prefer `$state` modules (`.svelte.js`) for new code
- `flex` in CSS works differently than you'd expect with SSR — test with JS disabled
