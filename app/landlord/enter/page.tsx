"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import FindingData from "@/components/business/FindingData";

/**
 * Where the link lands. The token is spent on arrival, the cookie is set,
 * and they are sent on: to the welcome the first time, to their property
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
    <div className="mx-auto max-w-md py-24 text-center">
      {failed ? (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">That link didn&rsquo;t work</p>
          <h1 className="mt-2 text-[24px] leading-tight">{failed}</h1>
          <Link
            href="/landlord/sign-in"
            className="mt-6 inline-block rounded-xl bg-accent-dark px-6 py-3 text-[13.5px] font-semibold text-white"
          >
            Get a new link
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-[24px] leading-tight">Opening your property file</h1>
          <p className="mt-3 text-[13px]"><FindingData label="One moment" /></p>
        </>
      )}
    </div>
  );
}

export default function EnterPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-[13px] text-muted">One moment.</div>}>
      <Enter />
    </Suspense>
  );
}
