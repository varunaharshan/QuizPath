import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

// A tiny step indicator shared by Practice's and Progress's Grade → Subject
// → ... flows, so students always know where they are and can jump back a
// step without the browser back button. Each non-final item is a link to
// that step; the last item (the current screen) renders as plain text.
export function StepBreadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-sm text-ink-secondary">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.label} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden>›</span>}
            {isLast || !item.href ? (
              <span className={isLast ? "font-semibold text-navy-900" : undefined}>{item.label}</span>
            ) : (
              <Link href={item.href} className="hover:underline">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
