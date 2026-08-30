import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/wallet/WalletProvider";

export const Route = createFileRoute("/wallet/receive")({
  component: ReceivePage,
});

function ReceivePage() {
  const { address, chain } = useWallet();
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

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/wallet">
          <ArrowLeft className="size-4" aria-hidden />
          Back to wallet
        </Link>
      </Button>

      <Card>
        <CardHeader className="text-center">
          <CardTitle>Receive {chain.symbol}</CardTitle>
          <CardDescription>
            Share this address to receive {chain.symbol} or tokens on {chain.label}. The same
            address works on all supported networks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="mx-auto w-fit rounded-2xl border border-border bg-white p-3">
            <canvas ref={canvasRef} aria-label={`QR code of your ${chain.label} address`} />
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-surface px-3 py-2 text-center text-sm">
              {address}
            </code>
          </div>
          <Button className="w-full" size="lg" onClick={copyAddress}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy address"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Only send {chain.label} assets to this address while the {chain.label} network is
            selected.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
