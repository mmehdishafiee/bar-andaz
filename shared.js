/*
 * Cafebazaar APK Downloader — هستهٔ مشترک
 *
 * این فایل هم در سرویس‌ورکر (با importScripts) و هم در پاپ‌آپ و هم در
 * content script لود می‌شود. هیچ‌کدام از توابع اینجا به APIهای مخصوص
 * یک context وابسته نیستند؛ فقط fetch و تابع خالص.
 */

var BAZAAR_API_BASE = 'https://api.cafebazaar.ir/rest-v1/process/';
var BAZAAR_DOWNLOAD_ENDPOINT = BAZAAR_API_BASE + 'AppDownloadInfoRequest';
var BAZAAR_DETAILS_ENDPOINT = BAZAAR_API_BASE + 'AppDetailsV2Request';

/* کافه‌بازار به این فیلدها فقط به‌عنوان «شبیه‌ساز کلاینت اندروید» نگاه می‌کند
   و مقدارشان احراز هویت نمی‌شود؛ هر مقدار ثابتی کار می‌کند. */
var BAZAAR_FALLBACK_DEVICE_ID = '488o50b88f5x228d';
var BAZAAR_CLIENT = {
  clientID: 'DFztC8oYTRuFZSf4565xu52',
  clientVersion: '8.11.2',
  clientVersionCode: 801102,
  language: 2
};

var PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;

function makeDeviceId() {
  var hex = '0123456789abcdef';
  var out = '';
  for (var i = 0; i < 16; i++) out += hex[Math.floor(Math.random() * 16)];
  return out;
}

/* ورودی می‌تواند نام پکیج، لینک صفحهٔ اپ یا باکس کامل آدرس باشد. */
function extractPackageName(input) {
  if (!input) return '';
  var s = String(input).trim();
  if (!s) return '';

  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname;
    } catch (e) {
      /* آدرس ناقص بود؛ همان رشته را ادامه می‌دهیم */
    }
  }

  var m = s.match(/\/(?:apps?|install|apk)\/([A-Za-z0-9._]+)/);
  if (m) return m[1];

  s = s.replace(/^\/+|\/+$/g, '');
  if (PACKAGE_RE.test(s)) return s;

  m = s.match(/([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)/);
  return m ? m[1] : '';
}

function bazaarProperties(deviceId) {
  var props = {
    androidClientInfo: {
      adId: '',
      adOptOut: false,
      androidId: deviceId || BAZAAR_FALLBACK_DEVICE_ID,
      city: 'NA',
      country: 'NA',
      province: 'NA',
      cpu: 'armeabi-v7a,armeabi',
      device: '',
      dpi: 510,
      hardware: '',
      height: 1920,
      locale: '',
      manufacturer: 'huawei',
      mcc: 432,
      mnc: 20,
      model: 'p50-pro',
      osBuild: '',
      product: 'p50',
      sdkVersion: 23,
      width: 1080
    },
    appThemeState: 0,
    isKidsEnabled: false
  };
  for (var k in BAZAAR_CLIENT) props[k] = BAZAAR_CLIENT[k];
  return props;
}

function bazaarDownloadPayload(packageName, deviceId) {
  return {
    properties: bazaarProperties(deviceId),
    singleRequest: {
      appDownloadInfoRequest: {
        packageName: packageName,
        deviceId: deviceId || BAZAAR_FALLBACK_DEVICE_ID,
        referrers: []
      }
    }
  };
}

function bazaarDetailsPayload(packageName, deviceId) {
  return {
    properties: bazaarProperties(deviceId),
    singleRequest: {
      appDetailsV2Request: {
        packageName: packageName,
        referrers: [
          { type: 11, extraJson: '{"services":"vitrin","slug":"home"}' }
        ]
      }
    }
  };
}

async function postBazaar(endpoint, payload) {
  var res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw httpError('cafebazaar', res.status);

  var data = await res.json();
  var status = data && data.properties ? data.properties.statusCode : undefined;
  if (status && status !== 200) {
    var msg = (data.properties && data.properties.errorMessage) || ('statusCode ' + status);
    throw new Error(msg);
  }
  return data.singleReply;
}

