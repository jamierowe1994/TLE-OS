"use client";

import { useNewLook } from "@/lib/use-new-look";
import { NewsroomOld, useNewsroom } from "@/components/newsroom/NewsroomBody";
import NewsroomNew from "@/components/new-look/admin/NewsroomNew";
import { Loading } from "@/components/new-look/admin/content-bits";

/**
 * Admin > Content > Newsroom (24 Oct 2026): the same board as /newsroom,
 * inside the Admin frame. Same data, same edit:knowledge check (the API
 * answers canPublish false to anybody else, and the screen says so).
 */
export default function AdminNewsroom() {
  const nr = useNewsroom();
  const look = useNewLook("admin");
  if (look === null) return <Loading label="Opening the Newsroom…" page />;
  if (!look) return <NewsroomOld nr={nr} />;
  return <NewsroomNew nr={nr} />;
}
