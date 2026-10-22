// -----------------------------------------------------------------------------
// Readers of the Pinchflat web pages. Pinchflat has no REST API: its web
// interface (Phoenix LiveView) renders every table on the server at the first
// HTTP request, so a plain GET of a page holds the data. Two pages are read:
//
//   - /sources: every source (channel or playlist) with its counts of pending
//     and downloaded videos, and the version of Pinchflat (side menu);
//   - /sources/<id>: the first page of the "Pending" tab (10 videos, newest
//     upload first, a red icon and the yt-dlp message on a failed download)
//     and of the "Downloaded" tab (10 videos, newest upload first), with the
//     total count of each tab.
//
// Checked against Pinchflat 2025.9.26 (test/fixtures/pinchflat/, real pages).
// The parsers keep titles, ids, dates and counts: nothing else of the page
// (paths, settings, tokens) leaves this file.
// -----------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the HTML entities Phoenix writes, and collapse the white space. */
export function decode(text) {
  return String(text)
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === '#') {
        const code =
          entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return Number.isFinite(code) && code > 0 && code < 0x110000
          ? String.fromCodePoint(code)
          : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const stripTags = (html) => html.replace(/<[^>]*>/g, ' ');

/** `Intl.NumberFormat().format(12)` spans: the raw number Phoenix writes. */
const numbersIn = (html) => [...html.matchAll(/format\((-?\d+(?:\.\d+)?)\)/g)].map((m) => +m[1]);

/** Is this page a Pinchflat page? (title and logo of the layout) */
export function isPinchflatPage(html) {
  return typeof html === 'string' && /<title>\s*Pinchflat\b/i.test(html);
}

/** The version in the side menu ("Pinchflat 2025.9.26"), or null. */
export function parseVersion(html) {
  const match = /<span>\s*Pinchflat\s+(\d{4}\.\d{1,2}\.\d{1,2}[\w.-]*)\s*<\/span>/.exec(html);
  return match ? match[1] : null;
}

const rowsOf = (html) => {
  const body = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(html);
  return body ? body[1].split(/<tr[\s>]/).slice(1) : [];
};

/**
 * The /sources page.
 * @returns {{ version: string|null, sources: Array<{ id: string, name: string, pending: number, downloaded: number }> }}
 */
export function parseSources(html) {
  const sources = [];
  const seen = new Set();
  for (const row of rowsOf(html)) {
    const link = /href="[^"]*\/sources\/(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
    if (!link || seen.has(link[1])) {
      continue;
    }
    const count = (tab) => {
      const cell = new RegExp(
        `href="[^"]*/sources/${link[1]}/#tab-${tab}"[^>]*>([\\s\\S]*?)</a>`,
      ).exec(row);
      const value = cell ? numbersIn(cell[1])[0] : undefined;
      return Number.isInteger(value) && value >= 0 ? value : null;
    };
    const pending = count('pending');
    const downloaded = count('downloaded');
    if (pending === null || downloaded === null) {
      continue;
    }
    seen.add(link[1]);
    sources.push({
      id: link[1],
      name: decode(stripTags(link[2])) || `#${link[1]}`,
      pending,
      downloaded,
    });
  }
  return { version: parseVersion(html), sources };
}

/** The content of one tab of a source page (`pending`, `downloaded`…), or null. */
function tabOf(html, name) {
  const marker = new RegExp(`x-show="openTab === (?:&#39;|')${name}(?:&#39;|')"`);
  const start = marker.exec(html);
  if (!start) {
    return null;
  }
  const rest = html.slice(start.index + start[0].length);
  const next = /x-show="openTab === /.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** The videos of one tab: total count and the rows of its first page. */
function parseTab(html) {
  if (html === null) {
    return null;
  }
  // "Showing 10 of 42": the second number is the total; "Nothing Here!" is 0.
  const showing = /Showing([\s\S]*?)<\/span>\s*<\/span>/.exec(html);
  const numbers = showing ? numbersIn(showing[1]) : [];
  const items = [];
  for (const row of rowsOf(html)) {
    const link = /href="[^"]*\/sources\/(\d+)\/media\/(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
    if (!link) {
      continue;
    }
    const date = /<td[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/.exec(row);
    const failed = /hero-exclamation-circle/.test(row);
    const tooltip = failed ? /<div class="px-3">([\s\S]*?)<\/div>/.exec(row) : null;
    items.push({
      id: link[2],
      sourceId: link[1],
      title: decode(stripTags(link[3])),
      uploadDate: date ? date[1] : null,
      error: failed ? decode(stripTags(tooltip ? tooltip[1] : '')) || 'error' : null,
    });
  }
  const total = numbers.length >= 2 ? numbers[1] : items.length;
  return { total, items };
}

/**
 * A source page.
 * @returns {{ name: string|null, pending: object|null, downloaded: object|null }}
 *   each tab `{ total, items: [{ id, sourceId, title, uploadDate, error }] }`
 */
export function parseSource(html) {
  const heading = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html);
  return {
    name: heading ? decode(stripTags(heading[1])) || null : null,
    pending: parseTab(tabOf(html, 'pending')),
    downloaded: parseTab(tabOf(html, 'downloaded')),
  };
}
