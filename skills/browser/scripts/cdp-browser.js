#!/usr/bin/env node

// cdp-browser.js -- Chrome DevTools Protocol client for browser automation
// Modes: screenshot, dom, accessibility, click, type, navigate, evaluate
// Requires Node 22+ (native WebSocket, native fetch)

"use strict";

const fs = require("fs");

// -- Node version check --

const nodeMajor = parseInt(process.version.slice(1), 10);
if (nodeMajor < 22) {
    process.stderr.write(
        `cdp-browser.js requires Node 22+, found ${process.version}\n`
    );
    process.exit(1);
}

// -- Port resolution: --port flag > CDP_PORT env > 9222 --

function resolvePort(args) {
    if (args.port !== undefined) {
        return args.port;
    }
    if (process.env.CDP_PORT) {
        return parseInt(process.env.CDP_PORT, 10);
    }
    return 9222;
}

// -- Target discovery --
// Finds the best page target from Chrome's CDP endpoint.
// Prefers non-chrome:// pages over internal Chrome pages.

async function discoverPageTarget(port) {
    const url = `http://localhost:${port}/json/list`;
    const response = await fetch(url);
    const targets = await response.json();

    if (!Array.isArray(targets) || targets.length === 0) {
        throw new Error("No targets found from Chrome");
    }

    // Filter to page targets only
    const pages = targets.filter((t) => t.type === "page");
    if (pages.length === 0) {
        throw new Error("No page targets found — open a tab in Chrome first");
    }

    // Prefer a page whose URL is not an internal Chrome page
    const userPage = pages.find(
        (t) => !t.url.startsWith("chrome://") && !t.url.startsWith("devtools://")
    );
    const target = userPage || pages[0];

    const wsUrl = target.webSocketDebuggerUrl;
    if (!wsUrl) {
        throw new Error("Target missing webSocketDebuggerUrl");
    }
    return wsUrl;
}

// -- CDP client wrapper --
// Deep module: hides message ID tracking, request/response correlation,
// and JSON parse/stringify behind send(method, params) + on(event, cb).

function connectCDP(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);

        let nextId = 1;
        // Pending requests keyed by message ID, each holding {resolve, reject}
        const pending = new Map();
        // Event listeners keyed by CDP method name
        const listeners = new Map();

        ws.addEventListener("open", () => {
            resolve({
                // Send a CDP command, returns a Promise with the result
                send(method, params = {}) {
                    return new Promise((res, rej) => {
                        const id = nextId++;
                        pending.set(id, { resolve: res, reject: rej });
                        ws.send(JSON.stringify({ id, method, params }));
                    });
                },

                // Register a listener for CDP events
                on(method, callback) {
                    if (!listeners.has(method)) {
                        listeners.set(method, []);
                    }
                    listeners.get(method).push(callback);
                },

                // Close the WebSocket connection
                close() {
                    ws.close();
                },
            });
        });

        ws.addEventListener("message", (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }

            // Response to a send() call
            if (msg.id !== undefined && pending.has(msg.id)) {
                const handler = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) {
                    handler.reject(new Error(msg.error.message));
                } else {
                    handler.resolve(msg.result);
                }
                return;
            }

            // CDP event
            if (msg.method && listeners.has(msg.method)) {
                for (const cb of listeners.get(msg.method)) {
                    cb(msg.params);
                }
            }
        });

        ws.addEventListener("error", (err) => {
            for (const handler of pending.values()) {
                handler.reject(err);
            }
            pending.clear();
            reject(err);
        });

        ws.addEventListener("close", () => {
            for (const handler of pending.values()) {
                handler.reject(new Error("WebSocket closed"));
            }
            pending.clear();
        });
    });
}

// -- Adaptive output --
// Writes large output to /tmp and prints the path instead.
// Keeps stdout clean for the caller (skill subagent).

const SIZE_LIMIT_BYTES = 60 * 1024;

function emitOutput(output, prefix, extension) {
    const byteSize = Buffer.byteLength(output, "utf8");
    if (byteSize > SIZE_LIMIT_BYTES) {
        const tempPath = `/tmp/${prefix}-${Date.now()}${extension}`;
        fs.writeFileSync(tempPath, output, "utf8");
        process.stdout.write(tempPath + "\n");
    } else {
        process.stdout.write(output);
    }
}

// -- Mode: screenshot --
// Captures a JPEG screenshot (quality 80) and writes to disk.
// Default JPEG for context efficiency — matches ios-sim's compressed approach.

async function modeScreenshot(client, args) {
    const format = args.format || "jpeg";
    const quality = args.quality || 80;

    const result = await client.send("Page.captureScreenshot", {
        format,
        quality,
    });

    const buffer = Buffer.from(result.data, "base64");
    const ext = format === "png" ? ".png" : ".jpg";
    const outputPath = args.output || `/tmp/browser-screenshot-${Date.now()}${ext}`;
    fs.writeFileSync(outputPath, buffer);

    process.stdout.write(outputPath + "\n");
    client.close();
    process.exit(0);
}

