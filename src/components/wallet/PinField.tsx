import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PinField({
  id,
  label,
  value,
  onChange,
  autoFocus,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  error?: string | null;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        maxLength={6}
        placeholder="••••••"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="h-12 text-center text-2xl tracking-[0.5em]"
        aria-invalid={error ? true : undefined}
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
