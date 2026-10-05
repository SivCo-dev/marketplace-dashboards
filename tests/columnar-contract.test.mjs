import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packRows = (rows) => {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const indexes = new Map(columns.map((key, index) => [key, index]));
  return {
    columns,
    rows: rows.map((row) => Object.keys(row).length === columns.length
      ? columns.map((key) => row[key])
      : Object.fromEntries(Object.entries(row).map(([key, value]) => [String(indexes.get(key)), value]))),
  };
};

const unpackRows = ({ columns, rows }) => rows.map((row) => Array.isArray(row)
  ? Object.fromEntries(columns.map((column, index) => [column, row[index]]))
  : Object.fromEntries(Object.entries(row).map(([index, value]) => [columns[Number(index)], value])));

test('columnar-v1 preserves sparse and complete LIVE rows', () => {
  const source = [
    { report_date: '2026-10-05', marketplace: 'OZON', cabinet: 'IPCH', units: 1, gmv: 14990, is_live: true },
    { report_date: '2026-10-05', marketplace: 'WB', cabinet: 'IPCH', units: 2, gmv: 8990, is_live: true, orders: 2 },
  ];
  assert.deepEqual(unpackRows(packRows(source)), source);
});
test('columnar-v1 keeps source freshness fields as metadata', () => {
  const health = [{
    account_id: 'ozon_orange_ipch',
    last_success: '2026-10-05T18:41:00Z',
    source_data_at: '2026-10-04T19:00:00Z',
    freshness_state: 'no_new_commercial_events',
  }];
  assert.deepEqual(unpackRows(packRows(health)), health);
});

test('Orange n8n patch batches once and retries only snapshot nodes', async () => {
  const patch = JSON.parse(await readFile(
    new URL('../n8n/orange-data-refresh.snapshot-stage.patch.json', import.meta.url),
    'utf8',
  ));
  assert.equal(patch.productionApplied, false);
  assert.equal(patch.nodes.length, 2);
  for (const node of patch.nodes) {
    assert.equal(node.parameters.options.queryBatching, 'single');
    assert.equal(node.retryOnFail, true);
    assert.equal(node.maxTries, 3);
    assert.match(node.parameters.query, /refresh_live_snapshot_v2/);
    assert.doesNotMatch(node.parameters.query, /Ozon|ingest/i);
  }
});
