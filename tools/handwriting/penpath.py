import numpy as np, math, itertools, heapq
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
allp=[p for c in per for co in c for p in co]
X0=min(p[0] for p in allp); Y0=min(p[1] for p in allp)
X1=max(p[0] for p in allp); Y1=max(p[1] for p in allp)
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

def prune(pts, minlen=9, rounds=4):
    """Shave the hairs off the skeleton.

    Skeletonising a smooth curve leaves short spurs wherever the outline had a
    bump — the m came out as 59 separate chains, twenty of which had to be
    retraced. They are invisible under a 95-unit nib but they wreck the stroke
    order, because every spur is a branch the pen has to go out to and come
    back from. Anything shorter than a nib-width is noise, not ink."""
    pts=set(pts)
    for _ in range(rounds):
        def nb(p):
            x,y=p; return [q for q in ((x+dx,y+dy) for dx,dy in N8) if q in pts]
        ends=[p for p in pts if len(nb(p))==1]
        drop=set()
        for e in ends:
            run=[e]; prev=None; cur=e
            while True:
                n=[q for q in nb(cur) if q!=prev and q not in drop]
                if len(n)!=1: break
                prev,cur=cur,n[0]
                if len(nb(cur))>2: break     # reached a junction
                run.append(cur)
                if len(run)>minlen: break
            if len(run)<=minlen and len(nb(cur))>2:
                drop|=set(run)
        if not drop: break
        pts-=drop
    return pts

def build_graph(pts):
    """Chains between junctions, with junction CLUSTERS collapsed to one node.

    This is the fix that matters. In an 8-connected skeleton a crossing is not
    one pixel, it is a little blob of three or four pixels that all have degree
    3+. Treating each of those as its own vertex turned the m into 56 edges,
    nineteen of which had to be retraced — so the pen kept nipping back into
    the middle of the letter instead of writing it in one go. Collapsed, the
    same m is a handful of real strokes."""
    def nb(p):
        x,y=p; return [q for q in ((x+dx,y+dy) for dx,dy in N8) if q in pts]
    deg={p:len(nb(p)) for p in pts}
    junc={p for p in pts if deg[p]>2}
    ends={p for p in pts if deg[p]==1}

    # group touching junction pixels into one vertex
    cid={}; clusters=[]
    for p in junc:
        if p in cid: continue
        st=[p]; cid[p]=len(clusters); grp=[p]
        while st:
            q=st.pop()
            for r in nb(q):
                if r in junc and r not in cid:
                    cid[r]=cid[p]; grp.append(r); st.append(r)
        clusters.append(grp)
    reps=[]
    for grp in clusters:
        cx=sum(p[0] for p in grp)/len(grp); cy=sum(p[1] for p in grp)/len(grp)
        reps.append(min(grp,key=lambda p:(p[0]-cx)**2+(p[1]-cy)**2))
    def vertex(p):
        if p in cid: return reps[cid[p]]
        return p if p in ends else None

    nodes={vertex(p) for p in junc} | set(ends)
    if not nodes:                       # a closed loop: nick it open anywhere
        nodes={min(pts,key=lambda p:(p[0],p[1]))}

    edges=[]; walked=set()
    for seed in list(junc)+list(ends):
        v0=vertex(seed)
        for first in nb(seed):
            if first in cid and cid.get(first)==cid.get(seed): continue   # inside a cluster
            if (seed,first) in walked: continue
            run=[seed,first]; walked.add((seed,first)); walked.add((first,seed))
            prev,cur=seed,first
            while cur not in junc and cur not in ends:
                nxt=[q for q in nb(cur) if q!=prev]
                if not nxt: break
                nxt=nxt[0]
                walked.add((cur,nxt)); walked.add((nxt,cur))
                run.append(nxt); prev,cur=cur,nxt
            v1=vertex(cur)
            if v1 is None: continue
            if v0==v1 and len(run)<4: continue      # a hop inside one cluster
            run=[v0]+run[1:-1]+[v1]
            edges.append((v0,v1,run))

    # both ends walk the same chain; keep one
    seen=set(); uniq=[]
    for a,b,run in edges:
        key=(min(a,b),max(a,b),len(run))
        if key in seen: continue
        seen.add(key); uniq.append((a,b,run))
    return nodes,uniq

def gdist(nodes,edges,src):
    adj={}
    for i,(a,b,run) in enumerate(edges):
        adj.setdefault(a,[]).append((b,len(run),i)); adj.setdefault(b,[]).append((a,len(run),i))
    dist={src:0}; prev={}; pq=[(0,src)]
    while pq:
        d,u=heapq.heappop(pq)
        if d>dist.get(u,1e18): continue
        for v,w,i in adj.get(u,[]):
            nd=d+w
            if nd<dist.get(v,1e18): dist[v]=nd; prev[v]=(u,i); heapq.heappush(pq,(nd,v))
    return dist,prev

