#!/usr/bin/env bash
# setup-node.sh — install a bundled Node.js LTS runtime for Maru skills.
#
# Used by the md2docx skill (docx-js) and any skill needing a known-good Node
# runtime independent of the host's fnm/nvm/system node. The bundled `docx`
# package lives at <env>/node_modules; this provides the interpreter to run it.
# Strategy:
#   1. If <target>/node/bin/node already has the desired major → exit 0.
#   2. Else download the latest Node ${NODE_MAJOR}.x LTS from nodejs.org for the
#      current OS/arch (filename resolved from the official SHASUMS manifest).
#
# Output: ~/.maru/env/node/bin/node when called by setup.sh --target ~/.maru/env.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"          # skills/envs/default

NODE_MAJOR="${NODE_MAJOR:-22}"                      # LTS line (override via env)

# Optional target ($1): install Node at <target>/node (or at <target> when it
# already ends in /node). Default: skills/envs/default/node (dev/source location).
if [[ -n "${1:-}" ]]; then
  case "$1" in
    */node) NODE_DIR="$1" ;;
    *)      NODE_DIR="$1/node" ;;
  esac
else
  NODE_DIR="$ENV_ROOT/node"
fi

# 1. idempotency — keep an existing runtime if it already matches the major line.
if [[ -x "$NODE_DIR/bin/node" ]]; then
  if "$NODE_DIR/bin/node" --version 2>/dev/null | grep -q "^v${NODE_MAJOR}\."; then
    echo "[setup-node] already installed: $NODE_DIR ($("$NODE_DIR/bin/node" --version))"
    exit 0
  fi
  echo "[setup-node] existing runtime is not v${NODE_MAJOR}.x; reinstalling"
fi

# 2. OS/arch → Node release tuple
case "$(uname -s)" in
  Darwin) NODE_OS="darwin" ;;
  Linux)  NODE_OS="linux" ;;
  *) echo "[setup-node] unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) NODE_ARCH="arm64" ;;
  x86_64|amd64)  NODE_ARCH="x64" ;;
  *) echo "[setup-node] unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

BASE="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
# Resolve the exact tarball name from the published checksum manifest (robust to
# patch bumps — no hardcoded version that could 404).
FILE="$(curl -fsSL "$BASE/SHASUMS256.txt" \
  | grep -oE "node-v[0-9.]+-${NODE_OS}-${NODE_ARCH}\.tar\.gz" | head -n1 || true)"
if [[ -z "$FILE" ]]; then
  echo "[setup-node] could not resolve Node v${NODE_MAJOR}.x tarball for ${NODE_OS}-${NODE_ARCH}" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
TARBALL="$TMP/$FILE"

echo "[setup-node] downloading $FILE"
curl -fsSL -o "$TARBALL" "$BASE/$FILE"
mkdir -p "$TMP/extract"
tar -xzf "$TARBALL" -C "$TMP/extract"

# Node tarball layout: node-vX.Y.Z-os-arch/{bin,lib,include,share}
EXTRACTED="$(find "$TMP/extract" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [[ -z "$EXTRACTED" || ! -x "$EXTRACTED/bin/node" ]]; then
  echo "[setup-node] unexpected archive layout" >&2; exit 1
fi

rm -rf "$NODE_DIR"
mkdir -p "$NODE_DIR"
cp -R "$EXTRACTED"/* "$NODE_DIR/"

echo "[setup-node] installed at $NODE_DIR"
"$NODE_DIR/bin/node" --version
