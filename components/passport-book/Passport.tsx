"use client";

import { useEffect, useId, useRef, useState } from "react";
import { photoPosition } from "@/components/PassportBook";
import type { PassportData } from "@/lib/passport-shape";
import { Ic, MARK_PATHS } from "./icons";
import { bornOn, shortAddress, type StepDef } from "./model";

/**
 * The live passport, beside the questions on a wide screen (the design hides
 * it on a phone, where the stamps are dots in the header). The front fills in
 * as they type; the back holds a slot for each stamp. It tilts and shimmers
 * after the mouse or a finger, turns over when tapped, and turns over by
 * itself to thud each new stamp on. Signing spins it once.
 *
 * Everything on it is theirs: the name, the photo, the date of birth, the move
 * and, when we have one, the home they enquired about. The design's prototype
 * printed a made-up passport number; there is no such number, so there is none.
 */
export default function Passport({
  d,
  pct,
  steps,
  stamped,
  cleared,
  fresh,
  home,
}: {
  d: PassportData;
  pct: number;
  /** Every step; the ones after the first each have a slot. */
  steps: StepDef[];
  /** Step indices whose stamp is on. */
  stamped: number[];
  /** Finished: the "Cleared to view" stamp on the front. */
  cleared: boolean;
  /** A stamp just earned: its step index, and a count so the same one can play again. */
  fresh: { k: number; n: number } | null;
  home: string | null;
}) {
  const pass = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const [idle, setIdle] = useState(true);
  const [over, setOver] = useState(false);
  const [spin, setSpin] = useState(false);
  /** The slot whose stamp is held back until the passport has turned, then the one that thuds. */
  const [held, setHeld] = useState<number | null>(null);
  const [thud, setThud] = useState<number | null>(null);
  const ringId = `tpx-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const slots = steps.slice(1);
  const name = d.legalName.trim();
  const initials = name.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const sub =
    [bornOn(d.dob) ? `Born ${bornOn(d.dob)}` : "", d.moveWhen && d.moveWhen !== "Just looking" ? `Moving ${d.moveWhen.toLowerCase()}` : ""].filter(Boolean).join(" · ") ||
    (home ? `For ${shortAddress(home)}` : "Fills in as you go");
  const shown = cleared ? 100 : pct;
  /* The data page: surname last, as a passport prints it, and the two machine-readable lines along the bottom built from the same. */
  const parts = name.split(/\s+/).filter(Boolean);
  const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  const moving = d.moveWhen && d.moveWhen !== "Just looking" ? d.moveWhen : home ? shortAddress(home).split(",")[0] : "";
  const mrz = mrzLines(surname, given, d.dob, stamped.filter((k) => k > 0).length);
  const nStamps = stamped.filter((k) => k > 0).length;

  /* Turn it over, thud the new stamp on, turn it back; the last one spins it. */
  useEffect(() => {
    if (!fresh) return;
    const { k } = fresh;
    const last = k === steps.length - 1;
    setHeld(k);
    setThud(null);
    setOver(true);
    const t: number[] = [];
    t.push(window.setTimeout(() => { setHeld(null); setThud(k); }, 650));
    t.push(window.setTimeout(() => setOver(false), last ? 2000 : 1900));
    if (last) {
      t.push(window.setTimeout(() => setSpin(true), 2100));
      t.push(window.setTimeout(() => setSpin(false), 3600));
    }
    return () => t.forEach((x) => window.clearTimeout(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh?.n]);

  /* The tilt and shimmer follow the mouse; on a touch screen it floats on its
     own and follows a finger drawn across it. Written straight onto the
     element so a mouse move never re-renders the page. */
  useEffect(() => {
    const el = pass.current, t = tilt.current;
    if (!el || !t) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let idleT = 0;
    let isIdle = true;
    const move = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = Math.max(-1, Math.min(1, (x - cx) / (window.innerWidth / 2)));
      const dy = Math.max(-1, Math.min(1, (y - cy) / (window.innerHeight / 2)));
      if (isIdle) { isIdle = false; setIdle(false); }
      t.style.setProperty("--ry", `${(dx * 16).toFixed(2)}deg`);
      t.style.setProperty("--rx", `${(-dy * 12).toFixed(2)}deg`);
      el.style.setProperty("--dx", dx.toFixed(3));
      el.style.setProperty("--dy", dy.toFixed(3));
      el.style.setProperty("--gx", `${50 + dx * 40}%`);
      el.style.setProperty("--gy", `${40 + dy * 40}%`);
      el.querySelectorAll<HTMLElement>(".holo").forEach((h) => { h.style.setProperty("--hx", `${50 + dx * 45}%`); h.style.setProperty("--hy", `${50 + dy * 45}%`); });
      window.clearTimeout(idleT);
      idleT = window.setTimeout(() => {
        t.style.removeProperty("--rx"); t.style.removeProperty("--ry");
        ["--dx", "--dy", "--gx", "--gy"].forEach((v) => el.style.removeProperty(v));
        isIdle = true;
        setIdle(true);
      }, 2500);
    };
    const onMouse = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => { const p = e.touches[0]; if (p) move(p.clientX, p.clientY); };
    window.addEventListener("mousemove", onMouse, { passive: true });
    el.addEventListener("touchmove", onTouch, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouse);
      el.removeEventListener("touchmove", onTouch);
      window.clearTimeout(idleT);
    };
  }, []);

  const turn = () => setOver((o) => !o);

  return (
    <div className="passcol">
      <div
        ref={pass}
        className={`pass${idle ? " idle" : ""}${over ? " over" : ""}${spin ? " spin" : ""}${cleared ? " done" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`Your tenant passport${cleared ? ", cleared to view" : ""}, ${nStamps} of ${slots.length} stamps. Turn it over`}
        aria-pressed={over}
        onClick={turn}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); turn(); } }}
      >
        <div className="tilt" ref={tilt}>
          <div className="flip">
            <span className="edge" style={{ ["--z" as string]: "-3px" }} />
            <span className="edge" style={{ ["--z" as string]: "-1.5px" }} />
            <span className="edge" style={{ ["--z" as string]: "0px" }} />
            <span className="edge" style={{ ["--z" as string]: "1.5px" }} />
            <span className="edge" style={{ ["--z" as string]: "3px" }} />
            <div className="pf front idp">
              <Guilloche />
              <div className="id-band"><span>The Letting Experts</span></div>
              <div className="id-body">
                <span className="id-photo">
                  {d.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.photo} alt="" style={{ objectPosition: photoPosition(d.photoFocus) }} />
                  ) : initials ? <i>{initials}</i> : <Ic k="user" />}
                </span>
                <dl className="id-f">
                  <div><dt>Surname</dt><dd className={surname ? "" : "empty"}>{surname || "Your name"}</dd></div>
                  <div><dt>Given names</dt><dd>{given || "\u00a0"}</dd></div>
                  <div className="half"><dt>Date of birth</dt><dd>{bornOn(d.dob) || "\u00a0"}</dd></div>
                  <div className="half"><dt>Moving</dt><dd>{moving || "\u00a0"}</dd></div>
                  <div><dt>Status</dt><dd>{cleared ? <span className="id-cleared">Cleared to view</span> : <>In progress · {shown}%<span className="id-bar"><i style={{ width: `${shown}%` }} /></span></>}</dd></div>
                </dl>
              </div>
              <span className="emb" aria-hidden="true"><Emboss ringId={ringId} /></span>
              <div className="id-mrz" aria-hidden="true"><span>{mrz[0]}</span><span>{mrz[1]}</span></div>
              <span className="glare" />
              <span className="holo" />
            </div>
            <div className="pf back">
              <div className="pt"><span>Stamps</span><span>{nStamps} of {slots.length}</span></div>
              <div className="slots">
                {slots.map((s, i) => {
                  const k = i + 1;
                  const st = s.stamp!;
                  const on = stamped.includes(k) && held !== k;
                  return (
                    <div className="slot" key={s.id}>
                      {on ? (
                        <span className={`stamp${st.sq ? " sq" : ""}${thud === k ? " new" : ""}`} style={{ ["--c" as string]: st.color, ["--r" as string]: `${st.rot}deg` }}>
                          {st.label}
                        </span>
                      ) : (
                        st.label
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="holo" />
            </div>
          </div>
        </div>
      </div>
      <p className="phint">Tap your passport to turn it over</p>
    </div>
  );
}

/** A blind-embossed seal: no ink, just a raised edge of light above and shadow below. */
function Emboss({ ringId }: { ringId: string }) {
  const art = (c: string, text: boolean) => (
    <>
      <circle cx="50" cy="50" r="47" />
      <circle cx="50" cy="50" r="33" />
      {text && (
        <text fontFamily="Inter, sans-serif" fontSize="7.4" letterSpacing="2.1" fontWeight="600" fill={c} stroke="none">
          <textPath href={`#${ringId}`} startOffset="0">THE LETTING EXPERTS · TENANT PASSPORT ·</textPath>
        </text>
      )}
      <g transform="translate(50 50) scale(1.15) translate(-12 -12)" strokeWidth="1.3">
        {MARK_PATHS.map((p) => <path key={p} d={p} />)}
      </g>
    </>
  );
  return (
    <svg viewBox="-2 -2 104 104">
      <defs>
        <path id={ringId} d="M50 50 m-40 0 a40 40 0 1 1 80 0 a40 40 0 1 1 -80 0" fill="none" stroke="none" />
      </defs>
      <g transform="translate(0 1.1)" fill="none" stroke="rgba(120,45,22,.46)" strokeWidth="1.2">{art("rgba(120,45,22,.46)", true)}</g>
      <g transform="translate(0 -.7)" fill="none" stroke="rgba(255,255,255,.72)" strokeWidth="1.2">{art("rgba(255,255,255,.72)", true)}</g>
    </svg>
  );
}

/** The two machine-readable lines, 32 characters each (room at the end for the cleared stamp), the way a passport's data page ends. Only what's on the page above goes into them. */
function mrzLines(surname: string, given: string, dob: string, stamps: number): [string, string] {
  const clean = (x: string) => x.toUpperCase().normalize("NFD").replace(/[^A-Z ]/g, "").trim().replace(/\s+/g, "<");
  const pad = (x: string) => (x + "<".repeat(32)).slice(0, 32);
  const m = /^(\d{2})(\d{2})-(\d{2})-(\d{2})$/.exec(dob);
  const born = m ? `${m[2]}${m[3]}${m[4]}` : "<<<<<<";
  return [pad(`P<TLE${clean(surname) || "<"}<<${clean(given)}`), pad(`TENANT<PASSPORT<<${born}<<${stamps}`)];
}

/** Security paper: fine coral waves across the page. */
function Guilloche() {
  const waves: string[] = [];
  for (let k = 0; k < 14; k++) {
    const pts: string[] = [];
    for (let x = -10; x <= 330; x += 6) pts.push(`${x},${(30 + k * 12 + 5 * Math.sin(x / 14 + k * 0.6)).toFixed(1)}`);
    waves.push(`M${pts.join("L")}`);
  }
  return (
    <svg className="id-guil" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" strokeWidth=".45">
        <g stroke="rgba(219,112,84,.22)">{waves.map((p) => <path key={p} d={p} />)}</g>
      </g>
    </svg>
  );
}
