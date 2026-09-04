"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const RED = "#e31f36";

function Enter() {
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token") ?? "";
    let gone = false;
    fetch("/api/tenant/session/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string }) => {
        if (gone) return;
        if (j.ok) {
          router.replace("/tenant");
          router.refresh();
        } else {
          setFailed(j.error ?? "That link isn't valid. Ask for a new one.");
        }
      })
      .catch(() => {
        if (!gone) setFailed("Something went wrong. Try the link again in a moment.");
      });
    return () => {
      gone = true;
    };
  }, [params, router]);

  return (
    <div className="mx-auto max-w-md py-24 text-center">
      {failed ? (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50">That link didn&rsquo;t work</p>
          <h1 className="mt-2 text-[24px] font-semibold leading-tight">{failed}</h1>
          <Link href="/tenant/sign-in" className="mt-6 inline-block rounded-xl px-6 py-3 text-[13.5px] font-semibold text-white" style={{ background: RED }}>
            Get a new link
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-[24px] font-semibold leading-tight">Opening your account</h1>
          <p className="mt-3 text-[13px] text-black/50">One moment…</p>
        </>
      )}
    </div>
  );
}

export default function TenantEnter() {
  return (
    <Suspense fallback={null}>
      <Enter />
    </Suspense>
  );
}
