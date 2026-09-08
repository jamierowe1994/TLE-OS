"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Playfair_Display } from "next/font/google";
import {
  ADDRESS_ZONE, CARD, colourFor, fontFor, illustrationFor, withExample,
  type Layer, type PostcardDesign, type Side,
} from "@/lib/postcard-design";

/**
 * The card, drawn from its layers.
 *
 * ── Why everything is in millimetres ──────────────────────────────────────
 *
 * A6 is 148 x 105mm. Every layer carries mm, and the whole card is scaled to
 * whatever room the screen has, so a design looks the same at any size and
 * the numbers in the studio mean something a printer would recognise.
 *
 * ── What the card draws, and nobody moves ─────────────────────────────────
 *
 * The address block and the opt-out line. One is Royal Mail's, the other is
 * the law; neither is a design decision, so neither is a layer.
 */

const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-postcard",
  display: "swap",
});

/**
 * The code, drawn here rather than fetched from Stannp: their endpoint wants
 * a separate public key and a round trip per card, and one fewer thing to be
 * down on the morning of a mailing is worth having. High correction, because
 * postcards get bent.
 */
function useQr(url: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!url.trim()) { setSrc(null); return; }
    QRCode.toDataURL(url.trim(), { errorCorrectionLevel: "H", margin: 0, scale: 8, color: { dark: "#101014", light: "#ffffff" } })
      .then((d) => { if (live) setSrc(d); })
      .catch(() => { if (live) setSrc(null); });
    return () => { live = false; };
  }, [url]);
  return src;
}

function LayerView({ layer, scale, example }: { layer: Layer; scale: number; example: boolean }) {
  const qr = useQr(layer.kind === "qr" ? layer.url ?? "" : "");
  const say = (t: string) => (example ? withExample(t) : t);
  const box: React.CSSProperties = {
    position: "absolute",
    left: layer.x * scale,
    top: layer.y * scale,
    width: layer.w * scale,
  };

  if (layer.kind === "image") {
    const art = illustrationFor(layer.src);
    return <img src={art.src} alt="" style={{ ...box, height: "auto", display: "block" }} />;
  }

  if (layer.kind === "rule") {
    /* Drawn as a curve, not a border, so it keeps the hand-made kink. */
    return (
      <svg style={{ ...box, height: (layer.w / 11) * scale, overflow: "visible" }} viewBox="0 0 380 34" preserveAspectRatio="none">
        <path d="M6 22 C 90 6, 232 4, 374 14" fill="none" stroke={colourFor(layer.colour).hex} strokeWidth="12" strokeLinecap="round" />
      </svg>
    );
  }

  if (layer.kind === "wordmark") {
    return (
      <div style={box}>
        <p style={{ margin: 0, fontSize: 2.6 * scale, letterSpacing: 0.5 * scale, color: "#101014", fontWeight: 600 }}>THE</p>
        <p style={{ margin: 0, fontSize: 6.6 * scale, letterSpacing: 0.55 * scale, lineHeight: 1, color: "#101014", fontWeight: 500 }}>LETTING</p>
        <p style={{ margin: 0, fontSize: 3 * scale, letterSpacing: 1.4 * scale, color: "#101014", fontWeight: 500 }}>EXPERTS</p>
      </div>
    );
  }

  if (layer.kind === "qr") {
    return qr ? <img src={qr} alt="" style={{ ...box, height: layer.w * scale, display: "block" }} /> : null;
  }

  const paras = (layer.text ?? "").split("\n").map((p) => p.trim());
  return (
    <div style={{ ...box, textAlign: layer.align ?? "left" }}>
      {paras.map((p, i) =>
        p === "" ? (
          <div key={i} style={{ height: (layer.size ?? 3) * 0.6 * scale }} />
        ) : (
          <p
            key={i}
            style={{
              margin: 0,
              fontFamily: fontFor(layer.font).css,
              fontSize: (layer.size ?? 3) * scale,
              fontWeight: layer.bold ? 600 : 400,
              fontStyle: layer.italic ? "italic" : "normal",
              lineHeight: layer.lineHeight ?? 1.4,
              color: colourFor(layer.colour).hex,
            }}
          >
            {say(p)}
          </p>
        )
      )}
    </div>
  );
}

