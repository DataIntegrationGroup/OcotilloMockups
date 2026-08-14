# AGENTS.md

Lo-fi HTML mockups for [Ocotillo](https://github.com/DataIntegrationGroup/OcotilloUI).
They exist to get a design argued about before anyone builds it. Nothing here is
production code and nothing here is wired to a backend.

## The hard rule: one mockup is one file

**Every mockup is a single self-contained `.html` file. All CSS and all
JavaScript are embedded in it.**

No linked stylesheets, no `<script src>`, no CDN, no build step, no bundler, no
npm install, no framework. Someone must be able to double-click the file, or
receive it over email or Slack, and see the design — offline, on a machine with
no toolchain, five years from now.

Do not "improve" this by extracting shared files and linking them. That has been
tried in this repo and reverted. If you find yourself wanting a shared asset,
see *Shared styles* below — the sharing happens at author time, not at load
time.

### The one exception

The Google Fonts `<link>` in each file's `<head>`. Public Sans and Outfit are
the app's typefaces, and base64-embedding two variable fonts would add hundreds
of kilobytes to every mockup. The font stacks fall back to `system-ui`, so a
mockup opened offline is correct in every respect except the typeface.

That is the only external reference permitted. Everything else is inline.

## Shared styles

The look-and-feel is shared, but it is shared by **copying, not linking**.

- `design-system/ocotillo.css` is the single source of truth. Edit it here.
- `design-system/sync.py` copies it into every mockup, inside a delimited block.
- The block in each mockup is **generated**. Never hand-edit it; your edit will
  be overwritten on the next sync.

```bash
python3 design-system/sync.py           # write the block into every mockup
python3 design-system/sync.py --check   # exit 1 if any mockup is stale
```

Each mockup therefore has two `<style>` blocks, in this order:

1. The generated design-system block, between the `design-system:start` and
   `design-system:end` comment markers.
2. The mockup's own `<style>`, holding only genuinely page-specific rules under
   a `/* ── Page-specific ── */` banner.

If a rule would be useful to a second mockup, it belongs in `ocotillo.css`. If
it is one-off, keep it local. When unsure, keep it local — promoting later is
easy, and un-inventing a token nobody wanted is not.

JavaScript goes in a single `<script>` block at the bottom of `<body>`. Plain
DOM, no libraries. Mockups only need enough behavior to demonstrate the flow —
switching tabs, toggling a checkbox, moving between steps.

## Making a new mockup

```bash
cp design-system/template.html <area>-<feature>-mockup.html
```

The template already carries a synced design-system block, the app chrome, and
a placeholder mockup note. Then:

1. Set the title, breadcrumb, and active sidebar item.
2. **Write the mockup note first.** See below.
3. Build the page from classes in `design-system/components.html`, which renders
   every available class. Open it before inventing anything.
4. Run `python3 design-system/sync.py` to be sure the block is current.
5. Verify (checklist below).

Name files `<area>-<feature>-mockup.html`, matching the existing
`chemistry-*`, `field-planning-*` pattern.

## The mockup note

Every mockup opens with a `.mockup-note`. It is deliberately styled outside the
token system — yellow, obviously not product UI — so no reviewer mistakes
commentary for design.

It states two things:

1. That the mockup is not functional.
2. The open questions the mockup exists to force a decision on.

The second part is the point. A mockup with no open questions listed is either
finished or not being honest. Write it before building the screen, not after.

## Design rules

`design-system/README.md` has the full set, including where each value comes
from in the app. The ones most often gotten wrong:

- **Primary is `#0e6da8`**, the custom Ocotillo brand ramp — not a Tailwind blue.
- **The page background is `#fafafa`.** Cards are white and separated by a 1px
  ring, not by a shadow and not by a contrasting page color.
- **Tint with `color-mix`**, 10% fill and 30% border of a token. Never
  hand-picked hex pairs — they drift from the token and break dark mode.
- **`--primary-dark` is the hover/emphasis slot**, not "a darker primary". In
  dark mode it resolves *lighter*.
- **`--bloom` and `--sand` are brand identity, never semantic.** The bloom sits
  8.7 degrees of hue from `--destructive` and reads as an alarm in UI chrome.

Fake data should be plausible New Mexico groundwater data: real counties, real
aquifer names, sane units and magnitudes. A reviewer distracted by a nonsense
arsenic value is not reviewing the design.

## Before committing

- `python3 design-system/sync.py --check` passes.
- The file opens correctly from `file://` with **no server running**. This is
  the real test of the standalone rule.
- No console errors.
- Every class used resolves, and every `var(--token)` resolves.
- It reads correctly in dark mode (`document.documentElement.classList.add('dark')`).
- The mockup note is present and lists real open questions.

There is a static server config in `.claude/launch.json` (`python3 -m
http.server 8931`) if you want one for convenience, but a mockup that *needs* it
is broken.

## Commits

Conventional commits, scoped by area — matching the existing history:

```
init(chemistry): chemistry report exporter mockup
feat(design-system): extract shared design system from OcotilloUI
refactor(chemistry): revert changes on field parameters table
```

Use `init(...)` for a brand-new mockup, `feat(...)` for a meaningful addition,
`refactor(...)`/`fix(...)` as usual. Commit only when asked.
