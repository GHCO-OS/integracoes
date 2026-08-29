export type CustomerMatchRecord = {
  email?: string;
  phone?: string;
  thirdPartyUserId?: string;
};

export async function customerMatchOperations(
  records: CustomerMatchRecord[],
  action: "create" | "remove" = "create"
): Promise<Record<string, unknown>[]> {
  if (records.length < 1 || records.length > 10_000) {
    throw new Error("records deve conter entre 1 e 10000 itens por lote.");
  }
  const identifierCount = records.reduce(
    (total, record) => total + Number(Boolean(record.email)) + Number(Boolean(record.phone)) + Number(Boolean(record.thirdPartyUserId)),
    0
  );
  if (identifierCount > 10_000) {
    throw new Error("O lote excede 10000 identificadores; divida-o em mais chamadas.");
  }
  return Promise.all(records.map(async (record) => {
    const userIdentifiers: Record<string, string>[] = [];
    if (record.email) userIdentifiers.push({ hashedEmail: await sha256(normalizeEmail(record.email)) });
    if (record.phone) userIdentifiers.push({ hashedPhoneNumber: await sha256(normalizePhone(record.phone)) });
    if (record.thirdPartyUserId) userIdentifiers.push({ thirdPartyUserId: record.thirdPartyUserId.trim() });
    if (userIdentifiers.length === 0) throw new Error("Cada registro precisa de email, phone ou thirdPartyUserId.");
    return { [action]: { userIdentifiers } };
  }));
}

export function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized.includes("@")) throw new Error("Email invalido para Customer Match.");
  return normalized;
}

export function normalizePhone(value: string): string {
  const normalized = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
    throw new Error("Telefone deve estar no formato E.164, por exemplo +5565999999999.");
  }
  return normalized;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
