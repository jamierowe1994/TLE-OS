import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { candidateEndpoints, r2, r2Configured, R2_BUCKET, rememberEndpoint } from "@/lib/r2";

/**
 * Does R2 actually work?
 *
 * Reports on the connection, never on the credentials: which variables are
 * PRESENT (booleans, never values), which endpoint answered, and what the
 * bucket contains. A diagnostic that echoes a secret back is a diagnostic that
 * leaks one into a browser history, a screenshot, or a chat window.
 *
 * It sits behind the access-code gate like every other page, so it isn't a
 * public probe of the storage layer.
 *
 * The listing is capped at five keys because this answers "is it wired up",
 * not "what's in the bucket".
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const present = {
    R2_ACCOUNT_ID: Boolean(process.env.R2_ACCOUNT_ID),
    R2_ACCESS_KEY_ID: Boolean(process.env.R2_ACCESS_KEY_ID),
    R2_SECRET_ACCESS_KEY: Boolean(process.env.R2_SECRET_ACCESS_KEY),
    R2_BUCKET: Boolean(process.env.R2_BUCKET),
  };

  if (!r2Configured) {
    const missing = Object.entries(present)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    return NextResponse.json({ ok: false, stage: "config", present, missing }, { status: 200 });
  }

  const attempts: { endpoint: string; ok: boolean; error?: string }[] = [];

  for (const endpoint of candidateEndpoints()) {
    try {
      const out = await r2(endpoint).send(
        new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 5 })
      );
      rememberEndpoint(endpoint);
      return NextResponse.json({
        ok: true,
        present,
        bucket: R2_BUCKET,
        endpoint,
        // Which hostname answered tells us the jurisdiction without anybody
        // having to remember which radio button they clicked.
        jurisdiction: endpoint.includes(".eu.") ? "EU" : "default",
        objectCount: out.KeyCount ?? 0,
        sampleKeys: (out.Contents ?? []).map((o) => o.Key),
        attempts,
      });
    } catch (e) {
      const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      attempts.push({
        endpoint,
        ok: false,
        error: `${err.name ?? "Error"}${
          err.$metadata?.httpStatusCode ? ` (${err.$metadata.httpStatusCode})` : ""
        }: ${err.message ?? "unknown"}`,
      });
    }
  }

  return NextResponse.json({ ok: false, stage: "connect", present, bucket: R2_BUCKET, attempts });
}
