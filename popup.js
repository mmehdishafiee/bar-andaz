const $ = (id) => document.getElementById(id);

const pkgInput = $('pkg');
const msgBox = $('msg');
const card = $('card');
const goBtn = $('go');
const clearBtn = $('clear');

let store = STORE_CAFEBAZAAR;
let current = null; // { url, filename, appName }

/* ---------- فروشگاه ---------- */

function setStore(id) {
  store = storeById(id).id;
  for (const b of document.querySelectorAll('.switch__item')) {
    b.classList.toggle('active', b.dataset.store === store);
    b.setAttribute('aria-selected', String(b.dataset.store === store));
  }
}

for (const b of document.querySelectorAll('.switch__item')) {
  b.addEventListener('click', () => {
    setStore(b.dataset.store);
    clearMsg();
  });
}

/* ---------- پیام ---------- */

function showMsg(text, kind) {
  msgBox.textContent = text;
  msgBox.className = 'alert alert--' + (kind || 'info');
  msgBox.hidden = false;
}

function clearMsg() {
  msgBox.hidden = true;
  msgBox.textContent = '';
}

function setBusy(busy) {
  goBtn.disabled = busy;
  goBtn.lastChild.textContent = busy ? ' در حال دریافت…' : ' دریافت لینک';
}

function askBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!resp) {
        reject(new Error('پاسخی از سرویس افزونه دریافت نشد'));
        return;
      }
      if (!resp.ok) {
        const err = new Error(resp.error || 'خطای نامشخص');
        err.code = resp.code;
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

/* ---------- نتیجه ---------- */

function addChip(parent, text, extraClass) {
  const el = document.createElement('span');
  el.className = 'chip' + (extraClass ? ' ' + extraClass : '');
  el.textContent = text;
  parent.append(el);
}

function render(data) {
  const info = data.info;
  const details = data.details || {};
  const label = storeLabel(data.store);

  $('appName').textContent = details.name || info.appName || info.packageName;

  const chips = $('chips');
  chips.textContent = '';
  addChip(chips, label, 'chip--store');
  if (details.versionName) addChip(chips, 'نسخه ' + details.versionName);
  else if (info.versionCode) addChip(chips, 'build ' + info.versionCode);
  const size = info.sizeText || details.sizeText;
  if (size) addChip(chips, size);
  if (details.developer) addChip(chips, details.developer);

  const icon = $('icon');
  if (details.iconUrl) {
    icon.src = details.iconUrl;
    icon.hidden = false;
  } else {
    icon.hidden = true;
  }

  const badge = $('badge');
  const free = details.isFree !== false;
  badge.textContent = free ? 'رایگان' : 'پولی';
  badge.classList.toggle('badge--paid', !free);
  badge.hidden = false;
  badge.style.display = '';

  $('url').value = info.url;
  $('open').href = info.url;

  current = {
    url: info.url,
    filename: apkFilename(info.packageName),
    appName: details.name || info.appName || info.packageName
  };

  card.hidden = false;

  if (!free) {
    showMsg('این اپ در ' + label + ' رایگان نیست؛ لینک دانلود ممکن است کار نکند.', 'info');
  }
}

/* ---------- اجرا ---------- */

async function run(rawInput) {
  clearMsg();
  card.hidden = true;
  current = null;

  // اگر ورودی لینک صفحهٔ یک فروشگاه بود، فروشگاه را هم از همان تشخیص بده.
  const detected = detectStore(rawInput);
  if (detected) setStore(detected);

  const pkg = extractPackageName(rawInput);
  if (!pkg) {
    showMsg('نام پکیج معتبر نیست. مثلاً: com.example.app', 'error');
    return;
  }
  pkgInput.value = pkg;
  clearBtn.hidden = false;

  const storeAtStart = store;
  setBusy(true);
  try {
    const resp = await askBackground({ type: 'APP_DOWNLOAD', packageName: pkg, store: storeAtStart });
    render(resp);
  } catch (err) {
    const code = err && err.code;
    if (code === 'NOT_FOUND' || /not found/i.test(err.message)) {
      showMsg('این پکیج در ' + storeLabel(storeAtStart) + ' پیدا نشد.', 'error');
    } else {
      showMsg('خطا: ' + ((err && err.message) || err), 'error');
    }
  } finally {
    setBusy(false);
  }
}

async function fillFromTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      showMsg('نمی‌توانم آدرس تب فعلی را بخوانم.', 'error');
      return;
    }
    const detected = detectStore(tab.url);
    const pkg = extractPackageName(tab.url);
    if (!pkg || !detected) {
      showMsg('از این صفحه نام پکیجی پیدا نشد. صفحهٔ اپ را در cafebazaar.ir یا myket.ir باز کن.', 'info');
      return;
    }
    setStore(detected);
    pkgInput.value = pkg;
    clearBtn.hidden = false;
    run(pkg);
  } catch (err) {
    showMsg('خطا: ' + ((err && err.message) || err), 'error');
  }
}

/* ---------- رویدادها ---------- */

goBtn.addEventListener('click', () => run(pkgInput.value));
$('fromTab').addEventListener('click', fillFromTab);

pkgInput.addEventListener('input', () => {
  clearBtn.hidden = !pkgInput.value;
});
pkgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') run(pkgInput.value);
});

clearBtn.addEventListener('click', () => {
  pkgInput.value = '';
  clearBtn.hidden = true;
  clearMsg();
  card.hidden = true;
  current = null;
  pkgInput.focus();
});

$('copy').addEventListener('click', async () => {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(current.url);
  } catch (e) {
    $('url').select();
    document.execCommand('copy');
  }
  showMsg('لینک کپی شد.', 'info');
});

$('dl').addEventListener('click', async () => {
  if (!current) return;
  clearMsg();
  try {
    await askBackground({ type: 'DOWNLOAD_FILE', url: current.url, filename: current.filename });
    showMsg('دانلود شروع شد؛ در صفحهٔ Downloads مرورگر ببین.', 'info');
  } catch (err) {
    showMsg('خطا در شروع دانلود: ' + ((err && err.message) || err), 'error');
  }
});

/* ---------- راه‌اندازی ---------- */

(async () => {
  setStore(STORE_CAFEBAZAAR);
  clearBtn.hidden = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab && tab.url;
    if (!url) return;
    const detected = detectStore(url);
    if (detected) setStore(detected);
    const pkg = extractPackageName(url);
    if (pkg) {
      pkgInput.value = pkg;
      clearBtn.hidden = false;
    }
  } catch (e) {
    /* بی‌اهمیت */
  }
})();
