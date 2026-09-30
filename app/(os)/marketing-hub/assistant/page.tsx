import { redirect } from "next/navigation";

/**
 * This was a "Not built yet" page - somewhere for Francesca to put what the
 * front end should know. That is Steve's knowledge, which already exists, so
 * the old address goes there (30 Sep 2026).
 */
export default function Assistant() {
  redirect("/marketing-hub/knowledge");
}
