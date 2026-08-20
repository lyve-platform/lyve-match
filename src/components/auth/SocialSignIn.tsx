import { useState } from "react";
import { Loader2 } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

type Provider = "google" | "apple";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1a6.2 6.2 0 1 1 0-12.4c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.5-.2-2.8.8-3.6.8-.7 0-1.9-.8-3.1-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.4-1-2.4-3.8zM14.1 5.6c.6-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.5-.6.7-1.1 1.9-1 3 1.1.1 2.2-.6 2.8-1.5z" />
    </svg>
  );
}

export function SocialSignIn({ onError }: { onError: (message: string) => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<Provider | null>(null);

  async function handle(provider: Provider) {
    setPending(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        onError(t.auth.social.error);
        setPending(null);
        return;
      }
      if (result.redirected) return;
      window.location.assign("/profile");
    } catch {
      onError(t.auth.social.error);
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-full"
          disabled={pending !== null}
          onClick={() => handle("google")}
        >
          {pending === "google" ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <GoogleMark />
          )}
          {t.auth.social.google}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-full"
          disabled={pending !== null}
          onClick={() => handle("apple")}
        >
          {pending === "apple" ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <AppleMark />
          )}
          {t.auth.social.apple}
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">{t.auth.social.fastHint}</p>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {t.auth.social.divider}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
