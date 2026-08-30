import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LockKeyhole, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/wallet/WalletProvider";
import { PinField } from "./PinField";

export function Unlock() {
  const { unlock, resetWallet, address } = useWallet();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUnlock() {
    if (pin.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await unlock(pin);
      if (ok) {
        navigate({ to: "/wallet" });
      } else {
        setError("Wrong PIN. Try again.");
        setPin("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <LockKeyhole className="size-7 text-primary" aria-hidden />
        </div>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          Enter your PIN to unlock{" "}
          <span className="font-mono text-xs">
            {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "your wallet"}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleUnlock();
          }}
          className="space-y-4"
        >
          <PinField
            id="unlock-pin"
            label="PIN"
            value={pin}
            onChange={setPin}
            autoFocus
            error={error}
          />
          <Button type="submit" className="w-full" disabled={busy || pin.length !== 6}>
            {busy ? "Unlocking…" : "Unlock"}
          </Button>
        </form>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="w-full text-destructive">
              <Trash2 className="size-4" aria-hidden />
              Forgot PIN — erase wallet
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Erase this wallet?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the encrypted wallet from this device permanently. You can only
                recover it with your 12-word recovery phrase. If you do not have it, your
                funds will be lost forever.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  resetWallet();
                }}
              >
                Erase wallet
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
