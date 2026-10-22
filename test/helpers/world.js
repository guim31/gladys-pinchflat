// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Pinchflat on a fake
// network, a temporary /data and a manual clock, with the integration wired
// on top through registerHandlers. No timer runs unless `timers: true`: the
// tests read Pinchflat with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakePinchflat, createNetwork } from './fakePinchflat.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Paris';

export const PINCHFLAT_URL = 'http://192.0.2.20:8945';

/** A manual clock, the morning of the real captures (local time, Europe/Paris). */
export function createClock(start = Date.parse('2026-10-22T07:50:00+02:00')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { url: '192.0.2.20', language: 'en' };

/** A Pinchflat with two sources, one of them with a failed download. */
export function defaultPinchflat(options) {
  const pinchflat = new FakePinchflat(options);
  pinchflat.addSource(1, 'Blender Studio', { downloaded: 12, pending: 1 });
  pinchflat.addSource(2, 'Kurzgesagt', { downloaded: 3 });
  pinchflat.fail(pinchflat.addVideo(1, 'Broken upload', { uploadDate: '2026-10-19' }));
  return pinchflat;
}

/**
 * @param {object} [options]
 * @param {FakePinchflat} [options.pinchflat]
 * @param {object} [options.config] raw integration config
 */
export async function createWorld({
  clock = createClock(),
  pinchflat = defaultPinchflat(),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-pinchflat-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork({ [PINCHFLAT_URL]: pinchflat });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, pinchflat, app, hub: app.hub, clock, dataDir };
}

export const serverDevice = (gladys) => gladys.externalIds('server', 'main').device;
export const serverFeature = (gladys, key) => gladys.externalIds('server', 'main').feature(key);

export { FakePinchflat };
