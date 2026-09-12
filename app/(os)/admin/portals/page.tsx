import { redirect } from "next/navigation";

/** Portals became Process on 12 Sep 2026. Old links still land. */
export default function PortalsRedirect() {
  redirect("/admin/process");
}
