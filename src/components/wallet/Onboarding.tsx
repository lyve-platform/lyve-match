import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Wallet, Download, TriangleAlert, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { isValidPin, isValidWordCount, normalizeMnemonic } from "@/wallet/crypto";
import { useWallet } from "@/wallet/WalletProvider";
import { PinField } from "./PinField";

type Mode = "choose" | "create-pin" | "create-phrase" | "import";

export function Onboarding() {
  const { createWallet, importWallet, confirmBackup } = useWallet();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("choose");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  function validatePins(): boolean {
    if (!isValidPin(pin)) {
      setPinError("PIN must be exactly 6 digits.");
      return false;
    }
    if (pin !== pinConfirm) {
      setPinError("PINs do not match.");
      return false;
    }
    setPinError(null);
    return true;
  }

  function handleCreate() {
    if (!validatePins()) return;
    const generated = createWallet(pin);
    setWords(generated);
    setMode("create-phrase");
  }

  async function handleImport() {
    if (!validatePins()) return;
    const phrase = normalizeMnemonic(importText);
    if (!isValidWordCount(phrase)) {
      setImportError("Recovery phrase must be 12 or 24 words.");
      return;
    }
    setBusy(true);
    setImportError(null);
    try {
      await importWallet(phrase, pin);
      toast.success("Wallet imported");
      navigate({ to: "/wallet" });
    } catch {
      setImportError("Invalid recovery phrase. Check every word and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPhrase() {
    try {
      await navigator.clipboard.writeText(words.join(" "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed — write the words down manually.");
    }
  }

  if (mode === "create-phrase") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            Back up your recovery phrase
          </CardTitle>
          <CardDescription>
            These 12 words are the only way to recover your wallet. Anyone with them controls
            your funds. LYVE never sees or stores them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {words.map((word, i) => (
              <li
                key={`${word}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                <span className="font-medium">{word}</span>
              </li>
            ))}
          </ol>
          <Button variant="outline" className="w-full" onClick={copyPhrase}>
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? "Copied" : "Copy phrase"}
          </Button>
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm">
              Write these words on paper and keep them offline. If you lose them, your funds
              are gone forever. There is no password reset.
            </p>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            I have written down my recovery phrase in a safe place.
          </label>
          <Button
            className="w-full"
            disabled={!acknowledged}
            onClick={() => {
              confirmBackup();
              toast.success("Wallet created");
              navigate({ to: "/wallet" });
            }}
          >
            Continue to my wallet
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (mode === "create-pin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Secure your wallet</CardTitle>
          <CardDescription>
            Choose a 6-digit PIN. It encrypts your keys on this device and is required to
            unlock and send.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PinField id="pin" label="PIN (6 digits)" value={pin} onChange={setPin} autoFocus />
          <PinField
            id="pin-confirm"
            label="Confirm PIN"
            value={pinConfirm}
            onChange={setPinConfirm}
            error={pinError}
          />
          <Button className="w-full" onClick={handleCreate}>
            Create wallet
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setMode("choose")}>
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (mode === "import") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import an existing wallet</CardTitle>
          <CardDescription>
            Enter your 12 or 24-word recovery phrase. It is encrypted with your PIN and never
            leaves this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={3}
            placeholder="word1 word2 word3 …"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {importError ? (
            <p className="text-sm text-destructive" role="alert">
              {importError}
            </p>
          ) : null}
          <PinField id="import-pin" label="New PIN (6 digits)" value={pin} onChange={setPin} />
          <PinField
            id="import-pin-confirm"
            label="Confirm PIN"
            value={pinConfirm}
            onChange={setPinConfirm}
            error={pinError}
          />
          <Button className="w-full" onClick={handleImport} disabled={busy}>
            {busy ? "Importing…" : "Import wallet"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setMode("choose")}>
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Wallet className="size-7 text-primary" aria-hidden />
          </div>
          <CardTitle className="text-2xl">Your keys. Your crypto.</CardTitle>
          <CardDescription>
            LYVE Wallet is a self-custody wallet for Ethereum, Base, Arbitrum and BNB Chain.
            No account, no email — the keys live only on your device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" size="lg" onClick={() => setMode("create-pin")}>
            Create a new wallet
          </Button>
          <Button
            variant="outline"
            className="w-full"
            size="lg"
            onClick={() => setMode("import")}
          >
            <Download className="size-4" aria-hidden />
            Import with recovery phrase
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
