// -----------------------------------------------------------------------------
// The readers of the Pinchflat pages, on real pages of Pinchflat 2025.9.26
// (test/fixtures/pinchflat/: a source "jawed" with one video downloaded, one
// pending and one whose download failed), and the fake Pinchflat of the
// other tests, which must read the same.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decode,
  isPinchflatPage,
  parseSource,
  parseSources,
  parseVersion,
} from '../src/pinchflat/parse.js';
import { FakePinchflat, fixture } from './helpers/fakePinchflat.js';

const sourcesPage = fixture('sources');
const sourcePage = fixture('sources-1');

test('the /sources page: version, sources and their counts', () => {
  assert.ok(isPinchflatPage(sourcesPage));
  assert.equal(parseVersion(sourcesPage), '2025.9.26');
  assert.deepEqual(parseSources(sourcesPage), {
    version: '2025.9.26',
    sources: [{ id: '1', name: 'jawed', pending: 2, downloaded: 1 }],
  });
});

test('a source page: pending (with the yt-dlp error) and downloaded videos', () => {
  assert.deepEqual(parseSource(sourcePage), {
    name: 'jawed',
    pending: {
      total: 2,
      items: [
        {
          id: '3',
          sourceId: '1',
          title: 'Failing video',
          uploadDate: '2026-10-21',
          error: 'ERROR: [youtube] xxxxxxxxxx2: Video unavailable',
        },
        {
          id: '2',
          sourceId: '1',
          title: 'Pending <test> & video',
          uploadDate: '2026-10-20',
          error: null,
        },
      ],
    },
    downloaded: {
      total: 1,
      items: [
        { id: '1', sourceId: '1', title: 'Me at the zoo', uploadDate: '2005-04-24', error: null },
      ],
    },
  });
});

test('the fake Pinchflat of the tests reads like the real pages', () => {
  const fake = new FakePinchflat();
  fake.addSource(1, 'jawed');
  fake.download(fake.addVideo(1, 'Me at the zoo', { uploadDate: '2005-04-24' }));
  fake.addVideo(1, 'Pending <test> & video', { uploadDate: '2026-10-20' });
  fake.fail(
    fake.addVideo(1, 'Failing video', { uploadDate: '2026-10-21' }),
    'ERROR: [youtube] xxxxxxxxxx2: Video unavailable',
  );
  assert.deepEqual(parseSources(fake.renderSources()), parseSources(sourcesPage));
  assert.deepEqual(parseSource(fake.renderSource(fake.sources.get('1'))), parseSource(sourcePage));
});

test('an empty tab, a page that is not Pinchflat, entities', () => {
  const fake = new FakePinchflat();
  fake.addSource(4, 'Empty');
  assert.deepEqual(parseSource(fake.renderSource(fake.sources.get('4'))), {
    name: 'Empty',
    pending: { total: 0, items: [] },
    downloaded: { total: 0, items: [] },
  });
  assert.equal(isPinchflatPage('<html><title>Sonarr</title></html>'), false);
  assert.equal(isPinchflatPage(undefined), false);
  assert.deepEqual(parseSources('<title>Pinchflat</title>'), { version: null, sources: [] });
  assert.equal(parseSource('<title>Pinchflat</title>').pending, null);
  assert.equal(
    decode(' L&#39;été &amp; &lt;b&gt; &#x1F600; &unknown; '),
    "L'été & <b> 😀 &unknown;",
  );
});

test('more than 10 videos: the total counts them all, the page shows 10', () => {
  const fake = new FakePinchflat();
  fake.addSource(1, 'Big', { downloaded: 25 });
  const { downloaded } = parseSource(fake.renderSource(fake.sources.get('1')));
  assert.equal(downloaded.total, 25);
  assert.equal(downloaded.items.length, 10);
});
