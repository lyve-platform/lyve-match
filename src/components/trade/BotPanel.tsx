import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Loader2, OctagonX, Play, Save, Square, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getBotState,
  panicStop,
  runBotNow,
  saveBotConfig,
  toggleBot,
  type BotSettings,
} from "@/lib/bot.functions";
import { formatMoney, roundVolume } from "@/lib/mt5-core";
import { cn } from "@/lib/utils";

type Draft = Omit<BotSettings, "disabledReason" | "lastTickAt" | "dayRealizedUsd" | "enabled">;

const FIELDS: Array<{ key: keyof Draft; label: string; hint: string; step?: string }> = [
  { key: "baseLot", label: "Starting lot", hint: "First leg volume", step: "0.01" },
  { key: "multiplier", label: "Multiplier", hint: "Each leg × this", step: "0.1" },
  { key: "stepPoints", label: "Step (points)", hint: "Distance before adding" },
  { key: "maxLegs", label: "Max legs", hint: "Hard cap on averaging" },
  { key: "targetUsd", label: "Target ($)", hint: "Close basket at profit" },
  { key: "maxLossUsd", label: "Basket stop ($)", hint: "Flatten and halt" },
  { key: "dailyLossUsd", label: "Daily stop ($)", hint: "Pause for the day" },
  { key: "maxTotalLots", label: "Max total lots", hint: "Across all legs" },
  { key: "minMarginPct", label: "Min margin %", hint: "Halt below this level" },
];

const REASONS: Record<string, string> = {
  stopped_by_user: "You stopped the bot.",
  panic_stop: "Emergency stop — everything was closed.",
  basket_max_loss: "Basket hit its loss limit.",
  daily_loss_limit: "Daily loss limit reached.",
  margin_too_low: "Margin level dropped below your safety line.",
  account_not_linked: "No MT5 account is linked.",
};

