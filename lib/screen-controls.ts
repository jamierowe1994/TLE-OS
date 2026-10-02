"use client";

import { neverPress, type ScreenControl, type ScreenControlKind, type ScreenSnapshot, type ScreenStep } from "@/lib/steve-never";

/**
 * STEVE'S EYES AND HANDS ON THE PAGE (James, 2 Oct 2026): "a literal personal
 * assistant ... every single ability to help them if we can do it on the
 * page ... apart from pushing properties live."
 *
 * readScreen() lists the controls in front of the person - buttons, fields,
 * dropdowns, ticks, tabs - each with a short ref, its words and what is in it.
 * That goes with every question, so he knows what they are looking at and what
 * could be done there. runSteps() then does what he planned, on THEIR screen,
 * in their session, with the same permissions the page already gave them: it
 * types, chooses and presses exactly as their own hands would, so nothing he
 * does can go round a rule a button enforces.
 *
 * The refs only mean something until the next read. A control that has gone
 * by the time the plan is run stops the run rather than guessing.
 */

const PICK = [
  "button",
  "a[href]",
  "input:not([type=hidden]):not([type=password]):not([type=file])",
  "select",
  "textarea",
  "[role=button]",
  "[role=tab]",
  "[role=checkbox]",
  "[role=switch]",
  "[contenteditable=true]",
].join(",");

const MAX = 90;
let refs = new Map<string, HTMLElement>();

const clean = (s: string | null | undefined, n = 70) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function shown(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
}

/** In view but under something else - the page behind an open drawer. Only
    what is in view can be tested; the rest is taken as it comes. */
function covered(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + Math.min(r.height / 2, 12);
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const top = document.elementFromPoint(x, y);
  if (!top || el === top || el.contains(top) || top.contains(el)) return false;
  /* The dock and his own highlight sit over everything; they do not count. */
  return !top.closest("[data-steve-dock], label");
}

/** The words a person would use for it. */
function labelOf(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return clean(aria);
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    if (clean(t)) return clean(t);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && clean(l.textContent)) return clean(l.textContent);
    }
    const wrap = el.closest("label");
    if (wrap) {
      const t = clean(wrap.textContent);
      if (t) return t;
    }
    if ("placeholder" in el && el.placeholder) return clean(el.placeholder);
    /* A field drawn under a heading-ish line in the same box. */
    const box = el.parentElement;
    const near = box?.querySelector("label, span, p, div > span");
    if (near && near !== el && clean(near.textContent)) return clean(near.textContent);
    return clean(el.name || el.title);
  }
  /* A button with a line of explanation under its name is called by its name. */
  const words = (el.innerText || el.textContent || "").split("\n").map((t) => t.trim()).filter(Boolean);
  return clean(words[0] || el.getAttribute("title") || "");
}

function kindOf(el: HTMLElement): ScreenControlKind {
  const role = el.getAttribute("role");
  if (role === "tab") return "tab";
  if (role === "checkbox" || role === "switch") return "checkbox";
  if (el instanceof HTMLSelectElement) return "select";
  if (el instanceof HTMLTextAreaElement || el.isContentEditable) return "textarea";
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return "checkbox";
    if (el.type === "number") return "number";
    if (el.type === "date" || el.type === "datetime-local" || el.type === "time") return "date";
    if (["button", "submit", "reset"].includes(el.type)) return "button";
    return "text";
  }
  if (el instanceof HTMLAnchorElement) return "link";
  return "button";
}

/** The front layer: an open dialog wins over the page behind it. */
function frontLayer(): HTMLElement {
  const dialogs = [...document.querySelectorAll<HTMLElement>("[role=dialog], [aria-modal=true], dialog[open]")].filter(
    (d) => shown(d) && !d.closest("[data-steve-dock]")
  );
  return dialogs.at(-1) ?? document.body;
}

