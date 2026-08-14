import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { getBlockedMembers } from "@/lib/discovery.functions";
import { unblockProfile } from "@/lib/discovery";

/** The member's own block list, with the ability to unblock. */
export function BlockedMembers() {
  const { t } = useI18n();
  const fetchBlocked = useServerFn(getBlockedMembers);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["discovery", "blocked"],
    queryFn: () => fetchBlocked({ data: undefined }),
    staleTime: 30_000,
  });

  async function handleUnblock(profileId: string) {
    try {
      await unblockProfile(profileId);
      await queryClient.invalidateQueries({ queryKey: ["discovery"] });
      toast.success(t.blockedList.unblocked);
    } catch {
      toast.error(t.discover.error);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">{t.discover.loading}</p>;
  if ((data ?? []).length === 0)
    return <p className="text-sm text-muted-foreground">{t.blockedList.empty}</p>;

  return (
    <ul className="divide-y divide-border/70">
      {(data ?? []).map((entry) => (
        <li key={entry.profileId} className="flex items-center justify-between gap-3 py-2">
          <span className="truncate text-sm">{entry.firstName || t.blockedList.unknown}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 rounded-full"
            onClick={() => void handleUnblock(entry.profileId)}
          >
            {t.blockedList.unblock}
          </Button>
        </li>
      ))}
    </ul>
  );
}
