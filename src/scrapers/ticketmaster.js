const axios = require('axios');
const { normalizeCity } = require('./scraper-utils');

const DISCOVERY_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
const REQUEST_TIMEOUT_MS = 15000;

// Status codes that mean tickets are NOT obtainable. Anything else — including
// 'onsale', 'presale', or a missing/empty status — is treated as available, so we
// over-notify rather than silently miss an event the API didn't tag with a status.
const UNAVAILABLE_STATUS_CODES = ['offsale', 'cancelled', 'canceled'];

/**
 * Fetch events from the Ticketmaster Discovery API.
 * Pure network layer — kept separate from parsing so logic can be unit-tested
 * against real saved API responses without hitting the network.
 *
 * Returns the raw `_embedded.events` array (possibly empty).
 * Throws on network / auth errors so the caller surfaces them loudly.
 */
async function fetchTicketmasterEvents({ keyword, city, dateFrom, dateTo, apiKey }) {
  const params = {
    apikey: apiKey,
    keyword,
    size: 50,
    sort: 'date,asc',
  };
  if (city) params.city = city;
  if (dateFrom) params.startDateTime = `${dateFrom}T00:00:00Z`;
  if (dateTo) params.endDateTime = `${dateTo}T23:59:59Z`;

  const response = await axios.get(DISCOVERY_URL, { params, timeout: REQUEST_TIMEOUT_MS });
  const data = response.data || {};
  return (data._embedded && Array.isArray(data._embedded.events)) ? data._embedded.events : [];
}

/**
 * Extract a lowercase city string from a Discovery event's venue(s).
 * Uses the structured city/state fields only — NOT the venue name, since venue
 * names often embed an unrelated city (e.g. "Madison Square Garden") and cause
 * false positives.
 */
function eventCityText(event) {
  const venues = event?._embedded?.venues;
  if (!Array.isArray(venues)) return '';
  return venues
    .map(v => [v.city?.name, v.state?.name, v.state?.stateCode].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();
}

/** ISO date (YYYY-MM-DD) for an event, or null. */
function eventDate(event) {
  return event?.dates?.start?.localDate || null;
}

/**
 * Pure parser: given Discovery API events, return the first one that is
 * on sale, in one of the target cities, and within the date range.
 * Returns { url, date } or null. Date filtering by city is a safety net —
 * the API already filters by date, but venue city is matched here.
 */
function findAvailableEvent(events, cities, dateFrom, dateTo) {
  const from = dateFrom ? new Date(`${dateFrom}T00:00:00Z`) : null;
  const to = dateTo ? new Date(`${dateTo}T23:59:59Z`) : null;

  for (const event of events) {
    const statusCode = (event?.dates?.status?.code || '').toLowerCase();
    if (UNAVAILABLE_STATUS_CODES.includes(statusCode)) continue;

    if (cities.length > 0) {
      const cityText = eventCityText(event);
      if (!cities.some(c => cityText.includes(c))) continue;
    }

    const date = eventDate(event);
    if (date) {
      const d = new Date(`${date}T12:00:00Z`);
      if (from && d < from) continue;
      if (to && d > to) continue;
    }

    return { url: event.url || null, date };
  }
  return null;
}

/**
 * Check Ticketmaster for available tickets via the official Discovery API.
 * Signature kept compatible with the orchestrator (artist, city, dateFrom, dateTo).
 */
async function scrapeTicketmaster(artist, city, dateFrom, dateTo) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      found: false,
      error: 'TICKETMASTER_API_KEY not set — get a free key at developer.ticketmaster.com',
      platform: 'ticketmaster',
    };
  }

  let events;
  try {
    events = await fetchTicketmasterEvents({ keyword: artist, city, dateFrom, dateTo, apiKey });
  } catch (error) {
    const status = error.response?.status;
    const detail = status ? `HTTP ${status}` : error.message;
    return { success: false, found: false, error: `Discovery API request failed: ${detail}`, platform: 'ticketmaster' };
  }

  const cities = normalizeCity(city);
  const match = findAvailableEvent(events, cities, dateFrom, dateTo);

  if (match) {
    return { success: true, found: true, url: match.url, date: match.date, platform: 'ticketmaster' };
  }
  return { success: true, found: false, url: null, date: null, platform: 'ticketmaster' };
}

module.exports = { scrapeTicketmaster, fetchTicketmasterEvents, findAvailableEvent };