export function PostcardSide({
  design, side, width = 460, example = true, showZones = false, children,
}: {
  design: PostcardDesign;
  side: Side;
  width?: number;
  example?: boolean;
  /** The studio turns these on: the trim margin and Royal Mail's half. */
  showZones?: boolean;
  children?: React.ReactNode;
}) {
  const scale = width / CARD.w;
  const layers = design.layers.filter((l) => l.side === side);

  return (
    <div
      className={display.variable}
      style={{
        width: CARD.w * scale,
        height: CARD.h * scale,
        position: "relative",
        overflow: "hidden",
        background: side === "front" ? design.paper : "#ffffff",
        borderRadius: 2 * scale,
        boxShadow: "0 10px 30px -14px rgba(28,20,16,.4)",
        flexShrink: 0,
      }}
    >
      {layers.map((l) => (
        <LayerView key={l.id} layer={l} scale={scale} example={example} />
      ))}

      {side === "back" && (
        <>
          {/* Royal Mail's, not ours. */}
          <div style={{ position: "absolute", right: 7 * scale, top: 8 * scale, width: 62 * scale }}>
            <div style={{ height: 12 * scale, width: 12 * scale, marginLeft: "auto", border: `${0.3 * scale}px dashed #cdc9c0`, borderRadius: 1 * scale }} />
            <div style={{ marginTop: 6 * scale, paddingLeft: 2 * scale }}>
              {["{firstname} {lastname}", "{address1}", "{city}", "{postcode}"].map((l, i) => (
                <p key={i} style={{ margin: 0, fontSize: 3.3 * scale, lineHeight: 1.55, color: i === 0 ? "#101014" : "#3f3d3a" }}>
                  {l.replace(/\{(\w+)\}/g, (w, k: string) =>
                    example
                      ? ({ firstname: "Margaret", lastname: "Hollis", address1: "18 Wellfield Terrace", city: "Bristol", postcode: "BS7 8HP" } as Record<string, string>)[k] ?? w
                      : w
                  )}
                </p>
              ))}
            </div>
          </div>
          <p style={{ position: "absolute", left: 7 * scale, bottom: 3.4 * scale, margin: 0, fontSize: 2.2 * scale, color: "#8b8781" }}>
            Not for you? Call {withExample("{phone}")} or write to us and we will not contact you again.
          </p>
        </>
      )}

      {showZones && (
        <>
          <div
            style={{
              position: "absolute", inset: CARD.safe * scale,
              border: "1px dashed rgba(199,111,79,.45)", pointerEvents: "none", borderRadius: 1 * scale,
            }}
          />
          {side === "back" && (
            <div
              style={{
                position: "absolute",
                left: ADDRESS_ZONE.x * scale, top: ADDRESS_ZONE.y * scale,
                width: ADDRESS_ZONE.w * scale, height: ADDRESS_ZONE.h * scale,
                background: "rgba(199,111,79,.06)", border: "1px dashed rgba(199,111,79,.4)",
                pointerEvents: "none",
              }}
            />
          )}
        </>
      )}

      {children}
    </div>
  );
}

/** Both sides, for a preview or a proof. */
export function PostcardPair({ design, width = 430, example = true }: { design: PostcardDesign; width?: number; example?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
      {(["front", "back"] as Side[]).map((side) => (
        <figure key={side} style={{ margin: 0 }}>
          <PostcardSide design={design} side={side} width={width} example={example} />
          <figcaption style={{ marginTop: 8, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted, #6b6b70)" }}>
            {side}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
