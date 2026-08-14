# Ocotillo Mockup Design System

Shared look-and-feel for the lo-fi mockups in this repo, derived from the real
application in `../../OcotilloUI`.

The point is narrow: **a mockup should be wrong about the product, never wrong
about the design.** Reviewers need to argue about the flow, not about why the
buttons are a different blue than the app.

## Files

| File              | Use                                                           |
| ----------------- | ------------------------------------------------------------- |
| `ocotillo.css`    | The stylesheet. **Source of truth — edit here, then sync.**    |
| `sync.py`         | Copies the stylesheet into every mockup. Run after editing.    |
| `template.html`   | Starting shell — app bar, sidebar, main, mockup note. Copy it. |
| `components.html` | Rendered gallery of every class. Open it to see what exists.   |

## Shared by copying, not by linking

Mockups in this repo are **single self-contained files** — all CSS and JS
embedded, so one can be opened offline or forwarded to someone with no
toolchain. See `../AGENTS.md` for the full rule.

That rules out a shared `<link>`, so the sharing happens at author time instead.
`ocotillo.css` is the one place to edit; `sync.py` copies it into a delimited,
**generated** block inside each mockup:

```bash
python3 design-system/sync.py           # write the block into every mockup
python3 design-system/sync.py --check   # exit 1 if any mockup is stale
```

Never hand-edit the block between the `design-system:start` and
`design-system:end` markers — the next sync overwrites it. Each mockup's own
`<style>` block, which follows it, is yours.

## Starting a new mockup

```bash
cp design-system/template.html my-feature-mockup.html
```

Then:

1. Fill in the page title, breadcrumb, and active sidebar item.
2. Write the mockup note first — see below.
3. Build the page from classes in `components.html`.
4. Put anything genuinely one-off in the file's own `<style>` block, under a
   `/* ── Page-specific ── */` banner.
5. Run `python3 design-system/sync.py`, then open the file from `file://` with
   no server running. That is the real test that it is standalone.

## Where the values come from

`ocotillo.css` is a port, not an invention. Source of truth, in priority order:

| Source                            | Provides                                            |
| --------------------------------- | --------------------------------------------------- |
| `OcotilloUI/src/index.css`        | Design tokens — the shadcn/Tailwind layer            |
| `OcotilloUI/src/theme.ts`         | Design tokens — the MUI layer, plus the brand ramp   |
| `OcotilloUI/src/components/ui/*`  | Component specs (button, badge, card, table, input)  |

The app is mid-migration and runs two component systems side by side. Where
they disagree, this stylesheet follows the **shadcn layer**, because that is
where the app is heading. Both are noted in the CSS where it matters.

### App → mockup mapping

| App                                   | Mockup class                              |
| ------------------------------------- | ----------------------------------------- |
| `<Button variant="default">`          | `.btn .btn-default`                       |
| `<Button variant="outline">`          | `.btn .btn-outline`                       |
| `<Button variant="ghost">`            | `.btn .btn-ghost`                         |
| MUI `contained` `color="secondary"`   | `.btn .btn-primary-outline`               |
| `<Badge variant="filter">`            | `.badge .badge-filter`                    |
| `<Badge variant="destructive">`       | `.badge .badge-destructive`               |
| `<Card>` / `<CardHeader>` / `<CardTitle>` | `.card` / `.card-header` / `.card-title` |
| `<Table>` (shadcn, inside a card)     | `.table`                                  |
| MUI X `<DataGrid>` (record lists)     | `.datagrid`                               |
| `<OcotilloPageTitle>`                 | `.page-title`                             |
| `components/pdf/*` (@react-pdf)       | `.report-page` and the `.rp-*` classes    |

## Rules that are easy to get wrong

**Primary is `#0e6da8`, not a Tailwind blue.** The brand ramp is the one ramp
in the system that is not Tailwind — it was sampled from the pixel water-splash
mark and the desert sky in the masthead photo, and it sits at hue ~235–245 so it
reads as water, not violet. `--brand-*` is the full ramp; `--primary` points
into it.

