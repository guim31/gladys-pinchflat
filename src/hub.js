// -----------------------------------------------------------------------------
// The hub: reads Pinchflat on a timer of the container (the interval chosen in
// the configuration), publishes the states of the server device when they
// change, fires the scene events, and answers the scene action, the widget
// and "Test the connection".
//
// Each reading gets /sources (counts of every source). A source page
// (/sources/<id>: its 10 latest pending and downloaded videos) is read only
// when its counts moved, when it was never read, or every 15 minutes while it
// has pending videos (to see the failed downloads), at most 10 pages per
// reading: a Pinchflat with 300 channels is not read 300 times a minute.
//
// Gladys never polls this device (should_poll: false): the scene events must
// fire even when the device was not added, and a device created without
// should_poll is never polled by Gladys 5.2 anyway.
//
// Scene events:
//   - video_downloaded: the downloaded count of a source grew, and a video
//     never seen before is among its latest downloaded ones (Pinchflat lists
//     them by upload date: an old video of a backfill is counted, not named);
//   - download_failed: a pending video shows a download error not seen yet.
// What was seen is kept under /data, so a restart announces nothing twice; the
// first reading of a source (or of a new server) announces nothing.
// No webhook: the sandbox has no inbound port.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { ERROR_KINDS, PinchflatClient } from './pinchflat/client.js';
import { FEATURE_KEYS, buildServer, featureValues, serverIds } from './devices.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  SUMMARY_TEXT,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'pinchflat-hub' });

export const WIDGET_KEY = 'latest_videos';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  VIDEO_DOWNLOADED: 'video_downloaded',
  DOWNLOAD_FAILED: 'download_failed',
});

export const HUB_TIMINGS = {
  // A source with pending videos is read again this often (failed downloads).
  detailMs: 15 * 60_000,
  // At most this many source pages per reading; the others wait their turn.
  maxDetailsPerRead: 10,
  // At most this many events of each kind per reading.
  maxEventsPerRead: 10,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
};

// Videos remembered per source (ids seen downloaded), and in the recent list.
const KNOWN_PER_SOURCE = 100;
export const RECENT_SIZE = 10;

/** The local date (TZ of Gladys, injected by the supervisor), `YYYY-MM-DD`. */
export const localDate = (ms) => {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const ids = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []);

export class CommandError extends Error {}

