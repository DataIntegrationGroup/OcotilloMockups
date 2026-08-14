#!/usr/bin/env python3
"""Inline design-system/ocotillo.css into every standalone mockup.

Mockups in this repo are single files: open the .html and you see the design,
with no server, no build step, and no missing stylesheet. That rules out a
shared <link>, so the shared CSS is copied into each file instead.

This script is what keeps the copies honest. ocotillo.css stays the single
source of truth; run this after editing it and every mockup picks up the change.

    python3 design-system/sync.py           # write
    python3 design-system/sync.py --check    # exit 1 if anything is stale

The generated block is delimited by DS_START/DS_END. Everything outside those
markers -- including each mockup's own page-specific <style> block -- is left
alone.
"""

import sys
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSS = ROOT / "design-system" / "ocotillo.css"

DS_START = (
    "<!-- design-system:start — generated from design-system/ocotillo.css\n"
    "         by design-system/sync.py. Do not edit this block by hand. -->"
)
DS_END = "<!-- design-system:end -->"

BLOCK_RE = re.compile(
    r"[ \t]*<!-- design-system:start.*?<!-- design-system:end -->",
    re.DOTALL,
)


def targets():
    """Every standalone mockup, plus the starter template."""
    return sorted(ROOT.glob("*-mockup.html")) + [
        ROOT / "design-system" / "template.html"
    ]


def block(indent="    "):
    css = CSS.read_text().rstrip("\n")
    css = "\n".join((indent + "  " + ln if ln.strip() else "") for ln in css.split("\n"))
    start = "\n".join(indent + ln if i else ln for i, ln in enumerate(DS_START.split("\n")))
    return f"{indent}{start}\n{indent}<style>\n{css}\n{indent}</style>\n{indent}{DS_END}"


def sync(check=False):
    new_block = block()
    stale, written = [], []

    for path in targets():
        src = path.read_text()

        if BLOCK_RE.search(src):
            out = BLOCK_RE.sub(lambda _: new_block, src, count=1)
        elif '<link rel="stylesheet" href="' in src and "ocotillo.css" in src:
            # First run: replace the old shared <link> with the inlined block.
            out = re.sub(
                r'[ \t]*<link rel="stylesheet" href="[^"]*ocotillo\.css" />',
                lambda _: new_block,
                src,
                count=1,
            )
        else:
            print(f"  ?? {path.name}: no design-system block and no ocotillo.css link")
            continue

        if out == src:
            continue
        if check:
            stale.append(path.name)
        else:
            path.write_text(out)
            written.append(path.name)

    if check:
        if stale:
            print("Stale (run: python3 design-system/sync.py):")
            for name in stale:
                print(f"  - {name}")
            return 1
        print(f"Up to date ({len(targets())} files).")
        return 0

    for name in written:
        print(f"  synced {name}")
    print(f"{len(written)} of {len(targets())} files updated.")
    return 0


if __name__ == "__main__":
    sys.exit(sync(check="--check" in sys.argv))
