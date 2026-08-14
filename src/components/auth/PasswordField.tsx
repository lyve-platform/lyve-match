import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  hint?: string;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pe-11"
          required
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute end-1 top-1/2 size-9 -translate-y-1/2 rounded-full"
          aria-label={visible ? t.auth.actions.hidePassword : t.auth.actions.showPassword}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </Button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
