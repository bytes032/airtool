import Airtable from 'airtable';

export type AirtableBase = Airtable.Base;
export type AirtableRecord = Airtable.Record<Airtable.FieldSet>;
export type AirtableFieldSet = Airtable.FieldSet;

export type AirtableSchema<T> = {
  parse: (input: unknown) => T;
  safeParse?: (input: unknown) => { success: true; data: T } | { success: false; error: unknown };
  partial?: () => AirtableSchema<Partial<T>>;
};

export type AirtableTableDefinition<T extends Record<string, unknown>> = {
  name: string;
  baseId?: string;
  tableId: string;
  mappings: {
    [K in Extract<keyof T, string>]: string | string[];
  };
  requiredFields?: Array<Extract<keyof T, string>>;
  schema: AirtableSchema<T>;
  recordSchema: AirtableSchema<{ id: string; fields: T }>;
  links?: Record<string, { tableId: string }>;
};

export type ParsedAirtableRecord<T extends Record<string, unknown>> = {
  id: string;
  fields: T;
};

export type AirtableConfig = {
  apiKey: string;
  baseId: string;
};

export type AirtableConfigStore<K extends string = string> = {
  apiKey: string;
  baseIds: Record<K, string>;
};

export type AirtableConfigProvider<K extends string = string> = () =>
  | AirtableConfigStore<K>
  | Promise<AirtableConfigStore<K>>;

export type AirtableWriteOptions = {
  validate?: 'full' | 'partial' | false;
};

export type AirtableJsonParseOptions = {
  fallbackArray?: unknown[];
  fallbackObject?: Record<string, unknown> | null;
};

export type AirtableCoerceOptions = {
  emptyToUndefined?: boolean;
};

const FIELD_ID_PATTERN = /^fld[a-zA-Z0-9]{8,}$/;

let airtableConfigProvider: AirtableConfigProvider | null = null;

export function setAirtableConfigProvider<K extends string>(provider: AirtableConfigProvider<K>): void {
  airtableConfigProvider = provider as AirtableConfigProvider;
}

export async function getAirtableConfigStore<K extends string = string>(): Promise<AirtableConfigStore<K>> {
  if (!airtableConfigProvider) {
    throw new Error('Airtable config provider not set. Call setAirtableConfigProvider().');
  }
  const store = await airtableConfigProvider();
  if (!store.apiKey) {
    throw new Error('Airtable config store missing apiKey.');
  }
  return store as AirtableConfigStore<K>;
}

export function createAirtableBase(config: AirtableConfig): AirtableBase {
  return new Airtable({ apiKey: config.apiKey }).base(config.baseId);
}

export async function withAirtable<K extends string, T>(
  baseIdKey: K,
  fn: (ctx: { base: AirtableBase; config: AirtableConfig; store: AirtableConfigStore<K> }) => T | Promise<T>,
): Promise<T> {
  const store = await getAirtableConfigStore<K>();
  const baseId = store.baseIds[baseIdKey];
  if (!baseId) {
    throw new Error(`Airtable baseId missing for "${String(baseIdKey)}".`);
  }
  const config: AirtableConfig = { apiKey: store.apiKey, baseId };
  const base = createAirtableBase(config);
  return fn({ base, config, store });
}

function looksLikeFieldId(field: string): boolean {
  return FIELD_ID_PATTERN.test(field);
}