**The page background is `#fafafa`, not a stone gray.** Cards are white and
separate from the page by a 1px ring (`ring-1 ring-foreground/10`), not by a
shadow and not by a contrasting page color. The app is a flat, ring-outlined
UI. Reserve shadows for things that genuinely float — popovers, and the
simulated sheet of paper in a report preview.

**Tint with `color-mix`, never with hand-picked hex pairs.** The app's badge
and alert idiom is a 10% fill with a 30% border of the same token:

```css
background: color-mix(in oklab, var(--destructive) 10%, transparent);
color: var(--destructive);
border-color: color-mix(in oklab, var(--destructive) 30%, transparent);
```

Reaching for `#fef2f2` / `#fecaca` instead produces something that looks right
today and drifts the moment the token moves — and it silently breaks dark mode.

**`--primary-dark` is the hover/emphasis slot, not "a darker primary."** In
dark mode it resolves *lighter* than `--primary`. If you use it to mean "darker,"
dark mode inverts on you.

**The ocotillo bloom (`--bloom`) and sand (`--sand`) are brand identity, not
semantic slots.** The bloom sits 8.7 degrees of hue from `--destructive` and
11.6 from `--warning`; anything painted in it inside UI chrome reads as an
alarm. Favicon, artwork, and splash screens only.

**`--border` and `--divider` are both real.** `--border` (neutral-200) is the
shadcn token used by tables, inputs, and rules. `--divider` (stone-300) is MUI's
`palette.divider`, used by the DataGrid. Use `.datagrid` and `.table` as
provided and this resolves itself.

**Info is teal, not cyan.** Cyan sits about 20 degrees from the brand blue, and
the two read as the same color when an info alert lands next to a primary
button.

## Domain conventions

Water chemistry flags map onto the semantic tints — never onto new colors:

| Flag           | Meaning                                       | Class          |
| -------------- | --------------------------------------------- | -------------- |
| **Above MCL**  | Exceeds a health-based limit                  | `.chip-mcl`    |
| **Above SMCL** | Exceeds a taste / odor / staining limit       | `.chip-smcl`   |
| **ND**         | Not detected; the value shown is the det. limit | `.chip-nd`   |
| **Calc.**      | Calculated, not directly measured             | `.chip-calc`   |

Any table using these carries a `.legend` spelling them out. An owner-facing
report must expand them in words as well — MCL and SMCL are not public
vocabulary.

Numeric columns get `font-variant-numeric: tabular-nums` so digits align down
the column. `.datagrid`, `.table`, `.mono`, `.rp-num`, and `.stat-value` already
do this; add `.num` to anything else that holds a measurement.

## The mockup note

Every mockup opens with a `.mockup-note`. It is deliberately outside the token
system — yellow, obviously not product UI — so no reviewer mistakes commentary
for design.

It states two things:

1. That the mockup is not functional.
2. The open questions the mockup is meant to force a decision on.

That second part is the reason the note exists. A mockup with no open questions
listed is either finished or not being honest.

## Dark mode

Tokens for both modes ship in the stylesheet. Add `class="dark"` to `<html>` to
check your mockup — the same switch the app uses. Anything hardcoded to a hex
value will announce itself immediately.

## Keeping in sync

When the app's tokens change, update `ocotillo.css` and run
`python3 design-system/sync.py` — do not fork a value into a single mockup. If
you need something the system does not have, add it to the stylesheet if it is
general, and to the mockup's own `<style>` block if it is genuinely one-off.
When in doubt, one-off it; promoting later is easy, and un-inventing a token
nobody wanted is not.

Because the stylesheet is copied into every mockup, a change to it touches every
file. That is the intended cost of standalone mockups: the diff is noisy, but no
mockup can quietly rot into a different design.
