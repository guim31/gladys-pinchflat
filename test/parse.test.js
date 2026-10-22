// -----------------------------------------------------------------------------
// The readers of the Pinchflat pages, on real pages of Pinchflat 2025.9.26
// (test/fixtures/pinchflat/, kept raw: Prettier skips them): 12 sources, so
// /sources shows 10 and "Page 1 of 2"; the source "jawed" has two videos
// downloaded from YouTube, one pending and two whose download failed. The fake
// Pinchflat of the other tests must read the same.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decode,
  isPinchflatPage,
  parsePagination,
  parseProfileSources,
  parseProfiles,
  parseSource,
  parseSources,
  parseVersion,
} from '../src/pinchflat/parse.js';
import { FakePinchflat, fixture } from './helpers/fakePinchflat.js';

const sourcesPage = fixture('sources');
const sourcePage = fixture('sources-1');
const profilesPage = fixture('media_profiles');
const profilePage = fixture('media_profiles-1');

const testChannels = Array.from({ length: 11 }, (_, i) => ({
  id: String(i + 2),
  name: `Test channel ${String(i + 1).padStart(2, '0')}`,
}));

test('the /sources page: version, the first 10 sources and their counts', () => {
  assert.ok(isPinchflatPage(sourcesPage));
  assert.equal(parseVersion(sourcesPage), '2025.9.26');
  assert.deepEqual(parsePagination(sourcesPage), { page: 1, pages: 2 });
  assert.deepEqual(parseSources(sourcesPage), {
    version: '2025.9.26',
    complete: false,
    sources: [
      { id: '1', name: 'jawed', pending: 3, downloaded: 2 },
      ...testChannels.slice(0, 9).map((source) => ({ ...source, pending: 0, downloaded: 0 })),
    ],
  });
});

test('the media profiles give every source', () => {
  assert.deepEqual(parseProfiles(profilesPage), ['1']);
  assert.deepEqual(parseProfileSources(profilePage), [...testChannels, { id: '1', name: 'jawed' }]);
});

test('a source page: pending (with the yt-dlp errors) and downloaded videos', () => {
  assert.deepEqual(parseSource(sourcePage), {
    name: 'jawed',
    pending: {
      total: 3,
      items: [
        {
          id: '5',
          sourceId: '1',
          title: 'Gone video',
          uploadDate: '2026-10-22',
          error: 'ERROR: [youtube] zzzzzzzzzz9: This video is unavailable',
        },
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
      total: 2,
      items: [
        { id: '4', sourceId: '1', title: 'Big Buck Bunny', uploadDate: '2008-05-29', error: null },
        { id: '1', sourceId: '1', title: 'Me at the zoo', uploadDate: '2005-04-24', error: null },
      ],
    },
  });
});

test('the fake Pinchflat of the tests reads like the real pages', () => {
  const fake = new FakePinchflat();
  fake.addSource(1, 'jawed');
  for (const source of testChannels) {
    fake.addSource(source.id, source.name);
  }
  fake.nextMediaId = 1;
  fake.download(fake.addVideo(1, 'Me at the zoo', { uploadDate: '2005-04-24' }));
  fake.addVideo(1, 'Pending <test> & video', { uploadDate: '2026-10-20' });
  fake.fail(
    fake.addVideo(1, 'Failing video', { uploadDate: '2026-10-21' }),
    'ERROR: [youtube] xxxxxxxxxx2: Video unavailable',
  );
  fake.download(fake.addVideo(1, 'Big Buck Bunny', { uploadDate: '2008-05-29' }));
  fake.fail(
    fake.addVideo(1, 'Gone video', { uploadDate: '2026-10-22' }),
    'ERROR: [youtube] zzzzzzzzzz9: This video is unavailable',
  );
  assert.deepEqual(parseSources(fake.renderSources()), parseSources(sourcesPage));
  assert.deepEqual(parseSource(fake.renderSource(fake.sources.get('1'))), parseSource(sourcePage));
  assert.deepEqual(parseProfiles(fake.renderProfiles()), parseProfiles(profilesPage));
  assert.deepEqual(parseProfileSources(fake.renderProfile()), parseProfileSources(profilePage));
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
  assert.deepEqual(parseSources('<title>Pinchflat</title>'), {
    version: null,
    complete: true,
    sources: [],
  });
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
