/** What a failed server call says to the person. */
export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) {
    // Zod's errors arrive as a JSON list of issues.
    try {
      const issues = JSON.parse(error.message) as { message?: string }[];
      if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
    } catch {
      // A plain message.
    }
    return error.message;
  }
  return "That didn't work. Try again.";
}
