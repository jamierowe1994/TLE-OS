/** Save one stored file from R2 to disk, to check a disagreement by eye. */
import fs from "node:fs";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, withR2 } from "@/lib/r2";
const [key, to] = process.argv.slice(2);
withR2(async (c) => {
  const r = await c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  fs.writeFileSync(to, Buffer.from(await r.Body!.transformToByteArray()));
}).then(() => console.log("saved", to));
