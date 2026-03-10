#!/bin/bash
echo "=== Line count: cdp-browser.js ==="
wc -l /Users/r/repos/svelte.skills/skills/browser/scripts/cdp-browser.js

echo ""
echo "=== Check for console.log/console.debug/TODO/FIXME/HACK ==="
grep -n 'console\.\(log\|debug\|warn\)' /Users/r/repos/svelte.skills/skills/browser/scripts/cdp-browser.js || echo "None found"
grep -n 'TODO\|FIXME\|HACK\|XXX' /Users/r/repos/svelte.skills/skills/browser/scripts/cdp-browser.js || echo "None found"

echo ""
echo "=== Check for commented-out code blocks ==="
grep -n '^\s*//.*=' /Users/r/repos/svelte.skills/skills/browser/scripts/cdp-browser.js | head -20

echo ""
echo "=== vite.sh executable? ==="
ls -la /Users/r/repos/svelte.skills/skills/_shared/scripts/vite.sh

echo ""
echo "=== vite.sh syntax check ==="
bash -n /Users/r/repos/svelte.skills/skills/_shared/scripts/vite.sh && echo "Syntax OK" || echo "Syntax error"

echo ""
echo "=== Unused imports/requires in cdp-browser.js ==="
grep -n 'require(' /Users/r/repos/svelte.skills/skills/browser/scripts/cdp-browser.js

echo ""
echo "=== Check fs usage ==="
grep -n '\bfs\.' /Users/r/repos/svelte.skills/skills/browser/scripts/cdp-browser.js
