interface TrustExplanationProps {
  reasons: string[];
}

export function TrustExplanation({ reasons }: TrustExplanationProps) {
  if (reasons.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg bg-[hsl(var(--secondary))/0.55] p-3">
      <p className="text-caption font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        Why this is surfacing
      </p>
      <ul className="mt-2 space-y-1">
        {reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2 text-ui text-[hsl(var(--foreground))]">
            <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[hsl(var(--primary))/0.75]" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
