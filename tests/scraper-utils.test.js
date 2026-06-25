/**
 * Tests for the pure scraper helpers — the real parsing logic the AXS scraper
 * relies on (checkStructuredData), plus URL safety and city normalization.
 * Fixtures mirror a real schema.org ld+json block as embedded on AXS event pages
 * (Ice Nine Kills, London).
 */

const { normalizeCity, isUrl, isSafeUrl, checkStructuredData } = require('../src/scrapers/scraper-utils');

function ldJson({ city = 'London', availability = 'InStock', date = '2026-02-14', url = 'https://www.axs.com/events/1483248/ice-nine-kills-tickets' } = {}) {
  const event = {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: 'Ice Nine Kills',
    startDate: `${date}T19:00:00`,
    url,
    location: { '@type': 'Place', name: 'OVO Arena Wembley', address: { '@type': 'PostalAddress', addressLocality: city, addressCountry: 'GB' } },
    offers: [{ '@type': 'Offer', availability: `https://schema.org/${availability}`, url }],
  };
  return `<!DOCTYPE html><html><head><script type="application/ld+json">${JSON.stringify(event)}</script></head><body></body></html>`;
}

describe('normalizeCity', () => {
  test('includes known aliases', () => {
    expect(normalizeCity('Las Vegas')).toEqual(['las vegas', 'paradise']);
    expect(normalizeCity('London')).toEqual(['london']);
  });
});

describe('isUrl / isSafeUrl', () => {
  test('isUrl detects http(s)', () => {
    expect(isUrl('https://www.axs.com/x')).toBe(true);
    expect(isUrl('Ice Nine Kills')).toBe(false);
  });
  test('isSafeUrl allows only https allowed hosts', () => {
    expect(isSafeUrl('https://www.axs.com/events/1')).toBe(true);
    expect(isSafeUrl('http://www.axs.com/events/1')).toBe(false);
    expect(isSafeUrl('https://evil.example.com')).toBe(false);
  });
});

describe('checkStructuredData', () => {
  const cities = ['london'];
  const FROM = '2026-01-01';
  const TO = '2026-12-31';

  test('returns {url,date} when an InStock event matches city and date range', () => {
    const result = checkStructuredData(ldJson(), cities, FROM, TO);
    expect(result).toEqual({ url: expect.stringContaining('axs.com'), date: '2026-02-14' });
  });

  test('returns null (city matched, no stock) when SoldOut', () => {
    expect(checkStructuredData(ldJson({ availability: 'SoldOut' }), cities, FROM, TO)).toBeNull();
  });

  test('returns undefined (no city match -> caller falls back) when city differs', () => {
    expect(checkStructuredData(ldJson({ city: 'Manchester' }), cities, FROM, TO)).toBeUndefined();
  });

  test('returns null when InStock but outside the date range', () => {
    expect(checkStructuredData(ldJson({ date: '2027-05-01' }), cities, FROM, TO)).toBeNull();
  });
});
