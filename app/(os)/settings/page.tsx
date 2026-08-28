import { redirect } from "next/navigation";

/**
 * Settings folded into the profile — one room, tabs down it.
 *
 * Kept as a redirect rather than deleted: the old address is in browser
 * histories and in at least one link I have written, and a 404 for something
 * that plainly still exists is a worse answer than a hop.
 */
export default function Moved() {
  redirect("/profile");
}
