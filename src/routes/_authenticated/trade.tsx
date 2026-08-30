import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Layers,
  Link2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Unlink,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  closeAllPositions,
  closeOpenPosition,
  getDesk,
  linkAccount,
  placeOrder,
  unlinkAccount,
  type DeskSnapshot,
} from "@/lib/mt5.functions";
import { buildGrid, formatMoney, roundVolume } from "@/lib/mt5-core";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trade")({
  head: () => ({
    meta: [
      { title: "Trading Desk — MT5 gold automation" },
      {
        name: "description",
        content:
          "Connect your MetaTrader 5 account and run a disciplined gold grid: live quotes, one-tap orders and an automated averaging plan.",
      },
      { property: "og:title", content: "Trading Desk — MT5 gold automation" },
      {
        property: "og:description",
        content:
          "Live MT5 quotes, one-tap buy and sell, and a martingale grid assistant for XAUUSD.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TradeDesk,
});

const SYMBOLS = ["XAUUSD", "XAUUSDm", "EURUSD", "BTCUSD"];

function TradeDesk() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const desk = useServerFn(getDesk);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["mt5-desk", symbol],
    queryFn: () => desk({ data: { symbol } }),
    refetchInterval: 5000,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["mt5-desk"] });
  const data = query.data;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 duration-500 animate-in fade-in slide-in-from-bottom-2 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Trading desk
          </p>
          <h1 className="text-2xl font-semibold">MetaTrader 5</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="rounded-full">
            <Link to="/wallet">
              <Wallet className="size-4" aria-hidden />
              Wallet
            </Link>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label="Refresh"
            onClick={refresh}
          >
            <RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} />
          </Button>
        </div>
      </header>

      {query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-56 w-full rounded-3xl" />
        </div>
      ) : !data ? (
        <Notice
          tone="warn"
          text="Could not reach the trading service. Try refreshing in a moment."
        />
      ) : !data.configured ? (
        <Notice
          tone="warn"
          text="Live trading is not configured yet. A MetaApi access token must be added before MT5 accounts can be linked."
        />
      ) : !data.linked ? (
        <LinkForm onDone={refresh} />
      ) : (
        <Desk
          data={data}
          symbol={symbol}
          setSymbol={setSymbol}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function Notice({ tone, text }: { tone: "warn" | "info"; text: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-sm",
        tone === "warn"
          ? "border-destructive/30 bg-destructive/5 text-foreground"
          : "border-border bg-surface text-muted-foreground",
      )}
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p>{text}</p>
    </div>
  );
}

function LinkForm({ onDone }: { onDone: () => void }) {
  const link = useServerFn(linkAccount);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [name, setName] = useState("My MT5");

  const mutation = useMutation({
    mutationFn: () => link({ data: { login, password, server, name } }),
    onSuccess: () => {
      toast.success("Account linked. Give the broker a moment to connect.");
      onDone();
    },
    onError: (err: unknown) =>
      toast.error("Could not link the account", {
        description: err instanceof Error ? err.message.slice(0, 160) : undefined,
      }),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <h2 className="text-lg font-semibold">Connect your MT5 account</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Use your broker&apos;s investor or trading credentials. Credentials are forwarded once
        to the trading provider and are never stored here.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Account label" value={name} onChange={setName} />
        <Field
          id="login"
          label="Login (account number)"
          value={login}
          onChange={setLogin}
          inputMode="numeric"
        />
        <Field
          id="server"
          label="Broker server"
          value={server}
          onChange={setServer}
          placeholder="Exness-MT5Real8"
        />
        <Field
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
        />
      </div>

      <Button
        className="mt-5 w-full rounded-full"
        size="lg"
        disabled={mutation.isPending || !login || !password || !server}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Link2 className="size-4" />
        )}
        Link account
      </Button>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl"
      />
    </div>
  );
}

