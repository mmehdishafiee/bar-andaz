#!/usr/bin/env node
/*
 * تست زندهٔ هستهٔ افزونه، بدون نیاز به نصب در کروم.
 * به شبکه نیاز دارد (به خود کافه‌بازار و مایکت وصل می‌شود).
 *
 *   node tools/test_core.js
 *
 * این تست در CI اجرا نمی‌شود؛ برای آن `node tools/check.js` هست.
 */

"use strict";

const S = require("../shared.js");

let failures = 0;
let count = 0;

function check(label, cond, extra) {
  count++;
  if (!cond) failures++;
  console.log(`  [${cond ? "OK  " : "FAIL"}] ${label}${extra ? " — " + extra : ""}`);
}

function section(t) {
  console.log("\n" + t);
}

/* ---------------- نام پکیج و فروشگاه ---------------- */

section("extractPackageName");
const pkgCases = [
  ["ir.tna.apartment", "ir.tna.apartment"],
  ["https://cafebazaar.ir/app/ir.tna.apartment", "ir.tna.apartment"],
  ["https://myket.ir/app/org.telegram.messenger", "org.telegram.messenger"],
  ["https://myket.ir/app/org.telegram.messenger/fa", "org.telegram.messenger"],
  ["https://cafebazaar.ir/install/org.telegram.messenger", "org.telegram.messenger"],
  ["nonsense!!", ""],
];
for (const [input, expected] of pkgCases) {
  const got = S.extractPackageName(input);
  check(`${JSON.stringify(input)} -> ${JSON.stringify(got)}`, got === expected);
}

section("detectStore");
check("cafebazaar.ir", S.detectStore("https://cafebazaar.ir/app/x.y") === "cafebazaar");
check("api.cafebazaar.ir", S.detectStore("https://api.cafebazaar.ir/x") === "cafebazaar");
check("myket.ir", S.detectStore("https://myket.ir/app/x.y") === "myket");
check("assets.myket.ir", S.detectStore("https://assets.myket.ir/apks/a.apk") === "myket");
check("google.com -> null", S.detectStore("https://google.com/") === null);

section("apkFilename");
check("ir.tna.apartment -> ir.tna.apartment.apk", S.apkFilename("ir.tna.apartment") === "ir.tna.apartment.apk");
check(
  "از لینک هم نام پکیج درست درمی‌آید",
  S.apkFilename("https://myket.ir/app/org.telegram.messenger") === "org.telegram.messenger.apk"
);

/* ---------------- کافه‌بازار ---------------- */

async function testCafebazaar() {
  section("کافه‌بازار — com.farsitel.bazaar");
  const dev = S.makeDeviceId();

  const info = await S.bazaarDownloadInfo("com.farsitel.bazaar", dev);
  check("info.url ساخته شد", /^https:\/\//.test(info.url));
  check("filename", S.apkFilename(info.packageName) === "com.farsitel.bazaar.apk");
  check("size", !!info.sizeText, info.sizeText);

  const details = await S.bazaarAppDetails("com.farsitel.bazaar", dev);
  check("details.name", !!(details && details.name));
  check("details.iconUrl", !!(details && details.iconUrl));

  const res = await fetch(info.url, { headers: { Range: "bytes=0-3" } });
  const buf = Buffer.from(await res.arrayBuffer());
  check(
    "لینک واقعاً APK می‌دهد",
    buf[0] === 0x50 && buf[1] === 0x4b,
    `HTTP ${res.status} magic ${JSON.stringify(buf.toString("latin1"))}`
  );
}

async function testCafebazaarNotFound() {
  section("کافه‌بازار — پکیج ناموجود");
  try {
    await S.bazaarDownloadInfo("com.this.does.not.exist.zzz", S.makeDeviceId());
    check("باید خطا می‌داد", false);
  } catch (e) {
    check("code = NOT_FOUND", e.code === "NOT_FOUND", `message=${e.message}`);
  }
}

/* ---------------- مایکت ---------------- */

async function testMyket() {
  section("مایکت — org.telegram.messenger");
  const details = await S.myketAppDetails("org.telegram.messenger");
  check("name", !!details.name, details.name);
  check("iconUrl", /^https:\/\/myket\.ir\//.test(details.iconUrl));
  check("isFree", details.isFree === true);

  const info = await S.myketDownloadInfo("org.telegram.messenger", details);
  check("لینک نهایی روی CDN مایکت است", /^https:\/\/assets\.myket\.ir\//.test(info.url), info.url);
  check("filename", S.apkFilename(info.packageName) === "org.telegram.messenger.apk");
  check("size تشخیص داده شد", info.sizeBytes > 0 || !!info.sizeText, `${info.sizeText} (${info.sizeBytes} bytes)`);

  const res = await fetch(info.url, { headers: { Range: "bytes=0-3" } });
  const buf = Buffer.from(await res.arrayBuffer());
  check(
    "لینک واقعاً APK می‌دهد",
    buf[0] === 0x50 && buf[1] === 0x4b,
    `HTTP ${res.status} magic ${JSON.stringify(buf.toString("latin1"))}`
  );
}

async function testMyketWhatsapp() {
  section("مایکت — com.whatsapp (نام فارسی + نسخه)");
  const d = await S.myketAppDetails("com.whatsapp");
  check("name", !!d.name, d.name);
  check("versionName از ld+json", !!d.versionName, d.versionName);
  check("sizeText از ld+json", !!d.sizeText, d.sizeText);
}

async function testMyketNotFound() {
  section("مایکت — پکیج ناموجود");
  try {
    await S.myketAppDetails("com.this.does.not.exist.zzz");
    check("باید خطا می‌داد", false);
  } catch (e) {
    check("code = NOT_FOUND", e.code === "NOT_FOUND", `message=${e.message}`);
  }
}

(async () => {
  try {
    await testCafebazaar();
    await testCafebazaarNotFound();
    await testMyket();
    await testMyketWhatsapp();
    await testMyketNotFound();
  } catch (e) {
    failures++;
    console.log("\nTHREW:", (e && e.message) || e);
  }
  console.log("\n" + (failures ? `${failures} of ${count} checks FAILED` : `all ${count} checks passed`));
  process.exit(failures ? 1 : 0);
})();
