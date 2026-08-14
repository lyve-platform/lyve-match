import { useState } from "react";
import { Flag, MoreHorizontal, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { fill } from "@/lib/format";
import { REPORT_CATEGORIES, REPORT_DESCRIPTION_MAX, type ReportCategory } from "@/config/lyve";
import { useSafetyActions } from "@/hooks/useDiscovery";
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
import { Checkbox } from "@/components/ui/checkbox";

/** Block and report controls, available on every profile surface. */
export function SafetyMenu({
  profileId,
  name,
  onDone,
}: {
  profileId: string;
  name: string;
  onDone?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const { block, report } = useSafetyActions();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("fake_profile");
  const [description, setDescription] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);

  async function handleBlock() {
    await block.mutateAsync(profileId);
    toast.success(t.discover.safety.blocked);
    setConfirmBlock(false);
    onDone?.();
  }

  async function handleReport() {
    await report.mutateAsync({ profileId, category, description, alsoBlock });
    toast.success(t.discover.safety.reportSent);
    setReportOpen(false);
    setDescription("");
    setAlsoBlock(false);
    onDone?.();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 rounded-full"
            aria-label={t.discover.safety.more}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setReportOpen(true)}>
            <Flag aria-hidden="true" /> {t.discover.safety.report}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmBlock(true)}>
            <ShieldOff aria-hidden="true" /> {t.discover.safety.block}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmBlock} onOpenChange={setConfirmBlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fill(t.discover.safety.blockConfirmTitle, { name })}</AlertDialogTitle>
            <AlertDialogDescription>{t.discover.safety.blockConfirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.discover.safety.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBlock} disabled={block.isPending}>
              {t.discover.safety.blockConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{fill(t.discover.safety.reportTitle, { name })}</DialogTitle>
            <DialogDescription>{fill(t.discover.safety.reportBody, { name })}</DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t.discover.safety.reportCategory}</legend>
            <RadioGroup
              value={category}
              onValueChange={(value) => setCategory(value as ReportCategory)}
              className="gap-2"
            >
              {REPORT_CATEGORIES.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <RadioGroupItem value={item} id={`report-${item}`} />
                  <Label htmlFor={`report-${item}`} className="font-normal">
                    {t.discover.reportCategories[item]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="report-details">{t.discover.safety.reportDetails}</Label>
            <Textarea
              id="report-details"
              value={description}
              maxLength={REPORT_DESCRIPTION_MAX}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="report-block"
              checked={alsoBlock}
              onCheckedChange={(value) => setAlsoBlock(value === true)}
            />
            <Label htmlFor="report-block" className="font-normal">
              {t.discover.safety.reportAlsoBlock}
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>
              {t.discover.safety.cancel}
            </Button>
            <Button type="button" onClick={handleReport} disabled={report.isPending}>
              {t.discover.safety.reportSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
