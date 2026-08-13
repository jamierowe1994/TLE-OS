# Handwriting: turning a word into a pen path

These two scripts generated the constants baked into
`components/WelcomeMark.tsx`. They are here so the word — or the font — can be
changed later without reverse-engineering how it was done. **They are not part
of the build and nothing imports them.**

The technique is the one from
[css-tricks.com/how-to-get-handwriting-animation-with-irregular-svg-strokes](https://css-tricks.com/how-to-get-handwriting-animation-with-irregular-svg-strokes/):
the letterforms become a `clipPath`, a pen path is drawn through the middle of
them in writing order, and that path is stroked far wider than the letters and
animated with `stroke-dashoffset`. Clipped to the letterforms, you see the
letters filling in along the writing path.

## Running them

```bash
python3 -m venv .venv && ./.venv/bin/pip install fonttools numpy scikit-image brotli
curl -sL -o MsMadi.ttf https://github.com/google/fonts/raw/main/ofl/msmadi/MsMadi-Regular.ttf
./.venv/bin/python outline.py    # -> welcome_outline.txt  (the clipPath)
./.venv/bin/python penpath.py    # -> welcome_pen.txt      (the pen path)
```

Then paste the two strings into `OUTLINE` and `PEN` in `WelcomeMark.tsx`, and
update `VIEW_BOX` to the bounding box `penpath.py` prints.

## The three things that matter

**1. Skeletonise each glyph separately.** The first attempt skeletonised the
finished word. Ms Madi is a joined script, so the trace ran off through a
ligature in the middle of a letter, wrote part of the next one, and came back
to finish the first — an `e` appeared half-formed and completed several
letters later. It looked like scribble.

**2. Collapse junction CLUSTERS to one vertex.** In an 8-connected skeleton a
crossing is not one pixel, it is a blob three or four pixels wide, and every
one of those pixels has degree 3+. Treating them as separate vertices turned
the `m` into 56 chains, nineteen of which had to be retraced — so the pen kept
nipping back into the middle of a letter it had already written. Collapsed,
the same `m` is 12 real strokes.

**3. Trace each letter with Fleury, not a greedy walk.** Never cross a bridge
while another edge is free; among the legal moves, prefer the one that
*continues* the current direction. That gives one continuous stroke covering
every pixel with no lifts. Where a letter has more than two odd-degree
vertices (the `m`'s arches) the surplus are paired by shortest path and those
chains duplicated, so the pen **retraces** — which is what a hand does going
up and back down an arch — rather than teleporting to a leftover branch.

## Reading the output

`penpath.py` prints two tables. In the first, **`unused` must be 0 for every
letter** — anything else means part of that letter never gets written. Watch
`edges` and `dup` too: a letter with dozens of edges has a fragmented skeleton
and will look like it is being coloured in rather than written.

The second table is each letter's share of the word's ink. Those fractions
become the per-stroke timings in `WelcomeMark.tsx`, which is what keeps the
pen at one steady speed across the whole word.
