// -----------------------------------------------------------------------------
// The hub against the fake Pinchflat: what each reading publishes, the scene
// events (once, and never for what was there before), the counter of the day,
// the retention, a restart, the limits per reading, the container's own timer,
// the scene action and "Test the connection".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { HUB_TIMINGS } from '../src/hub.js';
import {
  CONFIG,
  FakePinchflat,
  createClock,
  createWorld,
  defaultPinchflat,
  serverDevice,
  serverFeature,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);
const state = (w, key) => w.fake.lastState(serverFeature(w.gladys, key));

test('the first reading publishes the figures and announces nothing', async (t) => {
  const w = await world(t);
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(state(w, 'online'), 1);
  assert.equal(state(w, 'sources'), 2);
  assert.equal(state(w, 'pending'), 2);
  assert.equal(state(w, 'errors'), 1);
  assert.equal(state(w, 'downloaded'), 15);
  assert.equal(state(w, 'downloaded_today'), 0);
  // The widget and the last video are filled from the latest uploads.
  assert.equal(w.hub.recent().length, 10);
  assert.equal(state(w, 'last_video'), 'Blender Studio archive 9 (Blender Studio)');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.deepEqual(w.fake.transports, [
    { device_external_id: serverDevice(w.gladys), transport: DEVICE_TRANSPORTS.LOCAL },
  ]);
});

test('a new video downloaded fires video_downloaded once, with its details', async (t) => {
  const w = await world(t);
  const id = w.pinchflat.addVideo(2, 'Why the Sun shines', { uploadDate: '2026-10-22' });
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'video_downloaded'), [], 'indexed is not downloaded');
  w.pinchflat.download(id);
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'video_downloaded'), [
    {
      key: 'video_downloaded',
      data: {
        source: 'Kurzgesagt',
        title: 'Why the Sun shines',
        upload_date: '2026-10-22',
        url: 'http://192.0.2.20:8945/sources/2/media/' + id,
        downloaded_today: 1,
      },
    },
  ]);
  assert.equal(state(w, 'downloaded_today'), 1);
  assert.equal(state(w, 'last_video'), 'Why the Sun shines (Kurzgesagt)');
  assert.equal(w.hub.recent()[0].title, 'Why the Sun shines');
  assert.ok(w.fake.widgetRefreshes.includes('latest_videos'));
});

test('a restart announces nothing twice, and keeps the counter of the day', async (t) => {
  const first = await createWorld();
  first.pinchflat.download(first.pinchflat.addVideo(2, 'Fresh', { uploadDate: '2026-10-22' }));
  await first.hub.pollAll();
  assert.equal(events(first, 'video_downloaded').length, 1);
  await first.app.stop();

  const again = await world(t, {
    pinchflat: first.pinchflat,
    dataDir: first.dataDir,
    clock: first.clock,
  });
  await again.hub.pollAll();
  assert.deepEqual(again.fake.sceneEvents, []);
  assert.equal(state(again, 'downloaded_today'), 1);
  assert.equal(state(again, 'last_video'), 'Fresh (Kurzgesagt)');
});

test('the counter of the day restarts at local midnight', async (t) => {
  const clock = createClock(Date.parse('2026-10-22T23:50:00+02:00'));
  const w = await world(t, { clock });
  w.pinchflat.download(w.pinchflat.addVideo(2, 'Late', { uploadDate: '2026-10-22' }));
  await w.hub.pollAll();
  assert.equal(state(w, 'downloaded_today'), 1);
  clock.advance(15 * 60_000); // 00:05 local time
  await w.hub.pollAll();
  assert.equal(state(w, 'downloaded_today'), 0);
  w.pinchflat.download(w.pinchflat.addVideo(2, 'Early', { uploadDate: '2026-10-23' }));
  await w.hub.pollAll();
  assert.equal(state(w, 'downloaded_today'), 1);
  assert.equal(events(w, 'video_downloaded').at(-1).data.downloaded_today, 1);
});