export class PinchflatHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/pinchflat/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    this.server = this.emptyServer();
    this.error = null;
    this.devicesKey = null;
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    this.transport = null;
    this.connection = null;
    this.saved = this.emptySaved(null);
    this.pollTimer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  emptyServer() {
    return { reachable: null, version: null, sources: [] };
  }

  emptySaved(url) {
    return { url, sources: {}, today: { date: null, count: 0 }, recent: [] };
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const sources = {};
    for (const [id, entry] of Object.entries(saved.sources ?? {})) {
      if (entry && typeof entry === 'object') {
        sources[id] = {
          name: typeof entry.name === 'string' ? entry.name : '',
          downloaded: Number.isInteger(entry.downloaded) ? entry.downloaded : 0,
          pending: Number.isInteger(entry.pending) ? entry.pending : 0,
          readAt: Number.isFinite(entry.readAt) ? entry.readAt : 0,
          readDownloaded: Number.isInteger(entry.readDownloaded) ? entry.readDownloaded : null,
          known: ids(entry.known),
          failed: ids(entry.failed),
          errors: Number.isInteger(entry.errors) ? entry.errors : 0,
        };
      }
    }
    this.saved = {
      url: typeof saved.url === 'string' ? saved.url : null,
      sources,
      today:
        saved.today && typeof saved.today.date === 'string' && Number.isInteger(saved.today.count)
          ? { date: saved.today.date, count: saved.today.count }
          : { date: null, count: 0 },
      recent: Array.isArray(saved.recent)
        ? saved.recent
            .filter((item) => item && typeof item.title === 'string')
            .slice(0, RECENT_SIZE)
        : [],
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transport = null;
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    const signature = JSON.stringify([config.url, config.username, config.password]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.client = config.url
        ? new PinchflatClient({
            url: config.url,
            username: config.username,
            password: config.password,
            request: this.request,
          })
        : null;
      this.error = null;
      this.server = this.emptyServer();
      if (config.url && this.saved.url !== config.url) {
        // Another server: its videos are new, not news.
        this.saved = this.emptySaved(config.url);
        this.store.save(this.saved);
      }
    }
    this.devicesKey = null; // the language may have changed
    try {
      await this.refresh();
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Poll failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Devices ---------------------------------------------------------------

  devices() {
    return this.client ? [buildServer(this.gladys, this.config)] : [];
  }

  /** Publish the device when it changed (name, language). */
  async publishDevices({ force = false } = {}) {
    const devices = this.devices();
    const key = JSON.stringify(devices);
    if (!force && key === this.devicesKey) {
      return;
    }
    try {
      // Even an empty list: the Discovery tab then shows no stale device.
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
      this.resolved('discovery');
    } catch (err) {
      this.problem('discovery', `Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Pinchflat, publish the device again. */
  async rediscover() {
    await this.refresh();
    await this.publishDevices({ force: true });
  }

  /** The user added the device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.client || device.external_id !== serverIds(this.gladys).device) {
      return;
    }
    await this.publishStates({ force: true });
    this.transport = null;
    await this.publishTransport();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Reading Pinchflat -----------------------------------------------------

  /** Read Pinchflat and apply what changed. Concurrent calls share the read. */
  pollAll() {
    this.polling ??= this.readAll().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  /** A reading that starts after this call (a scene action wants fresh figures). */
  async refresh() {
    if (this.polling) {
      await this.polling.catch(() => {});
    }
    return this.pollAll();
  }

  /** Gladys asks for a refresh (onPoll): read Pinchflat now. */
  async pollDevice(device) {
    if (this.client && device.external_id === serverIds(this.gladys).device) {
      await this.pollAll();
    }
  }

  async readAll() {
    if (!this.client) {
      await this.publishDevices();
      await this.publishConnectionStatus();
      return;
    }
    const client = this.client;
    const before = this.widgetView();
    try {
      const list = await client.sources();
      if (client !== this.client) {
        return; // reconfigured meanwhile
      }
      await this.applySources(client, list);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      if (client !== this.client) {
        return;
      }
      this.applyFailure(err);
    }
    await this.publishDevices();
    await this.publishStates();
    await this.publishTransport();
    await this.publishConnectionStatus();
    if (this.widgetView() !== before) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async applySources(client, { version, sources }) {
    const previous = this.server;
    if (this.error) {
      logger.info(`Pinchflat ${this.config.url}: connection restored`);
    } else if (previous.reachable === null) {
      logger.info(
        `Pinchflat ${this.config.url}: connected, version ${version ?? 'unknown'}, ${sources.length} source(s)`,
      );
    }
    this.error = null;
    this.server = { reachable: true, version, sources };

    const now = this.now();
    const saved = this.saved;
    const today = localDate(now);
    if (saved.today.date !== today) {
      saved.today = { date: today, count: 0 };
    }

    // Counts first: the videos of today, and which source pages are due.
    const due = [];
    const listed = new Set();
    for (const source of sources) {
      listed.add(source.id);
      const entry = saved.sources[source.id];
      if (!entry) {
        saved.sources[source.id] = {
          name: source.name,
          downloaded: source.downloaded,
          pending: source.pending,
          readAt: 0,
          readDownloaded: null,
          known: [],
          failed: [],
          errors: 0,
        };
        due.push({ source, priority: 1 });
        continue;
      }
      if (source.downloaded > entry.downloaded) {
        saved.today.count += source.downloaded - entry.downloaded;
      }
      const moved = source.downloaded > entry.downloaded || source.pending !== entry.pending;
      entry.name = source.name;
      entry.downloaded = source.downloaded;
      entry.pending = source.pending;
      if (source.pending === 0) {
        // No pending video, no failed one.
        entry.failed = [];
        entry.errors = 0;
      }
      if (!entry.readAt || entry.readDownloaded === null) {
        due.push({ source, priority: 1 });
      } else if (moved) {
        due.push({ source, priority: 0 });
      } else if (source.pending > 0 && now - entry.readAt >= this.timings.detailMs) {
        due.push({ source, priority: 2, at: entry.readAt });
      }
    }
    for (const id of Object.keys(saved.sources)) {
      if (!listed.has(id)) {
        delete saved.sources[id]; // deleted in Pinchflat
      }
    }

    // Source pages: the ones that moved first, then the new ones, then the oldest read.
    due.sort((a, b) => a.priority - b.priority || (a.at ?? 0) - (b.at ?? 0));
    const events = { downloaded: [], failed: [] };
    for (const { source } of due.slice(0, this.timings.maxDetailsPerRead)) {
      let detail;
      try {
        detail = await client.source(source.id);
        this.resolved(`source:${source.id}`);
      } catch (err) {
        if (!err.kind) {
          throw err;
        }
        if (client !== this.client) {
          return;
        }
        this.problem(`source:${source.id}`, `Source ${source.name} not read: ${err.message}`);
        continue;
      }
      if (client !== this.client) {
        return;
      }
      this.applySource(client, source, detail, events, now);
    }

    const max = this.timings.maxEventsPerRead;
    for (const video of events.downloaded.slice(-max)) {
      logger.debug(`Pinchflat: downloaded "${video.title}" (${video.source})`);
      await this.fire(TRIGGERS.VIDEO_DOWNLOADED, {
        source: video.source,
        title: video.title,
        upload_date: video.uploadDate ?? '',
        url: video.url,
        downloaded_today: saved.today.count,
      });
    }
    for (const video of events.failed.slice(-max)) {
      logger.debug(`Pinchflat: download failed for "${video.title}" (${video.source})`);
      await this.fire(TRIGGERS.DOWNLOAD_FAILED, {
        source: video.source,
        title: video.title,
        error: video.error.slice(0, 1000),
        url: video.url,
      });
    }
    this.store.save(saved);
  }

  /** Apply one source page: new downloads, new failures, recent list. */
  applySource(client, source, detail, events, now) {
    const entry = this.saved.sources[source.id];
    const firstRead = entry.readDownloaded === null;
    const known = new Set(entry.known);
    const failed = new Set(entry.failed);
    const name = source.name;

    const downloaded = detail.downloaded.items;
    const fresh = downloaded.filter((item) => !known.has(item.id));
    if (!firstRead) {
      // Only as many new videos as the count grew: a video deleted by the
      // retention makes an older one appear in the first page, it is not new.
      const growth = Math.max(0, detail.downloaded.total - entry.readDownloaded);
      // Oldest upload first, the order they most likely arrived in.
      const announced = fresh.slice(0, growth).reverse();
      for (const item of announced) {
        const video = {
          id: item.id,
          sourceId: source.id,
          source: name,
          title: item.title,
          uploadDate: item.uploadDate,
          url: client.mediaUrl(source.id, item.id),
          at: now,
        };
        events.downloaded.push(video);
        this.addRecent(video);
      }
    } else {
      // First reading: the latest videos fill the widget, nothing is announced.
      for (const item of downloaded) {
        this.addRecent({
          id: item.id,
          sourceId: source.id,
          source: name,
          title: item.title,
          uploadDate: item.uploadDate,
          at: null,
        });
      }
    }
    entry.known = [...new Set([...downloaded.map((item) => item.id), ...entry.known])].slice(
      0,
      KNOWN_PER_SOURCE,
    );
    // The counts of /sources stay the reference of the counter of the day.
    entry.readDownloaded = detail.downloaded.total;

    const errored = detail.pending.items.filter((item) => item.error);
    if (!firstRead) {
      for (const item of errored) {
        if (!failed.has(item.id)) {
          events.failed.push({
            source: name,
            title: item.title,
            error: item.error,
            url: client.mediaUrl(source.id, item.id),
          });
        }
      }
    }
    entry.failed = errored.map((item) => item.id);
    entry.errors = errored.length;
    entry.readAt = now;
  }

  addRecent(video) {
    const sortKey = (item) => item.at ?? (Date.parse(item.uploadDate ?? '') || 0);
    const others = this.saved.recent.filter(
      (item) => !(item.id === video.id && item.sourceId === video.sourceId),
    );
    const { url: _url, ...kept } = video;
    this.saved.recent = [kept, ...others]
      .sort((a, b) => sortKey(b) - sortKey(a))
      .slice(0, RECENT_SIZE);
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.server = { ...this.server, reachable: false };
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Pinchflat ${this.config.url}: ${err.message}`);
    } else {
      logger.debug(`Pinchflat ${this.config.url}: ${err.message} (again)`);
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Figures ------------------------------------------------------------------

  totals() {
    const sources = this.server.sources ?? [];
    const today = this.saved.today.date === localDate(this.now()) ? this.saved.today.count : 0;
    return {
      sources: sources.length,
      pending: sources.reduce((sum, source) => sum + source.pending, 0),
      downloaded: sources.reduce((sum, source) => sum + source.downloaded, 0),
      errors: sources.reduce(
        (sum, source) => sum + (this.saved.sources[source.id]?.errors ?? 0),
        0,
      ),
      downloadedToday: today,
    };
  }

  /** The recent videos, newest first. */
  recent() {
    return this.saved.recent;
  }

  /** What the widget shows: a change asks Gladys to reload it. */
  widgetView() {
    return JSON.stringify([
      this.server.reachable,
      this.error?.kind ?? null,
      this.server.reachable ? this.totals() : null,
      this.saved.recent.map((item) => [item.sourceId, item.id]),
    ]);
  }

  // --- Publishing to Gladys --------------------------------------------------

  snapshot() {
    if (!this.server.reachable) {
      return { reachable: this.server.reachable };
    }
    const totals = this.totals();
    const last = this.saved.recent[0];
    return {
      reachable: true,
      ...totals,
      lastVideo: last ? `${last.title} (${last.source})`.slice(0, 250) : null,
    };
  }

  async publishStates({ force = false } = {}) {
    if (!this.client) {
      return;
    }
    const now = this.now();
    const down = this.server.reachable === false;
    const states = [];
    for (const { key, externalId, value, text } of featureValues(
      serverIds(this.gladys),
      this.snapshot(),
    )) {
      if (value === null) {
        continue;
      }
      const last = this.published.get(externalId);
      // While Pinchflat is down, its last counts are not republished as fresh.
      const stale = down && key !== FEATURE_KEYS.ONLINE;
      const fresh =
        last && last.value === value && (stale || now - last.at < this.timings.heartbeatMs);
      if (!force && fresh) {
        continue;
      }
      states.push(
        text
          ? { device_feature_external_id: externalId, text: String(value) }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, {
          value: state.text ?? state.state,
          at: now,
        });
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async publishTransport() {
    if (!this.client || this.server.reachable === null) {
      return;
    }
    const value = this.server.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    if (this.transport === value) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: serverIds(this.gladys).device, transport: value },
      ]);
      this.transport = value;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.invalidUrl ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noServer,
      };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Reports -----------------------------------------------------------------

  ensureServer() {
    if (!this.client) {
      throw new CommandError(pick(ACTION_TEXT.noServer, this.config?.language));
    }
  }

  /** The sentence of the scene action: today's videos, the latest ones, the queue. */
  summary(count = 3) {
    this.ensureServer();
    const text = SUMMARY_TEXT[this.config.language] ?? SUMMARY_TEXT.en;
    if (!this.server.reachable) {
      return text.down;
    }
    const totals = this.totals();
    const latest = this.saved.recent.slice(0, count);
    const parts = [
      text.today(totals.downloadedToday),
      latest.length
        ? `${text.latest}${text.colon}${latest.map((video) => text.video(video.title, video.source)).join(', ')}`
        : text.none,
    ];
    const queue = [text.pending(totals.pending)];
    if (totals.errors) {
      queue.push(text.errors(totals.errors));
    }
    const sentence = `Pinchflat${text.colon}${parts.join(text.semicolon)}. ${queue.join(', ')}.`;
    return sentence.length > 1000 ? `${sentence.slice(0, 999)}…` : sentence;
  }

  /** "Test the connection": read Pinchflat now, one report. */
  async testConnection() {
    await this.refresh();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!this.client || this.error) {
        message[language] = pick(this.connectionStatus().message, language);
        continue;
      }
      const totals = this.totals();
      message[language] = [
        text.ok(this.server.version),
        text.sources(totals.sources),
        text.pending(totals.pending),
        ...(totals.errors ? [text.errors(totals.errors)] : []),
      ].join(', ');
    }
    return message;
  }
}

export { ERROR_KINDS };
