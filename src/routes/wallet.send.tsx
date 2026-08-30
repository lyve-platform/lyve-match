import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { isAddress, parseEther } from "viem";
import { createWalletClient, http } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/wallet/WalletProvider";
import { formatBalance, useNativeBalance } from "@/wallet/useBalance";
import { PinField } from "@/components/wallet/PinField";
import { decryptMnemonic } from "@/wallet/crypto";
import { loadVault } from "@/wallet/vault";
import { mnemonicToAccount } from "viem/accounts";

export const Route = createFileRoute("/wallet/send")({
  component: SendPage,
});

function SendPage() {
  const { address, chain } = useWallet();
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
    <div className="mx-auto w-full max-w-lg space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/wallet">
          <ArrowLeft className="size-4" aria-hidden />
          Back to wallet
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Send {chain.symbol}</CardTitle>
          <CardDescription>
            On {chain.label}. Available: {formatBalance(balance.data)} {chain.symbol}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="to">Recipient address</Label>
            <Input
              id="to"
              placeholder="0x…"
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono text-sm"
            />
            {to && !toValid ? (
              <p className="text-sm text-destructive" role="alert">
                That is not a valid address.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount ({chain.symbol})</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {amount && !amountValid ? (
              <p className="text-sm text-destructive" role="alert">
                Enter a valid amount greater than zero.
              </p>
            ) : null}
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Transactions are irreversible. Double-check the address and network before
              confirming.
            </p>
          </div>

          <PinField
            id="send-pin"
            label="Confirm with PIN"
            value={pin}
            onChange={setPin}
            error={pinError}
          />

          <Button
            className="w-full"
            size="lg"
            disabled={busy || !toValid || !amountValid || pin.length !== 6}
            onClick={() => void handleSend()}
          >
            {busy ? "Sending…" : `Send ${chain.symbol}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
