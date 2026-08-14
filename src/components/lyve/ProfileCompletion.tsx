import { Check, Circle } from "lucide-react";
import { useI18n } from "@/i18n";
import { computeCompletion } from "@/lib/profile-completion";
import type { AccountData } from "@/lib/account";

export function ProfileCompletion({ account }: { account: AccountData | undefined }) {
  const { t } = useI18n();
  const { percent, sections } = computeCompletion(account);

  return (
    <section aria-labelledby="completion-heading" className="surface-panel p-5">
      <h2 id="completion-heading" className="text-base font-semibold">
        {t.profilePage.completion.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.profilePage.completion.value.replace("{percent}", String(percent))}
      </p>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t.profilePage.completion.title}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {sections.map((section) => (
          <li key={section.key} className="flex items-center gap-2 text-sm">
            {section.done ? (
              <Check aria-hidden="true" className="size-4 text-primary" />
            ) : (
              <Circle aria-hidden="true" className="size-4 text-muted-foreground" />
            )}
            <span className={section.done ? "text-foreground" : "text-muted-foreground"}>
              {t.profilePage.completion.sections[section.key]}
            </span>
            <span className="sr-only">
              {section.done ? t.profilePage.completion.done : t.profilePage.completion.todo}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
