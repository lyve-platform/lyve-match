import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: ReactNode;
};

const shell =
  "group flex flex-1 flex-col items-center gap-2 outline-none disabled:opacity-45 disabled:pointer-events-none";
const circle =
  "grid size-14 place-items-center rounded-full bg-primary-soft text-foreground shadow-soft transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lift group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background";

export function ActionTile({ icon: Icon, label, to, onClick, disabled, badge }: Props) {
  const body = (
    <>
      <span className={cn(circle, "relative")}>
        <Icon className="size-5" />
        {badge ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
        {label}
      </span>
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} className={shell} aria-label={label}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={shell} onClick={onClick} disabled={disabled}>
      {body}
    </button>
  );
}
