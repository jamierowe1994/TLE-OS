"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Search for anything (10 Oct 2026). Search in the sidebar, or ⌘K, darkens
 * the screen and opens one box; as you type, results gather underneath in
 * five groups - Tenant, Landlord, Back office, Portfolio, Works orders - with
 * the photo of the home where there is one. Arrow keys move, Enter opens,
 * Escape closes. The searching is lib/search-all.
 *
 * Opened from anywhere with: window.dispatchEvent(new Event(OPEN_SEARCH)).
 */

export const OPEN_SEARCH = "os-search-open";

type Group = "tenant" | "landlord" | "backoffice" | "portfolio" | "works";
type Item = { id: string; group: Group; label: string; title: string; sub: string; href: string; image?: string | null; snippet?: string | null };
type Answer = { groups: { group: Group; items: Item[]; more: number }[]; reason?: string };

const GROUPS: Record<Group, { title: string; icon: string }> = {
  tenant: { title: "Tenant", icon: "user" },
  landlord: { title: "Landlord", icon: "key" },
  backoffice: { title: "Back office", icon: "folder" },
  portfolio: { title: "Portfolio", icon: "home" },
  works: { title: "Works orders", icon: "checklist" },
};

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/** The typed words in bold, wherever they appear. */
function Marked({ text, words }: { text: string; words: string[] }) {
  if (!words.length || !text) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-transparent font-semibold text-ink">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function SearchPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const close = useCallback(() => {
    setShown(false);
    window.setTimeout(() => setOpen(false), 160);
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      requestAnimationFrame(() => {
        setShown(true);
        input.current?.focus();
        input.current?.select();
      });
    };
    window.addEventListener(OPEN_SEARCH, onOpen);
    return () => window.removeEventListener(OPEN_SEARCH, onOpen);
  }, []);

  /* Nothing behind it scrolls while it is open. */
  useEffect(() => {
    if (!open) return;
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = was;
    };
  }, [open]);

  /* Ask after a short pause, and only keep the answer to the latest words. */
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setAnswer(null);
      setBusy(false);
      setFailed(false);
      return;
    }
    const mine = ++seq.current;
    setBusy(true);
    const t = window.setTimeout(() => {
      fetch(`/api/search/all?q=${encodeURIComponent(term)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: Answer & { ok?: boolean }) => {
          if (mine !== seq.current) return;
          setFailed(!j.ok);
          setAnswer(j.ok ? { groups: j.groups ?? [], reason: j.reason } : null);
          setActive(0);
        })
        .catch(() => mine === seq.current && setFailed(true))
        .finally(() => mine === seq.current && setBusy(false));
    }, 180);
    return () => window.clearTimeout(t);
  }, [q]);

  const flat = useMemo(() => (answer?.groups ?? []).flatMap((g) => g.items), [answer]);
  const words = useMemo(() => q.trim().split(/\s+/).filter((w) => w.length > 1), [q]);

  const go = useCallback(
    (it: Item) => {
      close();
      setQ("");
      setAnswer(null);
      /* A screen that reads ?open= when it loads needs loading again when we
         are already on it; anywhere else, the router is quicker. */
      const path = it.href.split("?")[0];
      if (path === pathname) window.location.assign(it.href);
      else router.push(it.href);
    },
    [close, pathname, router]
  );

  /* Keep the highlighted row in view. */
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      go(flat[active]);
    }
  }

  if (!open || typeof document === "undefined") return null;

  let row = -1;
  return createPortal(
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-label="Search for anything" onKeyDown={onKey}>
      <button
        type="button"
        aria-label="Close search"
        onClick={close}
        className={`absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[2px] transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`relative mx-auto mt-[10vh] flex max-h-[78vh] w-[min(92vw,720px)] flex-col overflow-hidden rounded-3xl border border-line/70 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)] transition-[opacity,translate,scale] duration-200 ease-out motion-reduce:transition-none ${
          shown ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <label className="flex shrink-0 items-center gap-3 border-b border-line/70 px-5 py-4">
          <DoodleIcon name="search" size={18} className="shrink-0 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for anything"
            aria-label="Search for anything"
            className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted/70"
          />
          {busy ? (
            <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink" aria-label="Searching" />
          ) : (
            <kbd className="hidden shrink-0 rounded-md border border-line/80 px-1.5 py-0.5 font-sans text-[10.5px] text-muted sm:block">Esc</kbd>
          )}
        </label>

        <div ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {q.trim().length < 2 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[13px] text-ink">Tenants, landlords, back office, portfolio and works orders.</p>
              <p className="mt-1 text-[12px] text-muted">A name, an address, a phone number, an email, a word from a note or a job.</p>
            </div>
          ) : failed ? (
            <p className="m-2 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">Search didn&apos;t answer just now. Try again in a moment.</p>
          ) : answer && !answer.groups.length && !busy ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-muted">{answer.reason ?? `Nothing found for "${q.trim()}".`}</p>
          ) : !answer ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
              Searching everything…
            </div>
          ) : (
            answer.groups.map((g) => (
              <section key={g.group} className="mb-2 last:mb-0">
                <h3 className="flex items-center gap-2 px-3 pb-1.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                  <DoodleIcon name={GROUPS[g.group].icon} size={12} />
                  {GROUPS[g.group].title}
                  <span className="figures font-normal normal-case tracking-normal">{g.items.length + g.more}</span>
                </h3>
                <ul>
                  {g.items.map((it) => {
                    row += 1;
                    const i = row;
                    const on = i === active;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          data-row={i}
                          onMouseMove={() => setActive(i)}
                          onClick={() => go(it)}
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors ${on ? "bg-card shadow-[0_6px_18px_-12px_rgba(16,16,20,0.35)]" : ""}`}
                        >
                          {it.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.image} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" loading="lazy" />
                          ) : (
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft/60 text-[12px] font-semibold text-accent-dark">
                              {g.group === "tenant" || g.group === "landlord" ? initials(it.title) || <DoodleIcon name={GROUPS[g.group].icon} size={15} /> : <DoodleIcon name={GROUPS[g.group].icon} size={15} />}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="truncate text-[13.5px] text-ink">
                                <Marked text={it.title} words={words} />
                              </span>
                              <span className="shrink-0 rounded-full bg-page px-2 py-0.5 text-[10px] font-semibold text-muted">{it.label}</span>
                            </span>
                            {it.sub && (
                              <span className="block truncate text-[11.5px] text-muted">
                                <Marked text={it.sub} words={words} />
                              </span>
                            )}
                            {it.snippet && (
                              <span className="mt-0.5 block line-clamp-2 text-[11.5px] leading-snug text-ink/70">
                                <Marked text={it.snippet} words={words} />
                              </span>
                            )}
                          </span>
                          {on && <span className="hidden shrink-0 text-[10.5px] text-muted sm:block">Enter</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {g.more > 0 && <p className="px-3 pt-0.5 text-[11px] text-muted">And {g.more} more - add a word to narrow it down.</p>}
              </section>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
