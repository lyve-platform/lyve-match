import { useState } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { updateProfile } from "@/lib/account";
import { useAuth } from "@/auth/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { accountQueryKey } from "@/lib/account";

/**
 * Coarse location capture. The browser position is immediately rounded to one
 * decimal degree (~11 km) BEFORE it is stored, so LYVE never holds — and can
 * never leak — a member's precise coordinates. Distances shown to other
 * members are bucketed again on the server.
 */
const COARSE_PRECISION = 1;

export function ApproximateLocation({ hasLocation }: { hasLocation: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  function capture() {
    if (!user || typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error(t.locationField.unsupported);
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await updateProfile(user.id, {
            approx_latitude: Number(position.coords.latitude.toFixed(COARSE_PRECISION)),
            approx_longitude: Number(position.coords.longitude.toFixed(COARSE_PRECISION)),
          });
          await queryClient.invalidateQueries({ queryKey: accountQueryKey(user.id) });
          toast.success(t.locationField.saved);
        } catch {
          toast.error(t.locationField.failed);
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        toast.error(t.locationField.denied);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }

  async function clear() {
    if (!user) return;
    setBusy(true);
    try {
      await updateProfile(user.id, { approx_latitude: null, approx_longitude: null });
      await queryClient.invalidateQueries({ queryKey: accountQueryKey(user.id) });
      toast.success(t.locationField.cleared);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {hasLocation ? t.locationField.enabled : t.locationField.disabled}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-full"
          onClick={capture}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed aria-hidden="true" />
          )}
          {t.locationField.action}
        </Button>
        {hasLocation ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 rounded-full"
            onClick={() => void clear()}
            disabled={busy}
          >
            {t.locationField.clear}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t.locationField.privacy}</p>
    </div>
  );
}
