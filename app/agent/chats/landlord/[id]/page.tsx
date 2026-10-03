"use client";

import { useParams } from "next/navigation";
import CustomerThread from "../../customer";

/** A landlord's conversation from their portal (3 Oct 2026) - see ../../customer. */
export default function Page() {
  const params = useParams<{ id: string }>();
  return <CustomerThread kind="landlord" id={decodeURIComponent(String(params?.id ?? ""))} />;
}
