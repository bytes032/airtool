import type Airtable from 'airtable';

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
  typecast?: boolean;
};

export type AirtableJsonParseOptions = {
  fallbackArray?: unknown[];
  fallbackObject?: Record<string, unknown> | null;
};

export type AirtableCoerceOptions = {
  emptyToUndefined?: boolean;
};

export type AirtableLogger = {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export type AirtableRetryContext = {
  attempt: number;
  delayMs: number;
  error: unknown;
};

export type AirtableRetryOptions = {
  maxRetries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (context: AirtableRetryContext) => void;
  logger?: AirtableLogger;
};