function Desk({
  data,
  symbol,
  setSymbol,
  onChanged,
}: {
  data: DeskSnapshot;
  symbol: string;
  setSymbol: (s: string) => void;
  onChanged: () => void;
}) {
  const order = useServerFn(placeOrder);
  const close = useServerFn(closeOpenPosition);
  const closeAll = useServerFn(closeAllPositions);
  const unlink = useServerFn(unlinkAccount);

  const [volume, setVolume] = useState("0.1");
  const [multiplier, setMultiplier] = useState("2");
  const [stepPoints, setStepPoints] = useState("300");
  const [legs, setLegs] = useState("4");
  const [tpPoints, setTpPoints] = useState("150");
  const [busy, setBusy] = useState(false);

  const point = data.spec?.point ?? 0.01;
  const contractSize = data.spec?.contractSize ?? 100;
  const bid = data.price?.bid ?? 0;
  const ask = data.price?.ask ?? 0;
  const connected = data.connection?.connectionStatus === "CONNECTED";

  const plan = useMemo(
    () =>
      buildGrid({
        side: "sell",
        entryPrice: bid || 1,
        baseVolume: Number(volume) || 0.01,
        multiplier: Number(multiplier) || 1,
        stepPoints: Number(stepPoints) || 100,
        legs: Number(legs) || 1,
        takeProfitPoints: Number(tpPoints) || 100,
        contractSize,
        pointValue: point,
      }),
    [bid, volume, multiplier, stepPoints, legs, tpPoints, contractSize, point],
  );

  const openLots = roundVolume(
    data.positions.reduce((sum, p) => sum + p.volume, 0),
  );
  const filled = data.positions.length;
  const nextLeg = plan.legs[filled] ?? null;
  const floating = data.positions.reduce((sum, p) => sum + p.profit, 0);

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      onChanged();
    } catch (err) {
      toast.error("Trade rejected", {
        description: err instanceof Error ? err.message.slice(0, 180) : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  function send(side: "buy" | "sell", lots: number, comment?: string) {
    void run(
      () =>
        order({
          data: {
            side,
            symbol,
            volume: roundVolume(Math.max(lots, data.spec?.minVolume ?? 0.01)),
            ...(comment ? { comment } : {}),
          },
        }),
      `${side === "buy" ? "Buy" : "Sell"} ${lots} ${symbol} sent`,
    );
  }

  return (
    <div className="space-y-5">
      {/* Account hero */}
      <div className="relative overflow-hidden rounded-3xl p-6 shadow-lift gradient-warm">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-background/20 blur-2xl" />
        <div className="relative space-y-4 text-primary-foreground">
          <div className="flex items-center justify-between text-sm">
            <span className="opacity-85">
              {data.linked?.name} · {data.linked?.login}
            </span>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full bg-background/15 px-2.5 py-1 text-xs",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  connected ? "bg-success" : "bg-destructive",
                )}
              />
              {connected ? "Connected" : (data.connection?.connectionStatus ?? "Connecting")}
            </span>
          </div>
          <div>
            <p className="text-sm opacity-80">Equity</p>
            <p className="text-[2.5rem] font-semibold leading-none tabular-nums">
              {data.account ? formatMoney(data.account.equity) : "—"}
              <span className="ml-2 text-lg opacity-85">
                {data.account?.currency ?? ""}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Metric label="Balance" value={data.account ? formatMoney(data.account.balance) : "—"} />
            <Metric label="Free margin" value={data.account ? formatMoney(data.account.freeMargin) : "—"} />
            <Metric
              label="Floating"
              value={`${floating >= 0 ? "+" : ""}${formatMoney(floating)}`}
            />
          </div>
        </div>
      </div>

      {data.error ? <Notice tone="warn" text={data.error} /> : null}

      {/* Symbol pills */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSymbol(s)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-[0.97]",
              s === symbol
                ? "border-transparent bg-foreground text-background shadow-soft"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Quote + quick trade */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="grid grid-cols-2 gap-3">
          <QuoteButton
            tone="sell"
            label="SELL"
            price={bid}
            onClick={() => send("sell", Number(volume) || 0.01, "lyve-manual")}
            disabled={busy || !bid}
          />
          <QuoteButton
            tone="buy"
            label="BUY"
            price={ask}
            onClick={() => send("buy", Number(volume) || 0.01, "lyve-manual")}
            disabled={busy || !ask}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Label htmlFor="lots" className="text-sm text-muted-foreground">
            Lots
          </Label>
          <Input
            id="lots"
            inputMode="decimal"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="h-10 w-24 rounded-xl text-center tabular-nums"
          />
          <div className="flex gap-2">
            {[0.01, 0.1, 0.5, 1].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVolume(String(v))}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-foreground/25 active:scale-95"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="bot">
        <TabsList className="grid w-full grid-cols-3 rounded-full p-1">
          <TabsTrigger value="bot" className="rounded-full">
            Bot
          </TabsTrigger>
          <TabsTrigger value="strategy" className="rounded-full">
            Manual grid
          </TabsTrigger>
          <TabsTrigger value="positions" className="rounded-full">
            Positions ({data.positions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bot" className="mt-4">
          <BotPanel symbol={symbol} />
        </TabsContent>

        <TabsContent value="strategy" className="mt-4 space-y-4">

          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-muted-foreground" aria-hidden />
              <h2 className="font-semibold">Averaging grid (sell)</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Mirrors the manual routine: open a first lot, then reinforce every fixed
              distance with a larger lot, and exit the whole basket at break-even plus target.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field id="mult" label="Multiplier" value={multiplier} onChange={setMultiplier} inputMode="decimal" />
              <Field id="step" label="Step (points)" value={stepPoints} onChange={setStepPoints} inputMode="numeric" />
              <Field id="legs" label="Legs" value={legs} onChange={setLegs} inputMode="numeric" />
              <Field id="tp" label="Target (points)" value={tpPoints} onChange={setTpPoints} inputMode="numeric" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Total lots" value={plan.totalVolume.toFixed(2)} />
              <Stat label="Break-even" value={plan.breakEven.toFixed(2)} />
              <Stat label="Target" value={plan.targetPrice.toFixed(2)} />
              <Stat
                label="Worst case"
                value={`-${formatMoney(plan.worstCaseLossUsd, 0)}`}
                tone="danger"
              />
            </div>

            <ul className="mt-4 space-y-2">
              {plan.legs.map((leg) => {
                const done = leg.index < filled;
                return (
                  <li
                    key={leg.index}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border px-4 py-3 text-sm",
                      done
                        ? "border-success/40 bg-success/5"
                        : leg.index === filled
                          ? "border-foreground/25 bg-surface"
                          : "border-dashed border-border",
                    )}
                  >
                    <span className="font-medium">Leg {leg.index + 1}</span>
                    <span className="tabular-nums text-muted-foreground">
                      @ {leg.price.toFixed(2)}
                    </span>
                    <span className="tabular-nums font-medium">{leg.volume.toFixed(2)} lots</span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                className="w-full rounded-full"
                disabled={busy || !nextLeg || !bid}
                onClick={() =>
                  nextLeg && send("sell", nextLeg.volume, `grid-${nextLeg.index + 1}`)
                }
              >
                {nextLeg
                  ? `Execute leg ${nextLeg.index + 1} · ${nextLeg.volume.toFixed(2)} lots`
                  : "Grid complete"}
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-full"
                disabled={busy || data.positions.length === 0}
                onClick={() =>
                  void run(() => closeAll({ data: { symbol } }), "Basket closed")
                }
              >
                Close basket ({openLots.toFixed(2)} lots)
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Averaging increases risk quickly. Trade sizes you can fund.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              disabled={busy}
              onClick={() => void run(() => unlink({}), "Account unlinked")}
            >
              <Unlink className="size-4" />
              Unlink
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="positions" className="mt-4 space-y-2">
          {data.positions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-10 text-center">
              <Activity className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">No open positions.</p>
            </div>
          ) : (
            data.positions.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-full",
                    p.type.includes("BUY")
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {p.type.includes("BUY") ? (
                    <ArrowUpRight className="size-5" />
                  ) : (
                    <ArrowDownRight className="size-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {p.symbol} · {p.volume.toFixed(2)} lots
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {p.openPrice.toFixed(2)} → {p.currentPrice.toFixed(2)}
                  </p>
                </div>
                <p
                  className={cn(
                    "tabular-nums font-medium",
                    p.profit >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {p.profit >= 0 ? "+" : ""}
                  {formatMoney(p.profit)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() =>
                    void run(() => close({ data: { positionId: p.id } }), "Position closed")
                  }
                >
                  Close
                </Button>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background/15 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide opacity-75">{label}</p>
      <p className="tabular-nums font-medium">{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums font-medium", tone === "danger" && "text-destructive")}>
        {value}
      </p>
    </div>
  );
}

function QuoteButton({
  tone,
  label,
  price,
  onClick,
  disabled,
}: {
  tone: "buy" | "sell";
  label: string;
  price: number;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-2xl px-4 py-4 text-left text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50",
        tone === "buy" ? "bg-success" : "bg-destructive",
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-widest opacity-85">
        {label}
      </span>
      <span className="block text-2xl font-semibold tabular-nums">
        {price ? price.toFixed(2) : "—"}
      </span>
    </button>
  );
}
