# Accessibility Audit Checklist

## Required Attributes by Element Type

### Button
- Must have accessible name (text content, `aria-label`, or `aria-labelledby`)
- If icon-only, must have `aria-label`
- Must be focusable (not `tabindex="-1"` unless intentionally removed from tab order)

### Link
- Must have accessible name (text content or `aria-label`)
- Must have valid `href` (not `"#"` or `"javascript:void(0)"`)
- Must be distinguishable from surrounding text (not just color)

### Input
- Must have associated label (`for`/`id` match, `aria-label`, or `aria-labelledby`)
- Required fields must have `aria-required="true"` or `required` attribute
- Error states must have `aria-invalid="true"` and `aria-describedby` pointing to error message

### Image
- Must have `alt` attribute
- Decorative images: `alt=""` (empty, not missing)
- Informative images: `alt` describes the content or function
- Complex images: `aria-describedby` pointing to longer description

### Form
- Must have accessible name (`aria-label`, `aria-labelledby`, or `<legend>` in `<fieldset>`)
- Related fields should be grouped in `<fieldset>` with `<legend>`
- Submit button must have clear label

### Navigation
- Must have `aria-label` if multiple `nav` elements on page
- Current page link should have `aria-current="page"`

### Heading
- Must follow logical hierarchy (no skipping h1 to h3)
- Page should have exactly one `h1`
- Headings should describe the section content

## Minimum Touch Target Sizes

| Context | Minimum Size | Source |
|---------|-------------|--------|
| Mobile | 48x48 CSS pixels | WCAG 2.5.8 (AA) |
| Desktop | 44x44 CSS pixels | WCAG 2.5.5 (AAA) / recommended |
| Inline text links | Exempt | WCAG exception for inline links |

## Valid ARIA Role Values

### Landmark roles
`main`, `navigation`, `banner`, `contentinfo`, `complementary`, `search`, `form`, `region`

### Widget roles
`button`, `checkbox`, `dialog`, `link`, `menuitem`, `option`, `radio`, `slider`, `switch`, `tab`, `tabpanel`, `textbox`, `combobox`, `listbox`, `menu`, `menubar`, `tree`, `treeitem`, `grid`, `gridcell`, `row`, `rowgroup`, `columnheader`, `rowheader`

### Document structure roles
`article`, `cell`, `definition`, `directory`, `document`, `feed`, `figure`, `group`, `heading`, `img`, `list`, `listitem`, `math`, `note`, `presentation`, `separator`, `table`, `term`, `toolbar`

## Common Anti-Patterns

### BAD: Click handler on div
```svelte
<div on:click={handler}>Click me</div>
```

### GOOD: Use semantic button
```svelte
<button onclick={handler}>Click me</button>
```

### BAD: Placeholder as label
```svelte
<input placeholder="Email" />
```

### GOOD: Visible label
```svelte
<label for="email">Email</label>
<input id="email" type="email" />
```

### BAD: aria-hidden on focusable element
```svelte
<button aria-hidden="true">Hidden but focusable</button>
```

### GOOD: Remove from focus order too
```svelte
<button aria-hidden="true" tabindex="-1">Properly hidden</button>
```

### Svelte-specific: Component ARIA forwarding

**BAD:** Component swallows ARIA attributes
```svelte
<CustomButton>Submit</CustomButton>
<!-- CustomButton does not spread rest props to native button -->
```

**GOOD:** Spread rest props to forward ARIA
```svelte
<script>
  let { children, ...rest } = $props();
</script>
<button {...rest}>{@render children()}</button>
```

### Svelte-specific: Focus management with use: action

Action for focus trapping in modals:
```svelte
<div use:trapFocus>
  <!-- dialog content -->
</div>
```

### Svelte-specific: Form label binding

Use `bind:this` and `for`/`id` for dynamic label association:
```svelte
<script>
  let input = $state();
  let id = $props().id ?? 'field-' + Math.random().toString(36).slice(2);
</script>
<label for={id}>{label}</label>
<input {id} bind:this={input} />
```
