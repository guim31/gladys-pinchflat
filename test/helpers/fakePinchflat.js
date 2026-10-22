// -----------------------------------------------------------------------------
// An in-memory Pinchflat behind the `request` seam of the client
// (src/pinchflat/http.js). It renders the two pages the integration reads
// with the markup of a real Pinchflat 2025.9.26 (test/fixtures/pinchflat/,
// trimmed to what matters): test/parse.test.js checks that both give the
// same reading. Sources, videos that get downloaded, fail, or are deleted by
// the retention, an optional basic authentication, a server that does not
// answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  readFileSync(new URL(`../fixtures/pinchflat/${name}.html`, import.meta.url), 'utf8');

const escape = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const number = (value) =>
  `<span x-data x-text="Intl.NumberFormat().format(${value})">${value}</span>`;

const page = (version, main) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>
      Pinchflat
    </title>
  </head>
  <body>
    <span class="group relative flex items-center gap-2.5 px-4 pt-2 text-sm">
      <span>Pinchflat ${version}</span>
    </span>
    <main>${main}</main>
  </body>
</html>`;

const html = (status, body) => ({
  status,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body,
});

export class FakePinchflat {
  /**
   * @param {object} [options]
   * @param {{ username: string, password: string }|null} [options.auth]
   */
  constructor({ auth = null } = {}) {
    this.auth = auth;
    this.online = true;
    this.version = '2025.9.26';
    this.sources = new Map();
    this.nextMediaId = 1;
    this.requests = [];
  }

  /** A source with `downloaded` videos already there (uploaded before 2026). */
  addSource(id, name, { downloaded = 0, pending = 0 } = {}) {
    this.sources.set(String(id), { id: String(id), name, items: [] });
    for (let i = 0; i < downloaded; i += 1) {
      this.addVideo(id, `${name} archive ${i + 1}`, {
        downloaded: true,
        uploadDate: `2025-0${1 + (i % 9)}-1${i % 10}`,
      });
    }
    for (let i = 0; i < pending; i += 1) {
      this.addVideo(id, `${name} upcoming ${i + 1}`, { uploadDate: '2026-10-20' });
    }
    return this.sources.get(String(id));
  }

  /** A video indexed by Pinchflat; returns its media id. */
  addVideo(sourceId, title, { downloaded = false, uploadDate = '2026-10-21', error = null } = {}) {
    const id = String(this.nextMediaId++);
    this.sources.get(String(sourceId)).items.push({ id, title, uploadDate, downloaded, error });
    return id;
  }

  video(id) {
    for (const source of this.sources.values()) {
      const item = source.items.find((entry) => entry.id === String(id));
      if (item) {
        return item;
      }
    }
    return null;
  }

  /** The download of a pending video ends (its error is cleared, like Pinchflat does). */
  download(id) {
    Object.assign(this.video(id), { downloaded: true, error: null });
  }

  /** The download of a pending video fails with a yt-dlp message. */
  fail(id, error = 'ERROR: [youtube] abc: Video unavailable') {
    this.video(id).error = error;
  }

  /** The retention deletes a downloaded video. */
  remove(id) {
    for (const source of this.sources.values()) {
      source.items = source.items.filter((item) => item.id !== String(id));
    }
  }

  lists(source) {
    const byUpload = (a, b) => b.uploadDate.localeCompare(a.uploadDate) || b.id - a.id;
    return {
      pending: source.items.filter((item) => !item.downloaded).sort(byUpload),
      downloaded: source.items.filter((item) => item.downloaded).sort(byUpload),
    };
  }

  /** Sources by name: /sources ignores the case, a profile page does not (as in Pinchflat). */
  sorted({ ignoreCase = false } = {}) {
    const key = (source) => (ignoreCase ? source.name.toLowerCase() : source.name);
    return [...this.sources.values()].sort((a, b) =>
      key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0,
    );
  }

  /** The /sources page: its first page only, 10 sources. */
  renderSources() {
    const all = this.sorted({ ignoreCase: true });
    const pages = Math.max(1, Math.ceil(all.length / 10));
    const rows = all.slice(0, 10).map((source) => {
      const { pending, downloaded } = this.lists(source);
      return `<tr class="hover:bg-strokedark">
<td class="px-4 py-5 truncate max-w-xs">
<a href="/sources/${source.id}" class="underline" target="_self">
${escape(source.name)}
</a>
</td><td class="px-4 py-5 ">
<a href="/sources/${source.id}/#tab-pending" class="underline" target="_self">
${number(pending.length)}
</a>
</td><td class="px-4 py-5 ">
<a href="/sources/${source.id}/#tab-downloaded" class="underline" target="_self">
${number(downloaded.length)}
</a>
</td><td class="px-4 py-5 ">
${number(0)} KB
</td><td class="px-4 py-5 truncate max-w-xs">
<a href="/media_profiles/1" class="underline" target="_self">
Default
</a>
</td>
</tr>`;
    });
    return page(
      this.version,
      `<table class="w-full table-auto bg-boxdark text-white">
<thead><tr class="text-left bg-meta-4"><th>Name</th><th>Pending</th><th>Downloaded</th></tr></thead>
<tbody>
${rows.join('')}
</tbody>
</table>
${
  all.length
    ? `<section class="flex justify-center mt-5"><nav><ul class="flex flex-wrap items-center">
<li>
Page ${number(1)} of ${number(pages)}
</li>
</ul></nav></section>`
    : ''
}`,
    );
  }

  renderProfiles() {
    return page(
      this.version,
      `<table><tbody>
