// -----------------------------------------------------------------------------
// The `latest_videos` widget: content valid for the core (budget, vocabulary),
// in every language, before and after a download, and its messages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FakePinchflat, createWorld } from './helpers/world.js';
import { videoItem } from '../src/widgets.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const get = async (w, language = 'en') => {
  const ack = await w.fake.widgetGet('latest_videos', { settings: {}, language });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(validateWidgetContent(ack.data.content), [], JSON.stringify(ack.data));
  return ack.data.content.components;
};

test('the widget shows the figures and the latest videos, in every language', async (t) => {
  const w = await world(t);
  w.pinchflat.download(w.pinchflat.addVideo(2, 'x'.repeat(80), { uploadDate: '2026-10-22' }));
  await w.hub.pollAll();
  for (const language of ['en', 'fr', 'de', 'es']) {
    const components = await get(w, language);
    assert.ok(components.length <= 8);
    assert.ok(components.filter((c) => c.type === 'text').length <= 2);
    assert.deepEqual(
      components.filter((c) => c.type === 'value').map((c) => c.value),
      [1, 2, 1],
    );
    const list = components.find((c) => c.type === 'card-list');
    assert.equal(list.items.length, 8);
    assert.equal(list.items[0].title.length, 60);
    assert.equal(list.items[0].subtitle, 'Kurzgesagt');
    assert.equal(list.items[0].date, new Date(w.clock.now()).toISOString());
  }
});

test('no video yet: a sentence instead of the list', async (t) => {
  const w = await world(t, { pinchflat: new FakePinchflat() });
  const components = await get(w, 'de');
  assert.equal(components.at(-1).text, 'Noch kein Video heruntergeladen.');
});

test('no server, or a server down: a message instead of figures', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match((await get(empty))[0].text, /address of your Pinchflat server/);
  const w = await world(t);
  w.pinchflat.online = false;
  await w.hub.pollAll();
  const components = await get(w, 'fr');
  assert.equal(components[0].items[0].value, 'Hors ligne');
});

test('a row without a date or a source stays valid', () => {
  assert.deepEqual(videoItem({ title: 'Lonely', uploadDate: null, at: null }), {
    title: 'Lonely',
  });
});
