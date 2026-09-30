"use client";

import { useState } from "react";
import { FONT_STACKS, resolveMargin } from "@/lib/email/render.js";
import { LAYOUTS, cellsOf, type Block } from "./tree";
import { ICONS, UI } from "./icons";

/**
 * The right-hand panel: the selected section's settings, in the order people
 * reach for them - what it says, how it looks, the space around it, and where
 * it shows. Every control writes a field the renderer already reads, so there
 * is no setting here that does nothing in the inbox.
 */

export const LABEL: Record<string, string> = {
  heading: "Heading",
  text: "Text",
  button: "Button",
  image: "Image",
  video: "Video",
  columns: "Columns",
  divider: "Divider",
  spacer: "Space",
  quote: "Quote",
  faq: "Q&A",
  social: "Social links",
  logo: "Logo",
  code: "HTML / Embed",
  footer: "Footer",
};

/* The house palette first, so the brand colours are one click away. */
const SWATCHES = ["#101014", "#56423e", "#de968f", "#e31f36", "#a85a51", "#b3bea5", "#56634a", "#fdefec", "#f6f4f2", "#ffffff"];

type Patch = (field: string, value: unknown) => void;

export function Group({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [isOpen, setOpen] = useState(open);
  return (
    <section className="border-b border-[#eeeae6]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a817c]">{title}</span>
        <span className={`text-[#b9b0aa] transition-transform ${isOpen ? "" : "-rotate-90"}`}>
          <UI.down size={14} />
        </span>
      </button>
      {isOpen && <div className="space-y-4 px-5 pb-5">{children}</div>}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-[#3b3431]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-[#9a908a]">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-[#e4dfdb] bg-white px-3 py-2 text-[13px] text-[#1c1917] outline-none transition-colors placeholder:text-[#b9b0aa] focus:border-[#56423e]";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

function Slider({ value, min, max, step = 1, unit = "px", onChange }: { value: number; min: number; max: number; step?: number; unit?: string; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 flex-1 cursor-pointer accent-[#56423e]" />
      <span className="w-12 rounded-md bg-[#f6f4f2] py-1 text-center text-[11.5px] tabular-nums text-[#3b3431]">
        {value}
        {unit}
      </span>
    </div>
  );
}

function Colour({ value, onChange, allowNone }: { value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {allowNone && (
          <button type="button" onClick={() => onChange("")} title="None" className={`h-7 w-7 rounded-full border ${!value ? "ring-2 ring-[#56423e] ring-offset-1" : "border-[#e4dfdb]"} bg-[linear-gradient(135deg,#fff_45%,#e31f36_45%,#e31f36_55%,#fff_55%)]`} />
        )}
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            title={c}
            style={{ background: c }}
            className={`h-7 w-7 rounded-full border border-black/10 transition-transform hover:scale-110 ${value.toLowerCase() === c ? "ring-2 ring-[#56423e] ring-offset-1" : ""}`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} className="h-8 w-9 cursor-pointer rounded-md border border-[#e4dfdb] bg-white p-0.5" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={allowNone ? "None" : "#000000"} className={`${inputCls} font-mono text-[12px]`} />
      </div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-[#f3f0ed] p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          title={o.title}
          onClick={() => onChange(o.v)}
          className={`flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-[12px] transition-all ${value === o.v ? "bg-white font-semibold text-[#1c1917] shadow-sm" : "text-[#8a817c] hover:text-[#1c1917]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center justify-between py-0.5 text-left">
      <span className="text-[12.5px] text-[#3b3431]">{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-[#56423e]" : "bg-[#ddd6d1]"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Align({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Segmented
      value={(value || "left") as string}
      onChange={onChange}
      options={[
        { v: "left", label: <UI.alignLeft size={16} />, title: "Left" },
        { v: "center", label: <UI.alignCenter size={16} />, title: "Centre" },
        { v: "right", label: <UI.alignRight size={16} />, title: "Right" },
      ]}
    />
  );
}

function FontPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fonts = FONT_STACKS as { key: string; label: string; web?: boolean }[];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">The house font</option>
      {fonts.map((f) => (
        <option key={f.key} value={f.key}>
          {f.label}
          {f.web ? " (not in every inbox)" : ""}
        </option>
      ))}
    </select>
  );
}

/** Picture upload with a preview; also used for a video's thumbnail. */
export function ImagePick({ url, onUrl, uploadImage, label = "Picture" }: { url: string; onUrl: (u: string) => void; uploadImage?: (f: File) => Promise<string>; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = async (file?: File | null) => {
    if (!file || !uploadImage) return;
    setBusy(true);
    setErr("");
    try {
      onUrl(await uploadImage(file));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't upload.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <span className="mb-1.5 block text-[12px] font-medium text-[#3b3431]">{label}</span>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void pick(e.dataTransfer.files?.[0]);
        }}
        className="group relative flex h-36 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-[#e4dfdb] bg-[#faf8f6] text-center transition-colors hover:border-[#56423e]"
      >
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="relative rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
              {busy ? "Uploading…" : "Replace picture"}
            </span>
          </>
        ) : (
          <>
            <UI.upload size={22} className="text-[#8a817c]" />
            <span className="mt-2 text-[12.5px] font-semibold text-[#3b3431]">{busy ? "Uploading…" : "Upload a picture"}</span>
            <span className="mt-0.5 text-[11px] text-[#9a908a]">or drop one here. JPG, PNG, GIF, WebP.</span>
          </>
        )}
        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" disabled={busy || !uploadImage} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {err && <p className="mt-1.5 text-[11.5px] text-[#a85a51]">{err}</p>}
      <TextInput value={url} onChange={(e) => onUrl(e.target.value)} placeholder="Or paste a picture address" className="mt-2" />
    </div>
  );
}

/** A YouTube address to its own thumbnail, so a video needs only its link. */
export function youTubeThumb(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

export function Inspector({ block, patch, uploadImage }: { block: Block; patch: Patch; uploadImage?: (f: File) => Promise<string> }) {
  const s = (k: string) => (typeof block[k] === "string" ? (block[k] as string) : "");
  const n = (k: string, d: number) => (block[k] != null && block[k] !== "" && !Number.isNaN(Number(block[k])) ? Number(block[k]) : d);
  const m = resolveMargin(block) as { t: number; r: number; b: number; l: number };
  const hide = (block.hide as { mobile?: boolean; desktop?: boolean }) ?? {};
  const t = block.type;

  const typeStyle = (defaultSize: number, min: number, max: number) => (
    <>
      <Field label="Font">
        <FontPick value={s("font")} onChange={(v) => patch("font", v)} />
      </Field>
      <Field label="Size">
        <Slider value={n("size", defaultSize)} min={min} max={max} onChange={(v) => patch("size", v)} />
      </Field>
      <Field label="Colour">
        <Colour value={s("color")} onChange={(v) => patch("color", v)} allowNone />
      </Field>
      <Field label="Alignment">
        <Align value={s("align")} onChange={(v) => patch("align", v)} />
      </Field>
    </>
  );

  return (
    <div>
      {/* ── What it says ── */}
      {(t === "heading" || t === "text" || t === "quote") && (
        <Group title="Content">
          <p className="rounded-lg bg-[#f6f4f2] px-3 py-2.5 text-[12px] leading-relaxed text-[#6b625e]">
            Click the words on the email and type. {t === "text" ? "Select some to make them bold, a link or a list." : ""}
          </p>
          {t === "quote" && (
            <Field label="Who said it">
              <TextInput value={s("who")} onChange={(e) => patch("who", e.target.value)} placeholder="A landlord in Northampton" />
            </Field>
          )}
        </Group>
      )}

      {t === "button" && (
        <Group title="Content">
          <Field label="Button words">
            <TextInput value={s("text")} onChange={(e) => patch("text", e.target.value)} />
          </Field>
          <Field label="Where it goes" hint="A web address, or mailto:someone@thelettingexperts.co.uk">
            <TextInput value={s("url")} onChange={(e) => patch("url", e.target.value)} placeholder="https://" />
          </Field>
        </Group>
      )}

      {t === "image" && (
        <Group title="Content">
          <ImagePick url={s("url")} onUrl={(u) => patch("url", u)} uploadImage={uploadImage} />
          <Field label="Describe it" hint="Read aloud by screen readers, and shown if the picture is blocked.">
            <TextInput value={s("alt")} onChange={(e) => patch("alt", e.target.value)} />
          </Field>
          <Field label="Link (optional)">
            <TextInput value={s("linkUrl")} onChange={(e) => patch("linkUrl", e.target.value)} placeholder="https://" />
          </Field>
        </Group>
      )}

      {t === "video" && (
        <Group title="Content">
          <Field label="Video link" hint="YouTube, Vimeo or anywhere else. Inboxes can't play video, so this shows a picture with a play button that opens it.">
            <TextInput
              value={s("url")}
              onChange={(e) => {
                const url = e.target.value;
                patch("url", url);
                const thumb = youTubeThumb(url);
                if (thumb && !s("thumbnail")) patch("thumbnail", thumb);
              }}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </Field>
          <ImagePick url={s("thumbnail")} onUrl={(u) => patch("thumbnail", u)} uploadImage={uploadImage} label="Cover picture" />
        </Group>
      )}

      {t === "code" && (
        <Group title="Content">
          <Field label="HTML" hint="Paste an embed or your own HTML. Inboxes strip scripts and most iframes, so for video use the Video block.">
            <textarea
              value={s("html")}
              onChange={(e) => patch("html", e.target.value)}
              rows={12}
              spellCheck={false}
              className={`${inputCls} font-mono text-[11.5px] leading-relaxed`}
            />
          </Field>
        </Group>
      )}

      {t === "faq" && (
        <Group title="Content">
          <Field label="Title">
            <TextInput value={s("title")} onChange={(e) => patch("title", e.target.value)} />
          </Field>
          {((block.items as { q: string; a: string }[]) ?? []).map((it, i, all) => (
            <div key={i} className="space-y-2 rounded-xl border border-[#eeeae6] p-3">
              <TextInput value={it.q} placeholder="The question" onChange={(e) => patch("items", all.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
              <textarea value={it.a} rows={3} placeholder="The answer" onChange={(e) => patch("items", all.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} className={inputCls} />
              <button type="button" onClick={() => patch("items", all.filter((_, j) => j !== i))} className="text-[11.5px] font-semibold text-[#a85a51]">
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={() => patch("items", [...((block.items as unknown[]) ?? []), { q: "", a: "" }])} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#56423e]">
            <UI.plus size={14} /> Add a question
          </button>
        </Group>
      )}

      {t === "social" && (
        <Group title="Content">
          <p className="text-[12px] leading-relaxed text-[#6b625e]">The links are the company&apos;s own. Pick which to show.</p>
          {(["instagram", "facebook", "linkedin", "website"] as const).map((k) => {
            const show = (block.show as Record<string, boolean>) ?? {};
            return <Toggle key={k} on={show[k] !== false} label={k === "linkedin" ? "LinkedIn" : k[0].toUpperCase() + k.slice(1)} onChange={(v) => patch("show", { ...show, [k]: v })} />;
          })}
        </Group>
      )}

      {t === "columns" && (
        <Group title="Layout">
          <div className="grid grid-cols-2 gap-2">
            {LAYOUTS.map((l) => (
              <button
                key={l.key}
                type="button"
                title={l.label}
                onClick={() => patch("layout", l.key)}
                className={`flex h-12 gap-1 rounded-lg border p-1.5 transition-colors ${block.layout === l.key || (!block.layout && l.key === "50-50") ? "border-[#56423e] bg-[#fbf8f6]" : "border-[#e4dfdb] hover:border-[#b9b0aa]"}`}
              >
                {l.w.map((w, i) => (
                  <span key={i} style={{ width: `${w}%` }} className="rounded bg-[#e4dfdb]" />
                ))}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#9a908a]">
            {cellsOf(block).length} {cellsOf(block).length === 1 ? "column" : "columns"}. Drag blocks into each one.
          </p>
          <Field label="Column background">
            <Colour value={s("colBg")} onChange={(v) => patch("colBg", v)} allowNone />
          </Field>
          <Toggle on={block.stackMobile !== false} label="Stack on a phone" onChange={(v) => patch("stackMobile", v)} />
        </Group>
      )}

      {/* ── How it looks ── */}
      {t === "heading" && <Group title="Style">{typeStyle(28, 16, 48)}</Group>}
      {t === "text" && (
        <Group title="Style">
          {typeStyle(15, 12, 22)}
          <Field label="Line height">
            <Slider value={n("lineHeight", 1.6)} min={1.1} max={2.2} step={0.1} unit="" onChange={(v) => patch("lineHeight", v)} />
          </Field>
          <Field label="Background" hint="Puts the text in a soft panel.">
            <Colour value={s("bg")} onChange={(v) => patch("bg", v)} allowNone />
          </Field>
        </Group>
      )}
      {t === "quote" && <Group title="Style">{typeStyle(18, 14, 28)}</Group>}
      {t === "button" && (
        <Group title="Style">
          <Field label="Button colour">
            <Colour value={s("color")} onChange={(v) => patch("color", v)} />
          </Field>
          <Field label="Words colour">
            <Colour value={s("textColor") || "#ffffff"} onChange={(v) => patch("textColor", v)} />
          </Field>
          <Field label="Rounded corners">
            <Slider value={n("borderRadius", 8)} min={0} max={30} onChange={(v) => patch("borderRadius", v)} />
          </Field>
          <Field label="Text size">
            <Slider value={n("size", 14)} min={12} max={20} onChange={(v) => patch("size", v)} />
          </Field>
          <Toggle on={Boolean(block.bold)} label="Bold words" onChange={(v) => patch("bold", v)} />
          <Toggle on={Boolean(block.fullWidth)} label="Full width" onChange={(v) => patch("fullWidth", v)} />
          {!block.fullWidth && (
            <Field label="Alignment">
              <Align value={s("align") || "center"} onChange={(v) => patch("align", v)} />
            </Field>
          )}
        </Group>
      )}
      {t === "image" && (
        <Group title="Style">
          <Field label="Width" hint="Full width is 600px on a computer; phones shrink it to fit.">
            <Slider value={n("width", 552)} min={60} max={600} onChange={(v) => patch("width", v)} />
          </Field>
          <Field label="Rounded corners">
            <Slider value={n("borderRadius", 8)} min={0} max={40} onChange={(v) => patch("borderRadius", v)} />
          </Field>
          <Field label="Alignment">
            <Align value={s("align") || "center"} onChange={(v) => patch("align", v)} />
          </Field>
        </Group>
      )}
      {t === "video" && (
        <Group title="Style">
          <Field label="Alignment">
            <Align value={s("align") || "center"} onChange={(v) => patch("align", v)} />
          </Field>
        </Group>
      )}
      {t === "divider" && (
        <Group title="Style">
          <Field label="Colour">
            <Colour value={s("color") || "#E2E8F0"} onChange={(v) => patch("color", v)} />
          </Field>
          <Field label="Thickness">
            <Slider value={n("thickness", 1)} min={1} max={6} onChange={(v) => patch("thickness", v)} />
          </Field>
          <Field label="Width">
            <Slider value={n("width", 100)} min={10} max={100} unit="%" onChange={(v) => patch("width", v)} />
          </Field>
        </Group>
      )}
      {t === "spacer" && (
        <Group title="Style">
          <Field label="Height">
            <Slider value={n("height", 24)} min={4} max={160} onChange={(v) => patch("height", v)} />
          </Field>
        </Group>
      )}
      {t === "logo" && (
        <Group title="Style">
          <Field label="Size">
            <Segmented value={(s("size") || "md") as string} onChange={(v) => patch("size", v)} options={[{ v: "sm", label: "Small" }, { v: "md", label: "Medium" }, { v: "lg", label: "Large" }]} />
          </Field>
          <Field label="Alignment">
            <Align value={s("align") || "center"} onChange={(v) => patch("align", v)} />
          </Field>
        </Group>
      )}

      {/* ── The space around it ── */}
      {t !== "spacer" && (
        <Group title="Spacing">
          <Field label="Space above">
            <Slider value={m.t} min={0} max={80} onChange={(v) => patch("margin", { ...((block.margin as object) ?? {}), t: v })} />
          </Field>
          <Field label="Space below">
            <Slider value={m.b} min={0} max={80} onChange={(v) => patch("margin", { ...((block.margin as object) ?? {}), b: v })} />
          </Field>
        </Group>
      )}

      {/* ── Where it shows ── */}
      <Group title="Visibility" open={false}>
        <Toggle on={!hide.mobile} label="Show on phones" onChange={(v) => patch("hide", { ...hide, mobile: !v })} />
        <Toggle on={!hide.desktop} label="Show on computers" onChange={(v) => patch("hide", { ...hide, desktop: !v })} />
      </Group>
    </div>
  );
}

export function TypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  const I = ICONS[type] ?? ICONS.text;
  return <I size={size} />;
}
