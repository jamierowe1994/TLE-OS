"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import FindingData from "@/components/business/FindingData";

/**
 * /portfolio/home/<property>?name=<address>
 *
 * The clean sweep and the compliance drawer hold a home by its property (an
 * OS record or a REX property id); its page is by the let. This finds the
 * let and goes there (Josel Banagua, 20 Oct 2026: everything about a home in
 * one place, reached from where she works).
 */
export default function FindHome() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const id = decodeURIComponent(String(params.id ?? ""));

  useEffect(() => {
    let live = true;
    const sp = new URLSearchParams(window.location.search);
    const name = sp.get("name") ?? "";
    const tab = sp.get("tab") ?? "";
    /* Email Certificates from the compliance drawer opens the send on arrival. */
    const email = sp.get("email") === "certificates" ? "&email=certificates" : "";
    setName(name);
    fetch(`/api/portfolio/find?id=${encodeURIComponent(id)}${name ? `&name=${encodeURIComponent(name)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.ok && j.listingId) router.replace(`/portfolio/${encodeURIComponent(j.listingId)}${tab ? `?tab=${encodeURIComponent(tab)}${email}` : email ? `?${email.slice(1)}` : ""}`);
        else setError(j?.error ?? "This home couldn't be found.");
      })
      .catch(() => live && setError("This home couldn't be found just now. Try again in a minute."));
    return () => { live = false; };
  }, [id, router]);

  return (
    <div className="mx-auto max-w-[560px] px-4 py-16 text-center">
      {error ? (
        <div className="rounded-2xl border border-line/70 bg-card p-6">
          <p className="text-[13px]">{error}</p>
          {name && <p className="mt-1 text-[12px] text-muted">{name}</p>}
          <Link href="/portfolio" className="mt-4 inline-block text-[12.5px] font-semibold underline underline-offset-2">Go to Portfolio</Link>
        </div>
      ) : (
        <FindingData label="Finding the property page" />
      )}
    </div>
  );
}
