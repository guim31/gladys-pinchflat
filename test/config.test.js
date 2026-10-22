import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseServerUrl } from '../src/config.js';

test('the address: a bare host gets the port of Pinchflat, a copied URL keeps its base', () => {
  assert.equal(parseServerUrl('192.0.2.20'), 'http://192.0.2.20:8945');
  assert.equal(parseServerUrl(' 192.0.2.20:9000 '), 'http://192.0.2.20:9000');
  assert.equal(parseServerUrl('http://pinchflat.local:8945/'), 'http://pinchflat.local:8945');
  assert.equal(parseServerUrl('https://example.org/pinchflat/'), 'https://example.org/pinchflat');
  assert.equal(
    parseServerUrl('http://192.0.2.20:8945/sources/12?x=1#tab-pending'),
    'http://192.0.2.20:8945',
  );
  assert.equal(parseServerUrl('https://example.org/pf/settings'), 'https://example.org/pf');
  assert.equal(parseServerUrl('http://user:pass@192.0.2.20'), null, 'no credentials in the URL');
  assert.equal(parseServerUrl('ftp://192.0.2.20'), null);
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(42), null);
});

test('normalization: defaults, numbers as strings, unknown values', () => {
  const config = normalizeConfig({});
  assert.equal(config.url, null);
  assert.equal(config.invalidUrl, false);
  assert.equal(config.username, '');
  assert.equal(config.password, '');
  assert.equal(config.pollIntervalMs, 120_000);
  assert.equal(config.language, 'fr');
  const typed = normalizeConfig({
    url: 'http://[bad',
    poll_interval: 300,
    language: 'it',
    username: '  admin  ',
    password: ' spaced ',
  });
  assert.equal(typed.invalidUrl, true);
  assert.equal(typed.pollIntervalMs, 300_000);
  assert.equal(typed.language, 'fr');
  assert.equal(typed.username, 'admin');
  assert.equal(typed.password, ' spaced ', 'a password is kept as typed');
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 120_000);
});
