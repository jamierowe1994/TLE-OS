import numpy as np, math
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from skimage.morphology import skeletonize

f=TTFont("MsMadi.ttf"); gs=f.getGlyphSet(); cmap=f.getBestCmap(); hmtx=f["hmtx"]
try: kern=f["kern"].kernTables[0].kernTable
except Exception: kern=None

class Flatten(BasePen):
    def __init__(self,glyphSet,dx=0.0,steps=14):
        super().__init__(glyphSet); self.dx=dx; self.steps=steps; self.contours=[]; self.cur=[]
    def _pt(self,p): return (p[0]+self.dx,-p[1])
    def _moveTo(self,p):
        if len(self.cur)>1: self.contours.append(self.cur)
        self.cur=[self._pt(p)]
    def _lineTo(self,p): self.cur.append(self._pt(p))
    def _curveToOne(self,p1,p2,p3):
        p0=self.cur[-1]; a,b,c=self._pt(p1),self._pt(p2),self._pt(p3)
        for i in range(1,self.steps+1):
            t=i/self.steps; u=1-t
            self.cur.append((u**3*p0[0]+3*u*u*t*a[0]+3*u*t*t*b[0]+t**3*c[0],
                             u**3*p0[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t**3*c[1]))
    def _closePath(self):
        if len(self.cur)>1: self.contours.append(self.cur)
        self.cur=[]
    def endPath(self): self._closePath()

word="Welcome"; names=[cmap[ord(c)] for c in word]
per=[]; x=0.0
for i,n in enumerate(names):
    fp=Flatten(gs,dx=x); gs[n].draw(fp); fp.endPath(); per.append(fp.contours)
    adv=hmtx[n][0]
    if kern and i+1<len(names): adv+=kern.get((n,names[i+1]),0)
    x+=adv

allpts=[p for c in per for co in c for p in co]
X0=min(p[0] for p in allpts); Y0=min(p[1] for p in allpts)
X1=max(p[0] for p in allpts); Y1=max(p[1] for p in allpts)
S=0.34; PAD=8
W=int((X1-X0)*S)+PAD*2; H=int((Y1-Y0)*S)+PAD*2

def raster(contours):
    edges=[]
    for c in contours:
        pts=[((p[0]-X0)*S+PAD,(p[1]-Y0)*S+PAD) for p in c]
        for i in range(len(pts)):
            a=pts[i]; b=pts[(i+1)%len(pts)]
            if a[1]!=b[1]: edges.append((a,b))
    img=np.zeros((H,W),bool)
    for yi in range(H):
        yc=yi+0.5; xs=[]
        for (ax,ay),(bx,by) in edges:
            if (ay<=yc<by) or (by<=yc<ay): xs.append(ax+(yc-ay)*(bx-ax)/(by-ay))
        xs.sort()
        for i in range(0,len(xs)-1,2):
            a=int(np.ceil(xs[i]-0.5)); b=int(np.floor(xs[i+1]-0.5))
            if b>=a: img[yi,max(a,0):min(b+1,W)]=True
    return img

N8=[(-1,-1),(0,-1),(1,-1),(-1,0),(1,0),(-1,1),(0,1),(1,1)]
def walk_component(comp, entry):
    pts=set(comp)
    def nb(p):
        x,y=p; return [q for q in ((x+dx,y+dy) for dx,dy in N8) if q in pts]
    deg={p:len(nb(p)) for p in comp}
    ends=[p for p in comp if deg[p]==1]
    # Start at the endpoint nearest where the previous letter finished — that
    # is where a hand would pick the pen up again.
    pool=ends or comp
    start=min(pool,key=lambda p:(p[0]-entry[0])**2+(p[1]-entry[1])**2) if entry else min(pool,key=lambda p:(p[0],-p[1]))
    rest=set(comp); order=[start]; rest.discard(start); cur=start; d=(1.0,0.0)
    while rest:
        cands=[q for q in nb(cur) if q in rest]
        if not cands:
            nxt=min(rest,key=lambda q:(q[0]-cur[0])**2+(q[1]-cur[1])**2)
            cands=[nxt]; d=(1.0,0.0)
        def score(q):
            v=(q[0]-cur[0],q[1]-cur[1]); n=math.hypot(*v) or 1
            return -(v[0]*d[0]+v[1]*d[1])/n
        nxt=min(cands,key=score)
        v=(nxt[0]-cur[0],nxt[1]-cur[1]); n=math.hypot(*v) or 1
        d=(0.5*d[0]+0.5*v[0]/n, 0.5*d[1]+0.5*v[1]/n)
        nn=math.hypot(*d) or 1; d=(d[0]/nn,d[1]/nn)
        order.append(nxt); rest.discard(nxt); cur=nxt
    return order

ordered=[]; entry=None; total=0
for li,contours in enumerate(per):
    sk=skeletonize(raster(contours))
    pts={(int(x),int(y)) for y,x in zip(*np.nonzero(sk))}
    total+=len(pts)
    # components WITHIN one letter, left to right
    seen=set(); comps=[]
    for p in pts:
        if p in seen: continue
        st=[p]; seen.add(p); c=[]
        while st:
            q=st.pop(); c.append(q)
            for dx,dy in N8:
                r=(q[0]+dx,q[1]+dy)
                if r in pts and r not in seen: seen.add(r); st.append(r)
        comps.append(c)
    comps=[c for c in comps if len(c)>=6]
    comps.sort(key=lambda c: min(q[0] for q in c))
    for c in comps:
        o=walk_component(c, entry)
        ordered+=o; entry=o[-1]
    print(word[li], len(pts), "->", len(ordered))

def smooth(ps,k=3):
    out=[]
    for i in range(len(ps)):
        a=max(0,i-k); b=min(len(ps),i+k+1); w=ps[a:b]
        out.append((sum(p[0] for p in w)/len(w), sum(p[1] for p in w)/len(w)))
    return out
sm=smooth([(float(a),float(b)) for a,b in ordered])
keep=[sm[0]]
for p in sm[1:]:
    if (p[0]-keep[-1][0])**2+(p[1]-keep[-1][1])**2 >= 3.2**2: keep.append(p)
keep.append(sm[-1])
fp=[(((p[0]-PAD)/S+X0),((p[1]-PAD)/S+Y0)) for p in keep]
d="M"+"L".join(f"{x:.0f} {y:.0f}" for x,y in fp)
open("welcome_pen.txt","w").write(d)
print("skeleton total",total,"points",len(keep),"chars",len(d))
print("viewBox", f"{X0-10:.0f} {Y0-10:.0f} {X1-X0+20:.0f} {Y1-Y0+20:.0f}")
