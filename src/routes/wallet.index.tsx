import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, Copy, Check, Lock, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWallet } from "@/wallet/WalletProvider";
import { WALLET_CHAINS, getWalletChain } from "@/wallet/chains";
import { formatBalance, useNativeBalance } from "@/wallet/useBalance";

export const Route = createFileRoute("/wallet/")({
  component: WalletHome,
});

function WalletHome() {
  const { address, chain, setChain, lock } = useWallet();
  const balance = useNativeBalance(address, chain);
  const [copied, setCopied] = useState(false);

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
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Wallet</h1>
        <Button variant="outline" size="sm" onClick={lock}>
          <Lock className="size-4" aria-hidden />
          Lock
        </Button>
      </div>

      <Select value={chain.key} onValueChange={(key) => setChain(getWalletChain(key))}>
        <SelectTrigger className="w-full sm:w-64" aria-label="Network">
          <SelectValue placeholder="Network" />
        </SelectTrigger>
        <SelectContent>
          {WALLET_CHAINS.map((c) => (
            <SelectItem key={c.key} value={c.key}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total balance on {chain.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-4xl font-semibold tracking-tight">
            {balance.isLoading ? "…" : formatBalance(balance.data)}{" "}
            <span className="text-xl text-muted-foreground">{chain.symbol}</span>
          </p>
          {balance.isError ? (
            <p className="text-sm text-destructive">
              Could not reach the {chain.label} network. Check your connection and retry.
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-surface px-3 py-2 text-sm">
              {address}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={copyAddress}
              aria-label="Copy address"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
            {address ? (
              <Button variant="outline" size="icon" asChild aria-label="View on explorer">
                <a
                  href={chain.explorerAddress(address)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button asChild size="lg">
              <Link to="/wallet/send">
                <ArrowUpFromLine className="size-4" aria-hidden />
                Send
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/wallet/receive">
                <ArrowDownToLine className="size-4" aria-hidden />
                Receive
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Self-custody wallet. LYVE never holds your keys or funds. Token balances and full
        history are coming next.
      </p>
    </div>
  );
}
