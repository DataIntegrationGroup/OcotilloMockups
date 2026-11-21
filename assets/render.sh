#!/usr/bin/env bash
# Render field-notes-mockup.html into the two PDFs the wells preview embeds.
#
#   ./assets/render.sh
#
# Writes, replacing whatever is there:
#   assets/lofi_mockup_p1.pdf   page 1 only  (the field sheet)
#   assets/lofi_mockup_p2.pdf   pages 1+2    (field sheet + owner leave-behind)
#
# The HTML is the single source: one headless-Chrome print at letter size with
# the sheet's own @page rule, then page 1 is lifted out for the one-page file.
# Chrome is used for the same reason as examples/render.sh — re-implementing
# the CSS layout in a PDF library would drift from what the mockup shows.
#
# Page 1 is split with pdfseparate (poppler) when present, otherwise with
# pypdf under any python3 on PATH. Both paths are lossless page copies.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome not found at: $CHROME" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/field-notes-mockup.html"
[ -f "$SRC" ] || { echo "No such file: $SRC" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

count_pages() {
  if command -v pdfinfo >/dev/null 2>&1; then
    pdfinfo "$1" | awk '/^Pages:/ {print $2}'
  else
    python3 -c 'import sys,pypdf; print(len(pypdf.PdfReader(sys.argv[1]).pages))' "$1"
  fi
}

"$CHROME" \
  --headless \
  --disable-gpu \
  --no-pdf-header-footer \
  --print-to-pdf="$TMP/full.pdf" \
  --virtual-time-budget=10000 \
  "file://$SRC" 2>/dev/null

PAGES="$(count_pages "$TMP/full.pdf")"
[ "$PAGES" = "2" ] || { echo "expected the sheet to print as 2 pages, got $PAGES" >&2; exit 1; }

# page 1 only
if command -v pdfseparate >/dev/null 2>&1; then
  pdfseparate -f 1 -l 1 "$TMP/full.pdf" "$TMP/page-%d.pdf"
  cp "$TMP/page-1.pdf" "$ROOT/assets/lofi_mockup_p1.pdf"
else
  python3 - "$TMP/full.pdf" "$ROOT/assets/lofi_mockup_p1.pdf" <<'PY'
import sys
from pypdf import PdfReader, PdfWriter
r, out = PdfReader(sys.argv[1]), PdfWriter()
out.add_page(r.pages[0])
with open(sys.argv[2], "wb") as f:
    out.write(f)
PY
fi

cp "$TMP/full.pdf" "$ROOT/assets/lofi_mockup_p2.pdf"

for f in p1 p2; do
  want=$( [ "$f" = p1 ] && echo 1 || echo 2 )
  got="$(count_pages "$ROOT/assets/lofi_mockup_$f.pdf")"
  [ "$got" = "$want" ] || { echo "lofi_mockup_$f.pdf has $got pages, expected $want" >&2; exit 1; }
  printf 'wrote assets/lofi_mockup_%s.pdf  %s pages  %s bytes\n' \
    "$f" "$got" "$(wc -c < "$ROOT/assets/lofi_mockup_$f.pdf" | tr -d ' ')"
done
