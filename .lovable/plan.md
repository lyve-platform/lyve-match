# Automated Trading Bot (MT5 via API)

Turn the current manual Trading Desk into a bot that runs the video's gold strategy by itself, around the clock, on your real broker account.

## What the bot does

Same logic as the video, executed automatically:

1. Opens a first position on gold (XAUUSD) in the chosen direction with the starting lot.
2. If price moves against it by the configured distance, it adds a bigger position (martingale multiplier) — leg after leg.
3. It tracks the basket's break-even price and closes **all** positions at once when the basket profit reaches the target in dollars.
4. If the basket hits the maximum loss, or the max number of legs, it stops and alerts instead of adding more risk.

You choose direction (Buy / Sell / both-sides), starting lot, multiplier, step in points, max legs, profit target, and daily loss limit. One switch turns the bot on or off; everything can be stopped instantly.

## Safety rails (built in, not optional)

- Hard cap on total lots and on max legs.
- Daily loss limit — bot disables itself for the day when hit.
- Kill switch: "Stop bot & close all" button.
- Bot refuses to trade if free margin drops below a safety percentage.
- Every decision is written to a run log you can read in the app.

## Screens

- **Trading Desk** (existing `/trade`) gains a **Bot** panel: on/off switch, live strategy parameters, current basket state (legs open, average price, break-even, floating P/L, distance to target), and the kill switch.
- **Bot activity log**: timestamped list of every tick — opened leg, skipped, closed basket with realised profit, or blocked by a safety rule.

## Technical section

**Database (new migration, with GRANTs + RLS owner-only)**
- `bot_configs` — one row per user: enabled, symbol, direction mode, base_lot, multiplier, step_points, max_legs, target_usd, max_loss_usd, daily_loss_usd, min_margin_pct, last_tick_at, disabled_reason.
- `bot_runs` — append-only log: user_id, ts, action, detail JSON, basket snapshot.
- `bot_baskets` — active basket state per user: direction, legs filled, avg price, opened_at, closed_at, realised P/L.

**Engine**
- `src/lib/bot-core.ts` — pure decision function `decide(state, config) -> action` (`open_first` | `add_leg` | `close_basket` | `hold` | `halt`). Unit-testable, no I/O. Reuses `buildGrid` / `shouldFireLeg` from `mt5-core.ts`.
- `src/lib/bot.server.ts` — one tick per user: read config → pull account info, positions and price via existing `mt5.server.ts` → run `decide` → execute through `marketOrder` / `closePosition` → write `bot_runs`.
- `src/routes/api/public/cron/bot-tick.ts` — cron endpoint that iterates enabled bots. Protected by a shared `BOT_CRON_SECRET` header check; scheduled with pg_cron every minute.
- `src/lib/bot.functions.ts` — authenticated server fns: `getBotState`, `saveBotConfig`, `toggleBot`, `panicStop`.

**UI**
- `src/components/trade/BotPanel.tsx` + activity log, wired into `src/routes/_authenticated/trade.tsx`.

**Prerequisites**
- `METAAPI_TOKEN` secret (broker API bridge) — the bot cannot place a single order without it.
- `BOT_CRON_SECRET` — generated automatically.

**Risk note:** martingale on gold can lose an account quickly during a strong trend. The plan builds it exactly as in the video, with the loss limits above as the only protection. Recommend running it first on a demo MT5 account.
