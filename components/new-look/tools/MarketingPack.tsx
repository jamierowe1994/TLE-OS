"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Mast } from "@/components/new-look/Parts";
import { Back } from "@/components/new-look/learning/LearningHub";

/**
 * Tools > Marketing Pack (Francesca, 2 Nov 2026: "how will pro agents get
 * access to this?"). Her File Store, as this person may see it: Every agent
 * folders for everyone, Pro agents folders for Pro (Launch Pad's answer, the
 * same one as Paid Ads), and the office sees the lot with each folder's
 * setting beside it. An agent who isn't Pro sees the Pro folders' names,
 * locked, and nothing in them (GET /api/tools/marketing-pack).
 */

type Level = "office" | "pro" | "everyone";
type PackFile = { key: string; name: string; folder: string; size: number; uploadedAt: string | null; level: Level };
type Pack = { tier: "office" | "pro" | "agent"; unchecked: boolean; files: PackFile[]; proFolders: { folder: string; files: number }[]; levels?: Record<string, Level> };

const LEVEL_WORD: Record<Level, string> = { office: "Office only", pro: "Pro agents", everyone: "Every agent" };
const leafOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const fileHref = (key: string, save = false) => `/api/r2/file?key=${encodeURIComponent(key)}${save ? "&save=1" : ""}`;
const isPicture = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name);
const KB = 1024;
const size = (b: number) => (b < KB * KB ? `${Math.max(1, Math.round(b / KB))} KB` : `${(b / (KB * KB)).toFixed(1)} MB`);
const kind = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "file").toUpperCase();

function folderInAddress(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("folder") ?? "";
}

const LockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);
const FolderIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </svg>
);
const DocIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 3.5h7l4.5 4.5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1z" />
    <path d="M14 3.5V8h4.5" />
  </svg>
);

