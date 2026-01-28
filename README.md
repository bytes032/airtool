# airtool

Typed Airtable SDK helpers with schema-aware parsing, field mapping, and retry/pagination utilities.

## Features

- Typed table definitions with ID-to-field mapping
- Parse and validate records with your schema library
- Typed CRUD helpers (single + batch)
- Field selection with required-field merging
- Optional client wrapper with retry/backoff
- Lightweight and ESM-first

## Requirements

- Node.js >= 24

## Install

```sh
pnpm add airtool airtable
```

## Quick start

```ts
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

## Using with airtypes

Generate table definitions with `airtypes`, then import them directly into `airtool`:

```ts
import { createAirtableClient, pickFields } from 'airtool';
import { dealsTable } from './airtable-types.js';

const client = createAirtableClient({
  apiKey: process.env.AIRTABLE_API_KEY!,
  baseId: dealsTable.baseId!,
});

const deals = client.table(dealsTable);
const records = await deals.fetchAllRecords({
  fields: pickFields(dealsTable, 'name', 'status'),
});
```

`airtypes` can also emit `requiredFields` per table (via `required_fields` in its config), which airtool merges into
typed list queries automatically.

## Client wrapper (recommended)

```ts
import { createAirtableClient } from 'airtool';

const client = createAirtableClient(
  { apiKey: process.env.AIRTABLE_API_KEY!, baseId: 'app123' },
  { retry: { maxRetries: 3 }, logger: console },
);

const deals = client.table(dealsTable);
const record = await deals.fetchRecord('rec123');
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

## Field selection & required fields

- `pickFields(table, ...)` returns typed keys (not IDs).
- `requiredFields` are always included for typed list queries.

```ts
const fields = pickFields(dealsTable, 'status');
// requiredFields + fields are fetched and parsed
```

## Validation modes

`mapFieldsToAirtable` supports:
- `validate: 'full'` (strict)
- `validate: 'partial'` (default)
- `validate: false`

## Typecast writes

Set `typecast: true` when you want Airtable to create missing select or multiselect options during writes (requires
creator permissions on the base).

```ts
await updateRecord(base, dealsTable, recordId, { status: 'New Option' }, { typecast: true });
```

## Pagination

```ts
import { forEachPage } from 'airtool';

await forEachPage(base, 'tbl123', { view: 'Grid view' }, async (records) => {
  // process one page at a time
});
```

## Retry policy

Retry/backoff is enabled via the client wrapper. Defaults:
- Exponential backoff, capped
- Retries on 429 and 5xx errors

```ts
const client = createAirtableClient(
  { apiKey: process.env.AIRTABLE_API_KEY!, baseId: 'app123' },
  { retry: { maxRetries: 5, minDelayMs: 200, maxDelayMs: 3000 } },
);
```

## Build, test, release

```sh
pnpm lint
pnpm test
pnpm build
pnpm publish --access public
```

## License

MIT
