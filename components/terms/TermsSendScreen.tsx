"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TermsPaper, { Blank, type PaperPerson } from "@/components/terms/TermsPaper";
import { isScottish } from "@/lib/property-flags";
import { edition, editionFor } from "@/lib/terms/catalogue";
import { guessService, servicesFor } from "@/lib/terms/services";
import type { Country, LandlordDetails, TermsValues } from "@/lib/terms/types";

/**
 * SEND THE TERMS, ON ONE PAGE (James, 24 Oct 2026).
 *
 * "Where we click 'Sign the contract' and we send it from documents, that's
 * where that starts. It gives you a different layout to what we've currently
 * got, which I think is a lot clearer... It shows it on the page, and then
 * you've got the option down the right-hand side to send out to the landlord
 * with the different steps."
 *
 * Built from his design (send-the-terms.html: renderSend, steps, send). The
 * contract on the left is our real one (components/terms/TermsPaper, the
 * October 2026 England or Scotland wording) drawn live from what is on the
 * right, so the agent sees exactly what the landlord will read as they change
 * it. Down the right, three steps, each locked until the one before is done:
 *
 *   1. Check the details: who signs, the property, which country's terms, the
 *      service and fees, and each landlord's home address (it goes on the
 *      contract; "Send without it" leaves it for them to add when they sign).
 *   2. Sign your half: their saved signature, drawn, or typed in a hand. It is
 *      always sent as a PNG, the only thing DocuSeal will seal.
 *   3. Send: the email that goes, as it goes. Nothing to type into it: the
 *      email is the standard one from lib/email/tle-emails.
 *
 * Sending is two real requests, made then signed (POST /api/terms, then the
 * agent-sign action, which seals the signature with DocuSeal and emails every
 * landlord). The envelope and its ticks follow those answers, so it never says
 * sealed or emailed over something that wasn't; whoever's email didn't go is
 * named on the last screen with their link to copy.
 *
 * Opened three ways from the Terms of Business banner (components/terms/
 * TermsPanel): a fresh send, Adjust contract (filled in from the set that is
 * out, replacing it once signed), and Sign your part on one already made
 * (the details are settled, so it opens on step 2).
 */

export type StaffParty = {
  key: string;
  name: string;
  email: string;
  phone: string;
  status: "waiting" | "emailed" | "opened" | "signed";
  emailedAt: string | null;
  emailError: string | null;
  openedAt: string | null;
  signedAt: string | null;
  link: string;
  /** The address the agent put on, only while the agent has still to sign (lib/terms/staff). */
  homeAddress?: string | null;
};

export type StaffTerms = {
  id: string;
  version: string;
  country: Country;
  status: "agent" | "sent" | "signed" | "cancelled";
  propertyAddress: string;
  agentName: string;
  agentEmail: string;
  agentSignedAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string;
  signedR2Key: string | null;
  values: TermsValues;
  replaces: string | null;
  parties: StaffParty[];
};

/** Which wording each country sends now ("October 2026"), or null where there is none yet. */
export type Editions = { scotland: string | null; england: string | null };

type Known = { name?: string | null; email?: string | null; phone?: string | null };

/** Their home address: not decided yet, put on the contract, or left for them to add when they sign. */
type Home = "unset" | "set" | "skip";
type Person = { name: string; email: string; phone: string; home: string; homeIs: Home };

/**
 * A home address typed in rather than picked (James, 24 Oct 2026: "if they can't find the
 * address, they can't move on ... just make sure it has the number or house name, town and
 * postcode"). Null when it will do; otherwise what it still needs.
 */
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
function typedHomeProblem(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (!POSTCODE.test(t)) return "Add the postcode to their home address.";
  const parts = t.replace(POSTCODE, "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const first = parts[0] ?? "";
  if (!/\d/.test(first) && first.split(/\s+/).length < 2) return "Start their home address with the house number or name.";
  if (parts.length < 2) return "Add the town to their home address, after a comma.";
  return null;
}

type Tick = { label: string; state: "" | "go" | "ok" | "skip" | "warn" };

/* The design's line icons (send-the-terms.html PATHS), the few this screen draws. */
const PATHS = {
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 6l-6 6 6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  pen: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
} as const;
const Ic = ({ k, w = 1.7 }: { k: keyof typeof PATHS; w?: number }) => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={PATHS[k]} />
  </svg>
);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const firstOf = (name: string) => name.trim().split(/\s+/)[0] || "";
const listOf = (xs: string[]) => (xs.length < 2 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
/** "24 October 2026", London's day: what the contract is dated, as lib/terms/flow dates it. */
const london = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const londonTime = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
/* Wide enough that the paper and the panel sit side by side; below it the design stacks them, and
   scrolling the paper to a detail would carry the agent away from the step they are on. */
const sideBySide = () => typeof window !== "undefined" && window.innerWidth > 1100;

async function postJson(url: string, body: unknown): Promise<{ ok?: boolean; error?: string; terms?: StaffTerms } | null> {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => null);
}

/**
 * The agent's name set in the hand, as a PNG (DocuSeal seals PNG or JPEG, never
 * SVG). Caveat arrives as --font-hand with preload off, so it is asked for and
 * waited on first; a canvas drawn before the font lands silently uses the
 * fallback, and that is the signature that would be sealed.
 */
async function typedSignature(name: string): Promise<string | null> {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-hand").trim() || "cursive";
  const px = 88;
  const font = `500 ${px}px ${family}`;
  try {
    await Promise.race([document.fonts.load(font, name), wait(2500)]);
  } catch {
    /* Drawn in whatever the browser has; still the agent's own name. */
  }
  const c = document.createElement("canvas");
  const probe = c.getContext("2d");
  if (!probe) return null;
  probe.font = font;
  c.width = Math.ceil(probe.measureText(name).width) + 48;
  c.height = Math.round(px * 1.5);
  /* Resizing a canvas resets its context, so the font is set again. */
  const cx = c.getContext("2d")!;
  cx.font = font;
  cx.fillStyle = "#141413";
  cx.textBaseline = "middle";
  cx.fillText(name, 24, c.height / 2);
  return c.toDataURL("image/png");
}

