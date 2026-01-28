import type Airtable from 'airtable';
import { inferReturnFieldsByFieldId, resolveTableFieldIds } from './fields.js';
import { parseAirtableRecord, parseAirtableRecords } from './parse.js';
import { mapFieldsToAirtable } from './serialize.js';
import type {
  AirtableBase,
  AirtableFieldSet,
  AirtableRecord,
  AirtableTableDefinition,
  AirtableWriteOptions,
  ParsedAirtableRecord,
} from './types.js';

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

export async function forEachPage(
  base: AirtableBase,
  tableId: string,
  options: Airtable.SelectOptions<Airtable.FieldSet>,
  onPage: (records: readonly AirtableRecord[]) => void | Promise<void>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    base(tableId)
      .select(options)
      .eachPage(
        (pageRecords, fetchNextPage) => {
          Promise.resolve(onPage(pageRecords))
            .then(() => fetchNextPage())
            .catch(reject);
        },
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
  });
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
  options?: AirtableWriteOptions,
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
  const writeOptions = options?.typecast ? { typecast: true } : undefined;
  const updatedRecord = await base(tableId).update(recordId, mappedFields, writeOptions);

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
  options?: AirtableWriteOptions,
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
    const writeOptions = options?.typecast ? { typecast: true } : undefined;
    const updatedRecords = await base(tableId).update(recordsToUpdate, writeOptions);
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
  options?: AirtableWriteOptions,
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
  const writeOptions = options?.typecast ? { typecast: true } : undefined;
  const createdRecord = await base(tableId).create(mappedFields, writeOptions);

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
  options?: AirtableWriteOptions,
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
    const writeOptions = options?.typecast ? { typecast: true } : undefined;
    const createdBatch = await base(tableId).create(batch, writeOptions);
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
