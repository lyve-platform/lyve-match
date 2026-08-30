/**
 * MetaTrader 5 bridge (MetaApi cloud REST).
 *
 * Server-only: the MetaApi token never reaches the browser, and broker
 * credentials are forwarded once during linking and never stored by us.
 */

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

function token(): string {
  const value = process.env["METAAPI_TOKEN"];
  if (!value) throw new Error("mt5_not_configured");
  return value;
}

function region(): string {
  return process.env["METAAPI_REGION"] || "new-york";
}

function clientBase(): string {
  return `https://mt-client-api-v1.${region()}.agiliumtrade.agiliumtrade.ai`;
}

async function call<T>(
  base: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const request: RequestInit = {
    method: init.method ?? "GET",
    headers: {
      "auth-token": token(),
      "content-type": "application/json",
    },
  };
  if (init.body !== undefined) request.body = JSON.stringify(init.body);
  const res = await fetch(`${base}${path}`, request);
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* keep raw text */
    }
    throw new Error(`mt5_error:${res.status}:${message}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type ProvisionInput = {
  name: string;
  login: string;
  password: string;
  server: string;
};

export async function provisionAccount(input: ProvisionInput): Promise<string> {
  const created = await call<{ id: string }>(PROVISIONING, "/users/current/accounts", {
    method: "POST",
    body: {
      name: input.name,
      type: "cloud",
      login: input.login,
      password: input.password,
      server: input.server,
      platform: "mt5",
      magic: 0,
      region: region(),
      keywords: ["lyve"],
    },
  });
  await call(PROVISIONING, `/users/current/accounts/${created.id}/deploy`, {
    method: "POST",
  }).catch(() => undefined);
  return created.id;
}

export async function removeAccount(accountId: string): Promise<void> {
  await call(PROVISIONING, `/users/current/accounts/${accountId}`, { method: "DELETE" });
}

export type ProvisionState = {
  state: string;
  connectionStatus: string;
};

export async function accountState(accountId: string): Promise<ProvisionState> {
  const info = await call<{ state?: string; connectionStatus?: string }>(
    PROVISIONING,
    `/users/current/accounts/${accountId}`,
  );
  return {
    state: info.state ?? "UNKNOWN",
    connectionStatus: info.connectionStatus ?? "UNKNOWN",
  };
}

export type AccountInformation = {
  broker: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
};

export function accountInformation(accountId: string): Promise<AccountInformation> {
  return call<AccountInformation>(
    clientBase(),
    `/users/current/accounts/${accountId}/account-information`,
  );
}

export type Position = {
  id: string;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  currentPrice: number;
  profit: number;
  swap: number;
  stopLoss?: number;
  takeProfit?: number;
  time: string;
};

export function positions(accountId: string): Promise<Position[]> {
  return call<Position[]>(clientBase(), `/users/current/accounts/${accountId}/positions`);
}

export type SymbolPrice = { bid: number; ask: number; time: string };

export function symbolPrice(accountId: string, symbol: string): Promise<SymbolPrice> {
  return call<SymbolPrice>(
    clientBase(),
    `/users/current/accounts/${accountId}/symbols/${encodeURIComponent(
      symbol,
    )}/current-price?keepSubscription=true`,
  );
}

export type SymbolSpecification = {
  symbol: string;
  contractSize?: number;
  minVolume?: number;
  maxVolume?: number;
  volumeStep?: number;
  digits?: number;
  point?: number;
};

export function symbolSpecification(
  accountId: string,
  symbol: string,
): Promise<SymbolSpecification> {
  return call<SymbolSpecification>(
    clientBase(),
    `/users/current/accounts/${accountId}/symbols/${encodeURIComponent(
      symbol,
    )}/specification`,
  );
}

export type TradeResult = {
  numericCode?: number;
  stringCode?: string;
  message?: string;
  orderId?: string;
  positionId?: string;
};

export function marketOrder(
  accountId: string,
  input: {
    side: "buy" | "sell";
    symbol: string;
    volume: number;
    stopLoss?: number;
    takeProfit?: number;
    comment?: string;
  },
): Promise<TradeResult> {
  return call<TradeResult>(clientBase(), `/users/current/accounts/${accountId}/trade`, {
    method: "POST",
    body: {
      actionType: input.side === "buy" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL",
      symbol: input.symbol,
      volume: input.volume,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      comment: input.comment?.slice(0, 26),
    },
  });
}

export function closePosition(accountId: string, positionId: string): Promise<TradeResult> {
  return call<TradeResult>(clientBase(), `/users/current/accounts/${accountId}/trade`, {
    method: "POST",
    body: { actionType: "POSITION_CLOSE_ID", positionId },
  });
}

export function modifyPosition(
  accountId: string,
  positionId: string,
  stopLoss?: number,
  takeProfit?: number,
): Promise<TradeResult> {
  return call<TradeResult>(clientBase(), `/users/current/accounts/${accountId}/trade`, {
    method: "POST",
    body: { actionType: "POSITION_MODIFY", positionId, stopLoss, takeProfit },
  });
}
