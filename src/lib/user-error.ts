export function userFacingError(error: unknown, fallback = "We couldn't complete that action. Please contact the store administrator."): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("no longer available") || message.includes("remain for")) {
    return "Some items are no longer available in that quantity. Please update your bag and try again.";
  }
  if (message.includes("already exists") || message.includes("duplicate key")) {
    return "That email or item is already in use. Check your details and try again.";
  }
  if (message.includes("password") && (message.includes("incorrect") || message.includes("failed"))) {
    return "We couldn't verify those password details. Check them and try again.";
  }
  return fallback;
}
