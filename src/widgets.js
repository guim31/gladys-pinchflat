// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `latest_videos`.
//
// The use case: what arrived on the media server, at a glance on the wall
// tablet. Three tiles (downloaded today, pending, in error) and the latest
// videos downloaded, as a list (title, source, date). Read only: no button.
//
// The figures are sent as values, not bound to device features, so the widget
// works before the device is added to Gladys.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { ERROR_KINDS, WIDGET_KEY } from './hub.js';
import { ERROR_TEXT, pick } from './texts.js';

// Rows of the list (the core shows 8 at most in a `list` card-list).
const LIST_SIZE = 8;

export const TEXT = {
  pick: {
    en: 'Enter the address of your Pinchflat server in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur Pinchflat dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Pinchflat-Servers in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor Pinchflat en la configuración de la integración.',
  },
  waiting: {
    en: 'Waiting for the first reading of Pinchflat…',
    fr: 'En attente de la première lecture de Pinchflat…',
    de: 'Warte auf die erste Abfrage von Pinchflat…',
    es: 'Esperando la primera lectura de Pinchflat…',
  },
  none: {
    en: 'No video downloaded yet.',
    fr: 'Aucune vidéo téléchargée pour le moment.',
    de: 'Noch kein Video heruntergeladen.',
    es: 'Todavía no se ha descargado ningún vídeo.',
  },
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  pending: { en: 'Pending', fr: 'En attente', de: 'Ausstehend', es: 'Pendientes' },
  errors: { en: 'In error', fr: 'En erreur', de: 'Mit Fehler', es: 'Con error' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  problem: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: fit(t(text, language), 300) }],
  };
}

/** One row of the list: title, source, date of the download (or of the upload). */
export function videoItem(video) {
  const item = { title: fit(video.title || '…', 60), subtitle: fit(video.source || '', 60) };
  const date = video.at ? new Date(video.at) : video.uploadDate ? new Date(video.uploadDate) : null;
  if (date && Number.isFinite(date.getTime())) {
    item.date = date.toISOString();
  }
  if (!item.subtitle) {
    delete item.subtitle;
  }
  return item;
}

async function get(hub, { language = 'en' } = {}) {
  if (!hub.client) {
    return message(TEXT.pick, language);
  }
  if (hub.error) {
    const unreachable = hub.error.kind === ERROR_KINDS.UNREACHABLE;
    return {
      ttl_seconds: 120,
      components: [
        {
          type: 'status',
          items: [
            {
              label: 'Pinchflat',
              icon: 'alert-triangle',
              value: fit(t(unreachable ? TEXT.offline : TEXT.problem, language), 40),
              color: WIDGET_COLORS.DANGER,
            },
          ],
        },
        { type: 'text', variant: 'body', text: fit(t(ERROR_TEXT[hub.error.kind], language), 300) },
      ],
    };
  }
  if (!hub.server.reachable) {
    return message(TEXT.waiting, language);
  }
  const totals = hub.totals();
  const components = [
    {
      type: 'value',
      value: totals.downloadedToday,
      label: t(TEXT.today, language),
      icon: 'download',
      color: totals.downloadedToday ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    { type: 'value', value: totals.pending, label: t(TEXT.pending, language), icon: 'clock' },
    {
      type: 'value',
      value: totals.errors,
      label: t(TEXT.errors, language),
      icon: 'alert-circle',
      color: totals.errors ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    },
  ];
  const videos = hub.recent().slice(0, LIST_SIZE);
  components.push(
    videos.length
      ? { type: 'card-list', display: 'list', items: videos.map(videoItem) }
      : { type: 'text', variant: 'body', text: t(TEXT.none, language) },
  );
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey }) {
  // No button: nothing to run.
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
