# Svelte 5 Migration Patterns

Quick-reference tables for Svelte 4 to Svelte 5 migration.

## Reactivity

| Svelte 4 | Svelte 5 | Notes |
|----------|----------|-------|
| `let x = 0` | `let x = $state(0)` | Mutable reactive state |
| `$: doubled = x * 2` | `let doubled = $derived(x * 2)` | Derived values |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` | Side effects |
| `export let prop` | `let { prop } = $props()` | Component props |
| `export let prop = 'default'` | `let { prop = 'default' } = $props()` | Props with defaults |
| `$$props` | `let props = $props()` | All props as object |
| `$$restProps` | `let { known, ...rest } = $props()` | Rest props via destructuring |

## Events

| Svelte 4 | Svelte 5 | Notes |
|----------|----------|-------|
| `on:click={handler}` | `onclick={handler}` | Standard DOM event attributes |
| `on:click\|preventDefault` | Wrapper function or action | No more modifiers syntax |
| `createEventDispatcher()` | Callback props: `let { onsubmit } = $props()` | Events are just props |
| `dispatch('submit', data)` | `onsubmit(data)` | Call the callback directly |
| `on:click` (forwarding) | `{...props}` or explicit prop | No implicit event forwarding |

## Slots to Snippets

| Svelte 4 | Svelte 5 | Notes |
|----------|----------|-------|
| `<slot />` | `{@render children()}` | Default slot becomes `children` prop |
| `<slot name="header" />` | `{@render header()}` | Named slots become snippet props |
| `<slot name="row" {item} />` | `{@render row(item)}` | Slot props become snippet parameters |
| `let:item` (consumer) | `{#snippet row(item)}...{/snippet}` | Define snippet at call site |
| `$$slots.header` | `header !== undefined` | Check if snippet was passed |

## Lifecycle

| Svelte 4 | Svelte 5 | Notes |
|----------|----------|-------|
| `onMount(() => {})` | `onMount(() => {})` | Unchanged |
| `onDestroy(() => {})` | `onDestroy(() => {})` | Unchanged |
| `afterUpdate(() => {})` | `$effect(() => {})` | Runs after DOM updates |
| `beforeUpdate(() => {})` | `$effect.pre(() => {})` | Runs before DOM updates |
| `tick()` | `tick()` | Unchanged |

## Stores to Runes

| Svelte 4 | Svelte 5 | Notes |
|----------|----------|-------|
| `writable(0)` | `export let count = $state(0)` in `.svelte.js` | Module-level reactive state |
| `readable(val, start)` | `$derived()` or `$state()` in `.svelte.js` | Depends on use case |
| `derived(store, fn)` | `$derived(fn())` | Derived from reactive state |
| `$store` auto-subscribe | Direct property access | No `$` prefix needed |
| `$app/stores` | `$app/state` | SvelteKit app-level state |
| `get(store)` | Direct access (already reactive) | No `get()` needed |

## Class API

| Svelte 4 | Svelte 5 | Notes |
|----------|----------|-------|
| `new Component({ target })` | `mount(Component, { target })` | Import `mount` from `svelte` |
| `new Component({ target, props })` | `mount(Component, { target, props })` | Props passed separately |
| `component.$destroy()` | `unmount(component)` | Import `unmount` from `svelte` |
| `component.$set({ prop: val })` | Direct property assignment | Components are reactive objects |
| `component.$on('event', fn)` | Pass callback in props | Events are props |