export function BotPanel({ symbol }: { symbol: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getBotState);
  const save = useServerFn(saveBotConfig);
  const toggle = useServerFn(toggleBot);
  const panic = useServerFn(panicStop);
  const runOnce = useServerFn(runBotNow);

  const query = useQuery({
    queryKey: ["bot-state"],
    queryFn: () => load({ data: undefined }),
    refetchInterval: 10000,
  });

  const settings = query.data?.settings;
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!settings || draft) return;
    const { enabled, disabledReason, lastTickAt, dayRealizedUsd, ...rest } = settings;
    void enabled;
    void disabledReason;
    void lastTickAt;
    void dayRealizedUsd;
    setDraft({ ...rest, symbol });
  }, [settings, draft, symbol]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["bot-state"] });

  const saving = useMutation({
    mutationFn: (next: Draft) => save({ data: next }),
    onSuccess: () => {
      toast.success("Bot settings saved");
      invalidate();
    },
    onError: () => toast.error("Could not save settings"),
  });

  const toggling = useMutation({
    mutationFn: (enabled: boolean) => toggle({ data: { enabled } }),
    onSuccess: (_res, enabled) => {
      toast.success(enabled ? "Bot is running" : "Bot stopped");
      invalidate();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "";
      toast.error(
        message.includes("mt5_not_linked")
          ? "Link your MT5 account first"
          : "Could not change bot state",
      );
    },
  });

  const stopping = useMutation({
    mutationFn: () => panic({ data: undefined }),
    onSuccess: (res) => {
      toast.success(`Emergency stop — ${res.closed} position(s) closed`);
      invalidate();
    },
    onError: () => toast.error("Emergency stop failed"),
  });

  const ticking = useMutation({
    mutationFn: () => runOnce({ data: undefined }),
    onSuccess: (res) => {
      toast.info(`Tick: ${res.action} (${res.reason})`);
      invalidate();
    },
    onError: () => toast.error("Tick failed"),
  });

  const projection = useMemo(() => {
    if (!draft) return null;
    let volume = 0;
    for (let i = 0; i < draft.maxLegs; i += 1) {
      volume += draft.baseLot * Math.pow(draft.multiplier, i);
    }
    return {
      totalLots: roundVolume(volume),
      lastLeg: roundVolume(draft.baseLot * Math.pow(draft.multiplier, draft.maxLegs - 1)),
      spanPoints: draft.stepPoints * (draft.maxLegs - 1),
    };
  }, [draft]);

  if (query.isLoading || !draft || !settings) {
    return <Skeleton className="h-64 w-full rounded-3xl" />;
  }

  const busy =
    saving.isPending || toggling.isPending || stopping.isPending || ticking.isPending;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-3xl border p-5 shadow-soft transition-colors",
          settings.enabled ? "border-success/40 bg-success/5" : "border-border bg-card",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-11 place-items-center rounded-2xl",
                settings.enabled
                  ? "bg-success text-primary-foreground"
                  : "bg-surface text-muted-foreground",
              )}
            >
              <Bot className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">Auto bot — {settings.symbol}</p>
              <p className="text-sm text-muted-foreground">
                {settings.enabled ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 animate-pulse rounded-full bg-success" />
                    Running · checks the market every minute
                  </span>
                ) : (
                  (settings.disabledReason && REASONS[settings.disabledReason]) || "Idle"
                )}
              </p>
            </div>
          </div>
          <Button
            variant={settings.enabled ? "outline" : "default"}
            className="rounded-full"
            disabled={busy}
            onClick={() => toggling.mutate(!settings.enabled)}
          >
            {toggling.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : settings.enabled ? (
              <Square className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {settings.enabled ? "Stop" : "Start bot"}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Cell label="Direction" value={settings.direction.toUpperCase()} />
          <Cell
            label="Today"
            value={`$${formatMoney(settings.dayRealizedUsd)}`}
            tone={settings.dayRealizedUsd < 0 ? "danger" : undefined}
          />
          <Cell
            label="Last tick"
            value={
              settings.lastTickAt
                ? new Date(settings.lastTickAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"
            }
          />
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 rounded-full"
            disabled={busy}
            onClick={() => ticking.mutate()}
          >
            <Zap className="size-4" aria-hidden />
            Run one tick
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1 rounded-full"
            disabled={busy}
            onClick={() => stopping.mutate()}
          >
            <OctagonX className="size-4" aria-hidden />
            Stop &amp; close all
          </Button>
        </div>
      </div>

      {/* Strategy settings */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <p className="font-medium">Strategy</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Opens a first {draft.direction} trade, adds a bigger leg every{" "}
          {draft.stepPoints} points against it, and closes everything at $
          {formatMoney(draft.targetUsd)} profit.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["buy", "sell"] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => setDraft({ ...draft, direction: side })}
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-wide transition-all active:scale-[0.98]",
                draft.direction === side
                  ? side === "buy"
                    ? "border-transparent bg-success text-primary-foreground"
                    : "border-transparent bg-destructive text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground",
              )}
            >
              {side}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FIELDS.map((field) => (
            <div key={String(field.key)} className="space-y-1">
              <Label htmlFor={`bot-${String(field.key)}`} className="text-xs">
                {field.label}
              </Label>
              <Input
                id={`bot-${String(field.key)}`}
                inputMode="decimal"
                step={field.step}
                value={String(draft[field.key])}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [field.key]: Number(e.target.value) || 0,
                  } as Draft)
                }
                className="h-10 rounded-xl tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground">{field.hint}</p>
            </div>
          ))}
        </div>

        {projection ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface p-3 text-sm">
            <p className="text-muted-foreground">
              Worst case fully loaded: <strong>{projection.totalLots}</strong> lots (last leg{" "}
              {projection.lastLeg}), covering {projection.spanPoints} points of adverse
              movement before the bot halts.
            </p>
          </div>
        ) : null}

        <Button
          className="mt-4 w-full rounded-full"
          disabled={busy}
          onClick={() => saving.mutate({ ...draft, symbol })}
        >
          {saving.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Save settings for {symbol}
        </Button>
      </div>

      {/* Activity */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <p className="font-medium">Bot activity</p>
        {query.data?.runs.length ? (
          <ul className="mt-3 space-y-2">
            {query.data.runs.map((run) => (
              <li
                key={run.id}
                className="flex items-start justify-between gap-3 rounded-2xl bg-surface px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{run.action.replace(/_/g, " ")}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {Object.entries(run.detail)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {new Date(run.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing yet. Start the bot and every decision it makes will be listed here.
          </p>
        )}
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | undefined;
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
