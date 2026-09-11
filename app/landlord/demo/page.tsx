import LandlordDashboard from "@/components/landlord/Dashboard";
import LandlordDocuments from "@/components/LandlordDocuments";
import PropertyPhoto from "@/components/PropertyPhoto";
import { RAJ, img } from "@/lib/landlord-sample";

/* The sample landlord lives in lib/landlord-sample, shared with the demo journey page. */
export default function LandlordDemo() {
  return (
    <LandlordDashboard
      view={RAJ}
      upload={
        <LandlordDocuments sample wanted={["epc", "id"]} />
      }
      managed={
        <section className="rounded-[20px] border border-line/70 bg-panel p-5" data-search>
          <h2 className="text-[17px]">Already looked after</h2>
          <div className="mt-4 flex flex-wrap items-center gap-4 [&>div]:min-w-[55%]">
            <span className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line/60 bg-white">
              <PropertyPhoto src={img("Walesby")} className="h-full w-full object-cover" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[17px]">183 Walesby Lane, New Ollerton</h3>
              <p className="text-[12px] text-muted">Tenanted  •  £750 per month  •  Fully managed</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line/70 px-4 py-2 text-[12.5px] font-semibold text-muted">
              View property <span className="text-[11px]">›</span>
            </span>
          </div>
        </section>
      }
    />
  );
}
