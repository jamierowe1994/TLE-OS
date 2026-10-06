"use client";

import { useEffect, useRef, useState } from "react";
import ViewingSheet, { type SheetViewing } from "@/components/listing/ViewingSheet";
import { NO_ACCESS, type Access } from "@/components/listing/AccessRequest";
import { accessKeyFor } from "@/lib/access-key";
import { useCaseState } from "@/lib/case-state";

/**
 * "Do you want to confirm access now?" - the booker's last step (James,
 * 6 Oct 2026).
 *
 * The same sheet the listing's Viewings tab opens, on the viewing that has
 * just been booked, reading and writing the same record (os_case_state
 * "access", keyed as the listing drawer keys it). Nothing new is stored: a
 * yes recorded here shows on the listing, and one recorded there shows here.
 */
export default function AccessNow({
  listingId,
  propertyId,
  address,
  agent,
  tenant,
  viewing,
  onClose,
}: {
  listingId: string;
  propertyId: string | null;
  address: string;
  agent: string;
  tenant: { name: string; email: string; phone: string } | null;
  viewing: SheetViewing;
  onClose: () => void;
}) {
  const accessKey = accessKeyFor({ listingId, propertyId });
  const [access, setAccess, status] = useCaseState<Access>("access", accessKey, NO_ACCESS);

  /* Anything still filed under the listing rather than the property, read
     across once, exactly as the listing drawer does. */
  const moved = useRef(false);
  useEffect(() => {
    if (!accessKey || accessKey === listingId || moved.current) return;
    if (status !== "ready" || access.kind) return;
    moved.current = true;
    fetch(`/api/case-state?kind=access&id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { payload?: Access | null } | null) => {
        if (j?.payload?.kind) setAccess({ ...NO_ACCESS, ...j.payload });
      })
      .catch(() => { /* nothing to move */ });
  }, [accessKey, listingId, status, access.kind, setAccess]);

  /* The landlord, so "ask the landlord" has somebody to ask. */
  const [landlord, setLandlord] = useState<{ name: string; email: string | null; phone: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/listings/landlord?id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; landlord?: { name: string; email: string | null; phone: string | null } | null }) => {
        if (live && j?.ok && j.landlord) setLandlord(j.landlord);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [listingId]);

  return (
    <ViewingSheet
      viewing={viewing}
      address={address}
      agent={agent}
      access={access}
      onAccess={setAccess}
      accessLoading={status === "loading"}
      tenant={tenant}
      landlord={landlord}
      onClose={onClose}
    />
  );
}
