import { Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { Section } from "./Section";

export function Testimonials() {
  const { t } = useI18n();

  return (
    <Section id="testimonials" title={t.testimonials.title} subtitle={t.testimonials.subtitle}>
      <ul className="grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="surface-panel border-dashed p-6 text-center"
            aria-label={t.testimonials.placeholder}
          >
            <Quote aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
            <Badge variant="outline" className="mt-4 rounded-full text-xs">
              {t.testimonials.placeholder}
            </Badge>
            <p className="mt-3 text-sm text-muted-foreground">
              {t.testimonials.placeholderBody}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
