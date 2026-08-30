/**
 * Authenticated RPC surface for the MT5 trading desk.
 * Every function is scoped to the caller's own linked account.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LinkedAccount = {
  id: string;
  login: string;
  server: string;
  name: string;
  providerAccountId: string;
};

export type DeskSnapshot = {
  linked: LinkedAccount | null;
  configured: boolean;
  connection: { state: string; connectionStatus: string } | null;
  account: {
    broker: string;
    currency: string;
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
    leverage: number;
  } | null;
  price: { bid: number; ask: number } | null;
  spec: { contractSize: number; minVolume: number; volumeStep: number; point: number } | null;
  positions: Array<{
    id: string;
    symbol: string;
    type: string;
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
    stopLoss?: number;
    takeProfit?: number;
  }>;
  error: string | null;
};

const symbolSchema = z
  .object({ symbol: z.string().trim().min(1).max(24).default("XAUUSD") })
  .default({ symbol: "XAUUSD" });

async function loadLinked(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<LinkedAccount | null> {
  const { data, error } = await supabase
    .from("mt5_accounts")
    .select("id, login, server, name, provider_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("mt5_lookup_failed");
  if (!data) return null;
  return {
    id: data.id as string,
    login: data.login as string,
    server: data.server as string,
    name: data.name as string,
    providerAccountId: data.provider_account_id as string,
  };
}

export const getDesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => symbolSchema.parse(input ?? undefined))
  .handler(async ({ data, context }): Promise<DeskSnapshot> => {
    const configured = Boolean(process.env["METAAPI_TOKEN"]);
    const linked = await loadLinked(context.supabase as never, context.userId as string);

    const empty: DeskSnapshot = {
      linked,
      configured,
      connection: null,
      account: null,
      price: null,
      spec: null,
      positions: [],
      error: null,
    };
    if (!linked || !configured) return empty;

    const mt5 = await import("./mt5.server");
    try {
      const [connection, account, price, spec, open] = await Promise.all([
        mt5.accountState(linked.providerAccountId),
        mt5.accountInformation(linked.providerAccountId),
        mt5.symbolPrice(linked.providerAccountId, data.symbol),
        mt5.symbolSpecification(linked.providerAccountId, data.symbol),
        mt5.positions(linked.providerAccountId),
      ]);
      return {
        ...empty,
        connection,
        account,
        price: { bid: price.bid, ask: price.ask },
        spec: {
          contractSize: spec.contractSize ?? 100,
          minVolume: spec.minVolume ?? 0.01,
          volumeStep: spec.volumeStep ?? 0.01,
          point: spec.point ?? 0.01,
        },
        positions: open
          .filter((p) => p.symbol === data.symbol || !data.symbol)
          .map((p) => ({
            id: p.id,
            symbol: p.symbol,
            type: p.type,
            volume: p.volume,
            openPrice: p.openPrice,
            currentPrice: p.currentPrice,
            profit: p.profit,
            stopLoss: p.stopLoss,
            takeProfit: p.takeProfit,
          })),
      };
    } catch (err) {
      return { ...empty, error: err instanceof Error ? err.message : "mt5_unavailable" };
    }
  });

const linkSchema = z.object({
  login: z.string().trim().min(3).max(32),
  password: z.string().min(4).max(128),
  server: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(40).default("MT5"),
});

export const linkAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => linkSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (!process.env["METAAPI_TOKEN"]) throw new Error("mt5_not_configured");
    const mt5 = await import("./mt5.server");
    const providerAccountId = await mt5.provisionAccount({
      name: data.name,
      login: data.login,
      password: data.password,
      server: data.server,
    });

    const { error } = await (context.supabase as never as {
      from: (t: string) => any;
    })
      .from("mt5_accounts")
      .upsert(
        {
          user_id: context.userId,
          provider_account_id: providerAccountId,
          login: data.login,
          server: data.server,
          name: data.name,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error("mt5_save_failed");
    return { ok: true };
  });

export const unlinkAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const linked = await loadLinked(context.supabase as never, context.userId as string);
    if (linked) {
      const mt5 = await import("./mt5.server");
      await mt5.removeAccount(linked.providerAccountId).catch(() => undefined);
      await (context.supabase as never as { from: (t: string) => any })
        .from("mt5_accounts")
        .delete()
        .eq("user_id", context.userId);
    }
    return { ok: true };
  });

const orderSchema = z.object({
  side: z.enum(["buy", "sell"]),
  symbol: z.string().trim().min(1).max(24),
  volume: z.number().positive().max(100),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  comment: z.string().trim().max(26).optional(),
});

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const linked = await loadLinked(context.supabase as never, context.userId as string);
    if (!linked) throw new Error("mt5_not_linked");
    const mt5 = await import("./mt5.server");
    const result = await mt5.marketOrder(linked.providerAccountId, data);
    return {
      positionId: result.positionId ?? result.orderId ?? null,
      code: result.stringCode ?? null,
      message: result.message ?? null,
    };
  });

const closeSchema = z.object({ positionId: z.string().trim().min(1).max(64) });

export const closeOpenPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => closeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const linked = await loadLinked(context.supabase as never, context.userId as string);
    if (!linked) throw new Error("mt5_not_linked");
    const mt5 = await import("./mt5.server");
    const result = await mt5.closePosition(linked.providerAccountId, data.positionId);
    return { code: result.stringCode ?? null, message: result.message ?? null };
  });

export const closeAllPositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => symbolSchema.parse(input ?? undefined))
  .handler(async ({ data, context }) => {
    const linked = await loadLinked(context.supabase as never, context.userId as string);
    if (!linked) throw new Error("mt5_not_linked");
    const mt5 = await import("./mt5.server");
    const open = await mt5.positions(linked.providerAccountId);
    const targets = open.filter((p) => p.symbol === data.symbol);
    for (const position of targets) {
      await mt5.closePosition(linked.providerAccountId, position.id).catch(() => undefined);
    }
    return { closed: targets.length };
  });
