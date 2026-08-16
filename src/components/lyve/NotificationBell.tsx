import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listMyNotifications, markNotificationsRead } from "@/lib/notifications.functions";

/** Unread in-app notifications (support replies and ticket status changes). */
export function NotificationBell() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const load = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationsRead);
  const [open, setOpen] = useState(false);

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => load(),
    retry: false,
    refetchInterval: 60_000,
  });

  const mutation = useMutation({
    mutationFn: () => markRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = notifications.data ?? [];
  const unread = items.filter((item) => !item.readAt).length;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && unread > 0) mutation.mutate();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={t.notifications.title}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unread > 0 ? (
            <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t.notifications.title}
        </p>
        {items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t.notifications.empty}</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to="/support"
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-2 py-2 text-sm hover:bg-muted ${
                    item.readAt ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  <span className="block font-medium">
                    {item.kind === "support_reply"
                      ? t.notifications.reply
                      : t.notifications.status}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.title}
                  </span>
                  {item.detail ? (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {item.kind === "support_status"
                        ? (t.support.statuses[
                            item.detail as keyof typeof t.support.statuses
                          ] ?? item.detail)
                        : item.detail}
                    </span>
                  ) : null}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
