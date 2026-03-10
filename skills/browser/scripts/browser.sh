#!/usr/bin/env bash
set -euo pipefail

# browser.sh -- Chrome lifecycle management for CDP
# Commands: ensure, status, url

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Port resolution: --port flag > CDP_PORT env > 9222
resolve_port() {
    echo "${OPT_PORT:-${CDP_PORT:-9222}}"
}

# Validate port is numeric
validate_port() {
    local port="$1"
    if [[ ! "$port" =~ ^[0-9]+$ ]]; then
        echo "Error: Port must be a number, got: $port" >&2
        exit 1
    fi
}

usage() {
    echo "Usage: browser.sh <command> [options]"
    echo ""
    echo "Commands:"
    echo "  ensure     Start Chrome with CDP if not already running"
    echo "  status     Show Chrome CDP version info (JSON)"
    echo "  url        Print the WebSocket debugger URL"
    echo ""
    echo "Options:"
    echo "  --port <PORT>    CDP port (default: \$CDP_PORT or 9222)"
    exit 1
}

cmd_ensure() {
    local port
    port=$(resolve_port)
    validate_port "$port"

    # Check if Chrome is already running with CDP on this port
    if curl -s "http://localhost:${port}/json/version" >/dev/null 2>&1; then
        echo "Chrome already running on port ${port}"
        exit 0
    fi

    # Check if Chrome is running WITHOUT the debug port
    if pgrep -f "Google Chrome" >/dev/null 2>&1; then
        echo "Chrome is running but without --remote-debugging-port." >&2
        echo "Close Chrome and retry, or use a different --port." >&2
        exit 1
    fi

    # Find Chrome binary
    local chrome_bin=""
    local -a candidates=(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
    )
    for candidate in "${candidates[@]}"; do
        if [[ -x "$candidate" ]]; then
            chrome_bin="$candidate"
            break
        fi
    done

    if [[ -z "$chrome_bin" ]]; then
        echo "Error: No Chrome/Chromium installation found." >&2
        echo "Install Google Chrome from https://www.google.com/chrome/" >&2
        exit 1
    fi

    # Launch Chrome with CDP
    "$chrome_bin" \
        --remote-debugging-port="${port}" \
        --no-first-run \
        --no-default-browser-check \
        --user-data-dir=/tmp/chrome-cdp-profile \
        &>/dev/null &

    # Poll for readiness (up to 5 seconds at 0.5s intervals)
    local elapsed=0
    while [[ $elapsed -lt 10 ]]; do
        sleep 0.5
        elapsed=$((elapsed + 1))
        if curl -s "http://localhost:${port}/json/version" >/dev/null 2>&1; then
            echo "Chrome launched on port ${port}"
            exit 0
        fi
    done

    echo "Chrome failed to start with debugging port ${port}" >&2
    exit 1
}

cmd_status() {
    local port
    port=$(resolve_port)
    validate_port "$port"

    local result
    if result=$(curl -s "http://localhost:${port}/json/version"); then
        echo "$result"
    else
        echo "Chrome is not running on port ${port}" >&2
        exit 1
    fi
}

cmd_url() {
    local port
    port=$(resolve_port)
    validate_port "$port"

    local result ws_url
    if result=$(curl -s "http://localhost:${port}/json/version"); then
        ws_url=$(echo "$result" | node -e "
            const d=[];
            process.stdin.on('data',c=>d.push(c));
            process.stdin.on('end',()=>{
                const j=JSON.parse(d.join(''));
                console.log(j.webSocketDebuggerUrl||'');
            });
        ")
        if [[ -z "$ws_url" ]]; then
            echo "Error: No webSocketDebuggerUrl in response" >&2
            exit 1
        fi
        echo "$ws_url"
    else
        echo "Chrome is not running on port ${port}" >&2
        exit 1
    fi
}

# --- Main ---

OPT_PORT=""

if [[ $# -lt 1 ]]; then
    usage
fi

# Parse global --port flag before command dispatch
args=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port) OPT_PORT="$2"; shift 2 ;;
        *)      args+=("$1"); shift ;;
    esac
done

if [[ ${#args[@]} -lt 1 ]]; then
    usage
fi

command="${args[0]}"

case "$command" in
    ensure) cmd_ensure ;;
    status) cmd_status ;;
    url)    cmd_url ;;
    *)      echo "Error: Unknown command '$command'" >&2; usage ;;
esac
