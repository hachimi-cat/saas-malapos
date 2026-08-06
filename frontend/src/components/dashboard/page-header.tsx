export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    // Phone: title, subtitle and each action stack — one per row, actions
    // full-width. sm+ restores the classic title-left/action-right line.
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="min-w-0 sm:flex-1">
        <h1 className="text-2xl font-semibold tracking-tight font-display">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      {action && (
        <div className="flex flex-col items-stretch gap-2 max-sm:[&>*]:justify-center sm:flex-row sm:items-center sm:shrink-0">
          {action}
        </div>
      )}
    </header>
  );
}
