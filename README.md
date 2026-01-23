# airtool

Typed Airtable utilities with schema-aware helpers.

## Install

```sh
pnpm add airtool airtable
```

## Quick start

```ts
import Airtable from 'airtable';
import {
  createAirtableBase,
  fetchAllRecords,
  pickFields,
  type AirtableTableDefinition,
} from 'airtool';
import { z } from 'zod';

const DealsSchema = z.object({
  name: z.string(),
  status: z.string(),
});

const DealsRecordSchema = z.object({
  id: z.string(),
  fields: DealsSchema,
});

const dealsTable = {
  name: 'Deals',
  tableId: 'tbl123',
  mappings: {
    name: 'fldName',
    status: 'fldStatus',
  },
  requiredFields: ['name', 'status'],
  schema: DealsSchema,
  recordSchema: DealsRecordSchema,
} satisfies AirtableTableDefinition<z.infer<typeof DealsSchema>>;

const base = createAirtableBase({ apiKey: process.env.AIRTABLE_API_KEY!, baseId: 'app123' });
const records = await fetchAllRecords(base, dealsTable, {
  fields: pickFields(dealsTable, 'name', 'status'),
});

console.log(records[0].fields.name);
```

## Config providers (optional)

```ts
import { setAirtableConfigProvider, withAirtable } from 'airtool';

setAirtableConfigProvider(() => ({
  apiKey: process.env.AIRTABLE_API_KEY!,
  baseIds: {
    main: 'app123',
  },
}));

await withAirtable('main', async ({ base }) => {
  // use base here
});
```

## Field selection

`pickFields` returns **typed field keys** (not IDs). This keeps code compact while still validating against the table type.
The library resolves field IDs internally based on the table mappings.

## Validation

`mapFieldsToAirtable` supports three modes:
- `validate: 'full'` (default when you explicitly set it)
- `validate: 'partial'` (default when omitted)
- `validate: false`

## License

MIT
