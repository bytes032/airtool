import type {
  AirtableCoerceOptions,
  AirtableFieldSet,
  AirtableJsonParseOptions,
  AirtableTableDefinition,
  AirtableWriteOptions,
} from './types.js';

export function mapFieldsToAirtable<T extends Record<string, unknown>>(
  table: AirtableTableDefinition<T>,
  fields: Partial<T>,
  options?: AirtableWriteOptions,
): AirtableFieldSet {
  const validateMode = options?.validate ?? 'partial';
  if (validateMode === 'full') {
    table.schema.parse(fields as T);
  } else if (validateMode !== false) {
    if (table.schema.partial) {
      table.schema.partial().parse(fields as Partial<T>);
    } else {
      table.schema.parse(fields as Partial<T>);
    }
  }

  const mapped: AirtableFieldSet = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const mapping = (table.mappings as Record<string, string | string[]>)[key];
    if (!mapping) {
      throw new Error(`Missing Airtable mapping for field "${key}"`);
    }
    const fieldIds = Array.isArray(mapping) ? mapping : [mapping];
    for (const fieldId of fieldIds) {
      mapped[fieldId] = value as AirtableFieldSet[string];
    }
  }

  return mapped;
}

export function coerceString(value: unknown, options?: AirtableCoerceOptions): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (options?.emptyToUndefined && trimmed.length === 0) return undefined;
    return value;
  }
  return String(value);
}

export function coerceNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function coerceBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return undefined;
}

export function parseJsonArray<T = unknown>(value: unknown, options?: AirtableJsonParseOptions): T[] {
  const fallback = (options?.fallbackArray ?? []) as T[];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function parseJsonObject<T extends Record<string, unknown> = Record<string, unknown>>(
  value: unknown,
  options?: AirtableJsonParseOptions,
): T | null {
  const fallback = (options?.fallbackObject ?? null) as T | null;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as T;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as T;
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}
