#!/usr/bin/env node
/*
 * بررسی‌های ایستا (بدون شبکه) — همان چیزی که CI اجرا می‌کند.
 *
 *   node tools/check.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

const RUNTIME_JS = ["shared.js", "background.js", "content.js", "popup.js"];
const RUNTIME_ASSETS = ["popup.html", "popup.css", "fonts/vazirmatn-arabic-var.woff2"];

let failures = 0;
let checks = 0;

function ok(label, detail) {
  checks++;
  console.log("  \u2713 " + label + (detail ? "  (" + detail + ")" : ""));
}

function fail(label, detail) {
  checks++;
  failures++;
  console.log("  \u2717 " + label + (detail ? "  \u2014 " + detail : ""));
}

function section(title) {
  console.log("\n" + title);
}

function expect(cond, label, detail) {
  cond ? ok(label, detail) : fail(label, detail);
}

/* ---------------- manifest ---------------- */

section("manifest.json");

const manifestPath = path.join(ROOT, "manifest.json");
let manifest = null;

if (!fs.existsSync(manifestPath)) {
  fail("manifest.json exists");
} else {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    ok("valid JSON");
  } catch (err) {
    fail("valid JSON", err.message);
  }
}

if (manifest) {
  expect(manifest.manifest_version === 3, "manifest_version is 3", String(manifest.manifest_version));
  expect(typeof manifest.name === "string" && manifest.name.length > 0, "has a name", manifest.name);
  expect(/^\d+\.\d+\.\d+$/.test(manifest.version || ""), "version is semver", manifest.version);
  expect(
    typeof manifest.description === "string" && manifest.description.length <= 132,
    "description present and \u2264 132 chars",
    manifest.description ? manifest.description.length + " chars" : "missing"
  );

  // Chrome refuses to load a manifest that declares a default locale without
  // shipping the _locales subtree.
  if ("default_locale" in manifest) {
    expect(
      fs.existsSync(path.join(ROOT, "_locales", manifest.default_locale, "messages.json")),
      "default_locale has a matching _locales subtree",
      manifest.default_locale
    );
  } else {
    ok("no default_locale without _locales");
  }

  const action = manifest.action || {};
  const icons = Object.assign({}, manifest.icons || {}, (action.default_icon || null) || {});
  expect(Object.keys(icons).length >= 3, "declares at least 3 icon sizes", Object.keys(icons).join(", "));

  const referenced = new Set([action.default_popup, manifest.background && manifest.background.service_worker]);
  Object.values(icons).forEach((p) => referenced.add(p));
  (manifest.content_scripts || []).forEach((cs) => (cs.js || []).forEach((p) => referenced.add(p)));
  (manifest.web_accessible_resources || []).forEach((war) => (war.resources || []).forEach((p) => referenced.add(p)));

  const missing = [...referenced]
    .filter(Boolean)
    .filter((p) => !p.includes("*"))
    .filter((p) => !fs.existsSync(path.join(ROOT, p)));
  expect(missing.length === 0, "every referenced file exists", missing.join(", ") || "all present");

  const hosts = manifest.host_permissions || [];
  expect(hosts.some((h) => /cafebazaar\.ir/.test(h)), "host permission for cafebazaar.ir");
  expect(hosts.some((h) => /myket\.ir/.test(h)), "host permission for myket.ir");
  expect(
    (manifest.permissions || []).includes("downloads"),
    "requests the downloads permission"
  );
}

/* ---------------- runtime files ---------------- */

section("runtime files");

for (const rel of RUNTIME_JS.concat(RUNTIME_ASSETS)) {
  expect(fs.existsSync(path.join(ROOT, rel)), rel + " exists");
}

/* ---------------- syntax ---------------- */

section("javascript syntax");

for (const rel of RUNTIME_JS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  try {
    execFileSync(process.execPath, ["--check", abs], { stdio: "pipe" });
    ok(rel + " parses");
  } catch (err) {
    fail(rel + " parses", (err.stderr || err.stdout || "").toString().trim().split("\n")[0]);
  }
}

/* ---------------- popup wiring ---------------- */

section("popup wiring");

const html = fs.existsSync(path.join(ROOT, "popup.html"))
  ? fs.readFileSync(path.join(ROOT, "popup.html"), "utf8")
  : "";
const popupJs = fs.existsSync(path.join(ROOT, "popup.js"))
  ? fs.readFileSync(path.join(ROOT, "popup.js"), "utf8")
  : "";
const css = fs.existsSync(path.join(ROOT, "popup.css"))
  ? fs.readFileSync(path.join(ROOT, "popup.css"), "utf8")
  : "";

const referencedIds = new Set();
for (const m of popupJs.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)) referencedIds.add(m[1]);
for (const m of popupJs.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)) referencedIds.add(m[1]);

const missingIds = [...referencedIds].filter((id) => !new RegExp('id="' + id + '"').test(html));
expect(missingIds.length === 0, "every id used by popup.js exists in popup.html", missingIds.join(", ") || "all found");

const cssAssets = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
const missingAssets = cssAssets.filter((p) => !fs.existsSync(path.join(ROOT, p)));
expect(missingAssets.length === 0, "every url() in popup.css resolves", missingAssets.join(", ") || cssAssets.length + " checked");

expect(/dir="rtl"/.test(html), "popup.html is RTL");

const contentJs = fs.existsSync(path.join(ROOT, "content.js"))
  ? fs.readFileSync(path.join(ROOT, "content.js"), "utf8")
  : "";

// Architecture rules the extension depends on — see CONTRIBUTING.md.
expect(
  !/\bfetch\s*\(/.test(contentJs),
  "content.js does not fetch directly (CORS would block it)"
);
expect(
  /\bchrome\.runtime\.sendMessage\s*\(/.test(contentJs),
  "content.js talks to the service worker instead"
);
expect(
  !/\bnew\s+DOMParser\b/.test(fs.readFileSync(path.join(ROOT, "shared.js"), "utf8")) &&
    !/\bnew\s+DOMParser\b/.test(fs.readFileSync(path.join(ROOT, "background.js"), "utf8")),
  "shared.js / background.js do not use DOMParser (no DOM in a service worker)"
);

/* ---------------- version sync ---------------- */

section("version sync");

const pkgPath = path.join(ROOT, "package.json");
if (fs.existsSync(pkgPath) && manifest) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  expect(pkg.version === manifest.version, "package.json version matches manifest", pkg.version + " vs " + manifest.version);
} else {
  ok("no package.json to compare");
}

/* ---------------- result ---------------- */

console.log("\n" + (failures ? `${failures} of ${checks} checks FAILED` : `all ${checks} checks passed`));
process.exit(failures ? 1 : 0);
