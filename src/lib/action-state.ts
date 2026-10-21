export type ActionState = { error?: string; ok?: string } | null;

export function errorMessage(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}