function pickDownloadUrl(info) {
  if (Array.isArray(info.fullPathUrls) && info.fullPathUrls.length) {
    return info.fullPathUrls[0];
  }
  var cdn = Array.isArray(info.cdnPrefix) && info.cdnPrefix.length ? info.cdnPrefix[0] : '';
  if (cdn && info.token) return cdn + info.token;
  return '';
}

function humanSize(bytes) {
  var n = Number(bytes);
  if (!isFinite(n) || n <= 0) return '';
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
}

/* نام فایل خروجی از همان تکهٔ packageName در آدرس صفحه ساخته می‌شود. */
function apkFilename(packageName) {
  var pkg = extractPackageName(packageName) || String(packageName || '').trim();
  return (pkg || 'app') + '.apk';
}

async function bazaarDownloadInfo(packageName, deviceId) {
  var reply = await postBazaar(
    BAZAAR_DOWNLOAD_ENDPOINT,
    bazaarDownloadPayload(packageName, deviceId)
  );
  var info = reply && reply.appDownloadInfoReply;
  if (!info) throw new Error('کافه‌بازار برای این پکیج اطلاعات دانلودی برنگرداند');

  var url = pickDownloadUrl(info);
  if (!url) throw new Error('لینک دانلود در پاسخ کافه‌بازار پیدا نشد');

  return {
    packageName: packageName,
    appName: info.appName || packageName,
    versionCode: info.versionCode || 0,
    sizeBytes: Number(info.packageSize) || 0,
    sizeText: humanSize(info.packageSize),
    url: url,
    isFree: true
  };
}

async function bazaarAppDetails(packageName, deviceId) {
  var reply = await postBazaar(
    BAZAAR_DETAILS_ENDPOINT,
    bazaarDetailsPayload(packageName, deviceId)
  );
  var d = reply && reply.appDetailsV2Reply;
  if (!d) return null;

  var author = d.meta && d.meta.author ? d.meta.author : {};
  return {
    name: (d.meta && d.meta.name) || packageName,
    developer: author.name || '',
    iconUrl: (d.media && d.media.iconUrl) || '',
    versionName: (d.package && d.package.versionName) || '',
    sizeText: (d.package && d.package.verboseSizeLabel) || '',
    shortDescription: (d.meta && d.meta.shortDescription) || ''
  };
}

/* ------------------------------------------------------------------ */
/* فروشگاه‌ها                                                          */
/* ------------------------------------------------------------------ */

var STORE_CAFEBAZAAR = 'cafebazaar';
var STORE_MYKET = 'myket';

var STORES = [
  { id: STORE_CAFEBAZAAR, label: 'کافه‌بازار', host: /(^|\.)cafebazaar\.ir$/i },
  { id: STORE_MYKET, label: 'مایکت', host: /(^|\.)myket\.ir$/i }
];

function storeById(id) {
  for (var i = 0; i < STORES.length; i++) if (STORES[i].id === id) return STORES[i];
  return STORES[0];
}

function storeLabel(id) {
  return storeById(id).label;
}

/* از آدرس صفحه تشخیص می‌دهد اپ در کدام فروشگاه است. */
function detectStore(url) {
  var host;
  try {
    host = new URL(String(url)).hostname;
  } catch (e) {
    return null;
  }
  for (var i = 0; i < STORES.length; i++) {
    if (STORES[i].host.test(host)) return STORES[i].id;
  }
  return null;
}

/* خطای ساختاریافته؛ code را برای پیام‌های محلی‌شدهٔ UI نگه می‌داریم. */
function httpError(store, status) {
  var err = new Error(status === 404
    ? 'NOT_FOUND'
    : ('خطای شبکه از سمت ' + storeLabel(store) + ' (HTTP ' + status + ')'));
  err.code = status === 404 ? 'NOT_FOUND' : 'NETWORK';
  return err;
}

function notFoundError(message) {
  var err = new Error(message || 'NOT_FOUND');
  err.code = 'NOT_FOUND';
  return err;
}

/* ------------------------------------------------------------------ */
/* مایکت (myket.ir)                                                    */
/* ------------------------------------------------------------------ */