function inferReturnFieldsByFieldId(fields: string[]): boolean {
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

function resolveTableFieldIds<T extends Record<string, unknown>>(
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
        : (fieldIds.flatMap((id) => record.get(id) as unknown) as unknown);
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

async function fetchRecordRaw(base: AirtableBase, tableId: string, recordId: string): Promise<AirtableRecord> {
  return base(tableId).find(recordId);
}

async function fetchRecordRawByFieldId(base: AirtableBase, tableId: string, recordId: string): Promise<AirtableRecord> {
  const records = await base(tableId)
    .select({
      maxRecords: 1,
      filterByFormula: `RECORD_ID() = "${recordId}"`,
      returnFieldsByFieldId: true,
    })
    .firstPage();

  if (records.length === 0) {
    throw new Error(`Record not found: ${recordId}`);
  }

  return records[0];
}

export async function fetchRecord<T extends Record<string, unknown>>(
  base: AirtableBase,
  table: AirtableTableDefinition<T>,
  recordId: string,
): Promise<ParsedAirtableRecord<T>>;
export async function fetchRecord(base: AirtableBase, tableId: string, recordId: string): Promise<AirtableRecord>;
export async function fetchRecord(
  base: AirtableBase,
  tableOrId: string | AirtableTableDefinition<Record<string, unknown>>,
  recordId: string,
): Promise<AirtableRecord | ParsedAirtableRecord<Record<string, unknown>>> {
  if (typeof tableOrId === 'string') {
    return fetchRecordRaw(base, tableOrId, recordId);
  }

  const record = await fetchRecordRawByFieldId(base, tableOrId.tableId, recordId);
  return parseAirtableRecord(tableOrId, record);
}

async function fetchAllRecordsRaw(
  base: AirtableBase,
  tableId: string,
  fields: string[] = [],
  maxRecords?: number,
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  const selectOptions: Airtable.SelectOptions<Airtable.FieldSet> = {};

  if (fields.length > 0) {
    selectOptions.fields = fields;
    selectOptions.returnFieldsByFieldId = inferReturnFieldsByFieldId(fields);
  }

  if (maxRecords !== undefined) {
    selectOptions.maxRecords = maxRecords;
  }

  await base(tableId)
    .select(selectOptions)
    .eachPage((pageRecords, fetchNextPage) => {
      records.push(...pageRecords);
      fetchNextPage();
    });

  return records;
}

export async function fetchAllRecords<T extends Record<string, unknown>>(
  base: AirtableBase,
  table: AirtableTableDefinition<T>,
  options?: { fields?: Array<Extract<keyof T, string>>; maxRecords?: number },
): Promise<ParsedAirtableRecord<T>[]>;
export async function fetchAllRecords(
  base: AirtableBase,
  tableId: string,
  fields?: string[],
  maxRecords?: number,
): Promise<AirtableRecord[]>;
export async function fetchAllRecords(
  base: AirtableBase,
  tableOrId: string | AirtableTableDefinition<Record<string, unknown>>,
  fieldsOrOptions?: string[] | { fields?: Array<string>; maxRecords?: number },
  maxRecords?: number,
): Promise<AirtableRecord[] | ParsedAirtableRecord<Record<string, unknown>>[]> {
  if (typeof tableOrId === 'string') {
    const fields = Array.isArray(fieldsOrOptions) ? fieldsOrOptions : [];
    return fetchAllRecordsRaw(base, tableOrId, fields, maxRecords);
  }

  const options = (fieldsOrOptions as { fields?: Array<string>; maxRecords?: number }) ?? {};
  const requiredFields = tableOrId.requiredFields ?? [];
  const mergedFields = new Set<string>([...requiredFields, ...(options.fields ?? [])]);
  const fieldIds = resolveTableFieldIds(tableOrId, mergedFields.size > 0 ? [...mergedFields] : undefined);
  const records = await fetchAllRecordsRaw(base, tableOrId.tableId, fieldIds, options.maxRecords);
  return parseAirtableRecords(tableOrId, records);
}

async function fetchRecordsWithFormulaRaw(
  base: AirtableBase,
  tableId: string,
  formula: string,
  fields: string[] = [],
  maxRecords?: number,
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  const selectOptions: Airtable.SelectOptions<Airtable.FieldSet> = {
    filterByFormula: formula,
  };

  if (fields.length > 0) {
    selectOptions.fields = fields;
    selectOptions.returnFieldsByFieldId = inferReturnFieldsByFieldId(fields);
  }

  if (maxRecords !== undefined) {
    selectOptions.maxRecords = maxRecords;
  }

  await base(tableId)
    .select(selectOptions)
    .eachPage((pageRecords, fetchNextPage) => {
      records.push(...pageRecords);
      fetchNextPage();
    });

  return records;
}

export async function fetchRecordsWithFormula<T extends Record<string, unknown>>(
  base: AirtableBase,
  table: AirtableTableDefinition<T>,
  formula: string,
  options?: { fields?: Array<Extract<keyof T, string>>; maxRecords?: number },
): Promise<ParsedAirtableRecord<T>[]>;
export async function fetchRecordsWithFormula(
  base: AirtableBase,
  tableId: string,
  formula: string,
  fields?: string[],
  maxRecords?: number,
): Promise<AirtableRecord[]>;
export async function fetchRecordsWithFormula(
  base: AirtableBase,
  tableOrId: string | AirtableTableDefinition<Record<string, unknown>>,
  formula: string,
  fieldsOrOptions?: string[] | { fields?: Array<string>; maxRecords?: number },
  maxRecords?: number,
): Promise<AirtableRecord[] | ParsedAirtableRecord<Record<string, unknown>>[]> {
  if (typeof tableOrId === 'string') {
    const fields = Array.isArray(fieldsOrOptions) ? fieldsOrOptions : [];
    return fetchRecordsWithFormulaRaw(base, tableOrId, formula, fields, maxRecords);
  }

  const options = (fieldsOrOptions as { fields?: Array<string>; maxRecords?: number }) ?? {};
  const requiredFields = tableOrId.requiredFields ?? [];
  const mergedFields = new Set<string>([...requiredFields, ...(options.fields ?? [])]);
  const fieldIds = resolveTableFieldIds(tableOrId, mergedFields.size > 0 ? [...mergedFields] : undefined);
  const records = await fetchRecordsWithFormulaRaw(base, tableOrId.tableId, formula, fieldIds, options.maxRecords);
  return parseAirtableRecords(tableOrId, records);
}

async function updateRecordRaw(
  base: AirtableBase,
  tableId: string,
  recordId: string,
  fields: AirtableFieldSet,
): Promise<AirtableRecord> {
  return base(tableId).update(recordId, fields);
}

export async function updateRecord<T extends Record<string, unknown>>(
  base: AirtableBase,
  table: AirtableTableDefinition<T>,
  recordId: string,
  fields: Partial<T>,
  options?: AirtableWriteOptions,
): Promise<ParsedAirtableRecord<T>>;
export async function updateRecord(
  base: AirtableBase,
  tableId: string,
  recordId: string,
  fields: AirtableFieldSet,
): Promise<AirtableRecord>;
export async function updateRecord(
  base: AirtableBase,
  tableOrId: string | AirtableTableDefinition<Record<string, unknown>>,
  recordId: string,
  fields: AirtableFieldSet | Partial<Record<string, unknown>>,
  options?: AirtableWriteOptions,
): Promise<AirtableRecord | ParsedAirtableRecord<Record<string, unknown>>> {
  const tableId = typeof tableOrId === 'string' ? tableOrId : tableOrId.tableId;
  const mappedFields =
    typeof tableOrId === 'string'
      ? (fields as AirtableFieldSet)
      : mapFieldsToAirtable(tableOrId, fields as Partial<Record<string, unknown>>, options);
  const updatedRecord = await updateRecordRaw(base, tableId, recordId, mappedFields);

  if (typeof tableOrId === 'string') {
    return updatedRecord;
  }

  return parseAirtableRecord(tableOrId, updatedRecord);
}

export async function updateRecordsBatch<T extends Record<string, unknown>>(
  base: AirtableBase,
  table: AirtableTableDefinition<T>,
  updates: Array<{ id: string; fields: Partial<T> }>,
  options?: AirtableWriteOptions,
): Promise<ParsedAirtableRecord<T>[]>;
export async function updateRecordsBatch(
  base: AirtableBase,
  tableId: string,
  updates: Array<{ id: string; fields: AirtableFieldSet }>,
): Promise<AirtableRecord[]>;
export async function updateRecordsBatch(
  base: AirtableBase,
  tableOrId: string | AirtableTableDefinition<Record<string, unknown>>,
  updates: Array<{ id: string; fields: AirtableFieldSet | Partial<Record<string, unknown>> }>,
  options?: AirtableWriteOptions,
): Promise<AirtableRecord[] | ParsedAirtableRecord<Record<string, unknown>>[]> {
  const tableId = typeof tableOrId === 'string' ? tableOrId : tableOrId.tableId;
  const mappedUpdates =
    typeof tableOrId === 'string'
      ? (updates as Array<{ id: string; fields: AirtableFieldSet }>)
      : updates.map((update) => ({
          id: update.id,
          fields: mapFieldsToAirtable(tableOrId, update.fields as Partial<Record<string, unknown>>, options),
        }));

  if (mappedUpdates.length === 0) {
    return [];
  }

  const results: AirtableRecord[] = [];
  const batchSize = 10;

  for (let i = 0; i < mappedUpdates.length; i += batchSize) {
    const batch = mappedUpdates.slice(i, i + batchSize);
    const recordsToUpdate = batch.map((update) => ({
      id: update.id,
      fields: update.fields,
    }));
    const updatedRecords = await base(tableId).update(recordsToUpdate);
    results.push(...updatedRecords);
  }

  if (typeof tableOrId === 'string') {
    return results;
  }

  return parseAirtableRecords(tableOrId, results);
}

export async function updateRecordsByFormula<T extends Record<string, unknown>>(
  base: AirtableBase,
  table: AirtableTableDefinition<T>,
  formula: string,
  updates: Partial<T>,
  options?: AirtableWriteOptions,
): Promise<ParsedAirtableRecord<T>[]>;
export async function updateRecordsByFormula(
  base: AirtableBase,
  tableId: string,
  formula: string,
  updates: AirtableFieldSet,
): Promise<AirtableRecord[]>;
export async function updateRecordsByFormula(
  base: AirtableBase,
  tableOrId: string | AirtableTableDefinition<Record<string, unknown>>,
  formula: string,
  updates: AirtableFieldSet | Partial<Record<string, unknown>>,
  options?: AirtableWriteOptions,
): Promise<AirtableRecord[] | ParsedAirtableRecord<Record<string, unknown>>[]> {
  const tableId = typeof tableOrId === 'string' ? tableOrId : tableOrId.tableId;
  const records = await fetchRecordsWithFormulaRaw(base, tableId, formula);

  if (records.length === 0) {
    return [];
  }

  if (typeof tableOrId === 'string') {
    const updateBatch = records.map((record) => ({
      id: record.id,
      fields: updates as AirtableFieldSet,
    }));
    return updateRecordsBatch(base, tableId, updateBatch);
  }

  const updateBatch = records.map((record) => ({
    id: record.id,
    fields: updates as Partial<Record<string, unknown>>,
  }));
  return updateRecordsBatch(base, tableOrId, updateBatch, options);
}

async function createRecordRaw(base: AirtableBase, tableId: string, fields: AirtableFieldSet): Promise<AirtableRecord> {
  return base(tableId).create(fields);
}

export async function createRecord<T extends Record<string, unknown>>(
  base: AirtableBase,
  table: AirtableTableDefinition<T>,
  fields: Partial<T>,
  options?: AirtableWriteOptions,
): Promise<ParsedAirtableRecord<T>>;
export async function createRecord(
  base: AirtableBase,
  tableId: string,
  fields: AirtableFieldSet,
): Promise<AirtableRecord>;
export async function createRecord(
  base: AirtableBase,
  tableOrId: string | AirtableTableDefinition<Record<string, unknown>>,
  fields: AirtableFieldSet | Partial<Record<string, unknown>>,
  options?: AirtableWriteOptions,
): Promise<AirtableRecord | ParsedAirtableRecord<Record<string, unknown>>> {
  const tableId = typeof tableOrId === 'string' ? tableOrId : tableOrId.tableId;
  const mappedFields =
    typeof tableOrId === 'string'
      ? (fields as AirtableFieldSet)
      : mapFieldsToAirtable(tableOrId, fields as Partial<Record<string, unknown>>, options);
  const createdRecord = await createRecordRaw(base, tableId, mappedFields);

  if (typeof tableOrId === 'string') {
    return createdRecord;
  }

  return parseAirtableRecord(tableOrId, createdRecord);
}

export async function createRecords<T extends Record<string, unknown>>(
  base: AirtableBase,
  table: AirtableTableDefinition<T>,
  recordsData: Array<Partial<T>>,
  options?: AirtableWriteOptions,
): Promise<ParsedAirtableRecord<T>[]>;
export async function createRecords(
  base: AirtableBase,
  tableId: string,
  recordsData: AirtableFieldSet[],
): Promise<AirtableRecord[]>;
export async function createRecords(
  base: AirtableBase,
  tableOrId: string | AirtableTableDefinition<Record<string, unknown>>,
  recordsData: Array<AirtableFieldSet | Partial<Record<string, unknown>>>,
  options?: AirtableWriteOptions,
): Promise<AirtableRecord[] | ParsedAirtableRecord<Record<string, unknown>>[]> {
  const tableId = typeof tableOrId === 'string' ? tableOrId : tableOrId.tableId;
  const mappedRecords =
    typeof tableOrId === 'string'
      ? (recordsData as AirtableFieldSet[])
      : recordsData.map((record) =>
          mapFieldsToAirtable(tableOrId, record as Partial<Record<string, unknown>>, options),
        );

  const results: AirtableRecord[] = [];
  const batchSize = 10;

  for (let i = 0; i < mappedRecords.length; i += batchSize) {
    const batch = mappedRecords.slice(i, i + batchSize);
    const createdBatch = await base(tableId).create(batch);
    results.push(...createdBatch);
  }

  if (typeof tableOrId === 'string') {
    return results;
  }

  return parseAirtableRecords(tableOrId, results);
}

export async function fetchRecordsFromView(
  base: AirtableBase,
  tableId: string,
  viewId: string,
  maxRecords: number = 100,
  fields?: string[],
): Promise<AirtableRecord[]> {
  const queryConfig: Airtable.SelectOptions<Airtable.FieldSet> = {
    view: viewId,
    maxRecords,
  };

  if (fields && fields.length > 0) {
    queryConfig.fields = fields;
  }

  const records = await base(tableId).select(queryConfig).all();
  return [...records];
}

export async function deleteRecord<T extends Record<string, unknown>>(
  base: AirtableBase,
  table: AirtableTableDefinition<T>,
  recordId: string,
): Promise<ParsedAirtableRecord<T>>;
export async function deleteRecord(base: AirtableBase, tableId: string, recordId: string): Promise<AirtableRecord>;
export async function deleteRecord(
  base: AirtableBase,
  tableOrId: string | AirtableTableDefinition<Record<string, unknown>>,
  recordId: string,
): Promise<AirtableRecord | ParsedAirtableRecord<Record<string, unknown>>> {
  const tableId = typeof tableOrId === 'string' ? tableOrId : tableOrId.tableId;
  const deletedRecord = await base(tableId).destroy(recordId);
  if (typeof tableOrId === 'string') {
    return deletedRecord;
  }
  return parseAirtableRecord(tableOrId, deletedRecord);
}

export async function countRecordsInView(base: AirtableBase, tableId: string, viewId: string): Promise<number> {
  let count = 0;

  await base(tableId)
    .select({
      view: viewId,
    })
    .eachPage((pageRecords, fetchNextPage) => {
      count += pageRecords.length;
      fetchNextPage();
    });

  return count;
}
