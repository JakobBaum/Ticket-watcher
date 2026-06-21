/**
 * AXS scraper unit tests with mocked axios.
 * AXS returns 403 for direct HTTP requests (requires a real browser session),
 * so these tests mock the HTTP layer to verify scraper logic.
 *
 * Real event used in mocks: Electric Forest 2026
 * https://www.axs.com/events/1158551/electric-forest-2026-tickets
 */

jest.mock('axios');
const axios = require('axios');
const { scrapeAXS } = require('../src/scrapers/axs');

const AXS_EVENT_URL = 'https://www.axs.com/events/1158551/electric-forest-2026-tickets';
const AXS_ARTIST_NAME = 'Electric Forest';
const AXS_CITY = 'Rothbury';
const DATE_FROM = '2026-01-01';
const DATE_TO = '2027-12-31';

function ldJsonPage(city, available) {
  const availability = available
    ? 'https://schema.org/InStock'
    : 'https://schema.org/SoldOut';
  return `<!DOCTYPE html><html><head>
    <script type="application/ld+json">
    {
      "@context":"https://schema.org",
      "@type":"MusicEvent",
      "name":"Electric Forest 2026",
      "url":"${AXS_EVENT_URL}",
      "location":{"@type":"Place","address":{"addressLocality":"${city}","addressRegion":"MI"}},
      "offers":[{"@type":"Offer","availability":"${availability}","url":"${AXS_EVENT_URL}"}]
    }
    </script>
    </head><body></body></html>`;
}

function searchPage(available) {
  const content = available
    ? `<a href="${AXS_EVENT_URL}">Buy Tickets</a>`
    : '<p>No results found</p>';
  return `<!DOCTYPE html><html><body>${content}</body></html>`;
}

afterEach(() => jest.resetAllMocks());

describe('AXS scraper — URL-based (ld+json)', () => {
  test('finds available tickets when ld+json shows InStock', async () => {
    axios.get.mockResolvedValueOnce({ data: ldJsonPage('Rothbury', true) });

    const result = await scrapeAXS(AXS_EVENT_URL, AXS_CITY, DATE_FROM, DATE_TO);
    expect(result.success).toBe(true);
    expect(result.platform).toBe('axs');
    expect(result.found).toBe(true);
    expect(result.url).toBe(AXS_EVENT_URL);
  });

  test('returns found:false when ld+json shows SoldOut', async () => {
    axios.get.mockResolvedValueOnce({ data: ldJsonPage('Rothbury', false) });

    const result = await scrapeAXS(AXS_EVENT_URL, AXS_CITY, DATE_FROM, DATE_TO);
    expect(result.success).toBe(true);
    expect(result.platform).toBe('axs');
    expect(result.found).toBe(false);
  });

  test('falls back to text heuristic when city does not match ld+json', async () => {
    // ld+json says "Chicago" but we're looking for "Rothbury" — should fall through to text
    axios.get.mockResolvedValueOnce({ data: ldJsonPage('Chicago', true) });

    const result = await scrapeAXS(AXS_EVENT_URL, AXS_CITY, DATE_FROM, DATE_TO);
    // No "buy tickets" text in the page body, so heuristic also returns false
    expect(result.success).toBe(true);
    expect(result.found).toBe(false);
  });
});

describe('AXS scraper — keyword-based (text heuristic)', () => {
  test('finds available tickets when search page shows buy-tickets CTA', async () => {
    axios.get.mockResolvedValueOnce({ data: searchPage(true) });

    const result = await scrapeAXS(AXS_ARTIST_NAME, AXS_CITY, DATE_FROM, DATE_TO);
    expect(result.success).toBe(true);
    expect(result.platform).toBe('axs');
    expect(result.found).toBe(true);
  });

  test('returns found:false when search page shows no results', async () => {
    axios.get.mockResolvedValueOnce({ data: searchPage(false) });

    const result = await scrapeAXS(AXS_ARTIST_NAME, AXS_CITY, DATE_FROM, DATE_TO);
    expect(result.success).toBe(true);
    expect(result.platform).toBe('axs');
    expect(result.found).toBe(false);
  });
});

describe('AXS scraper — error handling', () => {
  test('returns success:false on network error (e.g. 403)', async () => {
    axios.get.mockRejectedValueOnce(new Error('Request failed with status code 403'));

    const result = await scrapeAXS(AXS_EVENT_URL, AXS_CITY, DATE_FROM, DATE_TO);
    expect(result.success).toBe(false);
    expect(result.found).toBe(false);
    expect(result.platform).toBe('axs');
    expect(result.error).toMatch('403');
  });
});