<tr><td><a href="/media_profiles/1" class="underline">Default</a></td>
<td><a href="/media_profiles/1/edit"><span class="hero-pencil-square"></span></a></td></tr>
</tbody></table>`,
    );
  }

  renderProfile() {
    return page(
      this.version,
      `<table><tbody>
${this.sorted()
  .map(
    (source) => `<tr class="hover:bg-strokedark">
<td class="px-4 py-5 ">
<a href="/sources/${source.id}" class="underline" target="_self">
${escape(source.name)}
</a>
</td><td class="px-4 py-5 flex justify-end">
<a href="/sources/${source.id}/edit" class="mr-4"><span class="hero-pencil-square"></span></a>
</td>
</tr>`,
  )
  .join('')}
</tbody></table>`,
    );
  }

  renderTab(name, items) {
    const shown = items.slice(0, 10);
    const content = shown.length
      ? `<div><header class="flex justify-between items-center mb-4">
<span class="flex items-center">
<span class="ml-2">
Showing ${number(shown.length)} of ${number(items.length)}
</span>
</span>
</header>
<table class="w-full table-auto bg-boxdark text-white">
<thead><tr class="text-left bg-meta-4"><th>Title</th><th>Upload Date</th><th></th></tr></thead>
<tbody>
${shown
  .map(
    (item) => `<tr class="hover:bg-strokedark">
<td class="px-4 py-5 max-w-xs">
<section class="flex items-center space-x-1">
${
  item.error
    ? `<div class="group relative inline-block cursor-pointer">
<div><span class="hero-exclamation-circle-solid text-red-500"></span></div>
<div class="hidden absolute top-full z-20 mt-3">
<span class="border-t border-l absolute -z-10 h-2 w-2 rotate-45"></span>
<div class="px-3">${escape(item.error)}</div>
</div>
</div>`
    : ''
}
<span class="truncate">
<a href="/sources/${this.sourceOf(item.id)}/media/${item.id}" class="underline" target="_self">
${escape(item.title)}
</a>
</span>
</section>
</td><td class="px-4 py-5 ">
${item.uploadDate}
</td><td class="px-4 py-5 flex justify-end">
<a href="/sources/${this.sourceOf(item.id)}/media/${item.id}/edit" class="mr-4"><span class="hero-pencil-square"></span></a>
</td>
</tr>`,
  )
  .join('')}
</tbody>
</table></div>`
      : `<div class="mb-4 flex items-center"><p class="ml-2">Nothing Here!</p></div>`;
    return `<div x-show="openTab === &#39;${name}&#39;" class="font-medium leading-relaxed">
<div id="phx-REDACTED">${content}</div>
</div>`;
  }

  sourceOf(mediaId) {
    for (const source of this.sources.values()) {
      if (source.items.some((item) => item.id === mediaId)) {
        return source.id;
      }
    }
    return '';
  }

  renderSource(source) {
    const { pending, downloaded } = this.lists(source);
    return page(
      this.version,
      `<h2 class="text-title-md2 font-bold ml-4 truncate">
${escape(source.name)}
</h2>
<div x-data="{ openTab: 'source' }">
<a href="#" @click.prevent="openTab = setTabByName(&#39;pending&#39;)" x-bind:class="openTab === &#39;pending&#39; ? activeClasses : inactiveClasses">Pending</a>
<div x-show="openTab === &#39;source&#39;" class="font-medium leading-relaxed"><p>Raw Attributes</p></div>
${this.renderTab('pending', pending)}
${this.renderTab('downloaded', downloaded)}
<div x-show="openTab === &#39;other&#39;" class="font-medium leading-relaxed"></div>
</div>`,
    );
  }

  handle(url, { headers = {} } = {}) {
    const path = new URL(url).pathname;
    this.requests.push({ path, headers });
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    if (path === '/healthcheck') {
      return { status: 200, headers: {}, body: '{"status":"ok"}' };
    }
    if (this.auth) {
      const expected = `Basic ${Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64')}`;
      if (headers.authorization !== expected) {
        return { status: 401, headers: { 'www-authenticate': 'Basic' }, body: 'Unauthorized' };
      }
    }
    if (path === '/sources') {
      return html(200, this.renderSources());
    }
    if (path === '/media_profiles') {
      return html(200, this.renderProfiles());
    }
    if (path === '/media_profiles/1') {
      return html(200, this.renderProfile());
    }
    const match = /^\/sources\/(\d+)$/.exec(path);
    if (match && this.sources.has(match[1])) {
      return html(200, this.renderSource(this.sources.get(match[1])));
    }
    // Phoenix answers an unknown route with its 404 page (Ecto.NoResultsError).
    return html(404, page(this.version, '<h1>Not Found</h1>'));
  }
}

/** A fake network: the servers by base URL; any other host does not answer. */
export function createNetwork(servers = {}) {
  return {
    servers,
    async request(url, options) {
      const origin = new URL(url).origin;
      const server = Object.entries(servers).find(([base]) => new URL(base).origin === origin);
      if (!server) {
        const error = new Error('connect EHOSTUNREACH');
        error.code = 'EHOSTUNREACH';
        throw error;
      }
      return server[1].handle(url, options);
    },
  };
}
