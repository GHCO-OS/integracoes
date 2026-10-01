const READ_PREFIX = /^\s*(SELECT|WITH|EXPLAIN)\b/i;
const WRITE_PATTERN = /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|EXPORT|LOAD)\b/i;

export function assertReadonlySql(sql: string): void {
  const clean = sql.trim();
  if (!READ_PREFIX.test(clean) || WRITE_PATTERN.test(clean) || clean.length > 50_000) {
    throw new Error("A consulta de leitura deve usar SELECT/WITH/EXPLAIN e nao pode conter comandos de escrita.");
  }
}

export function requireWriteConfirmation(validateOnly: boolean, confirmation?: string): void {
  if (!validateOnly && confirmation !== "CONFIRM_GHCO_DATA_WRITE") {
    throw new Error("Escrita bloqueada. Use confirmation=CONFIRM_GHCO_DATA_WRITE.");
  }
}

export function requireDeleteConfirmation(validateOnly: boolean, confirmation?: string): void {
  if (!validateOnly && confirmation !== "CONFIRM_GHCO_DATA_DELETE") {
    throw new Error("Exclusao bloqueada. Use confirmation=CONFIRM_GHCO_DATA_DELETE.");
  }
}

export function assertIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,1023}$/.test(value)) throw new Error(`${label} invalido.`);
  return value;
}

export function assertAssetName(value: string): string {
  if (!/^[A-Za-z0-9_-]{5,200}$/.test(value)) throw new Error("Asset Looker Studio invalido.");
  return value;
}
