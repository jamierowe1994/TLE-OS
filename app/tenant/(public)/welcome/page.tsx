import { redirect } from "next/navigation";

/**
 * Retired 10 Oct 2026 (Rig run 2, P-012). This was a mock-up of "choose a
 * password": it named every visitor Sophie Turner, showed
 * sophie.turner@gmail.com as their sign-in, and kept the password in their
 * own browser, so no account was ever made. No email a tenant receives
 * prints a link here (the templates that were handed it never use {{link}}),
 * but the address was public, so it now goes to the real front door: email
 * and password, or a one-time link.
 */
export default function TenantWelcome() {
  redirect("/tenant/sign-in");
}
