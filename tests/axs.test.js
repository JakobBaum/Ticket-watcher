/**
 * AXS scraper tests — exercise the pure response interpreter (interpretAxsResponse)
 * with real-shaped pages. The Playwright fetch itself is not unit-tested (it needs a
 * real browser); the logic that decides found / blocked / error is fully covered here.
 *
 * Real event referenced: Ice Nine Kills, London (AXS event 1483248).
 * NOTE: AXS returns HTTP 403 to headless browsers in practice — the block test below
 * mirrors that real behaviour.
 */

const { interpretAxsResponse } = require('../src/scrapers/axs');

const FETCH_URL = 'https://www.axs.com/de/events/1483248/ice-nine-kills-tickets';
const CITY = 'London';
const FROM = '2026-01-01';
const TO = '2026-12-31';

function ldJsonPage({ city = 'London', availability = 'InStock', date = '2026-02-14' } = {}) {
  const event = {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: 'Ice Nine Kills',
    startDate: `${date}T19:00:00`,
    url: FETCH_URL,
    location: { '@type': 'Place', name: 'OVO Arena Wembley', address: { addressLocality: city } },
    offers: [{ '@type': 'Offer', availability: `https://schema.org/${availability}`, url: FETCH_URL }],
  };
  return `<!DOCTYPE html><html><head><script type="application/ld+json">${JSON.stringify(event)}</script></head><body></body></html>`;
}

const base = (html, status = 200) => ({ html, status, fetchUrl: FETCH_URL, city: CITY, dateFrom: FROM, dateTo: TO });

describe('interpretAxsResponse — bot blocking (real AXS behaviour)', () => {
  test('HTTP 403 is reported as a loud error, not found:false', () => {
    const result = interpretAxsResponse(base('<html>Access ...</html>', 403));
    expect(result.success).toBe(false);
    expect(result.found).toBe(false);
    expect(result.error).toMatch('403');
  });

  test('200 challenge/captcha page is reported as an error', () => {
    const result = interpretAxsResponse(base('<html>cf-challenge please verify you are not a robot captcha</html>', 200));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/challenge|captcha/i);
  });
});

describe('interpretAxsResponse — availability (ld+json)', () => {
  test('found:true when InStock event matches city and date range', () => {
    const result = interpretAxsResponse(base(ldJsonPage()));
    expect(result).toMatchObject({ success: true, found: true, platform: 'axs' });
    expect(result.url).toContain('axs.com');
  });

  test('found:false when SoldOut', () => {
    const result = interpretAxsResponse(base(ldJsonPage({ availability: 'SoldOut' })));
    expect(result).toMatchObject({ success: true, found: false });
  });

  test('found:false (no signal) on a clean 200 page with no ld+json and no CTA', () => {
    const result = interpretAxsResponse(base('<html><body><p>No results</p></body></html>'));
    expect(result).toMatchObject({ success: true, found: false });
  });
});
