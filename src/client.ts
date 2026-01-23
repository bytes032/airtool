import type Airtable from 'airtable';
import { createAirtableBase, getAirtableConfigStore } from './config.js';
import {
  countRecordsInView,
  createRecord,
  createRecords,
  deleteRecord,
  fetchAllRecords,
  fetchRecord,
  fetchRecordsFromView,
  fetchRecordsWithFormula,
  forEachPage,
  updateRecord,
  updateRecordsBatch,
  updateRecordsByFormula,
} from './records.js';
import { runWithRetry } from './retry.js';
import type {
  AirtableBase,
  AirtableConfig,
  AirtableLogger,
  AirtableRetryOptions,
  AirtableTableDefinition,
  AirtableWriteOptions,
  ParsedAirtableRecord,
} from './types.js';

export type AirtableClientOptions = {
  retry?: AirtableRetryOptions;
  logger?: AirtableLogger;
};

export type AirtableClient = {
  base: AirtableBase;
  config: AirtableConfig;
  table: <T extends Record<string, unknown>>(table: AirtableTableDefinition<T>) => AirtableTableClient<T>;
  fetchRecord: <T extends Record<string, unknown>>(
    table: AirtableTableDefinition<T>,
    recordId: string,
  ) => Promise<ParsedAirtableRecord<T>>;
  fetchAllRecords: <T extends Record<string, unknown>>(
    table: AirtableTableDefinition<T>,
    options?: { fields?: Array<Extract<keyof T, string>>; maxRecords?: number },
  ) => Promise<ParsedAirtableRecord<T>[]>;
  fetchRecordsWithFormula: <T extends Record<string, unknown>>(
    table: AirtableTableDefinition<T>,
    formula: string,
    options?: { fields?: Array<Extract<keyof T, string>>; maxRecords?: number },
  ) => Promise<ParsedAirtableRecord<T>[]>;
  forEachPage: (
    tableId: string,
    options: Airtable.SelectOptions<Airtable.FieldSet>,
    onPage: (records: readonly Airtable.Record<Airtable.FieldSet>[]) => void | Promise<void>,
  ) => Promise<void>;
  updateRecord: <T extends Record<string, unknown>>(
    table: AirtableTableDefinition<T>,
    recordId: string,
    fields: Partial<T>,
    options?: AirtableWriteOptions,
  ) => Promise<ParsedAirtableRecord<T>>;
  updateRecordsBatch: <T extends Record<string, unknown>>(
    table: AirtableTableDefinition<T>,
    updates: Array<{ id: string; fields: Partial<T> }>,
    options?: AirtableWriteOptions,
  ) => Promise<ParsedAirtableRecord<T>[]>;
  updateRecordsByFormula: <T extends Record<string, unknown>>(
    table: AirtableTableDefinition<T>,
    formula: string,
    updates: Partial<T>,
    options?: AirtableWriteOptions,
  ) => Promise<ParsedAirtableRecord<T>[]>;
  createRecord: <T extends Record<string, unknown>>(
    table: AirtableTableDefinition<T>,
    fields: Partial<T>,
    options?: AirtableWriteOptions,
  ) => Promise<ParsedAirtableRecord<T>>;
  createRecords: <T extends Record<string, unknown>>(
    table: AirtableTableDefinition<T>,
    records: Array<Partial<T>>,
    options?: AirtableWriteOptions,
  ) => Promise<ParsedAirtableRecord<T>[]>;
  deleteRecord: <T extends Record<string, unknown>>(
    table: AirtableTableDefinition<T>,
    recordId: string,
  ) => Promise<ParsedAirtableRecord<T>>;
  fetchRecordsFromView: (
    tableId: string,
    viewId: string,
    maxRecords?: number,
    fields?: string[],
  ) => Promise<Airtable.Record<Airtable.FieldSet>[]>;
  countRecordsInView: (tableId: string, viewId: string) => Promise<number>;
};

