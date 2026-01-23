import Airtable from 'airtable';
import type { AirtableBase, AirtableConfig, AirtableConfigProvider, AirtableConfigStore } from './types.js';

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
