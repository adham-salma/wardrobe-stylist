import { cn } from "cn";

/** A square photo served by /photos/$id. */
export function Photo({
  id,
  alt,
  className,
  testId,
}: {
  id: string;
  alt: string;
  className?: string;
  testId?: string;
}) {
  return (
    <img
      src={`/photos/${id}`}
      alt={alt}
      loading="lazy"
      data-testid={testId}
      className={cn(
        "aspect-square w-full rounded-md border border-border bg-muted object-cover",
        className,
      )}
    />
  );
}
