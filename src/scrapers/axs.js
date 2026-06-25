const { chromium } = require('playwright-extra');
const StealthPlugin = require('playwright-extra-plugin-stealth');
const { normalizeCity, isUrl, isSafeUrl, checkStructuredData } = require('./scraper-utils');

chromium.use(StealthPlugin());

const AXS_SEARCH_URL = 'https://www.axs.com/events';
const NAV_TIMEOUT_MS = 30000;
const IDLE_TIMEOUT_MS = 10000;

let _browser = null;

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    // Block images/fonts/media to speed up load
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
 * Pure interpretation of a fetched AXS page.
 */
function interpretAxsResponse({ html, status, fetchUrl, city, dateFrom, dateTo }) {
  if (status !== null && status >= 400) {
    return { success: false, found: false, error: `AXS blocked the request (HTTP ${status}) — bot detection`, platform: 'axs' };
  }

  const pageContent = html.toLowerCase();

  const isChallengePage =
    pageContent.includes('cf-challenge') ||
    pageContent.includes('access denied') ||
    (pageContent.includes('captcha') && pageContent.includes('robot'));

  if (isChallengePage) {
    return { success: false, found: false, error: `AXS challenge/captcha page detected — scraper blocked`, platform: 'axs' };
  }

  const cities = normalizeCity(city);
  const structuredResult = checkStructuredData(html, cities, dateFrom, dateTo);

  if (structuredResult !== undefined) {
    const found = structuredResult !== null;
    const url = structuredResult?.url || (found ? fetchUrl : null);
    return { success: true, found, url, date: structuredResult?.date || null, platform: 'axs' };
  }

  const found = pageContent.includes('buy tickets') ||
                pageContent.includes('tickets from') ||
                pageContent.includes('get tickets');

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
