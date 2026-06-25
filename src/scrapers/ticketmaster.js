const axios = require('axios');
const { chromium } = require('playwright');
const { normalizeCity } = require('./scraper-utils');

const DISCOVERY_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
const REQUEST_TIMEOUT_MS = 15000;

// Status-Codes aus der API, die direkt bedeuten, dass keine Tickets existieren
const UNAVAILABLE_STATUS_CODES = ['offsale', 'cancelled', 'canceled'];
const UNAVAILABLE_SUB_STATUS_CODES = ['soldout', 'unavailable'];

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
    // 1. Haupt-Status aus der API prüfen
    const statusCode = (event?.dates?.status?.code || '').toLowerCase();
    if (UNAVAILABLE_STATUS_CODES.includes(statusCode)) continue;

    // 2. Sub-Status aus der API prüfen
    const subStatusCode = (event?.dates?.status?.subCode || '').toLowerCase();
    if (UNAVAILABLE_SUB_STATUS_CODES.includes(subStatusCode)) continue;

    // 3. Städte-Filter
    if (cities.length > 0) {
      const cityText = eventCityText(event);
      if (!cities.some(c => cityText.includes(c))) continue;
    }

    // 4. Datums-Filter
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
 * Check Ticketmaster for available tickets via the official Discovery API
 * AND cross-verify via a live Playwright browser check.
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

  // Wenn die API ein Event findet, starten wir jetzt den Live-Check mit Playwright
  if (match && match.url) {
    console.log(`API meldet Event als offen. Starte Playwright Live-Check auf: ${match.url}`);
    
    const browser = await chromium.launch({ headless: true });
    // User-Agent faken, damit Ticketmaster den Bot nicht sofort blockiert
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    try {
      // Seite laden (bricht nach 15 Sekunden ab, falls Ticketmaster laggt)
      await page.goto(match.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      // Gesamten Textinhalt der Seite auslesen
      const pageContent = await page.textContent('body');
      
      // Prüfen, ob typische Ausverkauft-Texte auf der Seite stehen
      const isSoldOut = 
        pageContent.includes('Ausverkauft') || 
        pageContent.includes('Sold Out') || 
        pageContent.includes('Tickets zurzeit nicht verfügbar') ||
        pageContent.includes('currently not available');

      await browser.close();

      if (isSoldOut) {
        console.log(`Live-Check ergab: Das Event am ${match.date} ist leider ausverkauft.`);
        return { success: true, found: false, url: null, date: null, platform: 'ticketmaster' };
      }

      console.log(`Erfolg! Tickets für den ${match.date} sind live verfügbar.`);
      return { success: true, found: true, url: match.url, date: match.date, platform: 'ticketmaster' };

    } catch (pwError) {
      console.error("Playwright Live-Check fehlgeschlagen (z.B. Timeout/Bot-Schutz). Nutze API-Fallback:", pwError.message);
      await browser.close();
      
      // Fallback: Wenn Playwright fehlschlägt (z.B. wegen Cloudflare), vertrauen wir sicherheitshalber der API,
      // damit wir im Zweifel lieber einmal zu viel benachrichtigen als ein Ticket zu verpassen.
      return { success: true, found: true, url: match.url, date: match.date, platform: 'ticketmaster' };
    }
  }

  return { success: true, found: false, url: null, date: null, platform: 'ticketmaster' };
}

module.exports = { scrapeTicketmaster, fetchTicketmasterEvents, findAvailableEvent };