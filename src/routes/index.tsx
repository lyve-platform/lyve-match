import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Globe,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/lyve/Logo";
import { ThemeToggle } from "@/components/lyve/ThemeToggle";

const title = "LYVE Wallet — Your keys. Your crypto.";
const description =
  "LYVE Wallet is a self-custody crypto wallet for Ethereum, Base, Arbitrum and BNB Chain. No sign-up, no email — your keys never leave your device.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://lyve-match.lovable.app" },
      { property: "og:image", content: "https://lyve-match.lovable.app/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "LYVE Wallet" },
      { name: "twitter:image", content: "https://lyve-match.lovable.app/og-image.jpg" },
      { name: "twitter:image:alt", content: "LYVE Wallet" },
    ],
    links: [{ rel: "canonical", href: "https://lyve-match.lovable.app" }],
  }),
  component: Index,
});

const features = [
  {
    icon: KeyRound,
    title: "Self-custody by design",
    body: "Keys are generated and encrypted on your device with your PIN. LYVE never sees your recovery phrase and cannot move your funds.",
  },
  {
    icon: Globe,
    title: "Multi-chain, one address",
    body: "Ethereum, Base, Arbitrum and BNB Smart Chain from a single recovery phrase. Switch networks in one tap.",
  },
  {
    icon: ShieldCheck,
    title: "No accounts, no tracking",
    body: "No email, no phone number, no KYC to start. Create a wallet in under a minute and stay in control.",
  },
  {
    icon: Smartphone,
    title: "Web and mobile",
    body: "Use LYVE Wallet in your browser today, with native iOS and Android apps built from the same secure core.",
  },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2" aria-label="Main">
            <ThemeToggle />
            <Button asChild size="sm" className="rounded-full">
              <Link to="/wallet">Open wallet</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-3xl bg-primary/10">
            <Wallet className="size-8 text-primary" aria-hidden />
          </div>
          <h1 className="font-display text-4xl font-semibold text-balance sm:text-5xl md:text-6xl">
            Your keys. Your crypto.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
            LYVE Wallet is a self-custody wallet for Ethereum, Base, Arbitrum and BNB Chain.
            No sign-up. No email. Your recovery phrase never leaves your device.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-8">
              <Link to="/wallet">
                Create or open wallet
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Self-custody means you are your own bank. Back up your recovery phrase.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10">
                    <f.icon className="size-5 text-primary" aria-hidden />
                  </div>
                  <CardTitle className="text-lg">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <Card>
            <CardHeader>
              <CardTitle>How it works</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-6 sm:grid-cols-3">
                <li className="space-y-2">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    1
                  </div>
                  <h3 className="font-medium">Create your wallet</h3>
                  <p className="text-sm text-muted-foreground">
                    A 12-word recovery phrase is generated locally and encrypted with your
                    6-digit PIN.
                  </p>
                </li>
                <li className="space-y-2">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    2
                  </div>
                  <h3 className="font-medium flex items-center gap-1.5">
                    <ArrowDownToLine className="size-4" aria-hidden /> Receive
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Share your address or QR code to receive ETH, BNB and tokens on any
                    supported network.
                  </p>
                </li>
                <li className="space-y-2">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    3
                  </div>
                  <h3 className="font-medium flex items-center gap-1.5">
                    <ArrowUpFromLine className="size-4" aria-hidden /> Send
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Sign transactions on-device with your PIN. Nothing is broadcast without
                    your confirmation.
                  </p>
                </li>
              </ol>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} LYVE Wallet</p>
          <nav className="flex gap-4" aria-label="Footer">
            <Link to="/wallet" className="underline-offset-4 hover:underline">
              Open wallet
            </Link>
            <Link to="/privacy" className="underline-offset-4 hover:underline">
              Privacy
            </Link>
            <Link to="/terms" className="underline-offset-4 hover:underline">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
