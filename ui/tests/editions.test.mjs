import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initEditions, getAvailableDates, getActiveDate, getActiveRepos,
  getDigest, canSwitchTo, setActiveEdition, adjacentDate, editionSummary,
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

test('editionSummary: a Digest with precomputed stats and evaluatedCount is trusted as-is', async () => {
  globalThis.window = { REPORADAR_DIGESTS: {
    '2026-09-01': {
      repos: [{ verdict: 'fit' }],
      evaluatedCount: 12,
      stats: { fit: 3, maybe: 4, notFit: 5, total: 12 },
    },
  } };
  await initEditions();
  assert.deepEqual(editionSummary('2026-09-01'), {
    count: 12,
    stats: { fit: 3, maybe: 4, notFit: 5, total: 12 },
  });
});

test('editionSummary: a Digest without stats or evaluatedCount counts its Repos', async () => {
  globalThis.window = { REPORADAR_DIGESTS: {
    '2026-09-01': { repos: [{ verdict: 'fit' }, { verdict: 'maybe' }, { verdict: 'bogus' }] },
    '2026-09-02': { repos: [] },
  } };
  await initEditions();
  assert.deepEqual(editionSummary('2026-09-01'), {
    count: 3,
    stats: { fit: 1, maybe: 1, notFit: 1, total: 3 },
  });
  assert.deepEqual(editionSummary('2026-09-02'), {
    count: 0,
    stats: { fit: 0, maybe: 0, notFit: 0, total: 0 },
  });
});

test('editionSummary: partial Digest stats fill the gaps with zero and the Repo total', async () => {
  globalThis.window = { REPORADAR_DIGESTS: {
    '2026-09-01': { repos: [{ verdict: 'fit' }, { verdict: 'fit' }], stats: { fit: 2 } },
  } };
  await initEditions();
  assert.deepEqual(editionSummary('2026-09-01'), {
    count: 2,
    stats: { fit: 2, maybe: 0, notFit: 0, total: 2 },
  });
});

test('editionSummary: without a Digest, the fallback Repos are counted', async () => {
  globalThis.window = {};
  await initEditions();
  assert.deepEqual(editionSummary(getActiveDate()), {
    count: 8,
    stats: { fit: 4, maybe: 2, notFit: 2, total: 8 },
  });
});
