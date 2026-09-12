import TenancyView from "@/components/tenant/TenancyView";
import { SOPHIE } from "@/lib/tenant-sample";

export default function Page() {
  return <TenancyView v={SOPHIE} />;
}
