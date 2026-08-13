from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

f = TTFont("MsMadi.ttf")
gs = f.getGlyphSet()
cmap = f.getBestCmap()
upm = f["head"].unitsPerEm
kern = None
try:
    kern = f["kern"].kernTables[0].kernTable
except Exception:
    pass

word = "Welcome"
names = [cmap[ord(c)] for c in word]

# Compose the whole word into ONE path, applying advance widths (+kerning).
pen_out = []
x = 0.0
hmtx = f["hmtx"]
for i, n in enumerate(names):
    sp = SVGPathPen(gs)
    # y-flip: font space is y-up, SVG is y-down.
    tp = TransformPen(sp, Transform(1, 0, 0, -1, x, 0))
    gs[n].draw(tp)
    d = sp.getCommands()
    if d:
        pen_out.append(d)
    adv = hmtx[n][0]
    if kern and i + 1 < len(names):
        adv += kern.get((n, names[i + 1]), 0)
    x += adv

path = " ".join(pen_out)
print("UPM", upm)
print("advance total", x)
print("len(d)", len(path))
open("welcome_outline.txt", "w").write(path)

# bounds
from fontTools.pens.boundsPen import BoundsPen
bx = None
x = 0.0
for i, n in enumerate(names):
    bp = BoundsPen(gs)
    gs[n].draw(bp)
    if bp.bounds:
        x0, y0, x1, y1 = bp.bounds
        b = (x0 + x, -y1, x1 + x, -y0)
        bx = b if bx is None else (min(bx[0], b[0]), min(bx[1], b[1]), max(bx[2], b[2]), max(bx[3], b[3]))
    adv = hmtx[n][0]
    if kern and i + 1 < len(names):
        adv += kern.get((n, names[i + 1]), 0)
    x += adv
print("bbox (svg coords)", bx)
open("welcome_bbox.txt","w").write(repr(bx))
