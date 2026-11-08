#!/usr/bin/env sh
set -eu
cd -- "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22+ is required. Install Node.js and add it to PATH.' >&2
  exit 1
fi
exec node launcher.mjs "$@"
