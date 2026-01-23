import type { AirtableTableDefinition } from './types.js';

const FIELD_ID_PATTERN = /^fld[a-zA-Z0-9]{8,}$/;

function looksLikeFieldId(field: string): boolean {
  return FIELD_ID_PATTERN.test(field);
}

export function inferReturnFieldsByFieldId(fields: string[]): boolean {
  if (fields.length === 0) {
    return false;
  }

  const matches = fields.map((field) => looksLikeFieldId(field));
  const hasIds = matches.some(Boolean);
  const hasNames = matches.some((value) => !value);

  if (hasIds && hasNames) {
    throw new Error('Airtable field list mixes IDs and names. Use one or the other consistently.');
  }

  return hasIds;
}

export function resolveTableFieldIds<T extends Record<string, unknown>>(
  table: AirtableTableDefinition<T>,
  keys?: Array<Extract<keyof T, string>>,
): string[] {
  const fieldIds = new Set<string>();
  const entries = keys
    ? keys.map((key) => [String(key), table.mappings[key]] as const)
    : Object.entries(table.mappings);

  for (const [key, mapping] of entries) {
    if (!mapping) {
      throw new Error(`Missing Airtable mapping for field "${key}"`);
    }
    if (Array.isArray(mapping)) {
      for (const fieldId of mapping) fieldIds.add(fieldId);
    } else {
      fieldIds.add(mapping);
    }
  }

  return [...fieldIds];
}

export function pickFields<T extends Record<string, unknown>, K extends Extract<keyof T, string>>(
  _table: AirtableTableDefinition<T>,
  keys: K[],
): K[];
export function pickFields<T extends Record<string, unknown>, K extends Extract<keyof T, string>>(
  _table: AirtableTableDefinition<T>,
  key: K,
  ...rest: K[]
): K[];
export function pickFields<T extends Record<string, unknown>, K extends Extract<keyof T, string>>(
  _table: AirtableTableDefinition<T>,
  keyOrKeys: K | K[],
  ...rest: K[]
): K[] {
  if (Array.isArray(keyOrKeys)) {
    return keyOrKeys;
  }
  return [keyOrKeys, ...rest];
}

export function pickFieldIds<T extends Record<string, unknown>>(
  table: AirtableTableDefinition<T>,
  keys?: Array<Extract<keyof T, string>>,
): string[] {
  return resolveTableFieldIds(table, keys);
}

export function tableFieldKeys<T extends Record<string, unknown>>(
  table: AirtableTableDefinition<T>,
): { [K in Extract<keyof T, string>]: K } {
  const keys = Object.keys(table.mappings) as Array<Extract<keyof T, string>>;
  return keys.reduce(
    (acc, key) => {
      acc[key] = key;
      return acc;
    },
    {} as { [K in Extract<keyof T, string>]: K },
  );
}
