// -----------------------------------------------------------------------------
// Pinchflat client (web interface, port 8945 by default), read only.
//
// Pinchflat has no REST API, and its RSS feeds only list the downloaded videos
// of one source (no queue, no error). Its notifications (Apprise) would need
// an inbound port, which the sandbox of Gladys does not open. So the client
// reads the pages of the web interface, the very pages a browser gets, with
// plain GET requests: it never submits a form, never writes anything in
// Pinchflat. See src/pinchflat/parse.js for what each page gives.
//
// When the interface is protected (BASIC_AUTH_USERNAME / BASIC_AUTH_PASSWORD
// of Pinchflat), the credentials go in the Authorization header: never in the
// URL, never in the logs.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';
import { isPinchflatPage, parseSource, parseSources } from './parse.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // user name or password refused or missing (401, 403)
  NOT_PINCHFLAT: 'not_pinchflat', // something answers, not Pinchflat
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page)
  HTTP: 'http', // any other HTTP error
});

export class PinchflatError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'PinchflatError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export class PinchflatClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, with the base path if any
   * @param {string} [options.username] empty when the interface is open
   * @param {string} [options.password]
   * @param {Function} [options.request] HTTP seam (src/pinchflat/http.js)
   */
  constructor({ url, username = '', password = '', request = httpRequest }) {
    this.url = url;
    this.authorization = username
      ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      : null;
    this.request = request;
  }

  /** GET a page of the interface; resolves with its HTML. */
  async page(path) {
    let answer;
    try {
      answer = await this.request(`${this.url}${path}`, {
        headers: this.authorization ? { authorization: this.authorization } : {},
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new PinchflatError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new PinchflatError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }
    const { status, body } = answer;
    if (status === 401 || status === 403) {
      throw new PinchflatError(
        ERROR_KINDS.AUTH,
        this.authorization
          ? 'User name or password refused'
          : 'The interface is protected: a user name and a password are needed',
        { status },
      );
    }
    if (status >= 300 && status < 400) {
      throw new PinchflatError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 404 && !isPinchflatPage(body)) {
      throw new PinchflatError(ERROR_KINDS.NOT_PINCHFLAT, `No Pinchflat at this address`, {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      throw new PinchflatError(ERROR_KINDS.HTTP, `${path} answered HTTP ${status}`, { status });
    }
    if (!isPinchflatPage(body)) {
      throw new PinchflatError(ERROR_KINDS.NOT_PINCHFLAT, `${path} is not a Pinchflat page`, {
        status,
      });
    }
    return body;
  }

  /** The sources, their counts, and the version of Pinchflat. */
  async sources() {
    return parseSources(await this.page('/sources'));
  }

  /** The first page of the pending and downloaded videos of one source. */
  async source(id) {
    const parsed = parseSource(await this.page(`/sources/${encodeURIComponent(id)}`));
    if (!parsed.pending || !parsed.downloaded) {
      throw new PinchflatError(ERROR_KINDS.HTTP, `/sources/${id}: no video table in the page`);
    }
    return parsed;
  }

  /** The page of a video in the interface, for the scene events. */
  mediaUrl(sourceId, mediaId) {
    return `${this.url}/sources/${sourceId}/media/${mediaId}`;
  }
}
