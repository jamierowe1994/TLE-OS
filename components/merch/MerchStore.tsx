"use client";

import "@/app/merch.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MERCH, type MerchLine, type MerchProduct } from "@/lib/merch-catalogue";

/**
 * The merch shop (James, 24 Nov 2026): "a really unique-looking hero page,
 * which will have a big, bold brand on the front of it", after two product
 * landing pages he sent - one dark, one product floating centre stage with
 * the buying on either side.
 *
 * In the house's own colours: lamp-lit brown behind, the name huge in linen,
 * the kit floating in front of it and following the pointer a little. Below,
 * the kit on linen. An order is a request: nothing is paid here and there are
 * no prices until James sets them (lib/merch).
 */

type Order = { id: string; lines: MerchLine[]; notes: string; status: string; createdAt: string; userName?: string };

const STATUS_WORD: Record<string, string> = { new: "With James", ordered: "Ordered", ready: "Ready to Collect", collected: "Collected" };

const Arrow = ({ left = false }: { left?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {left ? <path d="M19 12H5M11 6l-6 6 6 6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
  </svg>
);

const Bag = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 8h14l-1 12.5H6z" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
  </svg>
);

function priceText(p: MerchProduct) {
  return p.price == null ? "Price to come" : `£${p.price.toFixed(2)}`;
}

export default function MerchStore() {
  const [at, setAt] = useState(0);
  const [dir, setDir] = useState(1);
  const product = MERCH[at];
  const [colour, setColour] = useState<Record<string, string>>({});
  const [size, setSize] = useState<Record<string, string>>({});
  const [basket, setBasket] = useState<MerchLine[]>([]);
  const [sheet, setSheet] = useState<null | "basket" | "orders">(null);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [owner, setOwner] = useState(false);
  const [added, setAdded] = useState(0);
  const [needSize, setNeedSize] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);

  const pickedColour = colour[product.key] ?? product.colours[0].name;
  const pickedSize = size[product.key] ?? (product.sizes.length === 1 ? product.sizes[0] : "");
  const count = basket.reduce((n, l) => n + l.qty, 0);

  const go = useCallback((n: number) => {
    setDir(n >= 0 ? 1 : -1);
    setAt((i) => (i + n + MERCH.length) % MERCH.length);
    setNeedSize(false);
  }, []);

  const show = (i: number) => {
    setDir(i >= at ? 1 : -1);
    setAt(i);
    setNeedSize(false);
    scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* Arrow keys step through the kit while no sheet is open. */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(null);
      if (sheet || (e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go, sheet]);

  /* The kit leans a little towards the pointer (desktop only; reduced motion gets none). */
  useEffect(() => {
    const el = hero.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--mx", x.toFixed(3));
        el.style.setProperty("--my", y.toFixed(3));
      });
    };
    const leave = () => {
      el.style.setProperty("--mx", "0");
      el.style.setProperty("--my", "0");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  const loadOrders = useCallback(() => {
    setOrdersError(null);
    fetch("/api/merch/orders", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; orders?: Order[]; owner?: boolean; error?: string }) => {
        if (!j.ok) throw new Error(j.error || "Could not read your orders.");
        setOrders(j.orders ?? []);
        setOwner(Boolean(j.owner));
      })
      .catch((e: Error) => setOrdersError(e.message || "Could not read your orders."));
  }, []);
  useEffect(loadOrders, [loadOrders]);

  const add = () => {
    if (!pickedSize) {
      setNeedSize(true);
      return;
    }
    setBasket((b) => {
      const i = b.findIndex((l) => l.product === product.key && l.colour === pickedColour && l.size === pickedSize);
      if (i >= 0) return b.map((l, j) => (j === i ? { ...l, qty: Math.min(10, l.qty + 1) } : l));
      return [...b, { product: product.key, name: product.name, colour: pickedColour, size: pickedSize, qty: 1 }];
    });
    setAdded((n) => n + 1);
    setPlaced(null);
  };

  const bump = (i: number, d: number) =>
    setBasket((b) => b.flatMap((l, j) => (j !== i ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: Math.min(10, l.qty + d) }])));

  const place = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await fetch("/api/merch/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines: basket, notes }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; order?: Order; error?: string };
      if (!r.ok || !j.ok || !j.order) throw new Error(j.error || "That didn't go through. Try again.");
      setPlaced(j.order);
      setBasket([]);
      setNotes("");
      loadOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const thumbs = useMemo(() => MERCH.map((p, i) => ({ p, i })), []);

  return (
    <div ref={scroller} className="merch fixed inset-0 z-[105] overflow-y-auto overflow-x-hidden" data-sheet={sheet ? "open" : undefined}>
      <header className="m-bar">
        <Link href="/tools" className="m-back" aria-label="Back to the OS">
          <Arrow left />
          <span>Back to OS</span>
        </Link>
        <span className="m-mark" aria-label="TLE Merch">
          <b>TLE</b>
          <i>Merch</i>
        </span>
        <nav className="m-nav">
          <a href="#kit" onClick={(e) => { e.preventDefault(); document.getElementById("kit")?.scrollIntoView({ behavior: "smooth" }); }}>
            The Kit
          </a>
          <button type="button" onClick={() => setSheet("orders")}>
            Your Orders
          </button>
          {owner && <Link href="/tools/merch/orders">All Orders</Link>}
          <button type="button" className="m-bag" onClick={() => setSheet("basket")} aria-label={`Your order, ${count} item${count === 1 ? "" : "s"}`}>
            <Bag />
            <span key={added} className={`m-bag-n${count ? " is-on" : ""}`}>{count}</span>
          </button>
        </nav>
      </header>

      <section
        ref={hero}
        className="m-hero"
        aria-roledescription="carousel"
        aria-label="The kit"
        style={{ ["--letters" as string]: product.tint.letters, ["--glow" as string]: product.tint.glow }}
      >
        <div className="m-glow" aria-hidden />
        <h1 className="m-brand" aria-label="The Letting Experts">
          <span className="m-brand-1" aria-hidden>The Letting</span>
          <span className="m-brand-2" aria-hidden>Experts</span>
        </h1>

        <div className="m-stage" aria-live="polite">
          <div
            key={product.key}
            className="m-piece"
            style={{ ["--dir" as string]: dir, ["--scale" as string]: product.scale, ["--rim" as string]: product.tint.rim ?? "transparent", ["--edge" as string]: product.tint.edge ?? "transparent" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.image} alt={`${product.name} in ${pickedColour}`} draggable={false} />
          </div>
          <div className="m-shadow" aria-hidden style={{ ["--scale" as string]: product.scale }} />
        </div>

        <div key={`l-${product.key}`} className="m-left">
          <p className="m-word">{product.word}</p>
          <h2 className="m-name">{product.name}</h2>
          <p className="m-line">{product.line}</p>
          <p className="m-blurb">{product.blurb}</p>
        </div>

        <div className="m-right">
          <p className="m-for">{product.name}</p>
          <p className={`m-price${product.price == null ? "" : " is-set"}`}>{priceText(product)}</p>
          <p className="m-price-note">{product.price == null ? "Prices are being set. Order now and James will confirm the cost first." : "Nothing is paid on this page."}</p>

          <div className="m-pick">
            <p className="m-pick-l">
              Colour <span>{pickedColour}</span>
            </p>
            {product.colours.length > 1 && (
            <div className="m-swatches" role="radiogroup" aria-label="Colour">
              {product.colours.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={pickedColour === c.name}
                  aria-label={c.name}
                  className="m-swatch"
                  style={{ background: c.hex }}
                  onClick={() => setColour((s) => ({ ...s, [product.key]: c.name }))}
                />
              ))}
            </div>
            )}
          </div>

          <div className="m-pick">
            <p className="m-pick-l">
              Size {needSize && <span className="m-need">Pick a size</span>}
            </p>
            <div className={`m-sizes${needSize ? " is-need" : ""}`} role="radiogroup" aria-label="Size">
              {product.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={pickedSize === s}
                  className="m-size"
                  onClick={() => {
                    setSize((v) => ({ ...v, [product.key]: s }));
                    setNeedSize(false);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="m-add" onClick={add}>
            Add to Order
            <Arrow />
          </button>
          {count > 0 && (
            <button type="button" className="m-review" onClick={() => setSheet("basket")}>
              {count} in your order. Review and send
            </button>
          )}
        </div>

        <div className="m-switch">
          <button type="button" className="m-step" onClick={() => go(-1)} aria-label="Previous">
            <Arrow left />
          </button>
          <div className="m-thumbs">
            {thumbs.map(({ p, i }) => (
              <button key={p.key} type="button" className={`m-thumb${i === at ? " is-on" : ""}`} onClick={() => show(i)} aria-label={p.name} aria-current={i === at}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" draggable={false} />
              </button>
            ))}
          </div>
          <button type="button" className="m-step" onClick={() => go(1)} aria-label="Next">
            <Arrow />
          </button>
        </div>
      </section>

      <section id="kit" className="m-kit">
        <div className="m-kit-head">
          <h2>The Kit</h2>
          <p>Everything in the shop. Pick one to see it up close, choose your size and add it to your order.</p>
        </div>
        <div className="m-grid">
          {MERCH.map((p, i) => (
            <button key={p.key} type="button" className="m-card" onClick={() => show(i)}>
              <span className="m-card-pic">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" loading="lazy" style={{ ["--scale" as string]: p.scale }} />
              </span>
              <span className="m-card-name">{p.name}</span>
              <span className="m-card-foot">
                <span>{p.line}</span>
                <span>{priceText(p)}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="m-how">
          <div>
            <h3>Pick It</h3>
            <p>Choose the kit, the colour and your size. Add as many as you like.</p>
          </div>
          <div>
            <h3>Send It</h3>
            <p>Your order goes straight to James. Nothing is paid on this page.</p>
          </div>
          <div>
            <h3>Wear It</h3>
            <p>You will see it move from With James to Ready to Collect under Your Orders.</p>
          </div>
        </div>
      </section>

      <div className={`m-scrim${sheet ? " is-on" : ""}`} onClick={() => setSheet(null)} aria-hidden />
      <aside className={`m-sheet${sheet ? " is-on" : ""}`} aria-hidden={!sheet} aria-label={sheet === "orders" ? "Your orders" : "Your order"}>
        <div className="m-sheet-head">
          <div className="m-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={sheet === "basket"} onClick={() => setSheet("basket")}>
              Your Order{count ? ` (${count})` : ""}
            </button>
            <button type="button" role="tab" aria-selected={sheet === "orders"} onClick={() => setSheet("orders")}>
              Your Orders
            </button>
          </div>
          <button type="button" className="m-close" onClick={() => setSheet(null)} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {sheet === "basket" && (
          <div className="m-sheet-body">
            {placed ? (
              <div className="m-done">
                <h3>Order Placed</h3>
                <p>James has it. You can see where it is under Your Orders.</p>
                <ul className="m-lines is-plain">
                  {placed.lines.map((l, i) => (
                    <li key={i}>
                      <span>
                        {l.qty} x {l.name}
                      </span>
                      <em>
                        {l.colour}, {l.size}
                      </em>
                    </li>
                  ))}
                </ul>
                <button type="button" className="m-add is-dark" onClick={() => setSheet(null)}>
                  Back to the Shop
                </button>
              </div>
            ) : basket.length === 0 ? (
              <div className="m-empty">
                <p>Nothing in your order yet.</p>
                <button type="button" className="m-link" onClick={() => setSheet(null)}>
                  Have a look at the kit
                </button>
              </div>
            ) : (
              <>
                <ul className="m-lines">
                  {basket.map((l, i) => {
                    const p = MERCH.find((m) => m.key === l.product);
                    return (
                      <li key={`${l.product}-${l.colour}-${l.size}`}>
                        <span className="m-line-pic">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p && <img src={p.image} alt="" />}
                        </span>
                        <span className="m-line-what">
                          <b>{l.name}</b>
                          <em>
                            {l.colour}, {l.size}
                          </em>
                        </span>
                        <span className="m-qty">
                          <button type="button" onClick={() => bump(i, -1)} aria-label={`One fewer ${l.name}`}>
                            -
                          </button>
                          <span>{l.qty}</span>
                          <button type="button" onClick={() => bump(i, 1)} aria-label={`One more ${l.name}`} disabled={l.qty >= 10}>
                            +
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <label className="m-notes">
                  <span>Anything James should know</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={600} placeholder="A name on the back, a different fit, who it is for" />
                </label>
                <p className="m-fine">No payment is taken here. James will be in touch about the cost before anything is ordered.</p>
                {error && <p className="m-error">{error}</p>}
                <button type="button" className="m-add is-dark" onClick={place} disabled={sending}>
                  {sending ? (
                    <>
                      <span className="m-spin" aria-hidden />
                      Sending
                    </>
                  ) : (
                    <>
                      Place Order
                      <Arrow />
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {sheet === "orders" && (
          <div className="m-sheet-body">
            {ordersError ? (
              <div className="m-empty">
                <p>{ordersError}</p>
                <button type="button" className="m-link" onClick={loadOrders}>
                  Try again
                </button>
              </div>
            ) : orders === null ? (
              <p className="m-loading">
                <span className="m-spin is-ink" aria-hidden />
                Reading your orders
              </p>
            ) : orders.length === 0 ? (
              <div className="m-empty">
                <p>You haven&apos;t ordered anything yet.</p>
              </div>
            ) : (
              <ul className="m-orders">
                {orders.map((o) => (
                  <li key={o.id}>
                    <div className="m-order-top">
                      <span>{new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      <em data-status={o.status}>{STATUS_WORD[o.status] ?? o.status}</em>
                    </div>
                    {o.lines.map((l, i) => (
                      <p key={i}>
                        {l.qty} x {l.name} <span>{l.colour}, {l.size}</span>
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
