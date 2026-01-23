import { describe, expect, it } from 'vitest';
import { mapFieldsToAirtable } from '../src/serialize.js';
import type { AirtableSchema, AirtableTableDefinition } from '../src/types.js';

type Deal = {
  name: string;
  status: string;
  count?: number;
};

const schema: AirtableSchema<Deal> = {
  parse: (input) => input as Deal,
  partial: () => ({ parse: (input) => input as Partial<Deal> }),
};

const recordSchema: AirtableSchema<{ id: string; fields: Deal }> = {
  parse: (input) => input as { id: string; fields: Deal },
};

const dealsTable: AirtableTableDefinition<Deal> = {
  name: 'Deals',
  tableId: 'tblDeals',
  mappings: {
    name: 'fldName',
    status: 'fldStatus',
    count: 'fldCount',
  },
  schema,
  recordSchema,
};

describe('mapFieldsToAirtable', () => {
  it('maps typed fields to Airtable field ids', () => {
    const mapped = mapFieldsToAirtable(dealsTable, { name: 'Acme', status: 'Open' }, { validate: false });
    expect(mapped).toEqual({
      fldName: 'Acme',
      fldStatus: 'Open',
    });
  });

  it('skips undefined values', () => {
    const mapped = mapFieldsToAirtable(dealsTable, { name: 'Acme', count: undefined }, { validate: false });
    expect(mapped).toEqual({ fldName: 'Acme' });
  });
});
