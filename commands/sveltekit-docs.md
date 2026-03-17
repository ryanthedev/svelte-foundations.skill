---
description: "Use when answering questions about SvelteKit routing, load functions, form actions, adapters, hooks, deployment, SSR, SSG, SPA mode, or project structure."
---

# Skill: sveltekit-docs

**On load:** Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Display `sveltekit-docs v{version}` before proceeding.

Search the official SvelteKit documentation to answer questions accurately.

---

## Docs Location

All documentation lives at:
```
${CLAUDE_PLUGIN_ROOT}/refs/sveltekit-docs/
```

## Workflow

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/sveltekit-docs/MANIFEST.md` to find relevant files by title and section
2. Grep the docs directory for specific terms if the manifest isn't enough
3. Read the matched files to extract the answer
4. Cite the filename when referencing documentation

## Search Strategy

| Need | Tool | Example |
|------|------|---------|
| Find which file covers a topic | Read MANIFEST.md, scan titles | "Which file covers hooks?" |
| Find specific API/config/module | Grep docs directory | `Grep "prerender"` |
| Find all files mentioning a concept | Grep with glob `*.md` | `Grep "adapter" --glob "*.md"` |
| Read a known doc | Read the file directly | `Read 20-core-concepts/10-routing.md` |

## File Structure

- Docs are organized in numbered sections: getting-started, core-concepts, build-and-deploy, advanced, best-practices, appendix, reference
- Each section has an `index.md` and numbered topic files
- `98-reference/` contains API reference for `@sveltejs/kit`, `$app/*`, `$env/*`, `$lib`, `$service-worker`
- Files have YAML frontmatter with `title`

## Tips

- Core concepts (`20-core-concepts/`) cover routing, load functions, form actions, page options, state management, remote functions
- Build/deploy (`25-build-and-deploy/`) covers all adapters: auto, node, static, cloudflare, netlify, vercel
- Advanced (`30-advanced/`) covers hooks, errors, advanced routing, service workers, server-only modules, snapshots, shallow routing
- Reference docs (`98-reference/20-$app-*.md`) cover `$app/navigation`, `$app/state`, `$app/forms`, `$app/environment`, `$app/paths`
- Environment variables: `25-$env-*.md` covers static/dynamic, public/private env modules
- Configuration: `50-configuration.md` covers `svelte.config.js`
- Migration guides in `60-appendix/` cover Sapper → SvelteKit and SvelteKit v1 → v2
