import { redirect } from "next/navigation";

/** The workspace opens on its first screen. */
export default function CompanyFiguresIndex() {
  redirect("/company-figures/overview");
}