export type AirtableTableClient<T extends Record<string, unknown>> = {
  fetchRecord: (recordId: string) => Promise<ParsedAirtableRecord<T>>;
  fetchAllRecords: (options?: {
    fields?: Array<Extract<keyof T, string>>;
    maxRecords?: number;
  }) => Promise<ParsedAirtableRecord<T>[]>;
  fetchRecordsWithFormula: (
    formula: string,
    options?: { fields?: Array<Extract<keyof T, string>>; maxRecords?: number },
  ) => Promise<ParsedAirtableRecord<T>[]>;
  updateRecord: (
    recordId: string,
    fields: Partial<T>,
    options?: AirtableWriteOptions,
  ) => Promise<ParsedAirtableRecord<T>>;
  updateRecordsBatch: (
    updates: Array<{ id: string; fields: Partial<T> }>,
    options?: AirtableWriteOptions,
  ) => Promise<ParsedAirtableRecord<T>[]>;
  updateRecordsByFormula: (
    formula: string,
    updates: Partial<T>,
    options?: AirtableWriteOptions,
  ) => Promise<ParsedAirtableRecord<T>[]>;
  createRecord: (fields: Partial<T>, options?: AirtableWriteOptions) => Promise<ParsedAirtableRecord<T>>;
  createRecords: (records: Array<Partial<T>>, options?: AirtableWriteOptions) => Promise<ParsedAirtableRecord<T>[]>;
  deleteRecord: (recordId: string) => Promise<ParsedAirtableRecord<T>>;
};

function withRetry<T>(operation: () => Promise<T>, options?: AirtableClientOptions): Promise<T> {
  const retryOptions = { ...options?.retry, logger: options?.logger };
  return runWithRetry(operation, retryOptions);
}

export function createAirtableClient(config: AirtableConfig, options?: AirtableClientOptions): AirtableClient {
  const base = createAirtableBase(config);

  const client: AirtableClient = {
    base,
    config,
    table: <T extends Record<string, unknown>>(table: AirtableTableDefinition<T>) =>
      createTableClient(client, table, options),
    fetchRecord: (table, recordId) => withRetry(() => fetchRecord(base, table, recordId), options),
    fetchAllRecords: (table, opts) => withRetry(() => fetchAllRecords(base, table, opts), options),
    fetchRecordsWithFormula: (table, formula, opts) =>
      withRetry(() => fetchRecordsWithFormula(base, table, formula, opts), options),
    forEachPage: (tableId, opts, onPage) => withRetry(() => forEachPage(base, tableId, opts, onPage), options),
    updateRecord: (table, recordId, fields, opts) =>
      withRetry(() => updateRecord(base, table, recordId, fields, opts), options),
    updateRecordsBatch: (table, updates, opts) =>
      withRetry(() => updateRecordsBatch(base, table, updates, opts), options),
    updateRecordsByFormula: (table, formula, updates, opts) =>
      withRetry(() => updateRecordsByFormula(base, table, formula, updates, opts), options),
    createRecord: (table, fields, opts) => withRetry(() => createRecord(base, table, fields, opts), options),
    createRecords: (table, records, opts) => withRetry(() => createRecords(base, table, records, opts), options),
    deleteRecord: (table, recordId) => withRetry(() => deleteRecord(base, table, recordId), options),
    fetchRecordsFromView: (tableId, viewId, maxRecords, fields) =>
      withRetry(() => fetchRecordsFromView(base, tableId, viewId, maxRecords, fields), options),
    countRecordsInView: (tableId, viewId) => withRetry(() => countRecordsInView(base, tableId, viewId), options),
  };

  return client;
}

export async function createAirtableClientFromStore<K extends string>(
  baseIdKey: K,
  options?: AirtableClientOptions,
): Promise<AirtableClient> {
  const store = await getAirtableConfigStore<K>();
  const baseId = store.baseIds[baseIdKey];
  if (!baseId) {
    throw new Error(`Airtable baseId missing for "${String(baseIdKey)}".`);
  }
  return createAirtableClient({ apiKey: store.apiKey, baseId }, options);
}

export function createTableClient<T extends Record<string, unknown>>(
  client: AirtableClient,
  table: AirtableTableDefinition<T>,
  options?: AirtableClientOptions,
): AirtableTableClient<T> {
  return {
    fetchRecord: (recordId) => withRetry(() => fetchRecord(client.base, table, recordId), options),
    fetchAllRecords: (opts) => withRetry(() => fetchAllRecords(client.base, table, opts), options),
    fetchRecordsWithFormula: (formula, opts) =>
      withRetry(() => fetchRecordsWithFormula(client.base, table, formula, opts), options),
    updateRecord: (recordId, fields, opts) =>
      withRetry(() => updateRecord(client.base, table, recordId, fields, opts), options),
    updateRecordsBatch: (updates, opts) =>
      withRetry(() => updateRecordsBatch(client.base, table, updates, opts), options),
    updateRecordsByFormula: (formula, updates, opts) =>
      withRetry(() => updateRecordsByFormula(client.base, table, formula, updates, opts), options),
    createRecord: (fields, opts) => withRetry(() => createRecord(client.base, table, fields, opts), options),
    createRecords: (records, opts) => withRetry(() => createRecords(client.base, table, records, opts), options),
    deleteRecord: (recordId) => withRetry(() => deleteRecord(client.base, table, recordId), options),
  };
}
