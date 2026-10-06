// Helpers for the references and search tokens clients send. A malformed id must read as "not found", never as a database error.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

// "Patient/<id>" (or a bare id) to the id; undefined when the type does not match.
export function idFromReference(value: string | undefined, type: string): string | undefined {
  if (!value) return undefined;
  if (!value.includes("/")) return value;
  return value.startsWith(`${type}/`) ? value.slice(type.length + 1) : undefined;
}

// "system|value" to its parts; undefined when it has no system.
export function parseToken(value: string | undefined): { system: string; value: string } | undefined {
  const at = value?.indexOf("|") ?? -1;
  if (!value || at < 1) return undefined;
  return { system: value.slice(0, at), value: value.slice(at + 1) };
}
