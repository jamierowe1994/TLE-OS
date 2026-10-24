import Link from "next/link";
import { Badge, Ico } from "@/components/new-look/Parts";
import EmailCard from "@/components/admin/EmailCard";
import type { PortalFolder } from "@/lib/portals";

/**
 * One process as its screens and emails, in the order a person meets them,
 * in the new look (lib/new-look "admin", 24 Oct 2026). The frame gives the
 * way back to Process; a second way, to the map, is here when there is one.
 * The links are the folder's own (components/admin/PortalFolderView).
 */
export default function PortalFolderNew({ f, hrefOf, mapHref }: { f: PortalFolder; hrefOf: (h: string) => string; mapHref?: string }) {
  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-p-tab">
      <div className="nl-adm-block-head">
        <div>
          <h2 className="nl-section-title">{f.name}</h2>
          <p className="nl-meta nl-adm-measure">{f.blurb}</p>
        </div>
        {mapHref && (
          <Link href={mapHref} className="nl-link">
            The process map <Ico name="arrow" size={14} />
          </Link>
        )}
      </div>

      {/* Numbered, because the order is the point. */}
      <ol className="nl-adm-p-steps nl-adm-p-after">
        {f.items.map((item, i) => (
          <li key={item.id}>
            <span className="nl-adm-num">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="nl-adm-step-head">
                <span className="nl-strong">{item.name}</span>
                <Badge tone={item.kind === "email" ? "info" : "neutral"} bare>
                  {item.kind === "email" ? "Email" : "Screen"}
                </Badge>
                {item.kind === "open" && (
                  <a
                    href={hrefOf(item.href)}
                    /* New tab for the customer-facing ones; the in-OS admin pages open in place. */
                    target={item.href.startsWith("/admin") ? undefined : "_blank"}
                    rel={item.href.startsWith("/admin") ? undefined : "noreferrer"}
                    className="nl-btn nl-btn--secondary nl-btn--sm"
                  >
                    Open
                  </a>
                )}
              </div>
              <p className="nl-adm-step-body">{item.blurb}</p>
              {item.caveat && <p className="nl-adm-note is-care">{item.caveat}</p>}
              {item.kind === "email" && <EmailCard emailId={item.emailId} />}
              {item.kind === "open" && <p className="nl-adm-step-path">{hrefOf(item.href).split("?")[0]}</p>}
            </div>
          </li>
        ))}
      </ol>

      {f.missing && f.missing.length > 0 && (
        <section className="nl-adm-block">
          <div className="nl-adm-block-head">
            <div>
              <h2 className="nl-section-title">What Is Not Built Yet</h2>
              <p className="nl-meta">Worth knowing before somebody asks you in the room.</p>
            </div>
          </div>
          <ul className="nl-adm-bullets">
            {f.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
