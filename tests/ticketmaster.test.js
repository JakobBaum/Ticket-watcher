/**
 * Ticketmaster Discovery API scraper tests.
 *
 * Deterministic: the pure parser (findAvailableEvent) is tested against real
 * Discovery API event shapes, and scrapeTicketmaster is tested with axios mocked
 * so no network/bot-blocking is involved. Fixture mirrors a real response from
 * GET https://app.ticketmaster.com/discovery/v2/events.json?keyword=Shinedown&city=Las%20Vegas
 */

jest.mock('axios');
const axios = require('axios');
const {
  scrapeTicketmaster,
  findAvailableEvent,
} = require('../src/scrapers/ticketmaster');

// Real-shaped Discovery API event (Shinedown, Las Vegas, on sale with inventory).
function tmEvent({ city = 'Las Vegas', status = 'onsale', date = '2026-08-07', url = 'https://www.ticketmaster.com/shinedown-las-vegas-nevada-08-07-2026/event/1700612ABC', hasPriceRanges = true } = {}) {
  const event = {
    name: 'Shinedown',
    url,
    dates: { start: { localDate: date, dateTime: `${date}T02:00:00Z` }, status: { code: status } },
    _embedded: { venues: [{ name: 'Fontainebleau Las Vegas', city: { name: city }, state: { name: 'Nevada', stateCode: 'NV' } }] },
  };
  if (hasPriceRanges) event.priceRanges = [{ type: 'standard', currency: 'USD', min: 85, max: 175 }];
  return event;
}

const FROM = '2026-01-01';
const TO = '2027-12-31';
const VEGAS = ['las vegas', 'paradise'];

describe('findAvailableEvent (pure parser)', () => {
  test('returns url+date for an on-sale event matching city and date range', () => {
    const result = findAvailableEvent([tmEvent()], VEGAS, FROM, TO);
    expect(result).toEqual({ url: expect.stringContaining('ticketmaster.com'), date: '2026-08-07' });
  });

  test('returns null when the only event is not on sale (offsale)', () => {
    expect(findAvailableEvent([tmEvent({ status: 'offsale' })], VEGAS, FROM, TO)).toBeNull();
  });

  test('returns null when event city does not match', () => {
    expect(findAvailableEvent([tmEvent({ city: 'Chicago' })], VEGAS, FROM, TO)).toBeNull();
  });

  test('returns null when event falls outside the date range', () => {
    expect(findAvailableEvent([tmEvent({ date: '2025-05-01' })], VEGAS, FROM, TO)).toBeNull();
  });

  test('returns null for an empty event list', () => {
    expect(findAvailableEvent([], VEGAS, FROM, TO)).toBeNull();
  });

  test('picks the first matching on-sale event among several', () => {
    const events = [tmEvent({ status: 'offsale' }), tmEvent({ status: 'onsale', date: '2026-09-09', url: 'https://www.ticketmaster.com/event/SECOND' })];
    const result = findAvailableEvent(events, VEGAS, FROM, TO);
    expect(result.date).toBe('2026-09-09');
  });

  test('returns null when event has no status (not yet on sale)', () => {
    expect(findAvailableEvent([tmEvent({ status: '' })], VEGAS, FROM, TO)).toBeNull();
  });

  test('returns match for presale event', () => {
    const result = findAvailableEvent([tmEvent({ status: 'presale' })], VEGAS, FROM, TO);
    expect(result).not.toBeNull();
  });
});

describe('scrapeTicketmaster (Discovery API client)', () => {
  const OLD_ENV = process.env.TICKETMASTER_API_KEY;
  beforeEach(() => { process.env.TICKETMASTER_API_KEY = 'test-key'; });
  afterEach(() => { jest.resetAllMocks(); process.env.TICKETMASTER_API_KEY = OLD_ENV; });

  test('found:true when API returns an on-sale event in range', async () => {
    axios.get.mockResolvedValueOnce({ data: { _embedded: { events: [tmEvent()] } } });
    const result = await scrapeTicketmaster('Shinedown', 'Las Vegas', FROM, TO);
    expect(result).toMatchObject({ success: true, found: true, platform: 'ticketmaster' });
    expect(result.url).toContain('ticketmaster.com');
  });

  test('found:false when API returns no events', async () => {
    axios.get.mockResolvedValueOnce({ data: { page: { totalElements: 0 } } });
    const result = await scrapeTicketmaster('Shinedown', 'Las Vegas', FROM, TO);
    expect(result).toMatchObject({ success: true, found: false });
  });

  test('success:false with loud error on HTTP failure (e.g. 401 bad key)', async () => {
    const err = new Error('Request failed'); err.response = { status: 401 };
    axios.get.mockRejectedValueOnce(err);
    const result = await scrapeTicketmaster('Shinedown', 'Las Vegas', FROM, TO);
    expect(result).toMatchObject({ success: false, found: false });
    expect(result.error).toMatch('401');
  });

  test('success:false when API key is missing', async () => {
    delete process.env.TICKETMASTER_API_KEY;
    const result = await scrapeTicketmaster('Shinedown', 'Las Vegas', FROM, TO);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/TICKETMASTER_API_KEY/);
  });
});
