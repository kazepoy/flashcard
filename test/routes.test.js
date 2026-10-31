import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeOf } from '../src/ui/ctx.js';

test('routes : adresse → page nommée', () => {
  const r = (hash) => routeOf(parseRoute(hash));
  assert.deepEqual(r('#/'), { page: 'library' });
  assert.deepEqual(r('#/inconnu'), { page: 'library' });
  assert.deepEqual(r('#/set/ABC'), { page: 'set', setId: 'ABC' });
  assert.deepEqual(r('#/set/ABC/edit/C1'), { page: 'edit', setId: 'ABC', cardId: 'C1' });
  assert.deepEqual(r('#/set/ABC/print'), { page: 'print', setId: 'ABC' });
  assert.deepEqual(r('#/set/ABC/study/review/more'), { page: 'study', setId: 'ABC', mode: 'review', variant: 'more' });
  assert.deepEqual(r('#/browse/tag%3Averbe/x'), { page: 'browse', query: 'tag:verbe/x' });
  assert.deepEqual(r('#/stats'), { page: 'stats', setId: null });
  assert.deepEqual(r('#/help'), { page: 'help' });
});
