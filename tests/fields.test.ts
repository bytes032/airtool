import { describe, expect, it } from 'vitest';
import { pickFieldIds, pickFields } from '../src/fields.js';
import type { AirtableSchema, AirtableTableDefinition } from '../src/types.js';

type Deal = {
  name: string;
  status: string;
  tags?: string[];
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
    tags: ['fldTagsA', 'fldTagsB'],
  },
  schema,
  recordSchema,
};

describe('pickFields', () => {
  it('returns typed keys', () => {
    const fields = pickFields(dealsTable, 'name', 'status');
    expect(fields).toEqual(['name', 'status']);
  });
});

describe('pickFieldIds', () => {
  it('resolves mapped field ids', () => {
    const fieldIds = pickFieldIds(dealsTable, ['name', 'tags']);
    expect(fieldIds.sort()).toEqual(['fldName', 'fldTagsA', 'fldTagsB'].sort());
  });
});
