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

## The one thing that matters

**Skeletonise each glyph separately and concatenate in reading order.**

The first attempt skeletonised the finished word. Ms Madi is a joined script,
so the trace ran off through a ligature in the middle of a letter, wrote part
of the next one, and came back to finish the first — an `e` appeared
half-formed and completed several letters later. It looked like scribble.

Per-glyph, the pen writes W-e-l-c-o-m-e and each letter is finished before the
next begins. Within a letter the walk starts at whichever endpoint is nearest
where the pen last left off, and then always prefers the neighbour that
*continues* the current direction — that rule is what carries it straight
through a crossing rather than turning back at it.

`penpath.py` prints a per-letter tally. Every skeleton pixel should be
accounted for; a letter whose count doesn't grow the running total has been
dropped and will render as a gap.
