import { useState } from "react";
import { Check, CheckCheck, Flag, MoreHorizontal, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { fill } from "@/lib/format";
import { isReadByOther, type ChatMessage } from "@/lib/messaging-core";
import { REPORT_CATEGORIES, REPORT_DESCRIPTION_MAX, type ReportCategory } from "@/config/lyve";
import { useReportMessage } from "@/hooks/useMessaging";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

/** One message row: bubble, timestamp, delivery state, and per-message safety actions. */
export function MessageBubble({
  message,
  mine,
  otherName,
  otherProfileId,
  otherLastReadAt,
  onWithdraw,
}: {
  message: ChatMessage;
  mine: boolean;
  otherName: string;
  otherProfileId: string;
  otherLastReadAt: string | null;
  onWithdraw: (messageId: string) => Promise<unknown>;
}) {
  const { t, locale } = useI18n();
  const report = useReportMessage();
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("harassment");
  const [description, setDescription] = useState("");

  const time = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(message.createdAt));

  const withdrawn = message.deletedAt !== null;

  async function handleReport() {
    try {
      const details = description.trim();
      await report.mutateAsync({
        conversationId: message.conversationId,
        messageId: message.id,
        reportedId: otherProfileId,
        category,
        ...(details ? { description: details } : {}),
      });

      toast.success(t.messaging.reportSent);
      setReportOpen(false);
      setDescription("");
    } catch {
      toast.error(t.discover.error);
    }
  }

  return (
    <li className={`flex w-full gap-2 ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`group flex max-w-[85%] items-end gap-1 sm:max-w-[70%]`}>
        {mine ? <MessageActions align="start" /> : null}
        <div
          className={[
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            mine
              ? "rounded-ee-sm bg-primary text-primary-foreground"
              : "rounded-es-sm bg-muted text-foreground",
            withdrawn ? "italic opacity-70" : "",
          ].join(" ")}
        >
          <p className="whitespace-pre-wrap break-words">
            {withdrawn ? t.messaging.withdrawn : message.body}
          </p>
          <p
            className={`mt-1 flex items-center gap-1 text-[11px] ${
              mine ? "text-primary-foreground/75" : "text-muted-foreground"
            }`}
          >
            <time dateTime={message.createdAt}>{time}</time>
            {mine && !withdrawn ? (
              isReadByOther(message, otherLastReadAt) ? (
                <>
                  <CheckCheck className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{t.messaging.read}</span>
                </>
              ) : (
                <>
                  <Check className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{t.messaging.sent}</span>
                </>
              )
            ) : null}
          </p>
        </div>
        {!mine ? <MessageActions align="end" /> : null}
      </div>

      <AlertDialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.messaging.withdrawTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {fill(t.messaging.withdrawBody, { name: otherName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.messaging.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void onWithdraw(message.id);
              }}
            >
              {t.messaging.withdrawConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.messaging.reportTitle}</DialogTitle>
            <DialogDescription>
              {fill(t.messaging.reportBody, { name: otherName })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup
              value={category}
              onValueChange={(value) => setCategory(value as ReportCategory)}
              className="grid gap-2"
            >
              {REPORT_CATEGORIES.map((value) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem value={value} id={`report-${message.id}-${value}`} />
                  <Label htmlFor={`report-${message.id}-${value}`} className="text-sm font-normal">
                    {t.discover.reportCategories[value]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <div className="space-y-2">
              <Label htmlFor={`report-details-${message.id}`}>
                {t.discover.safety.reportDetails}
              </Label>
              <Textarea
                id={`report-details-${message.id}`}
                value={description}
                maxLength={REPORT_DESCRIPTION_MAX}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>
              {t.messaging.cancel}
            </Button>
            <Button onClick={handleReport} disabled={report.isPending}>
              {t.messaging.reportSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );

  function MessageActions({ align }: { align: "start" | "end" }) {
    if (withdrawn) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            aria-label={mine ? t.messaging.withdraw : t.messaging.reportMessage}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align}>
          {mine ? (
            <DropdownMenuItem onSelect={() => setConfirmWithdraw(true)}>
              <Undo2 aria-hidden="true" /> {t.messaging.withdraw}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setReportOpen(true)}>
              <Flag aria-hidden="true" /> {t.messaging.reportMessage}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
}