var MYKET_BASE = 'https://myket.ir';

function myketPageUrl(packageName) {
  return MYKET_BASE + '/app/' + encodeURIComponent(packageName);
}

/* همان لینکی که دکمهٔ «دانلود» خود سایت استفاده می‌کند؛ ۳۰۲ به CDN می‌خورد. */
function myketDownloadLink(packageName) {
  return MYKET_BASE + '/dl?packageName=' + encodeURIComponent(packageName);
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, ' ');
}

function collapse(s) {
  return String(s).replace(/[\s\u200c]+/g, ' ').trim();
}

/* بلوک ld+json از نوع SoftwareApplication را از HTML صفحه بیرون می‌کشد. */
function parseMyketLdJson(html) {
  var re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(html))) {
    try {
      var d = JSON.parse(m[1].trim());
      if (d && d['@type'] === 'SoftwareApplication') return d;
    } catch (e) {
      /* بلوک نامعتبر را رد کن و بعدی را ببین */
    }
  }
  return null;
}

function myketPriceText(app) {
  if (!app || !app.offers) return '';
  var p = app.offers.price;
  if (p === undefined || p === null) return '';
  return String(p);
}

async function myketAppDetails(packageName) {
  var res = await fetch(myketPageUrl(packageName), {
    headers: { Accept: 'text/html' }
  });
  if (res.status === 404) throw notFoundError();
  if (!res.ok) throw httpError(MYKET, res.status);

  var html = await res.text();
  var app = parseMyketLdJson(html);
  if (!app) throw notFoundError();

  var name = app.name || packageName;
  var h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    var t = collapse(decodeEntities(stripTags(h1[1])));
    if (t) name = t;
  }

  var price = myketPriceText(app);
  return {
    name: name,
    developer: (app.author && app.author.name) || '',
    iconUrl: app.image || '',
    versionName: app.softwareVersion || '',
    sizeText: app.fileSize || '',
    shortDescription: app.description || '',
    isFree: price === '' || Number(price) === 0
  };
}

async function myketDownloadInfo(packageName, details) {
  var link = myketDownloadLink(packageName);

  /* با Range یک بایت، فقط هدرها و آدرس نهایی را می‌گیریم؛ بدنه را فوراً قطع می‌کنیم. */
  var res = await fetch(link, { headers: { Range: 'bytes=0-0', Accept: '*/*' } });
  if (res.status === 404) throw notFoundError();
  if (!res.ok && res.status !== 206) throw httpError(MYKET, res.status);

  var url = res.url || link;
  var contentRange = res.headers.get('Content-Range') || '';
  try {
    if (res.body && res.body.cancel) res.body.cancel();
  } catch (e) { /* قطع نکردن مهم نیست */ }

  var sizeBytes = 0;
  var m = contentRange.match(/\/(\d+)\s*$/);
  if (m) sizeBytes = Number(m[1]);

  return {
    packageName: packageName,
    appName: (details && details.name) || packageName,
    versionCode: 0,
    sizeBytes: sizeBytes,
    sizeText: sizeBytes ? humanSize(sizeBytes) : ((details && details.sizeText) || ''),
    url: url,
    isFree: !details || details.isFree !== false
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractPackageName: extractPackageName,
    bazaarDownloadInfo: bazaarDownloadInfo,
    bazaarAppDetails: bazaarAppDetails,
    myketDownloadInfo: myketDownloadInfo,
    myketAppDetails: myketAppDetails,
    myketDownloadLink: myketDownloadLink,
    parseMyketLdJson: parseMyketLdJson,
    detectStore: detectStore,
    storeLabel: storeLabel,
    pickDownloadUrl: pickDownloadUrl,
    humanSize: humanSize,
    apkFilename: apkFilename,
    makeDeviceId: makeDeviceId,
    STORE_CAFEBAZAAR: STORE_CAFEBAZAAR,
    STORE_MYKET: STORE_MYKET,
    BAZAAR_DOWNLOAD_ENDPOINT: BAZAAR_DOWNLOAD_ENDPOINT,
    BAZAAR_DETAILS_ENDPOINT: BAZAAR_DETAILS_ENDPOINT
  };
}
