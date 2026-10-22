// -----------------------------------------------------------------------------
// The Gladys device of a Pinchflat server (`server:main`): online, videos
// downloaded today, pending, in error, sources followed, videos downloaded in
// total, and the last video downloaded (text).
//
// Feature category/type couples come from the core table (see
// test/gladys-rules.test.js). should_poll: false: the hub reads Pinchflat on
// its own timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';

export const DEVICE_TYPE = 'server';
export const SERVER_ID = 'main';
export const URL_PARAM = 'PINCHFLAT_URL';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  DOWNLOADED_TODAY: 'downloaded_today',
  PENDING: 'pending',
  ERRORS: 'errors',
  SOURCES: 'sources',
  DOWNLOADED: 'downloaded',
  LAST_VIDEO: 'last_video',
});

const K = FEATURE_KEYS;

// Feature names per language (Gladys does not tell a device integration the
// user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [K.ONLINE]: 'Online',
    [K.DOWNLOADED_TODAY]: 'Downloaded today',
    [K.PENDING]: 'Pending videos',
    [K.ERRORS]: 'Videos in error',
    [K.SOURCES]: 'Sources',
    [K.DOWNLOADED]: 'Downloaded videos',
    [K.LAST_VIDEO]: 'Last video downloaded',
  },
  fr: {
    [K.ONLINE]: 'En ligne',
    [K.DOWNLOADED_TODAY]: "Téléchargées aujourd'hui",
    [K.PENDING]: 'Vidéos en attente',
    [K.ERRORS]: 'Vidéos en erreur',
    [K.SOURCES]: 'Sources',
    [K.DOWNLOADED]: 'Vidéos téléchargées',
    [K.LAST_VIDEO]: 'Dernière vidéo téléchargée',
  },
  de: {
    [K.ONLINE]: 'Online',
    [K.DOWNLOADED_TODAY]: 'Heute heruntergeladen',
    [K.PENDING]: 'Ausstehende Videos',
    [K.ERRORS]: 'Videos mit Fehler',
    [K.SOURCES]: 'Quellen',
    [K.DOWNLOADED]: 'Heruntergeladene Videos',
    [K.LAST_VIDEO]: 'Zuletzt heruntergeladenes Video',
  },
  es: {
    [K.ONLINE]: 'En línea',
    [K.DOWNLOADED_TODAY]: 'Descargados hoy',
    [K.PENDING]: 'Vídeos pendientes',
    [K.ERRORS]: 'Vídeos con error',
    [K.SOURCES]: 'Fuentes',
    [K.DOWNLOADED]: 'Vídeos descargados',
    [K.LAST_VIDEO]: 'Último vídeo descargado',
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 10_000_000;

const sensor = (category, type, extra = {}) => ({
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

const DEFINITIONS = {
  online: sensor(DEVICE_FEATURE_CATEGORIES.INPUT, DEVICE_FEATURE_TYPES.SENSOR.BINARY, {
    min: 0,
    max: 1,
  }),
  counter: sensor(DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER, {
    min: 0,
    max: COUNTER_MAX,
  }),
  text: sensor(DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  }),
};

// Order = display order in Gladys. `value` reads the snapshot of the hub.
const FEATURES = [
  { key: K.ONLINE, definition: 'online', value: (s) => bit(s.reachable) },
  { key: K.DOWNLOADED_TODAY, definition: 'counter', value: (s) => s.downloadedToday },
  { key: K.PENDING, definition: 'counter', value: (s) => s.pending },
  { key: K.ERRORS, definition: 'counter', value: (s) => s.errors },
  { key: K.SOURCES, definition: 'counter', value: (s) => s.sources },
  { key: K.DOWNLOADED, definition: 'counter', value: (s) => s.downloaded },
  { key: K.LAST_VIDEO, definition: 'text', value: (s) => s.lastVideo || null },
];

function bit(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return value ? 1 : 0;
}

export const serverIds = (gladys) => gladys.externalIds(DEVICE_TYPE, SERVER_ID);

/** The server device. */
export function buildServer(gladys, config) {
  const ids = serverIds(gladys);
  const names = NAMES[config.language] ?? NAMES.en;
  return {
    name: `Pinchflat ${hostOf(config.url)}`.slice(0, 60),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: config.url }],
    features: FEATURES.map(({ key, definition }) => ({
      ...DEFINITIONS[definition],
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The value of every feature (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null, text: boolean }>}
 */
export function featureValues(ids, snapshot) {
  return FEATURES.map(({ key, definition, value }) => {
    const read = value(snapshot);
    return {
      key,
      externalId: ids.feature(key),
      value: read === undefined ? null : read,
      text: definition === 'text',
    };
  });
}
