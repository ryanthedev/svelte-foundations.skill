# SvelteKit Coding Workflow Checklist

## Before You Code

- [ ] Identified which SvelteKit APIs the task uses (load, actions, hooks, etc.)
- [ ] Searched docs for current API signatures
- [ ] Checked svelte5-patterns.md for migration gotchas
- [ ] Verified file naming convention (+page.svelte, +page.ts, +page.server.ts, +layout, +error)
- [ ] Checked if similar component/pattern exists in project (grep)
- [ ] Identified SSR-sensitive code paths (browser APIs, window, document)
- [ ] Read relevant section of sveltekit-checklist.md

## While Coding

- [ ] Using `$state()` for reactive declarations (not `let x = 0`)
- [ ] Using `$derived()` for computed values (not `$:`)
- [ ] Using `$effect()` for side effects (not `$: { }`)
- [ ] Using `$props()` for component props (not `export let`)
- [ ] Using `onclick={}` for events (not `on:click={}`)
- [ ] Using `{@render children()}` for content slots (not `<slot />`)
- [ ] Browser APIs guarded with `onMount` or `$effect` or `browser` check
- [ ] Form actions using `use:enhance` for progressive enhancement
- [ ] Error handling with SvelteKit `error()` and `fail()` helpers

## After Coding

- [ ] Component renders without JS disabled (SSR check)
- [ ] No TypeScript errors (`npx svelte-check`)
- [ ] Accessibility: labels on inputs, alt on images, semantic HTML
- [ ] Error states handled (loading, error, empty)
- [ ] Consider running `/svelte-foundations:a11y-audit` for accessibility review

## Common Gotchas

1. **$state proxy behavior**: `$state(array)` returns a proxy. Use `$state.snapshot()` to get a plain value for serialization or comparison.

2. **$effect timing**: `$effect` runs after DOM update. Use `$effect.pre()` for before-update logic. Do not set `$state` inside `$effect` that reads it (infinite loop).

3. **Form actions return**: Use `fail(400, { errors })` for validation errors. `throw error(500)` is for unexpected errors. Return data for success.

4. **SSR boundaries**: Code in `+page.svelte` runs on server AND client. Code in `+page.server.ts` runs server only. Code in `onMount`/`$effect` runs client only.

5. **$props destructuring**: `let { prop } = $props()` must be top-level in the script block. Cannot conditionally destructure or re-assign the props object.

6. **Snippet vs component**: Use `{#snippet}` for template reuse within a file. Use a `.svelte` component for reuse across files.

7. **$derived vs $derived.by**: Use `$derived(expr)` for simple expressions. Use `$derived.by(() => { complex logic })` for multi-line computations.

8. **Load function data**: Data from `load()` must be serializable. No class instances, functions, Dates, Maps, or Sets. Use plain objects.

9. **Store migration**: `$store` auto-subscribe syntax still works, but prefer `$state` modules (`.svelte.js`) for new code. Do not mix both in the same file.

10. **Event modifier removal**: `on:click|preventDefault` is gone. Wrap the handler instead:
    ```svelte
    <button onclick={(e) => { e.preventDefault(); handle(e) }}>
    ```
