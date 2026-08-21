import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import {
  accountQueryKey,
  createSignedPhotoUrls,
  deletePhoto,
  reorderPhotos,
  setPrimaryPhoto,
  uploadPhoto,
  type ProfilePhoto,
} from "@/lib/account";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTOS } from "@/config/lyve";
import { toErrorKey, type AppErrorKey } from "@/lib/auth-errors";

export function PhotoManager({ photos }: { photos: ProfilePhoto[] }) {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<AppErrorKey | null>(null);

  const { data: urls } = useQuery({
    queryKey: ["photo-urls", photos.map((photo) => photo.id).join("|")],
    queryFn: () => createSignedPhotoUrls(photos),
    enabled: photos.length > 0,
    staleTime: 20 * 60_000,
  });

  async function run(action: () => Promise<void>) {
    if (!user) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: accountQueryKey(user.id) });
      await queryClient.invalidateQueries({ queryKey: ["photo-urls"] });
    } catch (error) {
      setErrorKey(toErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  const Previous = ArrowLeft;
  const Next = ArrowRight;

  function move(index: number, delta: number) {
    const next = [...photos];
    const target = index + delta;
    const current = next[index];
    const swap = next[target];
    if (!current || !swap) return;
    next[index] = swap;
    next[target] = current;
    void run(() => reorderPhotos(next.map((photo) => photo.id)));
  }

  return (
    <div className="space-y-4">
      {errorKey ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {t.auth.errors[errorKey]}
        </p>
      ) : null}

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.onboarding.photos.empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="overflow-hidden rounded-xl border border-border bg-muted">
              <div className="aspect-[3/4] w-full bg-muted">
                {urls?.[photo.storage_path] ? (
                  <img
                    src={urls[photo.storage_path]}
                    alt={
                      photo.is_primary
                        ? t.onboarding.photos.primary
                        : `${t.profilePage.sections.photos} ${index + 1}`
                    }
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1 p-2">
                <Button
                  type="button"
                  size="icon"
                  variant={photo.is_primary ? "default" : "outline"}
                  className="size-9 rounded-full"
                  aria-label={
                    photo.is_primary ? t.onboarding.photos.primary : t.onboarding.photos.makePrimary
                  }
                  aria-pressed={photo.is_primary}
                  disabled={busy}
                  onClick={() => run(() => setPrimaryPhoto(photo.id, photos))}
                >
                  <Star aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-9 rounded-full"
                  aria-label={t.onboarding.photos.moveUp}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <Previous aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-9 rounded-full"
                  aria-label={t.onboarding.photos.moveDown}
                  disabled={busy || index === photos.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <Next aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-9 rounded-full text-destructive"
                  aria-label={t.onboarding.photos.delete}
                  disabled={busy}
                  onClick={() => run(() => deletePhoto(photo, photos))}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(",")}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || !user) return;
          void run(() => uploadPhoto(user.id, file, photos.length));
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-full"
          disabled={busy || photos.length >= MAX_PHOTOS}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          {busy ? t.onboarding.photos.uploading : t.onboarding.photos.upload}
        </Button>
        <p className="text-xs text-muted-foreground">{t.onboarding.photos.limit}</p>
      </div>
    </div>
  );
}
