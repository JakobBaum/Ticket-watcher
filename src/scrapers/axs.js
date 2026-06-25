const { chromium } = require('playwright');
const { normalizeCity, isUrl, isSafeUrl, checkStructuredData } = require('./scraper-utils');
const logger = require('../utils/logger');

const AXS_SEARCH_URL = 'https://www.axs.com/events';
const NAV_TIMEOUT_MS = 30000;
const IDLE_TIMEOUT_MS = 10000;

let _browser = null;

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({ headless: true });
  }
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

async function fetchWithPlaywright(url) {
  const browser = await getBrowser();
  let context;
  let html = '';
  let status = null;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    // Block non-essential resources to reduce attack surface and speed up loading
    await page.route('**/*', route => {
      const type = route.request().resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    status = response ? response.status() : null;
    try {
      await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT_MS });
    } catch (_) {
      // networkidle timed out — page content is still usable
    }
    html = await page.content();
  } finally {
    if (context) await context.close().catch(() => {});
  }
  return { html, status };
}

/**
 * Pure interpretation of a fetched AXS page. Separated from the browser fetch so
 * the block-detection and availability logic can be unit-tested with fixtures.
 * Returns the standard scraper result object.
 */
function interpretAxsResponse({ html, status, fetchUrl, city, dateFrom, dateTo }) {
  // AXS aggressively bot-blocks headless browsers (typically HTTP 403). Treat any
  // non-OK status as a loud error rather than silently reporting "no tickets found".
  if (status !== null && status !== undefined && status >= 400) {
    return { success: false, found: false, error: `AXS blocked the request (HTTP ${status}) — bot detection`, platform: 'axs' };
  }

  const pageContent = html.toLowerCase();

  // Challenge/captcha interstitials can be served with a 200 status, so check
  // content regardless of page size.
  const isChallengePage =
    pageContent.includes('cf-challenge') ||
    pageContent.includes('access denied') ||
    (pageContent.includes('captcha') && pageContent.includes('robot'));

  if (isChallengePage) {
    return { success: false, found: false, error: `AXS challenge/captcha page detected for ${fetchUrl} — scraper blocked`, platform: 'axs' };
  }

  const cities = normalizeCity(city);
  const structuredResult = checkStructuredData(html, cities, dateFrom, dateTo);

  if (structuredResult !== undefined) {
    const found = structuredResult !== null;
    const url = structuredResult?.url || (found ? fetchUrl : null);
    return { success: true, found, url, date: structuredResult?.date || null, platform: 'axs' };
  }

  const hasPositive = pageContent.includes('buy tickets') ||
                      pageContent.includes('tickets from') ||
                      pageContent.includes('get tickets');
  // Only treat negative signals as a veto when there's no positive signal —
  // "no results" commonly appears in JS bundles even on pages that have tickets.
  const hasNegative = !hasPositive &&
    (pageContent.includes('no results') || pageContent.includes('no events'));
  const found = hasPositive && !hasNegative;

  let eventUrl = null;
  if (found) {
    const urlMatch = html.match(/href="(https:\/\/www\.axs\.com\/[^"]+)"/);
    eventUrl = urlMatch ? urlMatch[1] : fetchUrl;
  }

  return { success: true, found, url: eventUrl, platform: 'axs' };
}

async function scrapeAXS(artist, city, dateFrom, dateTo) {
  try {
    const fetchUrl = isUrl(artist)
      ? artist
      : `${AXS_SEARCH_URL}?q=${encodeURIComponent(artist)}&location=${encodeURIComponent(city)}`;

    if (isUrl(artist) && !isSafeUrl(artist)) {
      return { success: false, found: false, error: `Unsafe or non-HTTPS URL rejected: ${artist}`, platform: 'axs' };
    }

    let html, status;
    try {
      ({ html, status } = await fetchWithPlaywright(fetchUrl));
    } catch (error) {
      return { success: false, found: false, error: `Playwright error: ${error.message}`, platform: 'axs' };
    }

    return interpretAxsResponse({ html, status, fetchUrl, city, dateFrom, dateTo });
  } catch (error) {
    return { success: false, found: false, error: error.message, platform: 'axs' };
  }
}

module.exports = { scrapeAXS, closeBrowser, interpretAxsResponse };
