// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only (a video downloaded or failed goes to debug, like any reading). A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never the password.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakePinchflat, createWorld, defaultPinchflat } from './helpers/world.js';

/** Capture the lines of the SDK logger at LOG_LEVEL=info. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => text.includes('connected')),
    'the start is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    // Videos indexed, pending sources read again: nothing to tell.
    w.pinchflat.addVideo(2, `Indexed ${i}`, { uploadDate: '2026-10-22' });
    w.clock.advance(20 * 60_000);
    await w.hub.pollAll();
  }
  assert.deepEqual(logs.texts(), []);
});

test('a video downloaded or failed is one line at debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  logs.clear();
  w.pinchflat.download(w.pinchflat.addVideo(2, 'Fresh one', { uploadDate: '2026-10-22' }));
  w.pinchflat.fail(w.pinchflat.addVideo(2, 'Blocked one', { uploadDate: '2026-10-22' }));
  await w.hub.pollAll();
  const news = logs.texts().filter((text) => /Pinchflat: download/.test(text));
  assert.equal(news.length, 2, logs.texts().join('\n'));
  assert.match(news[0], /\[DEBUG\].*downloaded "Fresh one" \(Kurzgesagt\)/);
  assert.match(news[1], /\[DEBUG\].*download failed for "Blocked one"/);
});

test('a server that stays down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.pinchflat.online = false;
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');
  logs.clear();
  w.pinchflat.online = true;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /connection restored/);
});

test('a refused password is logged once, never the password', async (t) => {
  const logs = captureLogs(t);
  const pinchflat = defaultPinchflat({ auth: { username: 'admin', password: 'right' } });
  const w = await world(t, {
    pinchflat,
    config: { url: '192.0.2.20', username: 'admin', password: 'wrong-pass-42' },
  });
  for (let i = 0; i < 5; i += 1) {
    await w.hub.pollAll();
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0].text, /refused/);
  assert.ok(!logs.texts().join('\n').includes('wrong-pass-42'), 'never the password');
});

test('a source page that fails is logged once, the rest keeps working', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  const original = w.pinchflat.handle.bind(w.pinchflat);
  w.pinchflat.handle = (url, options) =>
    url.endsWith('/sources/1') ? { status: 500, headers: {}, body: '' } : original(url, options);
  for (let i = 0; i < 4; i += 1) {
    w.pinchflat.addVideo(1, `Indexed ${i}`);
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /Source Blender Studio not read/);
  assert.equal(w.hub.error, null);
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.gladys.publishStates = async () => {
    throw new Error('HTTP 500');
  };
  for (let i = 0; i < 4; i += 1) {
    w.pinchflat.addVideo(2, `Indexed ${i}`);
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /States refused/);
});

test('LOG_LEVEL=debug shows each reading problem; never the password', async (t) => {
  const logs = captureLogs(t, 'debug');
  const pinchflat = new FakePinchflat({ auth: { username: 'admin', password: 'secret-77' } });
  const w = await world(t, {
    pinchflat,
    config: { url: '192.0.2.20', username: 'admin', password: 'secret-77' },
  });
  w.pinchflat.online = false;
  await w.hub.pollAll();
  await w.hub.pollAll();
  const text = logs.texts().join('\n');
  assert.match(text, /\[DEBUG\].*again/);
  assert.ok(!text.includes('secret-77'), 'never the password');
  assert.ok(!text.includes(Buffer.from('admin:secret-77').toString('base64')), 'nor its header');
});
