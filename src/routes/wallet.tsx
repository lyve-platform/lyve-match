import { createFileRoute, Outlet } from "@tanstack/react-router";
import { WalletProvider, useWallet } from "@/wallet/WalletProvider";
import { Onboarding } from "@/components/wallet/Onboarding";
import { Unlock } from "@/components/wallet/Unlock";
import { Logo } from "@/components/lyve/Logo";
import { ThemeToggle } from "@/components/lyve/ThemeToggle";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/wallet")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "LYVE Wallet — Self-custody crypto wallet" },
      {
        name: "description",
        content:
          "A self-custody EVM wallet for Ethereum, Base, Arbitrum and BNB Chain. Your keys stay on your device.",
      },
      { property: "og:title", content: "LYVE Wallet — Self-custody crypto wallet" },
      {
        property: "og:description",
        content:
          "A self-custody EVM wallet for Ethereum, Base, Arbitrum and BNB Chain. Your keys stay on your device.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletLayout,
});

function WalletGate() {
  const { status } = useWallet();

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-md space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (status === "empty") {
    return (
      <div className="mx-auto w-full max-w-lg">
        <Onboarding />
      </div>
    );
  }
  if (status === "locked") {
    return (
      <div className="mx-auto w-full max-w-lg">
        <Unlock />
      </div>
    );
  }
  return <Outlet />;
}

function WalletLayout() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <a href="/wallet" aria-label="LYVE Wallet" className="min-w-0">
              <Logo />
            </a>
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="px-4 pb-24 pt-8 sm:px-6">
          <WalletGate />
        </main>
      </div>
    </WalletProvider>
  );
}
