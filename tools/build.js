#!/usr/bin/env node
/*
 * ساخت بستهٔ نصبی برای انتشار (بدون هیچ وابستگی npm).
 *
 *   node tools/build.js
 *
 * خروجی: dist/bar-andaz-v<version>.zip
 * فقط فایل‌های زمان اجرا داخل zip می‌روند؛ docs/ tools/ .github/ نه.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const INCLUDE = [
  "manifest.json",
  "shared.js",
  "background.js",
  "content.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons",
  "fonts",
  "LICENSE",
  "LICENSES.md",
  "README.md",
];

/* ---------------- minimal ZIP writer ---------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() / 2)) & 0xffff;
  const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  return { time, day };
}

function zip(entries) {
  const { time, day } = dosDateTime(new Date());
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);       // version needed to extract
    local.writeUInt16LE(0x0800, 6);   // general purpose flags: UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    parts.push(local, name, payload);
    central.push({ name, method, crc, comp: payload.length, size: data.length, offset, time, day });
    offset += local.length + name.length + payload.length;
  }

  const centralStart = offset;
  for (const e of central) {
    const rec = Buffer.alloc(46);
    rec.writeUInt32LE(0x02014b50, 0);
    rec.writeUInt16LE(20, 4);      // version made by
    rec.writeUInt16LE(20, 6);      // version needed
    rec.writeUInt16LE(0x0800, 8);  // flags
    rec.writeUInt16LE(e.method, 10);
    rec.writeUInt16LE(e.time, 12);
    rec.writeUInt16LE(e.day, 14);
    rec.writeUInt32LE(e.crc, 16);
    rec.writeUInt32LE(e.comp, 20);
    rec.writeUInt32LE(e.size, 24);
    rec.writeUInt16LE(e.name.length, 28);
    rec.writeUInt16LE(0, 30);      // extra length
    rec.writeUInt16LE(0, 32);      // comment length
    rec.writeUInt16LE(0, 34);      // disk number
    rec.writeUInt16LE(0, 36);      // internal attrs
    rec.writeUInt32LE(0o644 << 16, 38); // external attrs
    rec.writeUInt32LE(e.offset, 42);
    parts.push(rec, e.name);
    offset += rec.length + e.name.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - centralStart, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  parts.push(end);

  return Buffer.concat(parts);
}

/* ---------------- collect ---------------- */

function walk(absDir, relPrefix, out) {
  for (const name of fs.readdirSync(absDir).sort()) {
    const abs = path.join(absDir, name);
    const rel = relPrefix ? relPrefix + "/" + name : name;
    if (fs.statSync(abs).isDirectory()) {
      walk(abs, rel, out);
    } else {
      out.push({ name: rel, data: fs.readFileSync(abs) });
    }
  }
  return out;
}

function collect() {
  const entries = [];
  for (const item of INCLUDE) {
    const abs = path.join(ROOT, item);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) walk(abs, item, entries);
    else entries.push({ name: item, data: fs.readFileSync(abs) });
  }
  return entries;
}

/* ---------------- main ---------------- */

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const entries = collect();
const out = path.join(DIST, `bar-andaz-v${manifest.version}.zip`);

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(out, zip(entries));

const total = entries.reduce((n, e) => n + e.data.length, 0);
console.log(`packed ${entries.length} files (${(total / 1024).toFixed(1)} KiB raw)`);
for (const e of entries) console.log("   " + e.name);
console.log("\n" + out + "  (" + (fs.statSync(out).size / 1024).toFixed(1) + " KiB)");
