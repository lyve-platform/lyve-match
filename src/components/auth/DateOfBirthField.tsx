import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import type { DateParts } from "@/lib/age";

export function DateOfBirthField({
  value,
  onChange,
  idPrefix = "dob",
}: {
  value: DateParts;
  onChange: (next: DateParts) => void;
  idPrefix?: string;
}) {
  const { t } = useI18n();

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{t.auth.fields.dateOfBirth}</legend>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-day`} className="text-xs text-muted-foreground">
            {t.auth.fields.day}
          </Label>
          <Input
            id={`${idPrefix}-day`}
            inputMode="numeric"
            autoComplete="bday-day"
            maxLength={2}
            value={value.day}
            onChange={(event) => onChange({ ...value, day: event.target.value.replace(/\D/g, "") })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-month`} className="text-xs text-muted-foreground">
            {t.auth.fields.month}
          </Label>
          <Input
            id={`${idPrefix}-month`}
            inputMode="numeric"
            autoComplete="bday-month"
            maxLength={2}
            value={value.month}
            onChange={(event) =>
              onChange({ ...value, month: event.target.value.replace(/\D/g, "") })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-year`} className="text-xs text-muted-foreground">
            {t.auth.fields.year}
          </Label>
          <Input
            id={`${idPrefix}-year`}
            inputMode="numeric"
            autoComplete="bday-year"
            maxLength={4}
            value={value.year}
            onChange={(event) =>
              onChange({ ...value, year: event.target.value.replace(/\D/g, "") })
            }
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t.auth.hints.dateOfBirth}</p>
    </fieldset>
  );
}
