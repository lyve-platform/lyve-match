import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PhoneCall, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmPhoneOtp,
  fetchPhoneVerification,
  normalizePhone,
  phoneVerificationKey,
  sendPhoneOtp,
} from "@/lib/phone-verification";

/** Ties one phone number to the account through an SMS one-time code. */
export function PhoneVerificationCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: phoneVerificationKey(user?.id ?? "anon"),
    queryFn: fetchPhoneVerification,
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  async function onSend() {
    setError(null);
    if (!normalizePhone(phone)) {
      setError(t.phoneVerification.invalidPhone);
      return;
    }
    setBusy(true);
    try {
      await sendPhoneOtp(phone);
      setStage("confirm");
    } catch {
      setError(t.phoneVerification.sendFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    setError(null);
    setBusy(true);
    try {
      await confirmPhoneOtp(phone, code);
      setCode("");
      setStage("enter");
      await queryClient.invalidateQueries({
        queryKey: phoneVerificationKey(user?.id ?? "anon"),
      });
    } catch {
      setError(t.phoneVerification.confirmFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {data?.verified ? (
            <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
          ) : (
            <PhoneCall aria-hidden="true" className="size-5 text-primary" />
          )}
          {t.phoneVerification.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t.phoneVerification.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.verified ? (
          <>
            <p className="text-sm font-medium">
              {t.phoneVerification.verified}
              {data.hint ? <span className="text-muted-foreground"> · {data.hint}</span> : null}
            </p>
            <p className="text-sm text-muted-foreground">{t.phoneVerification.verifiedBody}</p>
          </>
        ) : stage === "enter" ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="phone-number">{t.phoneVerification.phoneLabel}</Label>
              <Input
                id="phone-number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                maxLength={20}
                placeholder="+971500000000"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t.phoneVerification.phoneHelp}</p>
            </div>
            <Button
              type="button"
              className="min-h-11 rounded-full"
              disabled={busy}
              onClick={() => void onSend()}
            >
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {t.phoneVerification.sendCode}
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="phone-code">{t.phoneVerification.codeLabel}</Label>
              <Input
                id="phone-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                maxLength={8}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                {t.phoneVerification.codeHelp} {phone}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="min-h-11 rounded-full"
                disabled={busy || code.length < 4}
                onClick={() => void onConfirm()}
              >
                {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {t.phoneVerification.confirm}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 rounded-full"
                disabled={busy}
                onClick={() => {
                  setStage("enter");
                  setCode("");
                  setError(null);
                }}
              >
                {t.phoneVerification.changeNumber}
              </Button>
            </div>
          </>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">{t.phoneVerification.privacy}</p>
      </CardContent>
    </Card>
  );
}