/** Which terms the address gets: the postcode decides (James, 24 Oct 2026); the home's own record only where there is no postcode to go by. */
function countryFor(addr: string, propertyAddress: string, scottish: boolean | null): Country {
  const hasPostcode = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(addr);
  if (hasPostcode) return isScottish(addr) ? "scotland" : "england";
  return addr.trim() === propertyAddress.trim() && scottish ? "scotland" : isScottish(addr) ? "scotland" : "england";
}

export default function TermsSendScreen({
  from = null,
  signing = null,
  onWithdraw,
  propertyAddress,
  listingId,
  propertyId,
  appraisalId,
  landlords,
  agentLarn,
  serviceOnRecord,
  feesOnRecord,
  scottish,
  editions,
  preview,
  onClose,
  onSent,
}: {
  /** Adjust contract: the set out now, whose answers the screen starts from and which the new one replaces. */
  from?: StaffTerms | null;
  /** Sign your part: a contract already made and waiting for the agent. Opens on step 2. */
  signing?: StaffTerms | null;
  /** Adjust contract: withdraw the set out now without sending another. */
  onWithdraw?: () => Promise<string | null>;
  propertyAddress: string;
  listingId: string | null;
  propertyId: string | null;
  appraisalId: string | null;
  landlords: Known[];
  agentLarn: string | null;
  serviceOnRecord: string | null;
  feesOnRecord?: { setUpFee?: string | null; managementFee?: string | null } | null;
  scottish: boolean | null;
  editions: Editions;
  preview: boolean;
  /** Closed before sending. changed: a contract was made on the way, so the banner should look again. */
  onClose: (changed: boolean) => void;
  /** Sent, and the agent has pressed Back to the file. */
  onSent: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [today] = useState(london);

  /* ── The details (step 1), started the way the drawer before it started them ── */
  const startAddress = signing?.propertyAddress ?? from?.propertyAddress ?? propertyAddress;
  const [address, setAddress] = useState(startAddress);
  const byAddress = countryFor(address, propertyAddress, scottish);
  /* WHICH TERMS FOLLOWS THE POSTCODE (James, 24 Oct 2026): "If the property
     is a Scottish property based on postcode, then it's under Scottish law, so
     they shouldn't have to click between the two." No choice for the agent;
     a contract already made keeps its own. */
  const [chosen] = useState<Country | null>(() => (signing ? signing.country : null));
  const country: Country = chosen ?? (editions[byAddress] ? byAddress : byAddress === "scotland" ? "england" : "scotland");

  const [people, setPeople] = useState<Person[]>(() => {
    const base = signing ?? from;
    if (base) {
      return base.parties.map((p) => {
        const home = (p.homeAddress ?? "").trim();
        /* A contract waiting for the agent carries the address they gave; an
           adjusted one starts unasked, as staff never see what a landlord typed. */
        return { name: p.name, email: p.email, phone: p.phone ?? "", home, homeIs: home ? "set" : signing ? "skip" : "unset" };
      });
    }
    const known = landlords.filter((l) => l.name || l.email).map((l) => ({ name: l.name ?? "", email: l.email ?? "", phone: l.phone ?? "", home: "", homeIs: "unset" as Home }));
    return known.length ? known : [{ name: "", email: "", phone: "", home: "", homeIs: "unset" }];
  });

  const base = signing ?? from;
  const start = (base && servicesFor(country).find((o) => o.label === base.values.serviceLevel)) || guessService(country, base?.values.serviceLevel ?? serviceOnRecord);
  const [service, setService] = useState(start.id);
  const [setUpFee, setSetUpFee] = useState(base?.values.setUpFee ?? feesOnRecord?.setUpFee ?? start.setUpFee);
  const [managementFee, setManagementFee] = useState(base?.values.managementFee ?? feesOnRecord?.managementFee ?? start.managementFee);
  const [additional, setAdditional] = useState(base && base.values.additionalFees !== "None" ? base.values.additionalFees : "");
  const [larn, setLarn] = useState(base && base.values.agentLarn !== "Not recorded" ? base.values.agentLarn : agentLarn ?? "");
  const serviceLabel = servicesFor(country).find((o) => o.id === service)?.label ?? service;

  /* One part of step 1 open for changing at a time; who signs starts open when we don't know them well enough to send. */
  type Part = "people" | "property" | "country" | "fees" | "larn";
  const [editing, setEditing] = useState<Part | null>(() =>
    !signing && people.some((p) => !p.name.trim() || !EMAIL.test(p.email.trim())) ? "people" : null
  );

  /* ── Who is signing for us ── */
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const a = j?.actor;
        if (live && a) setMe({ name: String(a.name || a.email || ""), email: String(a.email ?? "") });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  /* The contract's own name where it is made already; otherwise the person signed in, as lib/terms/flow names them. */
  const agentName = signing?.agentName || me?.name || "";

  /* ── The steps ── */
  const [step, setStep] = useState<0 | 1 | 2>(signing ? 1 : 0);
  const [okDetails, setOkDetails] = useState(Boolean(signing));
  /* The contract made on the way, when signing then failed: kept so trying again signs that one rather than making a second. */
  const [made, setMade] = useState<StaffTerms | null>(null);
  const fixed = signing ?? made;

  /* ── The signature (step 2) ── */
  const [saved, setSaved] = useState<string | null>(null);
  const [mode, setMode] = useState<"saved" | "draw" | "type">("draw");
  const [sig, setSig] = useState<string | null>(null);
  const [keep, setKeep] = useState(true);
  const [keepUsed, setKeepUsed] = useState(false);
  const [signProblem, setSignProblem] = useState<string | null>(null);
  const modeTouched = useRef(false);
  useEffect(() => {
    let live = true;
    fetch("/api/terms/signature", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const img = typeof j?.image === "string" ? j.image : null;
        if (!live) return;
        setSaved(img);
        /* Their own signature first, the way the design opens, unless they have already started on another. */
        if (img && !modeTouched.current) setMode("saved");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const cv = useRef<HTMLCanvasElement | null>(null);
  const padBox = useRef<HTMLDivElement | null>(null);
  const signBtn = useRef<HTMLButtonElement | null>(null);
  const ink = useRef<{ drawing: boolean; last: [number, number] | null; box: [number, number, number, number] | null; dpr: number }>({ drawing: false, last: null, box: null, dpr: 1 });
  const [inked, setInked] = useState(false);

  /* The design's mountPad: the canvas sized to the pad at the screen's pixel density. */
  const mountPad = useCallback(() => {
    const c = cv.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
    const cx = c.getContext("2d");
    if (!cx) return;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.lineWidth = 2.4;
    cx.lineCap = "round";
    cx.lineJoin = "round";
    cx.strokeStyle = "#141413";
    ink.current = { drawing: false, last: null, box: null, dpr };
    setInked(false);
  }, []);
  /* After the portal is in (mounted): "Sign your part" opens straight on this step, and the canvas isn't there on the first pass. */
  useEffect(() => {
    if (mounted && step === 1 && mode === "draw" && !sig) mountPad();
  }, [mounted, step, mode, sig, mountPad]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const b = e.currentTarget.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  };
  const grow = ([x, y]: [number, number]) => {
    const b = ink.current.box;
    ink.current.box = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y];
  };
  const padEvents = {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      ink.current.drawing = true;
      ink.current.last = at(e);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      const s = ink.current;
      const cx = cv.current?.getContext("2d");
      if (!s.drawing || !s.last || !cx) return;
      const p = at(e);
      cx.beginPath();
      cx.moveTo(s.last[0], s.last[1]);
      cx.quadraticCurveTo(s.last[0], s.last[1], (s.last[0] + p[0]) / 2, (s.last[1] + p[1]) / 2);
      cx.lineTo(p[0], p[1]);
      cx.stroke();
      grow(s.last);
      grow(p);
      s.last = p;
      if (!inked) setInked(true);
    },
    onPointerUp: () => {
      ink.current.drawing = false;
    },
    onPointerCancel: () => {
      ink.current.drawing = false;
    },
  };

  /** What was drawn, cut to the ink with a little room, so it sits in the signature box the size it was written. */
  function drawnSignature(): string | null {
    const c = cv.current;
    const b = ink.current.box;
    if (!c || !b) return null;
    const { dpr } = ink.current;
    const room = 8;
    const x0 = Math.max(0, Math.floor((b[0] - room) * dpr));
    const y0 = Math.max(0, Math.floor((b[1] - room) * dpr));
    const x1 = Math.min(c.width, Math.ceil((b[2] + room) * dpr));
    const y1 = Math.min(c.height, Math.ceil((b[3] + room) * dpr));
    const out = document.createElement("canvas");
    out.width = Math.max(1, x1 - x0);
    out.height = Math.max(1, y1 - y0);
    out.getContext("2d")?.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  const shake = (el: HTMLElement | null) =>
    el?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], 300);

  /* ── Flashing a detail on the paper, as the design does when it changes ── */
  const [lit, setLit] = useState<string | null>(null);
  const flash = (id: string) =>
    window.setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      if (sideBySide()) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setLit(id);
      window.setTimeout(() => setLit((l) => (l === id ? null : l)), 1400);
    }, 60);

  async function signIt() {
    setSignProblem(null);
    let img: string | null = null;
    if (mode === "saved") img = saved;
    else if (mode === "type") {
      if (!agentName) return setSignProblem("Your name hasn't loaded yet. Give it a moment.");
      img = await typedSignature(agentName);
    } else {
      if (!ink.current.box) {
        shake(padBox.current);
        shake(signBtn.current);
        return;
      }
      img = drawnSignature();
    }
    if (!img) return setSignProblem("That signature couldn't be made here. Try drawing it instead.");
    setSig(img);
    setKeepUsed(mode === "draw" && keep);
    setStep(2);
    flash("ts-sig-agent");
  }

  async function forgetSaved() {
    const r = await fetch("/api/terms/signature", { method: "DELETE" }).then((x) => x.ok).catch(() => false);
    if (!r) return setSignProblem("It couldn't be forgotten just now. Try again in a moment.");
    setSaved(null);
    modeTouched.current = true;
    setMode("draw");
  }

  /* ── What is still missing from step 1: the drawer's checks, then the server's own ── */
  const peopleProblem = (() => {
    if (!people.length) return "Add the person who signs.";
    for (const p of people) {
      if (!p.name.trim()) return "Everybody who signs needs a name.";
      if (!EMAIL.test(p.email.trim())) return `${p.name.trim()} needs an email address, so their link can reach them.`;
    }
    if (new Set(people.map((p) => p.email.trim().toLowerCase())).size !== people.length) return "Two people have the same email address. Each person signs from their own.";
    return null;
  })();
  const detailsProblem =
    peopleProblem ??
    (!address.trim()
      ? "The terms need the property's address."
      : !setUpFee.trim() || !managementFee.trim()
        ? "Fill in the service and both fees before it goes."
        : !editionFor(country)
          ? "There are no terms for that country yet."
          : (() => {
              /* Not required: blank means they add it when they sign; typed means it has to be whole. */
              for (const x of people) if (x.homeIs === "unset") { const why = typedHomeProblem(x.home); if (why) return why; }
              return null;
            })());

  const setPerson = (i: number, patch: Partial<Person>) => setPeople((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const pickService = (id: string) => {
    const o = servicesFor(country).find((x) => x.id === id);
    setService(id);
    if (o) {
      setSetUpFee(o.setUpFee);
      setManagementFee(o.managementFee);
    }
  };

  function detailsRight() {
    if (detailsProblem && !fixed) return;
    /* A home address still open: typed in full goes on the contract; blank, they add it when they sign. */
    if (!fixed) setPeople((ps) => ps.map((x) => (x.homeIs !== "unset" ? x : x.home.trim() ? { ...x, home: x.home.trim(), homeIs: "set" } : { ...x, homeIs: "skip" })));
    setEditing(null);
    setOkDetails(true);
    setStep(sig ? 2 : 1);
    flash(sig ? "ts-sign" : "ts-sig-agent");
  }

  function openStep(k: 0 | 1 | 2) {
    const can = [true, okDetails, okDetails && !!sig][k];
    if (!can || phase === "sending") return;
    setStep(k);
    /* Reopening a finished step undoes it, as the design does: the details are checked again, the signature signed again. */
    if (k === 0 && !fixed) setOkDetails(false);
    if (k === 1 && sig) setSig(null);
  }

  /* ── The paper ── */
  const doc = signing ? edition(signing.version) : editionFor(country);
  const values: TermsValues = signing
    ? signing.values
    : {
        agentName: agentName || "Your name",
        agentLarn: larn.trim() || "Not recorded",
        propertyAddress: address.trim(),
        serviceLevel: serviceLabel,
        setUpFee: setUpFee.trim(),
        managementFee: managementFee.trim(),
        additionalFees: additional.trim() || "None",
        dateIssued: today,
      };
  const paperPeople: PaperPerson[] = people.map((p, i) => ({
    key: `l${i + 1}`,
    name: p.name.trim() || (people.length > 1 ? `Landlord ${i + 1}` : "The landlord"),
    details: { name: p.name.trim(), email: p.email.trim(), phone: p.phone.trim(), address: p.homeIs === "set" ? p.home : "" },
  }));
  const feesAt = doc ? doc.sections.findIndex((s) => s.blocks.some((b) => b.kind === "fees")) : -1;
  const [jumped, setJumped] = useState("ts-you");
  const jump = (id: string) => {
    setJumped(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const drawDetail = (p: PaperPerson, k: keyof LandlordDetails, v: string): React.ReactNode => {
    if (k !== "address") return v ? (k === "accountNumber" ? `•••• ${v.slice(-4)}` : v) : <Blank>They add this when they sign</Blank>;
    const i = Number(p.key.slice(1)) - 1;
    const who = people[i];
    const id = `ts-home-${p.key}`;
    /* Highlighted until it is set, the design's .fld: striped while it is wanted, plain once it is in. */
    if (!who || who.homeIs === "skip") return <Blank>They add this when they sign</Blank>;
    if (who.homeIs === "unset") return <span id={id} className={`fld empty${lit === id ? " flash" : ""}`}>Their home address</span>;
    return <span id={id} className={`fld done${lit === id ? " flash" : ""}`}>{v}</span>;
  };

  /* ── Sending ── */
  const [phase, setPhase] = useState<"idle" | "sending" | "failed" | "sent">("idle");
  const [env, setEnv] = useState(0);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<StaffTerms | null>(null);
  const [sentAt, setSentAt] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const tick = (i: number, state: Tick["state"], label?: string) => setTicks((ts) => ts.map((t, j) => (j === i ? { label: label ?? t.label, state } : t)));

  const firstNames = listOf(people.map((p) => firstOf(p.name)).filter(Boolean)) || "the landlord";
  const fullNames = people.length > 1 ? firstNames : people[0]?.name.trim() || "the landlord";
  const ready = okDetails && !!sig;

  async function send() {
    if (!ready || !sig || phase === "sending") return;
    setPhase("sending");
    setFailure(null);
    setEnv(0);
    let id = fixed?.id ?? null;
    /* Made first (unless it already is), then signed: one tick per thing the server confirms. */
    const making = !id;
    const list: Tick[] = [
      ...(making ? [{ label: "The contract made", state: "go" as const }] : []),
      { label: "Your signature added", state: making ? "" : "go" },
      { label: preview ? "Not sealed: this machine has no DocuSeal" : "Sealed by DocuSeal", state: "" },
      { label: `Emailed to ${fullNames}`, state: "" },
    ];
    setTicks(list);
    const at = making ? 1 : 0;

    if (!id) {
      const j = await postJson("/api/terms", {
        country,
        listingId,
        propertyId,
        appraisalId,
        propertyAddress: address,
        agentLarn: larn,
        serviceLevel: serviceLabel,
        setUpFee,
        managementFee,
        additionalFees: additional,
        people: people.map((p) => ({ name: p.name, email: p.email, phone: p.phone, address: p.homeIs === "set" ? p.home : "" })),
        replaces: from?.id ?? null,
      });
      if (!j?.ok || !j.terms) {
        tick(0, "warn");
        setFailure(j?.error ?? "The terms couldn't be made. Try again in a moment.");
        return setPhase("failed");
      }
      id = j.terms.id;
      setMade(j.terms);
      tick(0, "ok");
      tick(1, "go");
    }
    setEnv(1);

    const r = await postJson(`/api/terms/${id}`, { action: "agent-sign", signature: sig, keep: keepUsed });
    if (!r?.ok || !r.terms?.agentSignedAt) {
      tick(at, "warn");
      setFailure(r?.error ?? "Your signature didn't go on. Nothing has been sent. Try again in a moment.");
      return setPhase("failed");
    }
    const t = r.terms;
    tick(at, "ok");
    await wait(450);
    tick(at + 1, preview ? "skip" : "ok");
    setEnv(2);
    await wait(450);
    const went = t.parties.filter((p) => p.emailedAt);
    const missed = t.parties.filter((p) => !p.emailedAt && !p.signedAt);
    tick(
      at + 2,
      missed.length ? "warn" : "ok",
      !missed.length ? `Emailed to ${fullNames}` : went.length ? `Emailed to ${listOf(went.map((p) => p.name))}, not to ${listOf(missed.map((p) => p.name))}` : "The email didn't go"
    );
    /* The envelope only flies when something actually went. */
    if (went.length) {
      setEnv(3);
      await wait(1000);
    } else await wait(700);
    setSentAt(`${london()}, ${londonTime()}`);
    setResult(t);
    setPhase("sent");
  }

  const close = useCallback(() => onClose(Boolean(made)), [onClose, made]);

  /* Escape closes, and nothing else hears it (this sits over a listing or an appraisal that has its own). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      if (phase === "sending") return;
      if (phase === "sent") onSent();
      else if (phase === "failed") setPhase("idle");
      else close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase, close, onSent]);

  /* The page behind stays still while this is open. */
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = was;
    };
  }, []);

  const [withdrawAsk, setWithdrawAsk] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawProblem, setWithdrawProblem] = useState<string | null>(null);

  const copyLink = (p: StaffParty) => {
    navigator.clipboard
      ?.writeText(p.link)
      .then(() => {
        setCopied(p.key);
        window.setTimeout(() => setCopied(null), 1600);
      })
      .catch(() => window.prompt("Their link", p.link));
  };

  if (!mounted) return null;

  /* ── Step 1 ── */
  const locked = Boolean(fixed);
  const chg = (part: Part, label = "Change") =>
    locked ? null : (
      <button type="button" className="chg" onClick={() => setEditing(editing === part ? null : part)}>
        {editing === part ? "Done" : label}
      </button>
    );
  const editionLine = (c: Country) => (editions[c] ? `${editions[c]} wording` : "Not in the OS yet");

  const stepOne = (
    <div className="body">
      <div className="facts">
        {people.map((p, i) => (
          <Fragment key={i}>
            <span>{people.length > 1 ? `Landlord ${i + 1}` : "Landlord"}</span>
            <b>
              {p.name.trim() || <em className="miss">No name yet</em>}
              {i === 0 && chg("people")}
            </b>
            <span>Email</span>
            <b>{p.email.trim() || <em className="miss">No email yet</em>}</b>
            {p.phone.trim() ? (
              <>
                <span>Mobile</span>
                <b>{p.phone.trim()}</b>
              </>
            ) : null}
          </Fragment>
        ))}
        <span>Property</span>
        <b>
          {address.trim() || <em className="miss">No address yet</em>}
          {chg("property")}
        </b>
        <span>Terms</span>
        <b>
          {country === "scotland" ? "Scotland" : "England"} · {editionLine(country)}
          <small className="by">From the postcode</small>
        </b>
        <span>Service</span>
        <b>
          {serviceLabel}
          {chg("fees")}
        </b>
        <span>Set-up fee</span>
        <b>{setUpFee.trim() || <em className="miss">Not set</em>}</b>
        <span>Management</span>
        <b>{managementFee.trim() || <em className="miss">Not set</em>}</b>
        {additional.trim() ? (
          <>
            <span>Additional</span>
            <b>{additional.trim()}</b>
          </>
        ) : null}
        {country === "scotland" && (
          <>
            <span>Your LARN</span>
            <b>
              {larn.trim() || <em className="miss">Not recorded</em>}
              {chg("larn")}
            </b>
          </>
        )}
      </div>

      {editing === "people" && (
        <div className="edit-box">
          {people.map((p, i) => (
            <div key={i} className="person">
              {people.length > 1 && (
                <div className="person-h">
                  <b>Landlord {i + 1}</b>
                  <button type="button" className="chg" onClick={() => setPeople((ps) => ps.filter((_, j) => j !== i))}>Remove</button>
                </div>
              )}
              <label className="fl">
                Name
                <div className="ac"><input value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} placeholder="Full name" autoComplete="off" /></div>
              </label>
              <div className="row-2">
                <label className="fl">
                  Email
                  <div className="ac"><input type="email" value={p.email} onChange={(e) => setPerson(i, { email: e.target.value })} placeholder="name@example.com" autoComplete="off" /></div>
                </label>
                <label className="fl">
                  Mobile
                  <div className="ac"><input type="tel" value={p.phone} onChange={(e) => setPerson(i, { phone: e.target.value })} placeholder="Optional" autoComplete="off" /></div>
                </label>
              </div>
            </div>
          ))}
          <div className="done-row">
            <button type="button" className="chg" onClick={() => setPeople((ps) => [...ps, { name: "", email: "", phone: "", home: "", homeIs: "unset" }])}>
              Add another person
            </button>
            <button type="button" className="btn sm" disabled={Boolean(peopleProblem)} onClick={() => setEditing(null)}>Done</button>
          </div>
          <p className="fl">Everyone who owns the home signs, each from their own link.</p>
        </div>
      )}

      {editing === "property" && (
        <div className="edit-box">
          <label className="fl">
            The property
            <div className="ac"><input value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && address.trim() && setEditing(null)} /></div>
          </label>
        </div>
      )}

      {editing === "fees" && (
        <div className="edit-box">
          <label className="fl">
            Service
            <div className="ac">
              <select value={service} onChange={(e) => pickService(e.target.value)}>
                {servicesFor(country).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </label>
          <label className="fl">
            Set-up / tenant find fee
            <div className="ac"><input value={setUpFee} onChange={(e) => setSetUpFee(e.target.value)} /></div>
          </label>
          <label className="fl">
            Management / rent collection fee
            <div className="ac"><input value={managementFee} onChange={(e) => setManagementFee(e.target.value)} placeholder="e.g. 10% + VAT of the rent each month" /></div>
          </label>
          <label className="fl">
            Additional fees agreed
            <div className="ac"><input value={additional} onChange={(e) => setAdditional(e.target.value)} placeholder="None" /></div>
          </label>
        </div>
      )}

      {editing === "larn" && country === "scotland" && (
        <div className="edit-box">
          <label className="fl">
            Your letting agent registration number (LARN)
            <div className="ac"><input value={larn} onChange={(e) => setLarn(e.target.value)} placeholder="LARN1234567" /></div>
            <small>Printed in clause 1 beside The Letting Experts&apos; own.</small>
          </label>
        </div>
      )}

      {people.map((p, i) => (
        <div key={i} className="addr">
          <label htmlFor={`tsa-home-${i}`}>{people.length > 1 ? `${firstOf(p.name) || `Landlord ${i + 1}`}'s home address` : "Their home address"}</label>
          {p.homeIs !== "unset" ? (
            <div className="addr-set">
              {p.homeIs === "set" ? <Ic k="check" w={2.4} /> : null}
              <span>{p.homeIs === "set" ? p.home : "Not given. They add it before they sign."}</span>
              {!locked && (
                <button type="button" className="chg" onClick={() => setPerson(i, { homeIs: "unset" })}>Change</button>
              )}
            </div>
          ) : (
            <>
              <p>It goes on the contract. Pick it from the list, or type it in full: number or house name, street, town and postcode. Not required: left blank, they add it before they sign.</p>
              <HomeSearch
                id={`tsa-home-${i}`}
                start={p.home}
                onType={(home) => setPerson(i, { home })}
                onSet={(home) => {
                  setPerson(i, { home, homeIs: "set" });
                  flash(`ts-home-l${i + 1}`);
                }}
              />
              <div className="quick">
                <button
                  type="button"
                  onClick={() => {
                    setPerson(i, { home: address.trim(), homeIs: "set" });
                    flash(`ts-home-l${i + 1}`);
                  }}
                >
                  They live at the let property
                </button>
                <button type="button" onClick={() => setPerson(i, { homeIs: "skip" })}>Send without it</button>
              </div>
            </>
          )}
        </div>
      ))}

      {locked && <p className="legal">This contract is made with these details. To change them, close this, withdraw it on the file and start again.</p>}
      <button type="button" className="btn primary wide go" disabled={!locked && Boolean(detailsProblem)} onClick={detailsRight}>
        These are right <Ic k="arrow" />
      </button>
      {!locked && detailsProblem && editing !== "people" ? <p className="todo-in">{detailsProblem}</p> : null}
      {!locked && editing === "people" && peopleProblem ? <p className="todo-in">{peopleProblem}</p> : null}
    </div>
  );

  /* ── Step 2 ── */
  const stepTwo = (
    <div className="body">
      <div className="signer">
        <span>Signing as <b>{agentName || "…"}</b></span>
        <span>Dated <b>{today}</b></span>
      </div>
      <div className="seg">
        {saved ? (
          <button type="button" className={mode === "saved" ? "on" : ""} onClick={() => { modeTouched.current = true; setMode("saved"); }}>My signature</button>
        ) : null}
        <button type="button" className={mode === "draw" ? "on" : ""} onClick={() => { modeTouched.current = true; setMode("draw"); }}>Draw</button>
        <button type="button" className={mode === "type" ? "on" : ""} onClick={() => { modeTouched.current = true; setMode("type"); }}>Type</button>
      </div>
      {mode === "saved" && saved ? (
        <>
          <div className="typed" style={{ font: "inherit" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={saved} alt="Your saved signature" style={{ height: 64, maxWidth: "90%", objectFit: "contain" }} />
          </div>
          <button type="button" className="chg" style={{ marginTop: 10 }} onClick={() => void forgetSaved()}>Forget my saved signature</button>
        </>
      ) : mode === "type" ? (
        <div className="typed">{agentName || "…"}</div>
      ) : (
        <>
          <div className={`pad${inked ? " has" : ""}`} ref={padBox}>
            <canvas ref={cv} {...padEvents} aria-label="Sign here" />
            <span className="base" />
            <span className="x">×</span>
            <span className="hint">Sign here with your mouse or finger</span>
            <button type="button" className="clr" onClick={mountPad}>Clear</button>
          </div>
          <label className="saved-sig">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            Save it for next time
          </label>
        </>
      )}
      <p className="legal">
        By signing you agree to these terms on behalf of The Letting Experts. {people.length > 1 ? "They" : firstOf(people[0]?.name ?? "") || "They"} can&apos;t open the contract until you&apos;ve signed.
      </p>
      {preview && <p className="legal">This machine isn&apos;t connected to DocuSeal, so this is a preview: your signature goes on the page, and nothing is sealed or filed.</p>}
      {signProblem && <p className="err">{signProblem}</p>}
      <button type="button" className="btn primary wide go" ref={signBtn} onClick={() => void signIt()}>
        <Ic k="pen" /> Sign
      </button>
    </div>
  );

  /* ── Step 3: the email as it goes. It is the standard "landlord-terms-request" email
     (lib/email/tle-emails), from the agent's mailbox through lib/send-as-agent. ── */
  const agentFirst = firstOf(agentName) || "you";
  const stepThree = (
    <div className="body">
      <div className="mail">
        <div>
          <span>To</span>
          <b style={{ fontWeight: 500 }}>
            {people.map((p, i) => (
              <span key={i} style={{ display: "block", color: "inherit" }}>{p.name.trim()} · {p.email.trim()}</span>
            ))}
          </b>
        </div>
        <div>
          <span>Subject</span>
          <b style={{ fontWeight: 500 }}>Your terms of business for {address.trim()}</b>
        </div>
        <div className="note" style={{ display: "block" }}>
          <p>Hi {firstOf(people[0]?.name ?? "") || "there"},</p>
          <p>
            Thank you for choosing The Letting Experts for <b style={{ fontWeight: 500 }}>{address.trim()}</b>. Your terms of business are ready, and {agentFirst} has already signed for us.
          </p>
          <p>Any questions at all, just reply to this email and it comes straight to {agentFirst}.</p>
        </div>
        <span className="att">
          <Ic k="doc" />
          <span><b>Terms of Business</b> · {people.length > 1 ? "each their own link" : "a link"} to read and sign, with your half already signed</span>
        </span>
      </div>
      <p className="mail-say">
        From your Outlook when it&apos;s connected, so replies come back to you; otherwise from The Letting Experts with your address to reply to.
        {people.length > 1 ? " Each person gets their own email." : ""}
      </p>
    </div>
  );

  const sum = [
    okDetails ? `${people.map((p) => p.name.trim()).join(", ")} · ${serviceLabel}` : "The names, the home and the fees",
    sig ? `Signed as ${agentName}, ${today}` : "Your name and today's date go in for you",
    `To ${people.map((p) => p.email.trim()).filter(Boolean).join(", ") || "the landlord"}`,
  ];
  const can = [true, okDetails, okDetails && !!sig];
  const done = [okDetails, Boolean(sig), false];
  const stp = (k: 0 | 1 | 2, title: string, body: React.ReactNode) => (
    <section className={`stp${step === k ? " on" : ""}${done[k] ? " ok" : ""}${!can[k] ? " lock" : ""}`}>
      <header
        role="button"
        tabIndex={can[k] ? 0 : -1}
        aria-expanded={step === k}
        aria-disabled={!can[k]}
        onClick={() => openStep(k)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openStep(k);
          }
        }}
      >
        <i>{done[k] ? <Ic k="check" w={3} /> : k + 1}</i>
        <span>
          <b>{title}</b>
          <span>{sum[k]}</span>
        </span>
        <span className="edit">{k === 0 && locked ? "View" : "Change"}</span>
      </header>
      {body}
    </section>
  );

  const todo = [!okDetails && "check the details", !sig && "sign your half"].filter(Boolean) as string[];
  const lead = signing ? "Sign your part" : from ? "Adjust the terms" : "Send the terms";
  const leadTo = signing || from ? "for" : "to";

  /* ── The envelope, sending and sent ── */
  const missed = result ? result.parties.filter((p) => !p.emailedAt && !p.signedAt) : [];
  const went = result ? result.parties.filter((p) => p.emailedAt) : [];
  const fly = (
    <div className={`fly${phase !== "idle" ? " on" : ""}${env >= 1 ? " s1" : ""}${env >= 2 ? " s2" : ""}${env >= 3 && phase !== "sent" ? " s3" : ""}`} role="status" aria-live="polite">
      {phase === "sending" || phase === "failed" ? (
        <div className="fly-in">
          <div className="env">
            <span className="back" />
            <span className="letter"><i /><i /><i /><i className="s" /></span>
            <span className="front" />
            <span className="flap" />
          </div>
          {phase === "sending" ? (
            <h3>Sending it <span>to {firstNames}…</span></h3>
          ) : (
            <h3>It hasn&apos;t gone <span>yet.</span></h3>
          )}
          <ul className="ticks">
            {ticks.map((t, i) => (
              <li key={i} className={t.state}>
                <i>{t.state === "ok" ? <Ic k="check" w={3} /> : t.state === "warn" ? "!" : null}</i>
                {t.label}
              </li>
            ))}
          </ul>
          {phase === "failed" && (
            <>
              <p>{failure}</p>
              <div className="fly-acts">
                <button type="button" className="btn primary" onClick={() => void send()}>Try again</button>
                <button type="button" className="btn" onClick={() => setPhase("idle")}>Back to the terms</button>
              </div>
            </>
          )}
        </div>
      ) : phase === "sent" && result ? (
        <div className="fly-in">
          {went.length ? (
            <svg className="done-tick" viewBox="0 0 88 88" aria-hidden>
              <circle cx="44" cy="44" r="44" />
              <path d="M27 45l11 11 23-24" />
            </svg>
          ) : null}
          <h3>
            {!went.length ? (
              <>Signed, <span>but not sent.</span></>
            ) : (
              <>Sent to {listOf(went.map((p) => firstOf(p.name)))}.</>
            )}
          </h3>
          <p>
            {went.length
              ? `${went.map((p) => p.email).join(", ")} · ${sentAt}`
              : "Your half is signed and the contract is ready, but the email didn't go. Send each person their link yourself."}
          </p>
          {missed.length > 0 && (
            <div className="missed">
              {missed.map((p) => (
                <div key={p.key}>
                  <b>{went.length ? `${p.name}'s email didn't go` : p.name}</b>
                  <small>{p.emailError || "The email didn't go."} Copy their link and send it to them.</small>
                  <button type="button" className="btn sm" onClick={() => copyLink(p)}>
                    {copied === p.key ? <><Ic k="check" w={2.4} />Copied</> : <><Ic k="link" />Copy their link</>}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="next3">
            <div><i>1</i><span><b>{people.length > 1 ? "Each of them signs on their phone." : `${firstOf(people[0]?.name ?? "") || "They"} signs on their phone.`}</b> No account or printing needed.</span></div>
            <div><i>2</i><span><b>The file shows when they open it,</b> and again when they sign.</span></div>
            <div><i>3</i><span><b>Once everyone has signed,</b> the signed copy is filed and sent to each of them.</span></div>
          </div>
          <button type="button" className="btn primary" onClick={onSent}>Back to the file <Ic k="arrow" /></button>
        </div>
      ) : null}
    </div>
  );

  return createPortal(
    <div className="tsa tsa-screen" role="dialog" aria-modal="true" aria-label={`${lead} to ${fullNames}`}>
      <div className="send">
        <div className="sheet-wrap">
          <div className="sheet-top">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Ic k="doc" /> Terms of Business · as {firstNames} will read it
            </span>
            <span className="pages">
              <button type="button" className={jumped === "ts-you" ? "on" : ""} onClick={() => jump("ts-you")}>The details</button>
              {feesAt >= 0 && <button type="button" className={jumped === `ts-s${feesAt}` ? "on" : ""} onClick={() => jump(`ts-s${feesAt}`)}>Fees</button>}
              <button type="button" className={jumped === "ts-sign" ? "on" : ""} onClick={() => jump("ts-sign")}>Signatures</button>
            </span>
          </div>
          {/* Which terms these are, at a glance in the corner (James, 24 Oct 2026). */}
          <span className="which" aria-label={`${country === "scotland" ? "Scottish" : "English"} terms of business`}>
            {country === "scotland" ? "Scottish Terms" : "English Terms"}
          </span>
          {doc ? (
            <TermsPaper
              doc={doc}
              values={values}
              reference={fixed?.id ?? null}
              people={paperPeople}
              agent={{ signature: sig, signedOn: sig ? today : null }}
              you="agent"
              detail={drawDetail}
            />
          ) : (
            <p className="sheet-none">There are no terms for {country === "scotland" ? "Scotland" : "England"} in the OS yet.</p>
          )}
        </div>

        <aside className="panel">
          <div className="p-head">
            <button type="button" className="back" onClick={close}>
              <Ic k="back" /> Back to the file
            </button>
            <h2>
              {lead} <span>{leadTo} {firstNames}.</span>
            </h2>
            <p>
              {signing
                ? `Made, but nothing has gone yet. Sign and it goes straight to ${firstNames}.`
                : from
                  ? `Change what you need and sign again. Everyone gets a fresh link, and the contract sent ${day(from.sentAt)} is withdrawn at the same moment.`
                  : `Straight to ${firstNames}, without a presentation. Three steps and it's gone.`}
            </p>
          </div>
          <div className="p-body">
            {stp(0, "Check the details", stepOne)}
            {stp(1, "Sign your half", stepTwo)}
            {stp(2, `Send to ${firstNames}`, stepThree)}
          </div>
          <div className="p-foot">
            <button type="button" className="btn primary wide" disabled={!ready || phase === "sending"} onClick={() => void send()}>
              <Ic k="mail" /> Send to {fullNames}
            </button>
            <p className="todo">
              {ready
                ? people.length > 1
                  ? "Each of them gets their own email with a link to sign on their phone."
                  : `${firstNames} gets an email with a link to sign on their phone.`
                : `Still to do: ${todo.join(" and ")}.`}
            </p>
            {from && onWithdraw && !made && (
              <div className="wd">
                {withdrawAsk ? (
                  <>
                    <p>Withdraw it without sending a new one? Their links stop working.</p>
                    <button type="button" className="btn sm" disabled={withdrawing} onClick={() => setWithdrawAsk(false)}>Keep it</button>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={withdrawing}
                      onClick={async () => {
                        setWithdrawing(true);
                        setWithdrawProblem(null);
                        const p = await onWithdraw();
                        setWithdrawing(false);
                        if (p) setWithdrawProblem(p);
                      }}
                    >
                      {withdrawing ? "Withdrawing…" : "Withdraw"}
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn link" onClick={() => setWithdrawAsk(true)}>Withdraw without a new one</button>
                )}
                {withdrawProblem && <p className="err">{withdrawProblem}</p>}
              </div>
            )}
          </div>
        </aside>
      </div>
      {fly}
    </div>,
    document.body
  );
}

/**
 * The design's address box: type, pick from the address file (/api/address,
 * Homesearch then Google, the same lookup every address field in the OS uses),
 * or press Enter to use it as written.
 */
function HomeSearch({ id, start, onSet, onType }: { id: string; start: string; onSet: (address: string) => void; onType?: (address: string) => void }) {
  const [q, setQ] = useState(start);
  const [list, setList] = useState<{ id: string; label: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const typed = useRef(false);

  /* Debounced: a lookup per keystroke is a lookup paid for per keystroke. */
  useEffect(() => {
    const v = q.trim();
    if (!typed.current || v.length < 3) {
      setList(null);
      return;
    }
    let live = true;
    const t = window.setTimeout(async () => {
      const j = await fetch(`/api/address?q=${encodeURIComponent(v)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!live) return;
      setList(Array.isArray(j?.suggestions) ? j.suggestions : []);
      setOpen(true);
    }, 320);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q]);

  async function pick(s: { id: string; label: string }) {
    setOpen(false);
    setBusy(true);
    const j = await fetch(`/api/address?resolve=${encodeURIComponent(s.id)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    onSet(typeof j?.address === "string" && j.address.trim() ? j.address.trim() : s.label);
  }

  return (
    <div className="ac">
      <input
        id={id}
        value={q}
        placeholder={busy ? "Finding it…" : "Start typing an address or postcode"}
        autoComplete="off"
        onChange={(e) => {
          typed.current = true;
          setQ(e.target.value);
          onType?.(e.target.value);
        }}
        onFocus={() => list && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim().length > 6 && !typedHomeProblem(q)) {
            e.preventDefault();
            onSet(q.trim());
          }
        }}
      />
      {open && list && q.trim().length >= 3 && (
        <ul>
          {list.length ? (
            list.slice(0, 6).map((s) => (
              <li key={s.id} onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(s)}>
                {s.label}
              </li>
            ))
          ) : (
            <li style={{ color: "var(--faint)", cursor: "default" }}>No match. Type it in full (number or house name, street, town, postcode) and carry on.</li>
          )}
        </ul>
      )}
    </div>
  );
}