test('the retention deletes videos: no event, the counter of the day does not move', async (t) => {
  const pinchflat = new FakePinchflat();
  pinchflat.addSource(1, 'Daily news', { downloaded: 14 });
  const w = await world(t, { pinchflat });
  // The newest one goes: an older one, never seen, comes into the first page.
  const newest = pinchflat.lists(pinchflat.sources.get('1')).downloaded[0].id;
  pinchflat.remove(newest);
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(state(w, 'downloaded'), 13);
  assert.equal(state(w, 'downloaded_today'), 0);
});

test('an old video of a backfill is counted, not named', async (t) => {
  const pinchflat = new FakePinchflat();
  pinchflat.addSource(1, 'Archive', { downloaded: 12 });
  const old = pinchflat.addVideo(1, 'From 2010', { uploadDate: '2010-01-01' });
  const w = await world(t, { pinchflat });
  pinchflat.download(old);
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, [], 'not in the first page: no title to give');
  assert.equal(state(w, 'downloaded_today'), 1);
});

test('a new source added in Pinchflat is read without announcing its videos', async (t) => {
  const w = await world(t);
  w.pinchflat.addSource(3, 'Veritasium', { downloaded: 5 });
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(state(w, 'sources'), 3);
  assert.equal(state(w, 'downloaded_today'), 0);
  w.pinchflat.download(w.pinchflat.addVideo(3, 'Brand new', { uploadDate: '2026-10-22' }));
  await w.hub.pollAll();
  assert.equal(events(w, 'video_downloaded')[0].data.source, 'Veritasium');
});

test('a failed download fires download_failed once, a success clears the error', async (t) => {
  const w = await world(t);
  const id = w.pinchflat.addVideo(2, 'Members only', { uploadDate: '2026-10-22' });
  await w.hub.pollAll();
  // The failure does not change the counts: it is seen at the next reading of the page.
  w.pinchflat.fail(id, 'ERROR: [youtube] abc: Join this channel to get access');
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'download_failed'), []);
  w.clock.advance(HUB_TIMINGS.detailMs);
  await w.hub.pollAll();
  w.clock.advance(HUB_TIMINGS.detailMs);
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'download_failed'), [
    {
      key: 'download_failed',
      data: {
        source: 'Kurzgesagt',
        title: 'Members only',
        error: 'ERROR: [youtube] abc: Join this channel to get access',
        url: 'http://192.0.2.20:8945/sources/2/media/' + id,
      },
    },
  ]);
  assert.equal(state(w, 'errors'), 2);
  w.pinchflat.download(id);
  await w.hub.pollAll();
  assert.equal(state(w, 'errors'), 1);
  assert.equal(events(w, 'video_downloaded').length, 1);
});

test('more than 10 sources: all are listed, at most 10 pages per reading', async (t) => {
  const pinchflat = new FakePinchflat();
  for (let id = 1; id <= 25; id += 1) {
    pinchflat.addSource(id, `Channel ${String(id).padStart(2, '0')}`, { downloaded: 1 });
  }
  const w = await world(t, { pinchflat });
  const pages = () => pinchflat.requests.filter((r) => /^\/sources\/\d+$/.test(r.path));
  assert.equal(pages().length, 10);
  assert.equal(state(w, 'sources'), 25, '/sources only shows 10: the profiles list them all');
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(pages().length, 30);
  assert.equal(new Set(pages().map((r) => r.path)).size, 25, 'every source read once');
  assert.equal(state(w, 'downloaded'), 25);
  assert.deepEqual(w.fake.sceneEvents, [], 'seeded, not announced');
});

