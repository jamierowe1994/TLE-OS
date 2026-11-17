import "server-only";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { keyClimbs, R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";
import { FIRE_SAFETY, fireKindIn } from "@/lib/cert-kinds";
import { hasDb, q } from "@/lib/db";
import { isOsPropertyId } from "@/lib/os-properties";

/**
 * Every certificate the OS holds for one property (or for an address still
 * waiting for its REX property - key "pending-<address>"), across all its
 * types. One read, one shelf. The folders are the ones the intake writes:
 * documents/compliance-<property>-<certKey>/<timestamp>-<name>.
 *
 * AND THE ONES FILED UNDER THE HOME'S OTHER ID (Lianna Denholm, 17 Nov 2026,
 * ticket 913fb152: "The EICR hasnt pulled over from Rex?"). A home that came
 * across from the old system was filed under its OS id (pm-...). When it was
 * later linked to its REX property, its certificate records moved onto the
 * REX id and their files stayed where they were, under the pm- folder. This
 * read went by the folder alone, so on 113 homes (427 certificates, counted
 * that day) the record counted - the row said "In date" - and its document
 * was nowhere to be seen. The record is what says a file is this home's, so
 * the records are read too, and a file one of them points at is on the shelf
 * wherever it is kept. Nothing is moved.
 */

export interface VaultFile {
  key: string;
  certKey: string;
  label: string;
  name: string;
  size: number;
  uploadedAt: string | null;
  open: string;
  /** Not the newest certificate of its kind. Only said on a home whose
   *  certificates are kept under two ids, where the newest is worked out
   *  from the records (below); elsewhere the newest upload is first, as ever. */
  earlier?: boolean;
}

export const VAULT_LABEL: Record<string, string> = {
  gas: "Gas safety (CP12)",
  eicr: "EICR",
  epc: "EPC",
  licence: "HMO licence",
  legionella: "Legionella risk assessment",
  pat: "PAT",
  alarms: "Smoke and CO alarms",
  fire: "Fire safety",
};

/** The folder every certificate filed under this id sits in. */
const vaultShelf = (property: string): string => `documents/${safeName(`compliance-${property}-`)}`;

/* documents/compliance-<id>-<certKey>/<file>: the part up to the certKey. */
const SHELF_OF = /^(documents\/compliance-[^/]+-)[a-z_]+\/[^/]+$/;

async function listUnder(prefix: string): Promise<VaultFile[]> {
  const out = await withR2((client) => client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, MaxKeys: 200 })));
  return (out.Contents ?? [])
    .filter((o) => o.Key && !o.Key.endsWith("/"))
    .map((o) => {
      const key = o.Key as string;
      const rest = key.slice(prefix.length); // "<certKey>/<timestamp>-<name>"
      const slash = rest.indexOf("/");
      const certKey = slash > 0 ? rest.slice(0, slash) : "";
      const name = rest.slice(slash + 1).replace(/^\d+-/, "");
      return {
        key,
        certKey,
        /* A fire certificate by its own kind where its name says (ticket
           24053535, 11 Nov 2026): "FRA 16062025.pdf" is a fire risk
           assessment. The property file also reads the source line. */
        label: certKey === "fire" ? fireKindIn(name) ?? FIRE_SAFETY : VAULT_LABEL[certKey] ?? certKey,
        name,
        size: o.Size ?? 0,
        uploadedAt: o.LastModified ? new Date(o.LastModified).toISOString() : null,
        open: `/api/r2/file?key=${encodeURIComponent(key)}`,
      };
    })
    .sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
}

/** This home's certificate records: where each file is kept, and when it runs out. */
async function recordsFor(property: string): Promise<{ r2_key: string; expiry: string }[]> {
  /* A real home only: an address still waiting for its property has no records of its own. */
  if (!hasDb() || !(/^\d+$/.test(property) || isOsPropertyId(property))) return [];
  return q<{ r2_key: string; expiry: string }>(`SELECT r2_key, expiry::text AS expiry FROM os_certificates WHERE property_id = $1`, [property]).catch(() => []);
}

export async function listVault(property: string): Promise<VaultFile[]> {
  if (!r2Configured) return [];
  const shelf = vaultShelf(property);
  const [own, records] = await Promise.all([listUnder(shelf), recordsFor(property)]);
  /* The other folders this home's records point into. None on a home that
     only ever had one id, and the answer is the folder's, exactly as before. */
  const elsewhere = new Set(records.map((r) => r.r2_key).filter((k) => !k.startsWith(shelf) && !keyClimbs(k) && SHELF_OF.test(k)));
  if (!elsewhere.size) return own;
  const shelves = [...new Set([...elsewhere].map((k) => (SHELF_OF.exec(k) as RegExpExecArray)[1]))];
  /* Only the files a record of THIS home names: the rest of that folder is
     not this home's to show. A folder that cannot be read adds nothing. */
  const others = (await Promise.all(shelves.map((s) => listUnder(s).catch(() => [] as VaultFile[])))).flat().filter((f) => elsewhere.has(f.key));
  if (!others.length) return own;
  /* Two folders, so "the newest upload" no longer says which certificate is
     the current one: the record's expiry does, then the upload. A file with
     no record comes after those that have one. */
  const expiry = new Map(records.map((r) => [r.r2_key, String(r.expiry).slice(0, 10)]));
  const all = [...own, ...others].sort(
    (a, b) => (expiry.get(b.key) ?? "").localeCompare(expiry.get(a.key) ?? "") || (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? "")
  );
  const seen = new Set<string>();
  return all.map((f) => {
    if (!seen.has(f.certKey)) {
      seen.add(f.certKey);
      return f;
    }
    return { ...f, earlier: true };
  });
}
