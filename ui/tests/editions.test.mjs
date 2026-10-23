import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initEditions, getAvailableDates, getActiveDate, getActiveRepos,
  getDigest, canSwitchTo, setActiveEdition, adjacentDate,
} from '../js/editions.js';

const digests = {
  '2026-09-03': { repos: [{ id: 'a/b' }], stats: { fit: 1 } },
  '2026-09-01': { repos: [] },
  '2026-09-02': { repos: [{ id: 'c/d' }, { id: 'e/f' }] },
};

beforeEach(() => { delete globalThis.window; });

test('with a Digest, dates are sorted and the latest Edition is active', async () => {
  globalThis.window = { REPORADAR_DIGESTS: digests };
  await initEditions();
  assert.deepEqual(getAvailableDates(), ['2026-09-01', '2026-09-02', '2026-09-03']);
  assert.equal(getActiveDate(), '2026-09-03');
  assert.deepEqual(getActiveRepos(), [{ id: 'a/b' }]);
  assert.equal(getDigest('2026-09-02'), digests['2026-09-02']);
});

test('switching to an empty Edition yields no Repos; unknown dates are refused', async () => {
  globalThis.window = { REPORADAR_DIGESTS: digests };
  await initEditions();
  assert.equal(canSwitchTo('2026-09-03'), false);
  assert.equal(canSwitchTo('1999-01-01'), false);
  assert.equal(canSwitchTo('2026-09-01'), true);
  setActiveEdition('2026-09-01');
  assert.equal(getActiveDate(), '2026-09-01');
  assert.deepEqual(getActiveRepos(), []);
});

test('adjacentDate steps through Editions and stops at either end', async () => {
  globalThis.window = { REPORADAR_DIGESTS: digests };
  await initEditions();
  assert.equal(adjacentDate(1), null);
  assert.equal(adjacentDate(-1), '2026-09-02');
  setActiveEdition('2026-09-01');
  assert.equal(adjacentDate(-1), null);
  assert.equal(adjacentDate(1), '2026-09-02');
});

test('without a Digest, the fallback Repos load as a single Edition', async () => {
  globalThis.window = {};
  await initEditions();
  assert.deepEqual(getAvailableDates(), ['2026-09-02']);
  assert.equal(getActiveDate(), '2026-09-02');
  assert.equal(getActiveRepos().length, 8);
  assert.equal(getDigest('2026-09-02'), null);
});

test('an empty Digest also falls back', async () => {
  globalThis.window = { REPORADAR_DIGESTS: {} };
  await initEditions();
  assert.equal(getActiveRepos().length, 8);
});
