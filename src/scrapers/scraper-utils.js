const logger = require('../utils/logger');

const CITY_ALIASES = {
  'vienna': 'wien',
  'wien': 'vienna',
  'las vegas': 'paradise',
  'paradise': 'las vegas',
};

const ALLOWED_HOSTS = ['www.ticketmaster.com', 'www.axs.com'];

function normalizeCity(city) {
  const lower = city.toLowerCase();
  return [lower, CITY_ALIASES[lower]].filter(Boolean);
}

function isUrl(str) {
  return str.startsWith('http://') || str.startsWith('https://');
}

/** Validates that a URL is https and targets an allowed host — prevents SSRF via config. */
function isSafeUrl(str) {
  try {
    const { protocol, hostname } = new URL(str);
    return protocol === 'https:' && ALLOWED_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

/**
 * Extract a city string from an event's location field.
 * Handles: location.address.addressLocality, location.address.addressRegion,
 * location.name (venue name may include city), and location.address as a plain string.
 */
function extractLocationText(event) {
  const loc = event.location;
  if (!loc) return '';
  const parts = [];
  if (typeof loc.address === 'object' && loc.address) {
    if (loc.address.addressLocality) parts.push(loc.address.addressLocality);
    if (loc.address.addressRegion)   parts.push(loc.address.addressRegion);
  }
  if (typeof loc.address === 'string') parts.push(loc.address);
  if (loc.name) parts.push(loc.name);
  return parts.join(' ').toLowerCase();
}

/**
 * Parse ld+json blocks and check event availability for the given cities and date range.
 * Returns:
 *   { url, date } — InStock event matching city and date range found
 *   null          — city-matched event found but no InStock offer (don't fall back to heuristic)
 *   undefined     — no city-matched events found (caller should fall back to text heuristic)
 */
function checkStructuredData(html, cities, dateFrom, dateTo) {
  const ldMatches = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let foundCityMatch = false;

  for (const block of ldMatches) {
    const json = block.replace(/<script[^>]*>|<\/script>/gi, '').trim();
    let data;
    try {
      data = JSON.parse(json);
    } catch (err) {
      logger.log(logger.WARN, `Failed to parse ld+json block: ${err.message}`);
      continue;
    }

    const raw = Array.isArray(data) ? data : [data];
    const items = raw.flatMap(d => (d['@graph'] ? d['@graph'] : [d]));

    for (const event of items) {
      if (event['@type'] !== 'MusicEvent' && event['@type'] !== 'Event') continue;

      const locationText = extractLocationText(event);
      if (!cities.some(c => locationText.includes(c))) continue;

      // City matched — record it before date filtering so an out-of-range event
      // returns null (no in-range stock) rather than undefined (which would
      // wrongly trigger the loose text-heuristic fallback).
      foundCityMatch = true;

      if (dateFrom || dateTo) {
        const startDate = event.startDate ? new Date(event.startDate + (event.startDate.includes('T') ? '' : 'T00:00:00')) : null;
        const from      = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
        const to        = dateTo   ? new Date(dateTo   + 'T23:59:59') : null;
        if (startDate) {
          if (from && startDate < from) continue;
          if (to   && startDate > to)   continue;
        }
      }

      const offers = Array.isArray(event.offers) ? event.offers : (event.offers ? [event.offers] : []);
      const available = offers.some(o =>
        o.availability && o.availability.toLowerCase().includes('instock')
      );
      if (available) {
        const date = event.startDate ? event.startDate.split('T')[0] : null;
        return { url: event.url || null, date };
      }
    }
  }

  return foundCityMatch ? null : undefined;
}

module.exports = { normalizeCity, isUrl, isSafeUrl, checkStructuredData };
