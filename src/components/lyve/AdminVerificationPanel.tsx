import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listVerificationRequests,
  reviewVerificationRequest,
} from "@/lib/verification.functions";

type Filter = "pending" | "verified" | "rejected";

/** Staff review queue. Every action is authorised inside the database. */
export function AdminVerificationPanel() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const fetchList = useServerFn(listVerificationRequests);
  const review = useServerFn(reviewVerificationRequest);

  const query = useQuery({
    queryKey: ["admin", "verification", filter],
    queryFn: () => fetchList({ data: { status: filter } }),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: (input: { requestId: string; approve: boolean; note: string }) =>
      review({ data: input }),
    onSuccess: async (_result, input) => {
      toast.success(
        input.approve ? t.adminVerification.approved : t.adminVerification.rejected,
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "verification"] });
    },
    onError: () => toast.error(t.adminVerification.failed),
  });

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(locale === "ar" ? "ar" : "en", { dateStyle: "medium" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.adminVerification.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{t.adminVerification.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="pending">{t.adminVerification.filter.pending}</TabsTrigger>
            <TabsTrigger value="verified">{t.adminVerification.filter.verified}</TabsTrigger>
            <TabsTrigger value="rejected">{t.adminVerification.filter.rejected}</TabsTrigger>
          </TabsList>
        </Tabs>

        {query.isPending ? (
          <p className="text-sm text-muted-foreground">{t.adminVerification.loading}</p>
        ) : (query.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.adminVerification.empty}</p>
        ) : (
          <ul className="space-y-5">
            {(query.data ?? []).map((row) => (
              <li key={row.requestId} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{row.nickname ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.adminVerification.submitted}: {formatDate(row.createdAt)}
                  </p>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">
                      {t.adminVerification.selfie}
                    </p>
                    {row.selfieUrl ? (
                      <img
                        src={row.selfieUrl}
                        alt={t.adminVerification.selfie}
                        className="aspect-[3/4] w-full rounded-lg object-cover"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">
                      {t.adminVerification.profilePhotos}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {row.photoUrls.map((url) => (
                        <img
                          key={url}
                          src={url}
                          alt={t.adminVerification.profilePhotos}
                          className="aspect-[3/4] w-full rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {row.status === "pending" ? (
                  <div className="mt-3 space-y-2">
                    <Input
                      value={notes[row.requestId] ?? ""}
                      placeholder={t.adminVerification.notePlaceholder}
                      maxLength={500}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [row.requestId]: event.target.value,
                        }))
                      }
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="rounded-full"
                        disabled={decide.isPending}
                        onClick={() =>
                          decide.mutate({
                            requestId: row.requestId,
                            approve: true,
                            note: notes[row.requestId] ?? "",
                          })
                        }
                      >
                        {t.adminVerification.approve}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        disabled={decide.isPending}
                        onClick={() =>
                          decide.mutate({
                            requestId: row.requestId,
                            approve: false,
                            note: notes[row.requestId] ?? "",
                          })
                        }
                      >
                        {t.adminVerification.reject}
                      </Button>
                    </div>
                  </div>
                ) : row.note ? (
                  <p className="mt-3 text-sm text-muted-foreground">{row.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