export default function MarketingPack() {
  const [d, setD] = useState<Pack | null | string>(null);
  const [folder, setFolder] = useState("");

  useEffect(() => {
    let gone = false;
    fetch("/api/tools/marketing-pack", { cache: "no-store" })
      .then((r) => r.json().catch(() => ({ ok: false })))
      .then((j) => !gone && setD(j?.ok ? (j as Pack) : (j?.error ?? "The Marketing Pack couldn't be read just now. Try again in a minute.")))
      .catch(() => !gone && setD("The Marketing Pack couldn't be read just now. Try again in a minute."));
    setFolder(folderInAddress());
    const back = () => setFolder(folderInAddress());
    window.addEventListener("popstate", back);
    return () => {
      gone = true;
      window.removeEventListener("popstate", back);
    };
  }, []);

  function open(path: string) {
    setFolder(path);
    const url = new URL(window.location.href);
    if (path) url.searchParams.set("folder", path);
    else url.searchParams.delete("folder");
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
    window.scrollTo({ top: 0 });
  }

  const pack = d && typeof d === "object" ? d : null;
  /* Every folder that holds something, with the ones above it. */
  const folders = useMemo(() => {
    const all = new Set<string>();
    for (const f of pack?.files ?? []) for (let p = f.folder; p; p = parentOf(p)) all.add(p);
    return all;
  }, [pack]);
  const children = [...folders].filter((f) => parentOf(f) === folder).sort((a, b) => a.localeCompare(b, "en-GB", { sensitivity: "base" }));
  const here = (pack?.files ?? []).filter((f) => f.folder === folder).sort((a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true }));
  const under = (path: string) => (pack?.files ?? []).filter((f) => f.folder === path || f.folder.startsWith(`${path}/`));
  const trail = folder ? folder.split("/").map((_, i, s) => s.slice(0, i + 1).join("/")) : [];
  /* A folder that isn't there for this person (an old link, or Pro they don't have). */
  const missing = Boolean(pack && folder && !folders.has(folder));

  return (
    <div data-look="new" className="nl-page nl-rise nl-lr nl-mp">
      <Back href="/tools" label="Tools" />
      <Mast
        title="Marketing Pack"
        blurb="Social posts, carousels, guides and artwork from marketing, ready to post or send on. Open one to look, or save it."
      />

      {d === null ? (
        <p className="nl-lr-wait">
          <span className="nl-lr-spin" aria-hidden />
          Opening the Marketing Pack…
        </p>
      ) : typeof d === "string" ? (
        <p className="nl-lr-bad">{d}</p>
      ) : (
        <>
          {d.unchecked && (
            <p className="nl-mp-note">Your package couldn&apos;t be checked just now, so anything in the Pro package isn&apos;t showing. Try again in a few minutes.</p>
          )}

          {folder && (
            <nav aria-label="Where you are" className="nl-mp-trail">
              <button type="button" onClick={() => open("")}>
                Marketing Pack
              </button>
              {trail.map((path, i) => (
                <Fragment key={path}>
                  <span aria-hidden>/</span>
                  {i < trail.length - 1 ? (
                    <button type="button" onClick={() => open(path)}>
                      {leafOf(path)}
                    </button>
                  ) : (
                    <b>{leafOf(path)}</b>
                  )}
                </Fragment>
              ))}
            </nav>
          )}

          {missing ? (
            <p className="nl-lr-none">That folder isn&apos;t in your Marketing Pack. <button type="button" className="nl-link" onClick={() => open("")}>Back to the start</button></p>
          ) : (
            <>
              {children.length > 0 && (
                <section className="nl-lr-sec">
                  <h2 className="nl-section-title">Folders</h2>
                  <div className="nl-mp-folders">
                    {children.map((path, i) => {
                      const inside = under(path);
                      const level = d.levels?.[path];
                      return (
                        <button key={path} type="button" className="nl-mp-folder" onClick={() => open(path)} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                          <span className="nl-mp-folder-ico">
                            <FolderIcon />
                          </span>
                          <span className="min-w-0">
                            <span className="nl-mp-folder-name">{leafOf(path)}</span>
                            <span className="nl-meta">
                              {inside.length} {inside.length === 1 ? "file" : "files"}
                              {d.tier === "office" && level ? ` · ${LEVEL_WORD[level]}` : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {here.length > 0 && (
                <section className="nl-lr-sec">
                  <h2 className="nl-section-title">{folder ? "Files" : "Not in a Folder"}</h2>
                  <div className="nl-mp-files">
                    {here.map((f, i) => (
                      <article key={f.key} className="nl-mp-file" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                        <a className="nl-mp-thumb" href={fileHref(f.key)} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`}>
                          {isPicture(f.name) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileHref(f.key)} alt="" loading="lazy" />
                          ) : (
                            <span className="nl-mp-doc">
                              <DocIcon />
                              <em>{kind(f.name)}</em>
                            </span>
                          )}
                        </a>
                        <span className="nl-mp-file-name" title={f.name}>
                          {f.name}
                        </span>
                        <span className="nl-mp-file-foot">
                          <span className="nl-meta">{size(f.size)}</span>
                          <a href={fileHref(f.key, true)} className="nl-link">
                            Save
                          </a>
                        </span>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {!folder && children.length === 0 && here.length === 0 && (
                <p className="nl-lr-none">Nothing has been shared with you here yet. Marketing adds to it as new posts and artwork are made.</p>
              )}

              {!folder && d.tier === "agent" && d.proFolders.length > 0 && (
                <section className="nl-lr-sec">
                  <h2 className="nl-section-title">In the Pro Package</h2>
                  <div className="nl-mp-folders">
                    {d.proFolders.map((p) => (
                      <div key={p.folder} className="nl-mp-folder is-locked">
                        <span className="nl-mp-folder-ico">
                          <LockIcon />
                        </span>
                        <span className="min-w-0">
                          <span className="nl-mp-folder-name">{leafOf(p.folder)}</span>
                          <span className="nl-meta">
                            {p.files} {p.files === 1 ? "file" : "files"} · Part of the Pro package
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
