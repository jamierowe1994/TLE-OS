import IntroGate from "@/components/IntroGate";
import Shell from "@/components/Shell";

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return (
    <IntroGate>
      <Shell>{children}</Shell>
    </IntroGate>
  );
}
