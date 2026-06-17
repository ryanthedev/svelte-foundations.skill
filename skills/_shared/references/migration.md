# Svelte 4 → 5 migration

For migrating existing Svelte 4 code to Svelte 5 runes. New code should just use Svelte 5
directly (see `modern-svelte.md` and `pre-ship-checklist.md`). Quick-reference tables first,
then side-by-side examples.

## Contents

- Quick reference: reactivity, events, slots → snippets, lifecycle, stores → runes, component API
- Side-by-side examples: reactive declarations, events, slots → snippets, stores, class API → `mount`

## Quick reference

### Reactivity

| Svelte 4 | Svelte 5 |
|----------|----------|
| `let x = 0` (reactive) | `let x = $state(0)` |
| `$: doubled = x * 2` | `let doubled = $derived(x * 2)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` — but prefer `$derived` for values |
| `export let prop` | `let { prop } = $props()` |
| `export let prop = 'default'` | `let { prop = 'default' } = $props()` |
| `$$props` / `$$restProps` | `let props = $props()` / `let { known, ...rest } = $props()` |

### Events

| Svelte 4 | Svelte 5 |
|----------|----------|
| `on:click={handler}` | `onclick={handler}` |
| `on:click\|preventDefault` | wrap the handler (no modifier syntax) |
| `createEventDispatcher()` / `dispatch('x', d)` | callback props: `let { onx } = $props()` / `onx(d)` |

### Slots → snippets

| Svelte 4 | Svelte 5 |
|----------|----------|
| `<slot />` | `{@render children()}` (default slot → `children` prop) |
| `<slot name="header" />` | `{@render header()}` |
| `<slot name="row" {item} />` | `{@render row(item)}` |
| `let:item` (consumer) | `{#snippet row(item)}...{/snippet}` |
| `$$slots.header` | `header !== undefined` |

### Lifecycle

| Svelte 4 | Svelte 5 |
|----------|----------|
| `onMount` / `onDestroy` / `tick` | unchanged |
| `afterUpdate(fn)` | `$effect(fn)` |
| `beforeUpdate(fn)` | `$effect.pre(fn)` |

### Stores → runes

| Svelte 4 | Svelte 5 |
|----------|----------|
| `writable(0)` in `store.js` | `$state` in `state.svelte.js` (export an object/class, not a reassigned `let`) |
| `derived(store, fn)` | `$derived(fn())` |
| `$store` auto-subscribe | direct property access (no `$`) |
| `$app/stores` (`$page`) | `$app/state` (`page`) |
| `get(store)` | direct access |

### Component API

| Svelte 4 | Svelte 5 |
|----------|----------|
| `new Component({ target, props })` | `mount(Component, { target, props })` |
| `component.$destroy()` | `unmount(component)` |
| `component.$set({ prop })` | direct property assignment |
| `component.$on('event', fn)` | callback prop |

---

## Side-by-side examples

### Reactive declarations

```svelte
<!-- Svelte 4 -->
<script>
  let count = 0;
  $: doubled = count * 2;
  $: { console.log('count changed:', count) }
</script>

<!-- Svelte 5 -->
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  $effect(() => { console.log('count changed:', count) });
</script>
```

### Events (dispatcher → callback props)

```svelte
<!-- Svelte 4 -->
<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>
<button on:click={() => dispatch('submit', data)}>Submit</button>

<!-- Svelte 5 -->
<script>
  let { onsubmit } = $props();
</script>
<button onclick={() => onsubmit(data)}>Submit</button>
```

### Slots → snippets

```svelte
<!-- Svelte 4 Card.svelte -->
<div class="card">
  <slot name="header" />
  <slot />
</div>

<!-- Svelte 5 Card.svelte -->
<script>
  let { header, children } = $props();
</script>
<div class="card">
  {@render header?.()}
  {@render children?.()}
</div>
```

```svelte
<!-- Svelte 5 consumer -->
<Card>
  {#snippet header()}<h2>Title</h2>{/snippet}
  <p>Content</p>
</Card>
```

### Stores → `$state` modules

```js
// Svelte 4 stores.js
import { writable, derived } from 'svelte/store';
export const count = writable(0);
export const doubled = derived(count, $c => $c * 2);
```

```js
// Svelte 5 counter.svelte.js — export an object so reactivity survives the import
export const counter = $state({ count: 0 });
// derive at the use site, or expose a getter
```

`$store` auto-subscribe still works for existing stores, but don't mix `$store` syntax and
runes in the same `.svelte.js` file. File extension must be `.svelte.js`/`.svelte.ts` for
runes to compile.

### Class API → `mount`

```js
// Svelte 4
import App from './App.svelte';
const app = new App({ target: document.body, props: { name: 'world' } });
app.$destroy();

// Svelte 5
import { mount, unmount } from 'svelte';
import App from './App.svelte';
const app = mount(App, { target: document.body, props: { name: 'world' } });
unmount(app);
```

For exhaustive migration detail see the bundled doc `svelte-docs/07-misc/07-v5-migration-guide.md`.