test('a source beyond the first page: its download is announced in turn, counted once', async (t) => {
  const pinchflat = new FakePinchflat();
  for (let id = 1; id <= 15; id += 1) {
    pinchflat.addSource(id, `Channel ${String(id).padStart(2, '0')}`, { downloaded: 1 });
  }
  const w = await world(t, { pinchflat });
  await w.hub.pollAll(); // every source seeded
  pinchflat.download(pinchflat.addVideo(15, 'Far away', { uploadDate: '2026-10-22' }));
  for (let i = 0; i < 3; i += 1) {
    await w.hub.pollAll();
  }
  assert.deepEqual(
    events(w, 'video_downloaded').map((event) => [event.data.source, event.data.title]),
    [['Channel 15', 'Far away']],
  );
  assert.equal(state(w, 'downloaded_today'), 1);
  assert.equal(state(w, 'downloaded'), 16);
});

test('a source page that fails while its counts moved is read again later', async (t) => {
  const w = await world(t);
  const original = w.pinchflat.handle.bind(w.pinchflat);
  let broken = true;
  w.pinchflat.handle = (url, options) =>
    broken && url.endsWith('/sources/2')
      ? { status: 504, headers: {}, body: '' }
      : original(url, options);
  w.pinchflat.download(w.pinchflat.addVideo(2, 'Late news', { uploadDate: '2026-10-22' }));
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'video_downloaded'), []);
  broken = false;
  await w.hub.pollAll();
  assert.equal(events(w, 'video_downloaded').length, 1);
});

test('a failure pushed off the first page by newer videos is not announced twice', async (t) => {
  const w = await world(t);
  const members = w.pinchflat.addVideo(2, 'Members only', { uploadDate: '2026-10-01' });
  w.pinchflat.fail(members);
  await w.hub.pollAll();
  assert.equal(events(w, 'download_failed').length, 1);
  const newer = [];
  for (let i = 0; i < 11; i += 1) {
    newer.push(w.pinchflat.addVideo(2, `Newer ${i}`, { uploadDate: '2026-10-21' }));
  }
  await w.hub.pollAll();
  for (const id of newer) {
    w.pinchflat.download(id);
  }
  await w.hub.pollAll();
  assert.equal(events(w, 'download_failed').length, 1);
});

test('at most 10 events of a kind per reading', async (t) => {
  const w = await world(t);
  const fresh = [];
  for (let i = 0; i < 9; i += 1) {
    fresh.push(w.pinchflat.addVideo(2, `Burst ${i}`, { uploadDate: `2026-10-2${i % 3}` }));
    fresh.push(w.pinchflat.addVideo(1, `Burst B${i}`, { uploadDate: `2026-10-2${i % 3}` }));
  }
  for (const id of fresh) {
    w.pinchflat.download(id);
  }
  await w.hub.pollAll();
  assert.equal(events(w, 'video_downloaded').length, 10);
  assert.equal(state(w, 'downloaded_today'), 18);
});

