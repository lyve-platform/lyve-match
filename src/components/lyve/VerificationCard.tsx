import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, Loader2, ShieldAlert, Upload } from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCEPTED_PHOTO_TYPES } from "@/config/lyve";
import {
  fetchMyVerification,
  submitVerificationSelfie,
  verificationQueryKey,
} from "@/lib/verification";

/** Self-serve photo verification. The badge itself is granted by a reviewer. */
export function VerificationCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const { data } = useQuery({
    queryKey: verificationQueryKey(user?.id ?? "anon"),
    queryFn: fetchMyVerification,
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const status = data?.status ?? "unverified";

  async function onFile(file: File | undefined) {
    if (!file || !user) return;
    setBusy(true);
    setFailed(false);
    try {
      await submitVerificationSelfie(user.id, file);
      await queryClient.invalidateQueries({ queryKey: verificationQueryKey(user.id) });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const Icon = status === "verified" ? BadgeCheck : status === "pending" ? Clock : ShieldAlert;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon aria-hidden="true" className="size-5 text-primary" />
          {t.verification.cardTitle}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t.verification.cardSubtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm font-medium">{t.verification.status[status]}</p>

        {status === "verified" ? (
          <p className="text-sm text-muted-foreground">{t.verification.verifiedBody}</p>
        ) : status === "pending" ? (
          <p className="text-sm text-muted-foreground">{t.verification.pendingBody}</p>
        ) : (
          <>
            {status === "rejected" ? (
              <p className="text-sm text-muted-foreground">{t.verification.rejectedBody}</p>
            ) : null}
            <div>
              <p className="text-sm font-medium">{t.verification.requirementsTitle}</p>
              <ul className="mt-1 list-disc space-y-1 text-sm text-muted-foreground ps-5">
                {t.verification.requirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_PHOTO_TYPES.join(",")}
              capture="user"
              className="sr-only"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-full"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              {busy ? t.verification.uploading : t.verification.upload}
            </Button>
          </>
        )}

        {data?.note ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{t.verification.noteLabel}: </span>
            {data.note}
          </p>
        ) : null}

        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            {t.verification.error}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">{t.verification.privacy}</p>
      </CardContent>
    </Card>
  );
}
