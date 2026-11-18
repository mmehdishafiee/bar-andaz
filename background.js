/*
 * سرویس‌ورکر (Manifest V3)
 *
 * همهٔ درخواست‌های شبکه از اینجا انجام می‌شود، چون content script طبق
 * CORS نمی‌تواند مستقیم به API فروشگاه‌ها درخواست بزند. سرویس‌ورکر با
 * host_permissions این کار را بدون محدودیت انجام می‌دهد.
 *
 * این context DOM ندارد (نه DOMParser نه document)، پس تجزیهٔ HTML مایکت
 * با regex انجام می‌شود — در shared.js.
 */

importScripts('shared.js');

async function getDeviceId() {
  const stored = await chrome.storage.local.get('deviceId');
  if (stored && stored.deviceId) return stored.deviceId;
  const id = makeDeviceId();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

async function handleCafebazaar(packageName) {
  const deviceId = await getDeviceId();

  // اطلاعات دانلود حیاتی است؛ جزئیات اپ (اسم/آیکون/نسخه) اختیاری و تزئینی.
  const info = await bazaarDownloadInfo(packageName, deviceId);
  let details = null;
  try {
    details = await bazaarAppDetails(packageName, deviceId);
  } catch (e) {
    details = null;
  }
  return { info, details };
}

async function handleMyket(packageName) {
  // در مایکت اول باید اپ وجود داشته باشد؛ لینک دانلود از همان صفحه می‌آید.
  const details = await myketAppDetails(packageName);
  const info = await myketDownloadInfo(packageName, details);
  return { info, details };
}

async function handleDownload(packageName, store) {
  const id = store || STORE_CAFEBAZAAR;
  return id === STORE_MYKET
    ? handleMyket(packageName)
    : handleCafebazaar(packageName);
}

function sanitizeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim();
}

function downloadFile(url, filename) {
  return chrome.downloads.download({
    url,
    filename: sanitizeFilename(filename),
    saveAs: false
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'APP_DOWNLOAD') {
    const pkg = extractPackageName(msg.packageName) || String(msg.packageName || '').trim();
    if (!pkg) {
      sendResponse({ ok: false, error: 'نام پکیج معتبر نیست', code: 'BAD_PACKAGE' });
      return;
    }
    const store = msg.store === STORE_MYKET ? STORE_MYKET : STORE_CAFEBAZAAR;
    handleDownload(pkg, store)
      .then((data) => sendResponse({
        ok: true,
        packageName: pkg,
        store: store,
        info: data.info,
        details: data.details
      }))
      .catch((err) => sendResponse({
        ok: false,
        error: (err && err.message) || String(err),
        code: (err && err.code) || 'UNKNOWN'
      }));
    return true; // پاسخ را async می‌فرستیم
  }

  if (msg.type === 'DOWNLOAD_FILE') {
    if (!msg.url) {
      sendResponse({ ok: false, error: 'آدرسی برای دانلود داده نشد', code: 'BAD_URL' });
      return;
    }
    downloadFile(msg.url, msg.filename || 'app.apk')
      .then((id) => sendResponse({ ok: true, downloadId: id }))
      .catch((err) => sendResponse({ ok: false, error: (err && err.message) || String(err), code: 'DOWNLOAD_FAILED' }));
    return true;
  }
});