// -- Mode: dom --
// Retrieves the full page HTML or a specific element's HTML by CSS selector.
// Large output (>60KB) is written to /tmp.

async function modeDom(client, args) {
    const doc = await client.send("DOM.getDocument", { depth: -1 });
    const rootNodeId = doc.root.nodeId;

    let outerHTML;
    if (args.selector) {
        const queryResult = await client.send("DOM.querySelector", {
            nodeId: rootNodeId,
            selector: args.selector,
        });
        if (queryResult.nodeId === 0) {
            process.stderr.write(`No element matches: ${args.selector}\n`);
            client.close();
            process.exit(1);
        }
        const htmlResult = await client.send("DOM.getOuterHTML", {
            nodeId: queryResult.nodeId,
        });
        outerHTML = htmlResult.outerHTML;
    } else {
        const htmlResult = await client.send("DOM.getOuterHTML", {
            nodeId: rootNodeId,
        });
        outerHTML = htmlResult.outerHTML;
    }

    emitOutput(outerHTML + "\n", "browser-dom", ".html");
    client.close();
    process.exit(0);
}

// -- Mode: accessibility --
// Retrieves the full accessibility tree as JSON.
// Large output (>60KB) is written to /tmp.

async function modeAccessibility(client, args) {
    const result = await client.send("Accessibility.getFullAXTree");
    const output = JSON.stringify(result.nodes, null, 2) + "\n";

    emitOutput(output, "browser-ax", ".json");
    client.close();
    process.exit(0);
}

// -- Mode: click --
// Clicks an element by CSS selector or explicit coordinates.
// Sequence: mouseMoved -> mousePressed -> mouseReleased (matches real browser behavior).

async function modeClick(client, args) {
    let x, y;

    if (args.selector) {
        const doc = await client.send("DOM.getDocument", { depth: 0 });
        const queryResult = await client.send("DOM.querySelector", {
            nodeId: doc.root.nodeId,
            selector: args.selector,
        });
        if (queryResult.nodeId === 0) {
            process.stderr.write(`No element matches: ${args.selector}\n`);
            client.close();
            process.exit(1);
        }
        const box = await client.send("DOM.getBoxModel", {
            nodeId: queryResult.nodeId,
        });
        // content quad is 8 values: x1,y1, x2,y2, x3,y3, x4,y4
        const quad = box.model.content;
        x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
        y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
    } else if (args.x !== undefined && args.y !== undefined) {
        x = args.x;
        y = args.y;
    } else {
        process.stderr.write("Error: click requires --selector or --x and --y\n");
        client.close();
        process.exit(1);
    }

    // mouseMoved first so the element receives hover state
    await client.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
    });
    await client.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1,
    });
    await client.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1,
    });

    const target = args.selector ? ` (selector: ${args.selector})` : "";
    process.stdout.write(`Clicked at (${x}, ${y})${target}\n`);
    client.close();
    process.exit(0);
}

// -- Mode: type --
// Types text into the currently focused element using Input.insertText.
// Handles all characters including Unicode in a single call (no per-char loop).

async function modeType(client, args) {
    if (!args.text) {
        process.stderr.write("Error: type requires --text\n");
        client.close();
        process.exit(1);
    }

    await client.send("Input.insertText", { text: args.text });

    process.stdout.write(`Typed: "${args.text}"\n`);
    client.close();
    process.exit(0);
}

// -- Mode: navigate --
// Navigates to a URL and waits for the page load event.
// Page.enable is called before listening for loadEventFired (required for event delivery).
// 30s timeout with warning (not failure) for SPAs that don't fire load events on route changes.

async function modeNavigate(client, args) {
    if (!args.url) {
        process.stderr.write("Error: navigate requires --url\n");
        client.close();
        process.exit(1);
    }

    // Enable Page domain before listening for events
    await client.send("Page.enable");

    const loadPromise = new Promise((resolve) => {
        let resolved = false;
        client.on("Page.loadEventFired", () => {
            if (!resolved) {
                resolved = true;
                resolve(true);
            }
        });
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(false);
            }
        }, 30000);
    });

    await client.send("Page.navigate", { url: args.url });
    const loaded = await loadPromise;

    if (!loaded) {
        process.stderr.write("Warning: Page load event timed out (SPA or slow page)\n");
    }

    process.stdout.write(`Navigated to ${args.url}\n`);
    client.close();
    process.exit(0);
}

// -- Mode: evaluate --
// Evaluates a JavaScript expression in the page context.
// Supports async expressions via awaitPromise.

