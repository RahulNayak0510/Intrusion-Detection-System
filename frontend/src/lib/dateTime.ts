const UTC_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function parseApiUtcDate(value: string): Date {
  const normalized = UTC_SUFFIX.test(value)
    ? value.replace(/([+-]\d{2})(\d{2})$/i, "$1:$2")
    : `${value}Z`;
  return new Date(normalized);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatUtcTimestamp(value: string): string {
  const date = parseApiUtcDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function formatUtcShort(value: string): string {
  const date = parseApiUtcDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