test('Pinchflat down: offline, unreachable, the counts are not republished as fresh', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  w.pinchflat.online = false;
  await w.hub.pollAll();
  assert.equal(state(w, 'online'), 0);
  assert.equal(w.fake.states.length, before + 1, 'only "online" moves');
  assert.equal(w.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  w.pinchflat.online = true;
  await w.hub.pollAll();
  assert.equal(state(w, 'online'), 1);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('a protected interface: the basic authentication is sent, a refusal explained', async (t) => {
  const auth = { username: 'admin', password: 'p4ss' };
  const ok = await world(t, {
    pinchflat: defaultPinchflat({ auth }),
    config: { ...CONFIG, username: 'admin', password: 'p4ss' },
  });
  assert.equal(state(ok, 'online'), 1);
  const refused = await world(t, { pinchflat: defaultPinchflat({ auth }) });
  assert.equal(refused.fake.connectionStatus.connected, false);
  assert.match(refused.fake.connectionStatus.message.en, /User name or password/);
});

test('an address that is not Pinchflat is told apart', async (t) => {
  const pinchflat = defaultPinchflat();
  pinchflat.handle = () => ({ status: 200, headers: {}, body: '<title>Sonarr</title>' });
  const w = await world(t, { pinchflat });
  assert.match(w.fake.connectionStatus.message.en, /No Pinchflat at this address/);
});

test('no address: no device, a message under the integration name', async (t) => {
  const w = await world(t, { config: {} });
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.match(w.fake.connectionStatus.message.en, /Enter the address/);
  const invalid = await world(t, { config: { url: 'http://[bad' } });
  assert.match(invalid.fake.connectionStatus.message.en, /not valid/);
});

test('another server: what the first one had is not news', async (t) => {
  const w = await world(t);
  const other = defaultPinchflat();
  other.download(other.addVideo(2, 'Elsewhere', { uploadDate: '2026-10-22' }));
  w.network.servers['http://192.0.2.21:8945'] = other;
  await w.fake.configUpdated({ ...CONFIG, url: '192.0.2.21' });
  await w.hub.pollAll();
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(state(w, 'downloaded_today'), 0);
});

test('adding the device in Gladys republishes every state and refreshes the widget', async (t) => {
  const w = await world(t);
  const device = w.fake.discoveredDevices[0];
  const before = w.fake.states.length;
  await w.fake.deviceCreated(device);
  assert.equal(w.fake.states.length - before, device.features.length);
  assert.ok(w.fake.widgetRefreshes.includes('latest_videos'));
});

test('an unchanged value is republished every 12 hours (heartbeat)', async (t) => {
  const w = await world(t);
  const count = () => w.fake.states.length;
  const before = count();
  await w.hub.pollAll();
  assert.equal(count(), before);
  w.clock.advance(HUB_TIMINGS.heartbeatMs);
  await w.hub.pollAll();
  assert.ok(count() > before);
});

test('the container reads Pinchflat on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await world(t, { timers: true });
  const reads = () => w.pinchflat.requests.filter((r) => r.path === '/sources').length;
  assert.equal(reads(), 1);
  w.pinchflat.download(w.pinchflat.addVideo(2, 'On time', { uploadDate: '2026-10-22' }));
  t.mock.timers.tick(120_000);
  await w.hub.polling;
  assert.equal(reads(), 2);
  assert.equal(events(w, 'video_downloaded').length, 1);
  t.mock.timers.tick(120_000);
  await w.hub.polling;
  assert.equal(reads(), 3);
});

test('the scene action reads now and gives the sentence and the figures', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  w.pinchflat.download(w.pinchflat.addVideo(2, 'Le Soleil', { uploadDate: '2026-10-22' }));
  const ack = await w.fake.sceneAction('read_latest', { count: '1' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    summary:
      "Pinchflat : 1 vidéo téléchargée aujourd'hui ; dernières : « Le Soleil » (Kurzgesagt). 2 en attente, 1 en erreur.",
    downloaded_today: 1,
    pending: 2,
    errors: 1,
    last_title: 'Le Soleil',
    last_source: 'Kurzgesagt',
  });
  const three = await w.fake.sceneAction('read_latest', {});
  assert.equal(three.data.outputs.summary.match(/«/g).length, 3);
});

test('the scene action without a server, or with Pinchflat down', async (t) => {
  const empty = await world(t, { config: { language: 'en' } });
  const ack = await empty.fake.sceneAction('read_latest', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /Enter the address/);
  const w = await world(t);
  w.pinchflat.online = false;
  const down = await w.fake.sceneAction('read_latest', {});
  assert.equal(down.data.outputs.summary, 'Pinchflat does not answer.');
  assert.equal(down.data.outputs.last_title, '');
});

test('"Test the connection" reports the version and the figures', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(
    ack.data.message.en,
    'OK, Pinchflat 2025.9.26, 2 source(s), 2 video(s) pending, 1 in error',
  );
  w.pinchflat.online = false;
  const down = await w.fake.action('test_connection', {});
  assert.match(down.data.message.fr, /ne répond pas/);
});
