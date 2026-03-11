# Svelte 4 to Svelte 5 Migration Guide

Side-by-side code examples for each migration area.

---

## Reactive Declarations to Runes

### Svelte 4
```svelte
<script>
  let count = 0;
  $: doubled = count * 2;
  $: { console.log('count changed:', count) }
</script>
```

### Svelte 5
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  $effect(() => { console.log('count changed:', count) });
</script>
```

**Notes:** `$state()` wraps the initial value. `$derived()` replaces `$:` for computed values. `$effect()` replaces `$: {}` blocks for side effects.

---

## Props

### Svelte 4
```svelte
<script>
  export let name;
  export let count = 0;
</script>
```

### Svelte 5
```svelte
<script>
  let { name, count = 0 } = $props();
</script>
```

**Notes:** All props via a single `$props()` call. Defaults via JS destructuring defaults. Rest props: `let { name, ...rest } = $props()`.

---

## Events

### Svelte 4
```svelte
<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>
<button on:click={() => dispatch('submit', data)}>Submit</button>
```

### Svelte 5
```svelte
<script>
  let { onsubmit } = $props();
</script>
<button onclick={() => onsubmit(data)}>Submit</button>
```

**Notes:** Events are callback props. `on:click` becomes `onclick`. Event forwarding: pass the callback through with `{...props}` or as an explicit prop.

---

## Slots to Snippets

### Svelte 4
```svelte
<!-- Parent -->
<Card>
  <h2 slot="header">Title</h2>
  <p>Content</p>
</Card>

<!-- Card.svelte -->
<div class="card">
  <slot name="header" />
  <slot />
</div>
```

### Svelte 5
```svelte
<!-- Parent -->
<Card>
  {#snippet header()}
    <h2>Title</h2>
  {/snippet}
  <p>Content</p>
</Card>

<!-- Card.svelte -->
<script>
  let { header, children } = $props();
</script>
<div class="card">
  {@render header?.()}
  {@render children?.()}
</div>
```

**Notes:** Default slot content becomes the `children` prop. Named slots become snippet props. Use optional chaining (`?.`) for optional snippets.

---

## Lifecycle

### Svelte 4
```svelte
<script>
  import { afterUpdate, beforeUpdate } from 'svelte';
  afterUpdate(() => { scrollToBottom() });
  beforeUpdate(() => { saveScrollPos() });
</script>
```

### Svelte 5
```svelte
<script>
  $effect(() => { scrollToBottom() });
  $effect.pre(() => { saveScrollPos() });
</script>
```

**Notes:** `onMount` and `onDestroy` are unchanged. `afterUpdate` becomes `$effect`. `beforeUpdate` becomes `$effect.pre`. `tick()` is unchanged.

---

## Stores to $state Modules

### Svelte 4
```js
// stores.js
import { writable, derived } from 'svelte/store';
export const count = writable(0);
export const doubled = derived(count, $c => $c * 2);
```

```svelte
<!-- Component.svelte -->
<script>
  import { count, doubled } from './stores.js';
</script>
<p>{$count} x 2 = {$doubled}</p>
```

### Svelte 5
```js
// state.svelte.js
export let count = $state(0);
export let doubled = $derived(count * 2);
```

```svelte
<!-- Component.svelte -->
<script>
  import { count, doubled } from './state.svelte.js';
</script>
<p>{count} x 2 = {doubled}</p>
```

**Notes:** File extension must be `.svelte.js` (or `.svelte.ts`). No `$` prefix in the template. Import directly -- no auto-subscribe needed.

---

## $app/stores to $app/state

### Svelte 4
```svelte
<script>
  import { page } from '$app/stores';
</script>
<p>{$page.url.pathname}</p>
```

### Svelte 5
```svelte
<script>
  import { page } from '$app/state';
</script>
<p>{page.url.pathname}</p>
```

**Notes:** No `$` prefix. `page` is a reactive object, not a store. Also available: `navigating`, `updated`.

---

## Class API to mount()

### Svelte 4
```js
import App from './App.svelte';
const app = new App({
  target: document.getElementById('app'),
  props: { name: 'world' }
});
app.$destroy();
```

### Svelte 5
```js
import { mount, unmount } from 'svelte';
import App from './App.svelte';
const app = mount(App, {
  target: document.getElementById('app'),
  props: { name: 'world' }
});
unmount(app);
```

**Notes:** `mount()` and `unmount()` imported from `'svelte'`. No more `$set`, `$on`, or `$destroy` methods.
