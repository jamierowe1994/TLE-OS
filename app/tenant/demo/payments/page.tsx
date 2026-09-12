import PaymentsView from "@/components/tenant/PaymentsView";
import { SOPHIE } from "@/lib/tenant-sample";

export default function Page() {
  return <PaymentsView v={SOPHIE} />;
}
