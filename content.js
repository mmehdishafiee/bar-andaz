/*
 * content script — روی صفحات cafebazaar.ir و myket.ir اجرا می‌شود و یک
 * دکمهٔ شناور «بار انداز» به صفحه اضافه می‌کند.
 *
 * نکته‌ها:
 *  - درخواست شبکه از اینجا زده نمی‌شود (CORS)، بلکه به سرویس‌ورکر پیام می‌دهیم.
 *  - از Shadow DOM استفاده شده تا استایل سایت میزبان خراب نشود.
 *  - فونت و آیکون از خود افزونه لود می‌شوند (web_accessible_resources).
 */

(function () {
  if (window.__barandazInjected) return;
  window.__barandazInjected = true;

  const pkg = extractPackageName(location.href);
  if (!pkg) return;

  const store = detectStore(location.href) || STORE_CAFEBAZAAR;
  const label = storeLabel(store);
  const fontUrl = chrome.runtime.getURL('fonts/vazirmatn-arabic-var.woff2');

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;bottom:18px;left:18px;';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      @font-face {
        font-family: "Vazirmatn Var";
        src: url("${fontUrl}") format("woff2-variations");
        font-weight: 100 900;
        font-display: swap;
      }
      :host { all: initial; }
      * { box-sizing: border-box; }
      .wrap {
        font-family: "Vazirmatn Var", Vazirmatn, "Segoe UI", Tahoma, sans-serif;
        direction: rtl; text-align: right; font-size: 12px; line-height: 1.7;
      }
      .i { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.75;
           stroke-linecap: round; stroke-linejoin: round; flex: 0 0 auto; }
      .toggle {
        display: inline-flex; align-items: center; gap: 8px;
        font: 700 13px/1.4 inherit; color: #fff; cursor: pointer;
        padding: 11px 16px; border: 0; border-radius: 100px;
        background: linear-gradient(180deg, #5a4ff5, #473bf0);
        box-shadow: 0 8px 24px rgb(71 59 240 / .4);
        transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s cubic-bezier(.22,1,.36,1);
      }
      .toggle:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgb(71 59 240 / .48); }
      .panel {
        margin-top: 10px; width: 304px; padding: 13px; color: #c0c0c6;
        background: #1b1a1a; border: 1px solid #36363d; border-radius: 24px;
        box-shadow: 0 18px 48px rgb(0 0 0 / .5);
      }
      .panel[hidden] { display: none; }
      .name { font-weight: 800; font-size: 13.5px; color: #fff; word-break: break-word; }
      .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
      .chip { padding: 2px 8px; border-radius: 100px; background: #242426;
              border: 1px solid #36363d; color: #aaaab3; font-size: 10.5px; white-space: nowrap; }
      .chip--store { background: rgb(71 59 240 / .16); border-color: rgb(71 59 240 / .35); color: #e2e2e7; }
      .url {
        width: 100%; margin-top: 10px; padding: 0 11px; height: 38px;
        background: #242426; color: #c0c0c6; border: 1px solid #36363d; border-radius: 10px;
        font: 11px/1.4 ui-monospace, Consolas, monospace; direction: ltr; outline: none;
      }
      .url:focus { border-color: #473bf0; box-shadow: 0 0 0 3px rgb(71 59 240 / .16); }
      .row { display: flex; gap: 6px; margin-top: 8px; }
      .btn {
        flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
        padding: 10px 12px; border: 1px solid transparent; border-radius: 10px;
        font: 700 12.5px/1.4 inherit; cursor: pointer; white-space: nowrap;
        transition: box-shadow .25s cubic-bezier(.22,1,.36,1), background .25s cubic-bezier(.22,1,.36,1);
      }
      .btn--cta { background: linear-gradient(180deg, #f1786c, #ee675a); color: #1b1a1a;
                  box-shadow: 0 4px 14px rgb(238 103 90 / .32); }
      .btn--cta:hover { box-shadow: 0 6px 20px rgb(238 103 90 / .42); }
      .btn--ghost { flex: 0 0 auto; width: 38px; padding: 0; background: #242426;
                    border-color: #36363d; color: #e2e2e7; }
      .btn--ghost:hover { background: #2e2e32; }
      .err { color: #ee675a; }
    </style>
    <div class="wrap">
      <button class="toggle" id="toggle">
        <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3"/><path d="M7 10l5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
        دانلود مستقیم APK
      </button>
      <div class="panel" id="panel" hidden>
        <div id="body">در حال آماده‌سازی…</div>
      </div>
    </div>
  `;

  const toggle = shadow.getElementById('toggle');
  const panel = shadow.getElementById('panel');
  const body = shadow.getElementById('body');
  let loaded = false;

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!resp) return reject(new Error('پاسخی از افزونه دریافت نشد'));
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

  function chip(text, extraClass) {
    const el = document.createElement('span');
    el.className = 'chip' + (extraClass ? ' ' + extraClass : '');
    el.textContent = text;
    return el;
  }

  async function load() {
    body.textContent = 'در حال دریافت لینک…';
    try {
      const resp = await send({ type: 'APP_DOWNLOAD', packageName: pkg, store: store });
      const info = resp.info;
      const d = resp.details || {};
      const size = info.sizeText || d.sizeText || '';
      const filename = apkFilename(info.packageName);

      body.textContent = '';

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = d.name || info.appName || pkg;

      const chips = document.createElement('div');
      chips.className = 'chips';
      chips.append(chip(label, 'chip--store'));
      if (d.versionName) chips.append(chip('نسخه ' + d.versionName));
      else if (info.versionCode) chips.append(chip('build ' + info.versionCode));
      if (size) chips.append(chip(size));

      const url = document.createElement('input');
      url.className = 'url';
      url.readOnly = true;
      url.value = info.url;

      const row = document.createElement('div');
      row.className = 'row';

      const dl = document.createElement('button');
      dl.className = 'btn btn--cta';
      dl.innerHTML = '<svg class="i" viewBox="0 0 24 24"><path d="M12 15V3"/><path d="M7 10l5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>دانلود APK';
      dl.addEventListener('click', async () => {
        try {
          await send({ type: 'DOWNLOAD_FILE', url: info.url, filename: filename });
          dl.textContent = 'شروع شد…';
          dl.disabled = true;
        } catch (e) {
          dl.textContent = 'خطا: ' + e.message;
        }
      });

      const cp = document.createElement('button');
      cp.className = 'btn btn--ghost';
      cp.title = 'کپی لینک';
      cp.innerHTML = '<svg class="i" viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
      cp.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(info.url);
          cp.style.color = '#ee675a';
          setTimeout(() => { cp.style.color = ''; }, 1200);
        } catch (e) {
          url.select();
        }
      });

      row.append(dl, cp);
      body.append(name, chips, url, row);
    } catch (e) {
      body.textContent = '';
      const err = document.createElement('div');
      err.className = 'err';
      err.textContent = e.code === 'NOT_FOUND'
        ? 'این پکیج در ' + label + ' پیدا نشد.'
        : 'خطا: ' + e.message;
      body.append(err);
    }
  }

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden && !loaded) {
      loaded = true;
      load();
    }
  });

  document.documentElement.appendChild(host);
})();
