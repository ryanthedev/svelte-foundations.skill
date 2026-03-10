---
name: svelte-docs
description: Search Svelte official documentation. Use when answering questions about Svelte components, runes, template syntax, reactivity, lifecycle, stores, styling, special elements, or compiler behavior. Triggers on "Svelte", "svelte docs", "$state", "$derived", "$effect", "$props", "runes", "svelte component", "snippet", "svelte transition".
allowed-tools: Read, Grep, Glob
---

# Skill: svelte-docs

**On load:** Read `../../.claude-plugin/plugin.json` from this skill's base directory. Display `svelte-docs v{version}` before proceeding.

Search the official Svelte documentation to answer questions accurately.

---

## Docs Location

All documentation lives at:
```
${CLAUDE_SKILL_DIR}/../../refs/svelte-docs/
```

## Workflow

1. Read `${CLAUDE_SKILL_DIR}/MANIFEST.md` to find relevant files by title and section
2. Grep the docs directory for specific terms if the manifest isn't enough
3. Read the matched files to extract the answer
4. Cite the filename when referencing documentation

## Search Strategy

| Need | Tool | Example |
|------|------|---------|
| Find which file covers a topic | Read MANIFEST.md, scan titles | "Which file covers $state?" |
| Find specific API/rune/directive | Grep docs directory | `Grep "$derived.by"` |
| Find all files mentioning a concept | Grep with glob `*.md` | `Grep "snippet" --glob "*.md"` |
| Read a known doc | Read the file directly | `Read 02-runes/02-$state.md` |

## File Structure

- Docs are organized in numbered sections: introduction, runes, template-syntax, styling, special-elements, runtime, misc, reference, legacy
- Each section has an `index.md` and numbered topic files
- `98-reference/` contains API reference for all `svelte/*` modules
- `98-reference/.generated/` contains auto-generated error/warning lists
- `99-legacy/` covers deprecated Svelte 3/4 APIs
- Files have YAML frontmatter with `title` (and sometimes `tags`)

## Tips

- Runes docs (`02-runes/`) cover `$state`, `$derived`, `$effect`, `$props`, `$bindable`, `$inspect`, `$host`
- Template syntax (`03-template-syntax/`) covers `{#if}`, `{#each}`, `{#snippet}`, `{@render}`, `{@html}`, `{@attach}`, `bind:`, `use:`, transitions, animations
- Reference docs (`98-reference/21-svelte-*.md`) contain module-level API docs for `svelte/store`, `svelte/motion`, `svelte/transition`, `svelte/reactivity`, etc.
- The `07-misc/07-v5-migration-guide.md` is essential for Svelte 4 → 5 migration questions
- Error/warning reference: `30-compiler-errors.md`, `30-runtime-errors.md` include generated content from `.generated/`
