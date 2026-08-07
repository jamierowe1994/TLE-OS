import IntroGate from "@/components/IntroGate";
import Shell from "@/components/Shell";
import ThemeGate from "@/components/ThemeGate";

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeGate>
      <IntroGate>
        <Shell>{children}</Shell>
      </IntroGate>
    </ThemeGate>
  );
}
