import type { AirtableRecord, AirtableTableDefinition, ParsedAirtableRecord } from './types.js';

function buildRecordFields<T extends Record<string, unknown>>(
  table: AirtableTableDefinition<T>,
  record: AirtableRecord,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  for (const [key, fieldId] of Object.entries(table.mappings)) {
    const fieldIds = Array.isArray(fieldId) ? fieldId : [fieldId];
    const value =
      fieldIds.length === 1
        ? (record.get(fieldIds[0]) as unknown)
        : (fieldIds.map((id) => record.get(id) as unknown) as unknown);
    fields[key] = value;
  }

  return fields;
}

export function parseAirtableRecord<T extends Record<string, unknown>>(
  table: AirtableTableDefinition<T>,
  record: AirtableRecord,
): ParsedAirtableRecord<T> {
  const fields = buildRecordFields(table, record);
  return table.recordSchema.parse({ id: record.id, fields });
}

export function parseAirtableRecords<T extends Record<string, unknown>>(
  table: AirtableTableDefinition<T>,
  records: AirtableRecord[],
): ParsedAirtableRecord<T>[] {
  return records.map((record) => parseAirtableRecord(table, record));
}

export function safeParseAirtableRecord<T extends Record<string, unknown>>(
  table: AirtableTableDefinition<T>,
  record: AirtableRecord,
): { success: true; data: ParsedAirtableRecord<T> } | { success: false; error: unknown } {
  const fields = buildRecordFields(table, record);
  if (table.recordSchema.safeParse) {
    const parsed = table.recordSchema.safeParse({ id: record.id, fields });
    if (parsed.success) {
      return { success: true, data: parsed.data };
    }
    return { success: false, error: parsed.error };
  }

  try {
    return { success: true, data: table.recordSchema.parse({ id: record.id, fields }) };
  } catch (error) {
    return { success: false, error };
  }
}
