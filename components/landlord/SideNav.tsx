"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The portal's sections, every one a page. Knows which page it is on, so
 * the right row is lit, and keeps the demo inside the demo (with its
 * ?from=admin, so the preview bar survives the click).
 */
export default function SideNav({ variant, letHere = false }: { variant: "side" | "pills"; letHere?: boolean }) {
  const path = usePathname() ?? "/landlord";
  const params = useSearchParams();
  const base = path.startsWith("/landlord/demo") ? "/landlord/demo" : "/landlord";
  /* Keeps the sample's stop and the preview bar across the pages. */
  const keep = new URLSearchParams();
  if (params?.get("stage")) keep.set("stage", params.get("stage")!);
  if (params?.get("from") === "admin") keep.set("from", "admin");
  /* And which property they are in - see PlacePicker. */
  if (params?.get("p")) keep.set("p", params.get("p")!);
  const q = keep.size ? `?${keep.toString()}` : "";
  const onJourney = path.endsWith("/journey");
  const onDocuments = path.endsWith("/documents");
  const onMaintenance = path.endsWith("/maintenance");
  const onMessages = path.endsWith("/messages");
  const home = { href: `${base}${q}`, label: "Home", icon: "home", on: !onJourney && !onDocuments && !onMaintenance && !onMessages };
  const journey = { href: `${base}/journey${q}`, label: "Journey", icon: "trend-up", on: onJourney };
  const documents = { href: `${base}/documents${q}`, label: "Documents", icon: "doc", on: onDocuments };
  const maintenance = { href: `${base}/maintenance${q}`, label: "Maintenance", icon: "setting", on: onMaintenance };
  const messages = { href: `${base}/messages${q}`, label: "Messages", icon: "message", on: onMessages };
  const items = [home, journey, documents, maintenance, messages];

  /**
   * THREE ON A PHONE, and they fit on one screen.
   *
   * James, 15 Sep 2026: "there are a lot of tabs ... they should all be able
   * to fit into one screen ... based on their journey, only show the ones that
   * are relevant. Home will always be there ... once the property is let,
   * maintenance will show instead of journey."
   *
   * Which is the same rule the rest of the portal follows: the journey matters
   * until there is a tenant in, and then it is history and maintenance is the
   * thing. They are never both wanted at once on a screen this size.
   *
   * MESSAGES COMES OFF ENTIRELY. "You can drop off messages ... we can always
   * have it in the message tab here" - the agent tab carries Message on every
   * page now, which is closer to hand than a nav pill and already knows who
   * they are writing to.
   *
   * The sample decides from ?stage= so the harness can be walked through the
   * let; everywhere else it is the landlord's own book.
   */
  const demoStage = base.endsWith("/demo") ? params?.get("stage") : null;
  const isLet = demoStage ? demoStage === "let" || demoStage === "managed" : letHere;
  const phone = [home, isLet ? maintenance : journey, documents];

  if (variant === "pills") {
    const pill = (n: (typeof items)[number], extra: string) => (
      <Link
        key={extra + n.label}
        href={n.href}
        className={`${extra} shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] ${
          n.on ? "border-transparent bg-accent-soft font-semibold text-ink" : "border-line/60 text-muted"
        }`}
      >
        <DoodleIcon name={n.icon} size={14} />
        {n.label}
      </Link>
    );
    /* Two lists rather than one reordered: the phone's three have to be in
       Home, Journey-or-Maintenance, Documents order, which is not the order
       the full five read in. */
    return (
      <>
        {phone.map((n) => pill(n, "flex sm:hidden"))}
        {items.map((n) => pill(n, "hidden sm:flex"))}
      </>
    );
  }
  return (
    <nav className="mt-10 space-y-1">
      {items.map((n) => (
        <Link
          key={n.label}
          href={n.href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
            n.on ? "bg-accent-soft font-semibold text-ink" : "text-muted hover:bg-accent-soft/50 hover:text-ink"
          }`}
        >
          <DoodleIcon name={n.icon} size={17} />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
