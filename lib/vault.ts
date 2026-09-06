import "server-only";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";

/**
 * Every certificate the OS holds for one property (or for an address still
 * waiting for its REX property - key "pending-<address>"), across all its
 * types. One read, one shelf. The folders are the ones the intake writes:
 * documents/compliance-<property>-<certKey>/<timestamp>-<name>.
 */

export interface VaultFile {
  key: string;
  certKey: string;
  label: string;
  name: string;
  size: number;
  uploadedAt: string | null;
  open: string;
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

export async function listVault(property: string): Promise<VaultFile[]> {
  if (!r2Configured) return [];
  const prefix = `documents/${safeName(`compliance-${property}-`)}`;
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
        label: VAULT_LABEL[certKey] ?? certKey,
        name,
        size: o.Size ?? 0,
        uploadedAt: o.LastModified ? new Date(o.LastModified).toISOString() : null,
        open: `/api/r2/file?key=${encodeURIComponent(key)}`,
      };
    })
    .sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
}
