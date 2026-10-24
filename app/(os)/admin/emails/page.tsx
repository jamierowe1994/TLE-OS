"use client";

import { useNewLook } from "@/lib/use-new-look";
import { EmailCatalogueOld, useEmailCatalogue } from "@/components/admin/EmailCatalogue";
import EmailsNew from "@/components/new-look/admin/EmailsNew";
import { Loading } from "@/components/new-look/admin/content-bits";

/**
 * Admin > Emails > Every email: every email the OS sends, as the recipient
 * will see it. The catalogue itself is components/admin/EmailCatalogue, the
 * same screen Marketing > Email templates draws (/marketing-hub/templates).
 * With the Admin new look on it is drawn by components/new-look/admin/
 * EmailsNew, opening the same reader and the same builder.
 */
export default function AdminEmails() {
  const cat = useEmailCatalogue();
  const look = useNewLook("admin");
  if (look === null) return <Loading label="Opening the emails…" page />;
  if (!look) return <EmailCatalogueOld cat={cat} />;
  return <EmailsNew cat={cat} />;
}
