import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ClipboardPaste, TriangleAlert, Check } from "lucide-react";
import { isAddress, parseEther } from "viem";
import { createWalletClient, http } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/wallet/WalletProvider";
import { formatBalance, useNativeBalance } from "@/wallet/useBalance";
import { PinField } from "@/components/wallet/PinField";
import { ChainPills } from "@/components/wallet/ChainPills";
import { decryptMnemonic } from "@/wallet/crypto";
import { loadVault } from "@/wallet/vault";
import { mnemonicToAccount } from "viem/accounts";

export const Route = createFileRoute("/wallet/send")({
  component: SendPage,
});

const QUICK = [0.25, 0.5, 1] as const;

function SendPage() {
  const { address, chain, setChain } = useWallet();
  const navigate = useNavigate();
  const balance = useNativeBalance(address, chain);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toValid = isAddress(to, { strict: false });
  let parsedAmount: bigint | null = null;
  try {
    if (amount) parsedAmount = parseEther(amount);
  } catch {
    parsedAmount = null;
  }
  const amountValid = parsedAmount !== null && parsedAmount > 0n;
  const available = Number(balance.data ?? "0");

  function applyFraction(fraction: number) {
    if (!Number.isFinite(available) || available <= 0) return;
    const value = fraction === 1 ? available * 0.99 : available * fraction;
    setAmount(String(Number(value.toFixed(6))));
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      setTo(text.trim());
    } catch {
      toast.error("Clipboard unavailable");
    }
  }

  async function handleSend() {
    if (!toValid || !amountValid || !parsedAmount || !address) return;
    setBusy(true);
    setPinError(null);
    try {
      const vault = loadVault();
      if (!vault) throw new Error("vault_missing");
      const phrase = await decryptMnemonic(vault.payload, pin);
      const account = mnemonicToAccount(phrase);
      if (account.address.toLowerCase() !== address.toLowerCase()) {
        setPinError("Wrong PIN.");
        setBusy(false);
        return;
      }
      const client = createWalletClient({
        account,
        chain: chain.chain,
        transport: http(chain.rpcUrl),
      });
      const hash = await client.sendTransaction({
        account,
        to: to as `0x${string}`,
        value: parsedAmount,
        chain: chain.chain,
      });
      toast.success("Transaction sent", {
        description: hash,
        action: {
          label: "View",
          onClick: () => window.open(chain.explorerTx(hash), "_blank", "noopener"),
        },
      });
      navigate({ to: "/wallet" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "wrong_pin") {
        setPinError("Wrong PIN.");
      } else if (/insufficient funds/i.test(message)) {
        toast.error("Insufficient balance for amount plus gas.");
      } else {
        toast.error("Transaction failed", { description: message.slice(0, 200) });
      }
    } finally {
      setBusy(false);
    }
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

      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <h1 className="text-xl font-semibold">Send {chain.symbol}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          On {chain.label} · Available {formatBalance(balance.data)} {chain.symbol}
        </p>

        {/* Amount */}
        <div className="mt-5 rounded-2xl bg-surface p-5 text-center">
          <Label htmlFor="amount" className="sr-only">
            Amount
          </Label>
          <div className="flex items-baseline justify-center gap-2">
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-auto w-40 border-0 bg-transparent p-0 text-center text-4xl font-semibold tabular-nums shadow-none focus-visible:ring-0"
            />
            <span className="text-lg text-muted-foreground">{chain.symbol}</span>
          </div>
          <div className="mt-4 flex justify-center gap-2">
            {QUICK.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => applyFraction(f)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-all hover:border-foreground/25 active:scale-95"
              >
                {f === 1 ? "MAX" : `${f * 100}%`}
              </button>
            ))}
          </div>
          {amount && !amountValid ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              Enter a valid amount greater than zero.
            </p>
          ) : null}
        </div>

        {/* Recipient */}
        <div className="mt-5 space-y-2">
          <Label htmlFor="to">Recipient address</Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                id="to"
                placeholder="0x…"
                value={to}
                onChange={(e) => setTo(e.target.value.trim())}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="rounded-xl pr-9 font-mono text-sm"
              />
              {toValid ? (
                <Check className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-success" />
              ) : null}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              onClick={() => void paste()}
              aria-label="Paste address"
            >
              <ClipboardPaste className="size-4" />
            </Button>
          </div>
          {to && !toValid ? (
            <p className="text-sm text-destructive" role="alert">
              That is not a valid address.
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-surface p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Transactions are irreversible. Double-check the address and network before
            confirming.
          </p>
        </div>

        <div className="mt-4">
          <PinField
            id="send-pin"
            label="Confirm with PIN"
            value={pin}
            onChange={setPin}
            error={pinError}
          />
        </div>

        <Button
          className="mt-5 w-full rounded-full transition-transform active:scale-[0.98]"
          size="lg"
          disabled={busy || !toValid || !amountValid || pin.length !== 6}
          onClick={() => void handleSend()}
        >
          {busy ? "Sending…" : `Send ${chain.symbol}`}
        </Button>
      </div>
    </div>
  );
}
