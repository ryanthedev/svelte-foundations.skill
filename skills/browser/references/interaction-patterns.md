# CDP Interaction Patterns

Recipes for common UI interaction patterns using cdp-browser.js.

## Combobox (Autocomplete Dropdown)

```
1. cdp-browser.js form --action fill --selector INPUT_SEL --text "search term" --clear
2. cdp-browser.js wait --selector "[role=option]" --timeout 2000
3. cdp-browser.js form --action select --selector INPUT_SEL --option "Option Text"
```

**Notes:**
- Web components may need 300-500ms for dropdown render
- Use `--clear` to replace existing field content before typing
- The select action handles open + type + wait + click internally

## Date Picker

```
1. cdp-browser.js click --selector TRIGGER_SEL           # open picker
2. cdp-browser.js wait --selector ".date-picker-panel"    # wait for panel
3. cdp-browser.js click --selector NAV_ARROW_SEL          # navigate months if needed
4. cdp-browser.js click --selector "[data-date='YYYY-MM-DD']"  # select date
```

**Notes:**
- Many date pickers use shadow DOM -- add `--pierce` to click commands
- Some pickers require clicking the input, not a separate trigger button
- Verify final state with `form --action read --selector INPUT_SEL`

## Dialog / Modal

```
1. cdp-browser.js click --selector TRIGGER_SEL            # open dialog
2. cdp-browser.js wait --selector "[role=dialog]" --timeout 3000
3. (interact with dialog contents)
4. cdp-browser.js click --selector CLOSE_SEL              # close dialog (or press Escape)
```

**Notes:**
- Focus trap -- tab key cycles within dialog
- Dialogs often have overlay/backdrop that blocks clicks outside
- Wait for dialog before interacting (animation delay)

## Tab Panel

```
1. cdp-browser.js click --selector "[role=tab][aria-controls='panel-id']"
2. cdp-browser.js wait --selector "#panel-id:not([hidden])" --timeout 1000
```

**Notes:**
- ARIA attributes identify which tab controls which panel
- `aria-selected="true"` indicates the active tab
- Panel content may load asynchronously -- use wait

## Accordion

```
1. cdp-browser.js click --selector TRIGGER_SEL            # expand section
2. cdp-browser.js wait --selector CONTENT_SEL --timeout 1000
```

**Notes:**
- Check `aria-expanded` attribute to verify state
- Some accordions close other sections on expand (single-open mode)

## Shadow DOM Tips

- Use `--pierce` flag on click and form commands when targeting web component internals
- Shadow DOM elements are not visible to standard CSS selectors
- The tool tries standard DOM first, then shadow piercing -- no performance penalty
- For deeply nested shadow DOMs (shadow root inside shadow root), the recursive query handles it
- Coordinate-based clicks are used for shadow elements (nodeId not available from CDP)
- Form mode uses `--pierce` by default -- no need to specify it explicitly
