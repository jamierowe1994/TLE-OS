"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const RED = "#e31f36";

/**
 * Where the link lands. The token is spent on arrival, the cookie is set,
 * and they are sent on: to the welcome the first time, to their properties
 * after that. A dead link says so and offers the sign-in page, since that
 * is the only cure.
 */
function Enter() {
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token") ?? "";
    let gone = false;
    fetch("/api/landlord/session/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; first?: boolean; error?: string }) => {
        if (gone) return;
        if (j.ok) {
          router.replace(j.first ? "/landlord/welcome" : "/landlord");
          router.refresh();
        } else {
          setFailed(j.error ?? "That link isn't valid. Ask for a new one.");
        }
      })
      .catch(() => { if (!gone) setFailed("Something went wrong. Try the link again in a moment."); });
    return () => { gone = true; };
  }, [params, router]);

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      {failed ? (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: RED }}>
            That link didn&rsquo;t work
          </p>
          <h1 className="mt-2 text-[22px] font-bold leading-tight">{failed}</h1>
          <Link
            href="/landlord/sign-in"
            className="mt-6 inline-block rounded-lg px-6 py-3 text-[13.5px] font-bold text-white"
            style={{ backgroundColor: RED }}
          >
            Get a new link
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-[22px] font-bold leading-tight">Opening your property file…</h1>
          <p className="mt-2 text-[13px] text-black/50">One moment.</p>
        </>
      )}
    </div>
  );
}

export default function EnterPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-[13px] text-black/50">One moment.</div>}>
      <Enter />
    </Suspense>
  );
}
