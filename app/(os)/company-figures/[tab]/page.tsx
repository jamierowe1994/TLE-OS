"use client";

import { notFound, useParams } from "next/navigation";
import { useBusiness } from "../frame";
import { TAB_COMPONENTS } from "../registry";
import type { BusinessTabKey } from "../rail";

export default function BusinessTabPage() {
  const { tab } = useParams<{ tab: string }>();
  const { month, seed } = useBusiness();
  const Component = TAB_COMPONENTS[tab as BusinessTabKey];
  if (!Component) notFound();
  if (!seed) return null;
  return <Component month={month} seed={seed} />;
}
