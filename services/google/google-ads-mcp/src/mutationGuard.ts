import type { MutateOperation } from "./googleAdsClient.js";

export function assertMutationConfirmed(
  operations: MutateOperation[],
  validateOnly: boolean,
  confirmWrite?: string
): void {
  if (operations.length < 1 || operations.length > 1000) {
    throw new Error("operations deve conter entre 1 e 1000 operacoes.");
  }
  if (validateOnly) return;
  const hasRemove = operations.some((operation) => containsRemove(operation));
  const expected = hasRemove ? "CONFIRM_GOOGLE_ADS_DELETE" : "CONFIRM_GOOGLE_ADS_WRITE";
  if (confirmWrite !== expected) {
    throw new Error(`Mutacao bloqueada. Use confirmWrite=${expected} para executar.`);
  }
}

export function containsRemove(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => key.toLowerCase() === "remove" || containsRemove(nested)
  );
}
