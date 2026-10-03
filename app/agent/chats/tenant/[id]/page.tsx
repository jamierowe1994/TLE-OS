"use client";

import { useParams } from "next/navigation";
import CustomerThread from "../../customer";

/** A tenant's conversation from their portal (3 Oct 2026) - see ../../customer. */
export default function Page() {
  const params = useParams<{ id: string }>();
  return <CustomerThread kind="tenant" id={decodeURIComponent(String(params?.id ?? ""))} />;
}
