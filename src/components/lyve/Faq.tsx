import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useI18n } from "@/i18n";
import { Section } from "./Section";

export function Faq() {
  const { t } = useI18n();

  return (
    <Section id="faq" title={t.faq.title} subtitle={t.faq.subtitle} tone="surface">
      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="w-full">
          {t.faq.items.map((item, index) => (
            <AccordionItem key={item.q} value={`faq-${index}`}>
              <AccordionTrigger className="text-start text-base font-medium">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
