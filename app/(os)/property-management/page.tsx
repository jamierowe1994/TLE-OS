import { redirect } from "next/navigation";

/** Property management became Compliance (James, 8 Aug 2026) — keeping
 *  the old address alive because bookmarks outlive renames. */
export default function PropertyManagement() {
  redirect("/compliance");
}
