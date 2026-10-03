"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MatchFlow, { type MatchItem, type MatchSubject } from "../flow";

/**
 * EMAIL THE DATABASE on the phone (3 Oct 2026): one live home, the people who
 * would want it. The people are the desk's own Mail the database match
 * (/api/m/match -> lib/mail-database), the email is its Homes That Fit, and
 * the send is its POST /api/listings/email-out - 50 a press, each on their
 * own, logged on their lead, and only if customer emails are switched on.
 */

type Person = {
  email: string;
  name: string;
  askedAbout: string;
  askedRent: number | null;
  askedPer: string;
  askedAt: string | null;
  lat: number | null;
  lng: number | null;
  miles: number | null;
};

const PER_PRESS = 50;

function ago(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 14 ? `${days} days ago` : `${Math.round(days / 7)} weeks ago`;
}

export default function EmailTheDatabase() {
  const params = useParams<{ listing: string }>();
  const id = decodeURIComponent(String(params?.listing ?? ""));
  const router = useRouter();
  const [subject, setSubject] = useState<MatchSubject | null>(null);
  const [items, setItems] = useState<MatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [homeName, setHomeName] = useState("");

  useEffect(() => {
    fetch(`/api/m/match?listing=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; said?: string; home?: { name: string; locality: string; image: string | null; lat: number | null; lng: number | null }; people?: Person[] }) => {
        if (!j.ok || !j.home) throw new Error(j.said ?? "The matches did not load.");
        setHomeName(j.home.name);
        setSubject({ title: j.home.name, line: j.home.locality, lat: j.home.lat, lng: j.home.lng, image: j.home.image });
        setItems(
          (j.people ?? []).map((p) => ({
            id: p.email,
            title: p.name || p.email,
            line: `Asked about ${p.askedAbout}`,
            meta: [p.askedRent ? `£${Math.round(p.askedRent).toLocaleString("en-GB")} ${p.askedPer}` : "", p.miles != null ? `${p.miles} mi away` : "", ago(p.askedAt)].filter(Boolean).join(" · "),
            lat: p.lat,
            lng: p.lng,
            miles: p.miles,
          }))
        );
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const post = (emails: string[], preview: boolean) =>
    fetch("/api/listings/email-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, emails, preview }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, said: "No connection. Nothing was sent." })) as Promise<{ ok?: boolean; said?: string; subject?: string; html?: string }>;

  const close = () => (window.history.length > 1 ? router.back() : router.push("/agent/properties"));

  return (
    <MatchFlow
      kind="people"
      subject={subject}
      items={items}
      error={error}
      intro={{
        title: "Email the Database",
        line: homeName
          ? `Everyone who asked about a home like ${homeName} in the last 90 days - the same area, a similar rent.`
          : "Everyone who asked about a home like this one in the last 90 days.",
      }}
      noun={["person", "people"]}
      max={PER_PRESS}
      onPreview={async (ids) => {
        const r = await post(ids, true);
        return r.ok && r.html ? { subject: r.subject ?? "", html: r.html } : { error: r.said ?? "The email did not load." };
      }}
      onSend={async (ids) => {
        const r = await post(ids, false);
        return { ok: Boolean(r.ok), said: r.said ?? (r.ok ? "Sent." : "Nothing was sent.") };
      }}
      onClose={close}
    />
  );
}
