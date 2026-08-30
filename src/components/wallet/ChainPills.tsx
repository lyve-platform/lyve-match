import { WALLET_CHAINS, type WalletChain } from "@/wallet/chains";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  ethereum: "bg-chart-2",
  base: "bg-chart-1",
  arbitrum: "bg-chart-4",
  bsc: "bg-chart-3",
};

export function ChainPills({
  value,
  onChange,
  className,
}: {
  value: WalletChain;
  onChange: (chain: WalletChain) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Network"
      className={cn(
        "-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {WALLET_CHAINS.map((c) => {
        const active = c.key === value.key;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(c)}
            className={cn(
              "flex shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium",
              "transition-all duration-200 active:scale-[0.97]",
              active
                ? "border-transparent bg-foreground text-background shadow-soft"
                : "border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            )}
          >
            <span
              className={cn("size-2 rounded-full", DOT[c.key] ?? "bg-primary")}
              aria-hidden
            />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
