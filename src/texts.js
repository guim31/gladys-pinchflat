// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, the command
// errors and the sentence of the scene action. Four languages, the four of the
// Gladys interface; German says "du", Spanish "usted". test/i18n.test.js
// checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './pinchflat/client.js';

export const pick = (text, language) => text?.[language] ?? text?.en ?? '';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Pinchflat server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Pinchflat dans la configuration.",
    de: 'Gib die Adresse deines Pinchflat-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Pinchflat en la configuración.',
  },
  invalid: {
    en: 'The address of the Pinchflat server is not valid (e.g. http://192.168.1.2:8945).',
    fr: "L'adresse du serveur Pinchflat n'est pas valide (ex. http://192.168.1.2:8945).",
    de: 'Die Adresse des Pinchflat-Servers ist ungültig (z. B. http://192.168.1.2:8945).',
    es: 'La dirección del servidor Pinchflat no es válida (p. ej. http://192.168.1.2:8945).',
  },
};

// One explanation per error kind (src/pinchflat/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Pinchflat does not answer: check the address and the port (8945).',
    fr: "Pinchflat ne répond pas : vérifiez l'adresse et le port (8945).",
    de: 'Pinchflat antwortet nicht: Prüfe die Adresse und den Port (8945).',
    es: 'Pinchflat no responde: compruebe la dirección y el puerto (8945).',
  },
  [ERROR_KINDS.TLS]: {
    en: 'Certificate refused: use the http:// address on your network.',
    fr: 'Certificat refusé : utilisez l’adresse en http:// de votre réseau.',
    de: 'Zertifikat abgelehnt: Verwende die http://-Adresse in deinem Netzwerk.',
    es: 'Certificado rechazado: use la dirección http:// de su red.',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'User name or password refused or missing (BASIC_AUTH_USERNAME of Pinchflat).',
    fr: 'Identifiant ou mot de passe refusé ou manquant (BASIC_AUTH_USERNAME de Pinchflat).',
    de: 'Benutzername oder Passwort abgelehnt oder fehlend (BASIC_AUTH_USERNAME von Pinchflat).',
    es: 'Usuario o contraseña rechazados o ausentes (BASIC_AUTH_USERNAME de Pinchflat).',
  },
  [ERROR_KINDS.NOT_PINCHFLAT]: {
    en: 'No Pinchflat at this address (web interface port, 8945 by default).',
    fr: "Aucun Pinchflat à cette adresse (port de l'interface web, 8945 par défaut).",
    de: 'Kein Pinchflat unter dieser Adresse (Port der Weboberfläche, standardmäßig 8945).',
    es: 'No hay ningún Pinchflat en esta dirección (puerto de la interfaz web, 8945).',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'The address redirects (a login page?): enter the direct address of Pinchflat.',
    fr: "L'adresse redirige (page de connexion ?) : saisissez l'adresse directe de Pinchflat.",
    de: 'Die Adresse leitet um (Anmeldeseite?): Gib die direkte Adresse von Pinchflat ein.',
    es: 'La dirección redirige (¿página de acceso?): introduzca la dirección directa de Pinchflat.',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Unexpected answer from Pinchflat, see the logs of the integration.',
    fr: "Réponse inattendue de Pinchflat, voir les logs de l'intégration.",
    de: 'Unerwartete Antwort von Pinchflat, sieh in den Protokollen der Integration nach.',
    es: 'Respuesta inesperada de Pinchflat, consulte los registros de la integración.',
  },
};

// Errors of the scene action and of "Test the connection".
export const ACTION_TEXT = {
  noServer: CONNECTION_TEXT.noServer,
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version) => (version ? `OK, Pinchflat ${version}` : 'OK, Pinchflat'),
    sources: (count) => `${count} source(s)`,
    pending: (count) => `${count} video(s) pending`,
    errors: (count) => `${count} in error`,
  },
  fr: {
    ok: (version) => (version ? `OK, Pinchflat ${version}` : 'OK, Pinchflat'),
    sources: (count) => `${count} source(s)`,
    pending: (count) => `${count} vidéo(s) en attente`,
    errors: (count) => `${count} en erreur`,
  },
  de: {
    ok: (version) => (version ? `OK, Pinchflat ${version}` : 'OK, Pinchflat'),
    sources: (count) => `${count} Quelle(n)`,
    pending: (count) => `${count} Video(s) ausstehend`,
    errors: (count) => `${count} mit Fehler`,
  },
  es: {
    ok: (version) => (version ? `OK, Pinchflat ${version}` : 'OK, Pinchflat'),
    sources: (count) => `${count} fuente(s)`,
    pending: (count) => `${count} vídeo(s) pendiente(s)`,
    errors: (count) => `${count} con error`,
  },
};

// The sentence of the "Read the latest videos" scene action.
export const SUMMARY_TEXT = {
  en: {
    colon: ': ',
    semicolon: '; ',
    today: (count) =>
      count === 0
        ? 'no video downloaded today'
        : `${count} video${count > 1 ? 's' : ''} downloaded today`,
    latest: 'latest',
    video: (title, source) => `“${title}” (${source})`,
    none: 'no video downloaded yet',
    pending: (count) => `${count} pending`,
    errors: (count) => `${count} in error`,
    down: 'Pinchflat does not answer.',
  },
  fr: {
    colon: ' : ',
    semicolon: ' ; ',
    today: (count) =>
      count === 0
        ? "aucune vidéo téléchargée aujourd'hui"
        : `${count} vidéo${count > 1 ? 's' : ''} téléchargée${count > 1 ? 's' : ''} aujourd'hui`,
    latest: 'dernières',
    video: (title, source) => `« ${title} » (${source})`,
    none: 'aucune vidéo téléchargée pour le moment',
    pending: (count) => `${count} en attente`,
    errors: (count) => `${count} en erreur`,
    down: 'Pinchflat ne répond pas.',
  },
  de: {
    colon: ': ',
    semicolon: '; ',
    today: (count) =>
      count === 0
        ? 'heute kein Video heruntergeladen'
        : `${count} Video${count > 1 ? 's' : ''} heute heruntergeladen`,
    latest: 'zuletzt',
    video: (title, source) => `„${title}“ (${source})`,
    none: 'noch kein Video heruntergeladen',
    pending: (count) => `${count} ausstehend`,
    errors: (count) => `${count} mit Fehler`,
    down: 'Pinchflat antwortet nicht.',
  },
  es: {
    colon: ': ',
    semicolon: '; ',
    today: (count) =>
      count === 0
        ? 'ningún vídeo descargado hoy'
        : `${count} vídeo${count > 1 ? 's' : ''} descargado${count > 1 ? 's' : ''} hoy`,
    latest: 'últimos',
    video: (title, source) => `«${title}» (${source})`,
    none: 'todavía ningún vídeo descargado',
    pending: (count) => `${count} pendiente${count > 1 ? 's' : ''}`,
    errors: (count) => `${count} con error`,
    down: 'Pinchflat no responde.',
  },
};
