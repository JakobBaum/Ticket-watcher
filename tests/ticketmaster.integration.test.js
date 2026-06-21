/**
 * Ticketmaster integration tests — hit the live website.
 * Require internet access and may be affected by Ticketmaster's bot detection.
 */

const { scrapeTicketmaster } = require('../src/scrapers/ticketmaster');

const TM_ARTIST_URL = 'https://www.ticketmaster.com/helene-fischer-tickets/artist/1652327';
const TM_ARTIST_NAME = 'Helene Fischer';
const TM_CITY = 'Vienna';
const DATE_FROM = '2026-01-01';
const DATE_TO = '2027-12-31';

describe('Ticketmaster scraper (live)', () => {
  test('URL-based: finds available tickets via artist page URL', async () => {
    const result = await scrapeTicketmaster(TM_ARTIST_URL, TM_CITY, DATE_FROM, DATE_TO);
    expect(result.success).toBe(true);
    expect(result.platform).toBe('ticketmaster');
    expect(result.found).toBe(true);
    expect(result.url).toBeTruthy();
  });

  test('keyword-based: finds available tickets via artist name + city', async () => {
    const result = await scrapeTicketmaster(TM_ARTIST_NAME, TM_CITY, DATE_FROM, DATE_TO);
    expect(result.success).toBe(true);
    expect(result.platform).toBe('ticketmaster');
    expect(result.found).toBe(true);
  });

  test('gracefully handles a bad URL without throwing', async () => {
    const result = await scrapeTicketmaster('https://www.ticketmaster.com/__nonexistent_artist__', TM_CITY, DATE_FROM, DATE_TO);
    expect(result.platform).toBe('ticketmaster');
    expect(typeof result.found).toBe('boolean');
  });
});
