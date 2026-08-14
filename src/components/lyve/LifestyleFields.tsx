import { useI18n } from "@/i18n";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHILDREN_OPTIONS,
  COMMUNICATION_OPTIONS,
  DRINKING_OPTIONS,
  EXERCISE_OPTIONS,
  SMOKING_OPTIONS,
  SOCIAL_ENERGY_OPTIONS,
  type ChildrenPlan,
  type CommunicationStyle,
  type Drinking,
  type Exercise,
  type Smoking,
  type SocialEnergy,
} from "@/config/lyve";

export type LifestyleForm = {
  smoking: Smoking | null;
  drinking: Drinking | null;
  exercise: Exercise | null;
  children: ChildrenPlan | null;
  social_energy: SocialEnergy | null;
  communication_style: CommunicationStyle | null;
};

const UNSET = "__unset__";

/**
 * Optional lifestyle and personality answers. They feed the compatibility
 * estimate; every field can stay unanswered or be set to "prefer not to say".
 */
export function LifestyleFields({
  value,
  onChange,
}: {
  value: LifestyleForm;
  onChange: (patch: Partial<LifestyleForm>) => void;
}) {
  const { t } = useI18n();
  const labels = t.lifestyleFields.options as Record<string, string>;

  const fields: Array<{ key: keyof LifestyleForm; options: readonly string[] }> = [
    { key: "smoking", options: SMOKING_OPTIONS },
    { key: "drinking", options: DRINKING_OPTIONS },
    { key: "exercise", options: EXERCISE_OPTIONS },
    { key: "children", options: CHILDREN_OPTIONS },
    { key: "social_energy", options: SOCIAL_ENERGY_OPTIONS },
    { key: "communication_style", options: COMMUNICATION_OPTIONS },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(({ key, options }) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`lifestyle-${key}`}>{t.lifestyleFields[key]}</Label>
          <Select
            value={value[key] ?? UNSET}
            onValueChange={(next) =>
              onChange({ [key]: next === UNSET ? null : next } as Partial<LifestyleForm>)
            }
          >
            <SelectTrigger id={`lifestyle-${key}`} className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>{labels['unset']}</SelectItem>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {labels[option] ?? option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