async function modeEvaluate(client, args) {
    if (!args.expression) {
        process.stderr.write("Error: evaluate requires an expression argument\n");
        client.close();
        process.exit(1);
    }

    const result = await client.send("Runtime.evaluate", {
        expression: args.expression,
        awaitPromise: true,
        returnByValue: true,
    });

    if (result.exceptionDetails) {
        const desc =
            result.exceptionDetails.exception?.description ||
            result.exceptionDetails.text ||
            "Evaluation threw an exception";
        process.stderr.write(`Error: ${desc}\n`);
        client.close();
        process.exit(1);
    }

    process.stdout.write(JSON.stringify(result.result.value) + "\n");
    client.close();
    process.exit(0);
}

// -- Argument parsing --

function parseArgs() {
    const argv = process.argv.slice(2);
    const args = {
        mode: null,
        port: undefined,
        output: null,
        selector: null,
        x: undefined,
        y: undefined,
        text: null,
        url: null,
        format: null,
        quality: null,
        expression: null,
    };

    let i = 0;
    while (i < argv.length) {
        switch (argv[i]) {
            case "--port":
                args.port = parseInt(argv[++i], 10);
                break;
            case "--output":
                args.output = argv[++i];
                break;
            case "--selector":
                args.selector = argv[++i];
                break;
            case "--x":
                args.x = parseFloat(argv[++i]);
                break;
            case "--y":
                args.y = parseFloat(argv[++i]);
                break;
            case "--text":
                args.text = argv[++i];
                break;
            case "--url":
                args.url = argv[++i];
                break;
            case "--format":
                args.format = argv[++i];
                break;
            case "--quality":
                args.quality = parseInt(argv[++i], 10);
                break;
            default:
                if (argv[i].startsWith("-")) {
                    process.stderr.write(`Error: Unknown option '${argv[i]}'\n`);
                    process.exit(1);
                }
                // Positional: first is mode, second is expression (for evaluate)
                if (args.mode === null) {
                    args.mode = argv[i];
                } else if (args.mode === "evaluate" && args.expression === null) {
                    args.expression = argv[i];
                }
                break;
        }
        i++;
    }

    return args;
}

function printUsage() {
    process.stderr.write(
        "Usage: cdp-browser.js <mode> [options]\n" +
        "\n" +
        "Modes:\n" +
        "  screenshot                Capture page screenshot (JPEG)\n" +
        "  dom                       Get page HTML\n" +
        "  accessibility             Get accessibility tree (JSON)\n" +
        "  click                     Click element or coordinates\n" +
        "  type                      Type text into focused element\n" +
        "  navigate                  Navigate to URL\n" +
        '  evaluate "expression"     Evaluate JS in page context\n' +
        "\n" +
        "Options:\n" +
        "  --port <PORT>             CDP port (default: $CDP_PORT or 9222)\n" +
        "  --output <PATH>           Output file path (screenshot)\n" +
        "  --selector <CSS>          CSS selector (dom, click)\n" +
        "  --x <N> --y <N>           Coordinates (click)\n" +
        "  --text <TEXT>             Text to type (type)\n" +
        "  --url <URL>               URL to navigate to (navigate)\n" +
        "  --format <jpeg|png>       Screenshot format (default: jpeg)\n" +
        "  --quality <1-100>         JPEG quality (default: 80)\n"
    );
    process.exit(1);
}

// -- Main --

async function main() {
    const args = parseArgs();

    if (!args.mode) {
        printUsage();
    }

    const port = resolvePort(args);
    let wsUrl;

    try {
        wsUrl = await discoverPageTarget(port);
    } catch (err) {
        process.stderr.write(`Cannot connect to Chrome on port ${port}\n`);
        process.stderr.write("Ensure Chrome is running: browser.sh ensure\n");
        process.exit(1);
    }

    let client;
    try {
        client = await connectCDP(wsUrl);
    } catch (err) {
        process.stderr.write(`WebSocket connection failed: ${err.message}\n`);
        process.exit(1);
    }

    switch (args.mode) {
        case "screenshot":
            await modeScreenshot(client, args);
            break;
        case "dom":
            await modeDom(client, args);
            break;
        case "accessibility":
            await modeAccessibility(client, args);
            break;
        case "click":
            await modeClick(client, args);
            break;
        case "type":
            await modeType(client, args);
            break;
        case "navigate":
            await modeNavigate(client, args);
            break;
        case "evaluate":
            await modeEvaluate(client, args);
            break;
        default:
            process.stderr.write(`Error: Unknown mode '${args.mode}'\n`);
            printUsage();
    }
}

// Global unhandled rejection handler
process.on("unhandledRejection", (err) => {
    process.stderr.write(`Error: ${err.message || err}\n`);
    process.exit(1);
});

main().catch((err) => {
    process.stderr.write(`Error: ${err.message || err}\n`);
    process.exit(1);
});