export function readScreen(path: string): ScreenSnapshot {
  refs = new Map();
  const root = frontLayer();
  const title = clean(document.querySelector("h1")?.textContent ?? document.title, 100);
  const headings = [...root.querySelectorAll<HTMLElement>("h1, h2, h3")]
    .filter((h) => shown(h) && !h.closest("[data-steve-dock]"))
    .map((h) => clean(h.textContent, 60))
    .filter(Boolean)
    .slice(0, 14);
  const vh = window.innerHeight;
  const all = [...root.querySelectorAll<HTMLElement>(PICK)].filter(
    (el) => !el.closest("[data-steve-dock], [data-steve-skip], [data-os-sidebar], [data-admin-rail]") && shown(el) && !covered(el)
  );
  /* What is in view first, then the rest of the page, so a long form is still
     reachable without filling the list with the footer. */
  const near = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh ? 0 : 1;
  };
  all.sort((a, b) => near(a) - near(b));

  const controls: ScreenControl[] = [];
  const seen = new Set<string>();
  for (const el of all) {
    if (controls.length >= MAX) break;
    const label = labelOf(el);
    const kind = kindOf(el);
    if (!label && kind !== "text" && kind !== "textarea") continue;
    /* Twenty identical "Open" buttons are one fact, not twenty. */
    const sig = `${kind}|${label}`;
    if ((kind === "button" || kind === "link") && seen.has(sig)) continue;
    seen.add(sig);
    const ref = `s${controls.length + 1}`;
    refs.set(ref, el);
    const c: ScreenControl = { ref, kind, label: label || "(unlabelled box)" };
    if (el instanceof HTMLSelectElement) {
      c.value = clean(el.selectedOptions[0]?.text, 60);
      c.options = [...el.options].slice(0, 14).map((o) => clean(o.text, 40));
    } else if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      c.value = el.checked ? "ticked" : "not ticked";
    } else if (el.getAttribute("role") === "checkbox" || el.getAttribute("role") === "switch") {
      c.value = el.getAttribute("aria-checked") === "true" ? "on" : "off";
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      c.value = clean(el.value, 120);
    } else if (el.isContentEditable) {
      c.value = clean(el.innerText, 120);
    }
    if (el.closest("[data-steve-never]") || ((kind === "button" || kind === "link" || kind === "checkbox") && neverPress(label, path))) c.never = true;
    controls.push(c);
  }
  return { title, headings, controls };
}

/** Typed in so React hears it: the native setter, then the events. */
function typeInto(el: HTMLElement, value: string) {
  if (el.isContentEditable) {
    el.focus();
    el.innerText = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return;
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  (el as HTMLInputElement).focus();
  set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  (el as HTMLInputElement).blur();
}

function chooseIn(el: HTMLSelectElement, value: string): boolean {
  const want = value.trim().toLowerCase();
  const opt =
    [...el.options].find((o) => o.text.trim().toLowerCase() === want || o.value.toLowerCase() === want) ??
    [...el.options].find((o) => o.text.trim().toLowerCase().includes(want));
  if (!opt) return false;
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  set?.call(el, opt.value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Do the plan, one step at a time, where they can watch it happen. Each control
 * is scrolled to and lit before it is touched. Returns what happened in words.
 */
export async function runSteps(steps: ScreenStep[], path: string): Promise<{ ok: boolean; done: number; message: string }> {
  let done = 0;
  for (const s of steps) {
    const el = refs.get(s.ref);
    if (!el || !el.isConnected) {
      return { ok: false, done, message: `The screen changed before I got to "${s.says}". Ask me again and I'll look afresh.` };
    }
    /* Checked again at the moment of pressing: the words on a button can
       change between reading the screen and doing the plan. */
    if (s.do === "press" || s.do === "tick" || s.do === "untick") {
      if (el.closest("[data-steve-never]") || neverPress(labelOf(el), path)) {
        return { ok: false, done, message: `"${labelOf(el)}" is yours to press, never mine. Everything before it is done.` };
      }
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("os-steve-touch");
    await wait(420);
    try {
      if (s.do === "type") typeInto(el, s.value ?? "");
      else if (s.do === "choose") {
        if (!(el instanceof HTMLSelectElement) || !chooseIn(el, s.value ?? "")) {
          el.classList.remove("os-steve-touch");
          return { ok: false, done, message: `I couldn't find "${s.value}" in ${labelOf(el) || "that list"}.` };
        }
      } else if (s.do === "tick" || s.do === "untick") {
        const on = el instanceof HTMLInputElement ? el.checked : el.getAttribute("aria-checked") === "true";
        if (on !== (s.do === "tick")) el.click();
      } else el.click();
    } finally {
      window.setTimeout(() => el.classList.remove("os-steve-touch"), 700);
    }
    done++;
    /* A press can open a drawer or load a step; give it a beat. */
    await wait(s.do === "press" ? 650 : 250);
  }
  return { ok: true, done, message: "Done." };
}
