"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Your email footer, on the Profile page under "Send yourself a test".
 *
 * James, 21 Sep 2026. The quick road is a blank email to yourself: Outlook
 * puts your signature on it, and the OS reads it out of your own mailbox - see
 * lib/email-footer for why that needs no special address. The other road is a
 * picture of it. Either way it is shown back here exactly as it will sit under
 * a mail, because a footer nobody has looked at is one that goes out wrong.
 *
 * The preview is drawn in a sandboxed frame. It is the person's own HTML and
 * it has been cleaned, but it came out of an email, and a frame with no
 * scripts and no same-origin is the cheap way to be certain.
 */

type Held = { html: string; source: string; updatedAt: string; pictures: number } | null;

export default function EmailFooterSetup({ mailbox }: { mailbox: string }) {
  const [held, setHeld] = useState<Held | undefined>(undefined);
  const [busy, setBusy] = useState<"" | "find" | "upload" | "remove">("");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/me/footer", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setHeld(j?.footer ?? null))
      .catch(() => setHeld(null));
  }, []);

  async function find() {
    setBusy("find");
    setSaid(null);
    const j = await fetch("/api/me/footer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ find: true }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setBusy("");
    if (j?.ok) {
      setHeld(j.footer);
      setSaid({ ok: true, text: "Found it. This now goes under every email the OS sends from your mailbox." });
    } else {
      setSaid({
        ok: false,
        text:
          j?.reason === "not_found"
            ? "We couldn't see it yet. Check the subject says footer, give it a few seconds to send, then press the button again."
            : (j?.error ?? "That didn't work. Try again in a moment."),
      });
    }
  }

  async function upload(f: File) {
    setBusy("upload");
    setSaid(null);
    const data = await new Promise<string | null>((res) => {
      const r = new FileReader();
      r.onload = () => res(typeof r.result === "string" ? r.result : null);
      r.onerror = () => res(null);
      r.readAsDataURL(f);
    });
    const j = data
      ? await fetch("/api/me/footer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: data }),
        })
          .then((r) => r.json())
          .catch(() => null)
      : null;
    setBusy("");
    if (j?.ok) {
      setHeld(j.footer);
      setSaid({ ok: true, text: "Saved. This picture now goes under every email the OS sends from your mailbox." });
    } else {
      setSaid({ ok: false, text: j?.error ?? "That picture wouldn't save." });
    }
  }

  async function remove() {
    setBusy("remove");
    await fetch("/api/me/footer", { method: "DELETE" }).catch(() => null);
    setBusy("");
    setHeld(null);
    setSaid({ ok: true, text: "Removed. Your emails go out without a footer until you set one." });
  }

  const step = "flex gap-2.5 text-[12px] leading-relaxed";
  const dot = "mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[var(--brown)] text-[10px] font-semibold text-white";

  return (
    <div className="rounded-2xl border border-line/70 bg-card p-4">
      <p className="text-[13px] font-semibold">Your email footer</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        The signature that sits under your emails in Outlook. Set it once and it goes under every
        email the OS sends from your mailbox.
      </p>

      {held === undefined ? (
        <p className="mt-3 text-[12px] text-muted">Checking…</p>
      ) : held ? (
        <>
          <div className="mt-3 overflow-hidden rounded-xl border border-line/70 bg-white">
            <iframe
              title="Your email footer"
              sandbox=""
              srcDoc={`<!doctype html><html><body style="margin:0;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#1f1a17;background:#ffffff">${held.html}</body></html>`}
              className="block h-[210px] w-full"
            />
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            {held.source === "upload" ? "From a picture you uploaded" : "Taken from your own mailbox"} on{" "}
            {new Date(held.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" })}.
            Changed your signature? Send the blank email again and press the button.
          </p>
        </>
      ) : null}

      {held !== undefined && (
        <>
          <ol className="mt-3.5 space-y-2">
            <li className={step}>
              <span className={dot}>1</span>
              <span>
                In Outlook, start a <strong>new email to yourself</strong>
                {mailbox ? ` (${mailbox})` : ""}.
              </span>
            </li>
            <li className={step}>
              <span className={dot}>2</span>
              <span>
                Put{" "}
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText("My email footer");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                  className="rounded-md border border-line/80 px-1.5 py-[1px] font-semibold transition-colors hover:border-ink"
                >
                  {copied ? "Copied" : "My email footer"}
                </button>{" "}
                as the subject. Write nothing else - leave only your signature on it - and send.
              </span>
            </li>
            <li className={step}>
              <span className={dot}>3</span>
              <span>Come back here and press the button.</span>
            </li>
          </ol>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={find}
              disabled={busy !== ""}
              className="rounded-full bg-[var(--brown)] px-5 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy === "find" ? "Looking in your mailbox…" : held ? "I've sent it again - update my footer" : "I've sent it - find my footer"}
            </button>
            <button
              type="button"
              onClick={() => file.current?.click()}
              disabled={busy !== ""}
              className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink disabled:opacity-40"
            >
              {busy === "upload" ? "Saving…" : "Upload a picture instead"}
            </button>
            {held && (
              <button
                type="button"
                onClick={remove}
                disabled={busy !== ""}
                className="text-[12px] text-muted underline underline-offset-2 hover:text-ink disabled:opacity-40"
              >
                Remove
              </button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </div>
        </>
      )}

      {said && (
        <p className={`mt-2.5 text-[12px] leading-relaxed ${said.ok ? "" : "text-accent-dark"}`}>{said.text}</p>
      )}
    </div>
  );
}
