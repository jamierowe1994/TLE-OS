"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MatchFlow, { type MatchItem, type MatchSubject } from "../match/flow";

/**
 * FIND A HOME on the phone (3 Oct 2026) - Email the Database the other way
 * round: one tenant, the live homes around where they want to be
 * (/api/m/homes). The email is the same Homes That Fit, sent to them alone by
 * the desk's own POST /api/leads/email-properties, 20 homes at most.
 *
 *   /agent/find-home?name=Sophie%20Turner&email=…&near=12%20Clive%20Road,%20Canton,%20CF5%201HG&rent=1100
 */

type Home = {
  id: string;
  name: string;
  locality: string;
  rent: number | null;
  rentPeriod: string | null;
  image: string | null;
  lat: number;
  lng: number;
  miles: number;
  similarRent: boolean | null;
};

const MAX_HOMES = 20;

export default function FindAHome() {
  const router = useRouter();
  const [who, setWho] = useState<{ name: string; email: string; near: string } | null>(null);
  const [subject, setSubject] = useState<MatchSubject | null>(null);
  const [items, setItems] = useState<MatchItem[] | null>(null);
  const [homes, setHomes] = useState<Map<string, Home>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const w = { name: sp.get("name") ?? "", email: sp.get("email") ?? "", near: sp.get("near") ?? "" };
    setWho(w);
    const rent = sp.get("rent") ?? "";
    fetch(`/api/m/homes?near=${encodeURIComponent(w.near)}&rent=${encodeURIComponent(rent)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; said?: string; at?: { lat: number; lng: number; postcode: string }; homes?: Home[] }) => {
        if (!j.ok || !j.at) throw new Error(j.said ?? "The homes did not load.");
        setSubject({ title: w.name || "This tenant", line: w.near, lat: j.at.lat, lng: j.at.lng });
        const list = j.homes ?? [];
        setHomes(new Map(list.map((h) => [h.id, h])));
        setItems(
          list.map((h) => ({
            id: h.id,
            title: h.name,
            line: h.locality,
            meta: [h.rent ? `£${Math.round(h.rent).toLocaleString("en-GB")} ${h.rentPeriod === "week" ? "pw" : "pcm"}` : "", `${h.miles} mi away`].filter(Boolean).join(" · "),
            lat: h.lat,
            lng: h.lng,
            miles: h.miles,
            image: h.image,
            similar: h.similarRent,
          }))
        );
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const post = (ids: string[], preview: boolean) =>
    fetch("/api/leads/email-properties", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: who?.name ?? "",
        email: who?.email ?? "",
        preview,
        homes: ids.map((id) => homes.get(id)).filter(Boolean).map((h) => ({ id: h!.id, name: h!.name, locality: h!.locality, rent: h!.rent, rentPeriod: h!.rentPeriod })),
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, said: "No connection. Nothing was sent." })) as Promise<{ ok?: boolean; said?: string; subject?: string; html?: string }>;

  const first = (who?.name ?? "").split(/\s+/)[0] || "them";
  const close = () => (window.history.length > 1 ? router.back() : router.push("/agent/people"));

  return (
    <MatchFlow
      kind="homes"
      subject={subject}
      items={items}
      error={error}
      intro={{
        title: who?.name ? `Find ${first} a Home` : "Find a Home",
        line: who?.email ? "Every live home around where they want to be, nearest first. Pick the ones that fit and send them over." : `${first} has no email address on their record, so you can look but not send.`,
      }}
      noun={["home", "homes"]}
      max={MAX_HOMES}
      onPreview={async (ids) => {
        const r = await post(ids, true);
        return r.ok && r.html ? { subject: r.subject ?? "", html: r.html } : { error: r.said ?? "The email did not load." };
      }}
      onSend={async (ids) => {
        const r = await post(ids, false);
        return { ok: Boolean(r.ok), said: r.said ?? (r.ok ? `Sent to ${first}.` : "Nothing was sent.") };
      }}
      onClose={close}
    />
  );
}
