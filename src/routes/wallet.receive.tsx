import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/wallet/WalletProvider";
import { ChainPills } from "@/components/wallet/ChainPills";

export const Route = createFileRoute("/wallet/receive")({
  component: ReceivePage,
});

function ReceivePage() {
  const { address, chain, setChain } = useWallet();
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      if (!address || !canvasRef.current) return;
      try {
        const QRCode = await import("qrcode");
        if (cancelled || !canvasRef.current) return;
        await QRCode.toCanvas(canvasRef.current, address, {
          width: 220,
          margin: 1,
          color: { dark: "#1c1917", light: "#ffffff" },
        });
      } catch {
        /* QR is a convenience; address text below is the source of truth */
      }
    }
    void draw();
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  async function share() {
    if (!address) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "My wallet address", text: address });
        return;
      } catch {
        /* user dismissed */
      }
    }
    void copyAddress();
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 duration-400 animate-in fade-in slide-in-from-bottom-2">
      <Button variant="ghost" size="sm" asChild className="rounded-full">
        <Link to="/wallet">
          <ArrowLeft className="size-4" aria-hidden />
          Back to wallet
        </Link>
      </Button>

      <ChainPills value={chain} onChange={setChain} />

      <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
        <h1 className="text-xl font-semibold">Receive {chain.symbol}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share this address to receive assets on {chain.label}. The same address works on all
          supported networks.
        </p>

        <div className="mx-auto mt-6 w-fit rounded-3xl bg-gradient-to-b from-primary-soft to-transparent p-3">
          <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
            <canvas
              ref={canvasRef}
              className="rounded-lg"
              aria-label={`QR code of your ${chain.label} address`}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={copyAddress}
          className="mt-5 w-full break-all rounded-2xl bg-surface px-4 py-3 font-mono text-sm transition-colors hover:bg-muted"
        >
          {address}
        </button>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="rounded-full transition-transform active:scale-[0.98]"
            onClick={copyAddress}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full transition-transform active:scale-[0.98]"
            onClick={() => void share()}
          >
            <Share2 className="size-4" />
            Share
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Only send {chain.label} assets to this address while {chain.label} is selected.
        </p>
      </div>
    </div>
  );
}
