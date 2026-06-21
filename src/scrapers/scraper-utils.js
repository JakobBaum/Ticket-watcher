const CITY_ALIASES = {
  'vienna': 'wien',
  'wien': 'vienna',
};

function normalizeCity(city) {
  const lower = city.toLowerCase();
  return [lower, CITY_ALIASES[lower]].filter(Boolean);
}

function isUrl(str) {
  return str.startsWith('http://') || str.startsWith('https://');
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
    try {
      const data = JSON.parse(json);
      const events = Array.isArray(data) ? data : [data];
      for (const event of events) {
        if (event['@type'] !== 'MusicEvent' && event['@type'] !== 'Event') continue;
        const location = (event.location?.address?.addressLocality || '').toLowerCase();
        if (!cities.some(c => location.includes(c))) continue;

        if (dateFrom || dateTo) {
          const startDate = event.startDate ? new Date(event.startDate) : null;
          if (startDate) {
            if (dateFrom && startDate < new Date(dateFrom)) continue;
            if (dateTo && startDate > new Date(dateTo)) continue;
          }
        }

        foundCityMatch = true;
        const offers = Array.isArray(event.offers) ? event.offers : (event.offers ? [event.offers] : []);
        const available = offers.some(o =>
          o.availability && o.availability.toLowerCase().includes('instock')
        );
        if (available) {
          const date = event.startDate ? event.startDate.split('T')[0] : null;
          return { url: event.url || null, date };
        }
      }
    } catch (_) {}
  }

  return foundCityMatch ? null : undefined;
}

module.exports = { normalizeCity, isUrl, checkStructuredData };
