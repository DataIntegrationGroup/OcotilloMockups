#!/usr/bin/env bash
# Render an example report HTML to PDF with headless Chrome.
#
#   ./examples/render.sh                                    # render the default example
#   ./examples/render.sh examples/some-other-report.html    # render a specific one
#
# Chrome is used rather than a Python PDF library because the reports are laid
# out with CSS the same way the app's own print output is; anything that
# re-implements the layout would drift from what the mockup shows.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome not found at: $CHROME" >&2; exit 1; }

SRC="${1:-examples/annual-report-WL-1187-2026.html}"
[ -f "$SRC" ] || { echo "No such file: $SRC" >&2; exit 1; }

ABS="$(cd "$(dirname "$SRC")" && pwd)/$(basename "$SRC")"
OUT="${ABS%.html}.pdf"

"$CHROME" \
  --headless \
  --disable-gpu \
  --no-pdf-header-footer \
  --print-to-pdf="$OUT" \
  --virtual-time-budget=10000 \
  "file://$ABS" 2>/dev/null

echo "wrote $OUT"