def fleury(nodes,edges,start):
    """A single continuous stroke. Prefers the edge that CONTINUES the current
       direction, and refuses to cross a bridge while another edge is free —
       that is the rule that stops a letter being left half-drawn and returned
       to later."""
    adj={}
    for i,(a,b,run) in enumerate(edges):
        adj.setdefault(a,set()).add(i); adj.setdefault(b,set()).add(i)
    live=set(range(len(edges)))
    def other(i,n): 
        a,b,_=edges[i]; return b if n==a else a
    def reachable(n,pool):
        seen={n}; st=[n]
        while st:
            u=st.pop()
            for i in adj.get(u,()):
                if i not in pool: continue
                v=other(i,u)
                if v not in seen: seen.add(v); st.append(v)
        return seen
    out=[]; cur=start; d=(1.0,0.0)
    while live:
        inc=[i for i in adj.get(cur,()) if i in live]
        if not inc: break
        if len(inc)>1:
            ok=[]
            for i in inc:
                pool=live-{i}
                # not a bridge if the far side is still reachable without it
                if other(i,cur) in reachable(cur,pool) or len(reachable(cur,pool))>=len(reachable(cur,live))-0:
                    ok.append(i)
            nonbridge=[]
            for i in inc:
                pool=live-{i}
                before=reachable(cur,live); after=reachable(other(i,cur),pool)
                rest={n for j in pool for n in (edges[j][0],edges[j][1])}
                if rest<=after or not rest: nonbridge.append(i)
            cands=nonbridge or inc
        else:
            cands=inc
        def score(i):
            a,b,run=edges[i]
            seq=run if run[0]==cur else run[::-1]
            k=min(6,len(seq)-1)
            v=(seq[k][0]-seq[0][0], seq[k][1]-seq[0][1]); n=math.hypot(*v) or 1
            return -(v[0]*d[0]+v[1]*d[1])/n
        i=min(cands,key=score)
        a,b,run=edges[i]; seq=run if run[0]==cur else run[::-1]
        out+= seq if not out else seq[1:]
        k=min(6,len(seq)-1)
        v=(seq[-1][0]-seq[-1-k][0], seq[-1][1]-seq[-1-k][1]); n=math.hypot(*v) or 1
        d=(v[0]/n,v[1]/n)
        live.discard(i); cur=other(i,cur)
    return out,len(live)

letters=[]; entry=None; report=[]
for li,contours in enumerate(per):
    sk=skeletonize(raster(contours))
    pts=prune({(int(a),int(b)) for b,a in zip(*np.nonzero(sk))})
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
    comps=[c for c in comps if len(c)>=6]; comps.sort(key=lambda c:min(q[0] for q in c))
    letter=[]
    for comp in comps:
        cs=set(comp); nodes,edges=build_graph(cs)
        deg={}
        for a,b,run in edges:
            deg[a]=deg.get(a,0)+1; deg[b]=deg.get(b,0)+1
        odd=[n for n in nodes if deg.get(n,0)%2==1]
        dup=0
        if len(odd)>2:
            keep_a=min(odd,key=lambda p:(p[0],-p[1])); keep_b=max(odd,key=lambda p:(p[0],-p[1]))
            pool=[n for n in odd if n not in (keep_a,keep_b)]
            while len(pool)>=2:
                best=None
                for u,v in itertools.combinations(pool,2):
                    dist,prev=gdist(nodes,edges,u)
                    if v in dist and (best is None or dist[v]<best[0]): best=(dist[v],u,v,prev)
                if not best: break
                _,u,v,prev=best
                cur=v
                while cur!=u and cur in prev:
                    pu,ei=prev[cur]; a,b,run=edges[ei]
                    edges.append((a,b,list(run))); dup+=1
                    cur=pu
                pool.remove(u); pool.remove(v)
            deg={}
            for a,b,run in edges:
                deg[a]=deg.get(a,0)+1; deg[b]=deg.get(b,0)+1
            odd=[n for n in nodes if deg.get(n,0)%2==1]
        pool=odd or list(nodes)
        start=min(pool,key=lambda p:((p[0]-entry[0])**2+(p[1]-entry[1])**2) if entry else (p[0],-p[1]))
        o,left=fleury(nodes,edges,start)
        letter+=o
        if o: entry=o[-1]
        report.append((word[li],len(cs),len(edges),len(odd),dup,left))
    letters.append(letter)
for r in report: print("  %s px=%-5d edges=%-3d odd=%-2d dup=%-2d unused=%d"%r)

def smooth(ps,k=3):
    out=[]
    for i in range(len(ps)):
        a=max(0,i-k); b=min(len(ps),i+k+1); w=ps[a:b]
        out.append((sum(p[0] for p in w)/len(w),sum(p[1] for p in w)/len(w)))
    return out

import json
out=[]
for li,letter in enumerate(letters):
    sm=smooth([(float(a),float(b)) for a,b in letter])
    keep=[sm[0]]
    for p in sm[1:]:
        if (p[0]-keep[-1][0])**2+(p[1]-keep[-1][1])**2>=3.2**2: keep.append(p)
    keep.append(sm[-1])
    fp=[(((p[0]-PAD)/S+X0),((p[1]-PAD)/S+Y0)) for p in keep]
    L=sum(math.dist(fp[i],fp[i+1]) for i in range(len(fp)-1))
    d="M"+"L".join(f"{x:.0f} {y:.0f}" for x,y in fp)
    out.append({"c":word[li],"d":d,"len":round(L)})
tot=sum(o["len"] for o in out)
for o in out: print("  %s  len=%-6d %5.1f%%  pts~%d"%(o["c"],o["len"],100*o["len"]/tot,o["d"].count("L")))
json.dump(out,open("welcome_letters.json","w"))
print("total length",tot,"chars",sum(len(o["d"]) for o in out))
print("viewBox", f"{X0-10:.0f} {Y0-10:.0f} {X1-X0+20:.0f} {Y1-Y0+20:.0f}")
