import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ChainPills } from "@/components/wallet/ChainPills";
import { ActionTile } from "@/components/wallet/ActionTile";
import { useWallet } from "@/wallet/WalletProvider";
import { formatBalance, useNativeBalance } from "@/wallet/useBalance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/wallet/")({
  component: WalletHome,
});

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function WalletHome() {
  const { address, chain, setChain, lock } = useWallet();
  const balance = useNativeBalance(address, chain);
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(false);

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
    <div className="mx-auto w-full max-w-2xl space-y-6 duration-500 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account 1</p>
          <button
            type="button"
            onClick={copyAddress}
            className="flex items-center gap-2 rounded-full text-lg font-semibold transition-colors hover:text-primary"
          >
            {address ? shorten(address) : "…"}
            {copied ? (
              <Check className="size-4 text-success" />
            ) : (
              <Copy className="size-4 text-muted-foreground" />
            )}
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={lock} className="rounded-full">
          <Lock className="size-4" aria-hidden />
          Lock
        </Button>
      </div>

      <ChainPills value={chain} onChange={setChain} />

      {/* Balance hero */}
      <div className="relative overflow-hidden rounded-3xl p-6 shadow-lift gradient-warm">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-background/20 blur-2xl" />
        <div className="relative space-y-5 text-primary-foreground">
          <div className="flex items-center justify-between">
            <p className="text-sm/none opacity-80">Balance on {chain.label}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setHidden((v) => !v)}
                aria-label={hidden ? "Show balance" : "Hide balance"}
                className="rounded-full p-2 transition-colors hover:bg-background/15"
              >
                {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
              <button
                type="button"
                onClick={() => void balance.refetch()}
                aria-label="Refresh balance"
                className="rounded-full p-2 transition-colors hover:bg-background/15"
              >
                <RefreshCw
                  className={cn("size-4", balance.isFetching && "animate-spin")}
                  aria-hidden
                />
              </button>
            </div>
          </div>

          <div className="flex items-end gap-2">
            {balance.isLoading ? (
              <Skeleton className="h-11 w-40 bg-background/25" />
            ) : (
              <p className="text-[2.75rem] font-semibold leading-none tracking-tight tabular-nums">
                {hidden ? "••••" : formatBalance(balance.data)}
              </p>
            )}
            <span className="pb-1 text-lg opacity-85">{chain.symbol}</span>
          </div>

          {balance.isError ? (
            <p className="text-sm opacity-90">
              Could not reach {chain.label}. Pull refresh to retry.
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <code className="truncate rounded-full bg-background/15 px-3 py-1.5 text-xs">
              {address}
            </code>
            {address ? (
              <a
                href={chain.explorerAddress(address)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View on explorer"
                className="rounded-full bg-background/15 p-2 transition-colors hover:bg-background/25"
              >
                <ExternalLink className="size-4" />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-start gap-2 rounded-3xl border border-border bg-card p-4 shadow-soft">
        <ActionTile icon={ArrowUpFromLine} label="Send" to="/wallet/send" />
        <ActionTile icon={ArrowDownToLine} label="Receive" to="/wallet/receive" />
        <ActionTile
          icon={ArrowLeftRight}
          label="Swap"
          onClick={() => toast.info("Swaps are coming soon.")}
          badge="soon"
        />
        <ActionTile
          icon={CreditCard}
          label="Buy"
          onClick={() => toast.info("On-ramp is coming soon.")}
          badge="soon"
        />
      </div>

      {/* Tokens / Activity */}
      <Tabs defaultValue="tokens" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-full p-1">
          <TabsTrigger value="tokens" className="rounded-full">
            Tokens
          </TabsTrigger>
          <TabsTrigger value="activity" className="rounded-full">
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="mt-4 space-y-2">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-soft">
            <span className="grid size-10 place-items-center rounded-full text-sm font-semibold text-primary-foreground gradient-warm">
              {chain.symbol.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{chain.symbol}</p>
              <p className="text-xs text-muted-foreground">{chain.label}</p>
            </div>
            <p className="tabular-nums font-medium">
              {hidden ? "••••" : formatBalance(balance.data)}
            </p>
          </div>
          <EmptyRow
            text="ERC-20 token balances arrive in the next update."
            icon={Sparkles}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <EmptyRow
            text="No activity yet. Your transfers on this network will appear here."
            icon={ArrowLeftRight}
          />
        </TabsContent>
      </Tabs>

      <p className="text-center text-xs text-muted-foreground">
        Self-custody wallet. Your keys never leave this device.
      </p>
    </div>
  );
}

function EmptyRow({
  text,
  icon: Icon,
}: {
  text: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-8 text-center">
      <Icon className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
