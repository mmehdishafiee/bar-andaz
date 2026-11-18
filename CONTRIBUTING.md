# Contributing

ممنون که وقت می‌گذاری! این پروژه کوچک و بدون وابستگی است، پس مشارکت ساده است.

## راه‌اندازی محیط

```bash
git clone https://github.com/mmehdishafiee/bar-andaz.git
cd bar-andaz
npm run check      # باید پاس شود
npm test           # تست زنده؛ به شبکه نیاز دارد
```

برای تست دستی در مرورگر: `chrome://extensions` → **Developer mode** →
**Load unpacked** → ریشهٔ مخزن را انتخاب کن.

نیازمندی‌ها:

| ابزار | برای چه | نسخه |
|---|---|---|
| Node.js | `check.js`، `test_core.js`، `build.js` | ۱۸ به بالا |
| Python + Pillow | فقط `make_icons.py` (بازتولید آیکون‌ها) | ۳.۹+ |

هیچ `npm install` ای لازم نیست؛ پروژه هیچ وابستگی‌ای ندارد و عمداً همین‌طور می‌ماند.

## ساختار کد

| فایل | مسئولیت |
|---|---|
| `shared.js` | تنها منبع حقیقت برای ساختار APIها. توابع **خالص** — نه DOM، نه `chrome.*` |
| `background.js` | سرویس‌ورکر؛ **تنها** جایی که `fetch` زده می‌شود |
| `popup.js` | رابط پاپ‌آپ |
| `content.js` | دکمهٔ شناور درون صفحه |
| `popup.css` | توکن‌های طراحی و استایل هر دو تم |

سه قاعده که بهتر است نشکنی:

1. **در `shared.js` به `document` یا `chrome` دست نزن.** این فایل هم در
   سرویس‌ورکر (بدون DOM) و هم در پاپ‌آپ و هم در content script لود می‌شود.
2. **در `content.js` مستقیم `fetch` نزن.** در MV3 درخواست cross-origin از
   content script بلاک می‌شود؛ پیام به سرویس‌ورکر بفرست.
3. **در سرویس‌ورکر از `DOMParser` استفاده نکن.** وجود ندارد. تجزیهٔ HTML مایکت
   عمداً با regex انجام می‌شود.

## افزودن یک فروشگاه جدید

۱. در `shared.js` یک `STORE_*` و ورودی‌اش در آرایهٔ `STORES` اضافه کن
   (شناسه، برچسب فارسی، الگوی هاست).
۲. توابع `xxxAppDetails()` و `xxxDownloadInfo()` را بنویس که یک شیء با
   `{ packageName, appName, sizeText, url, isFree }` برگردانند. برای خطای
   «پیدا نشد» از `notFoundError()` و برای بقیه از `httpError(store, status)`
   استفاده کن.
۳. در `background.js` یک شاخهٔ `handleXxx()` و یک `case` اضافه کن.
۴. `host_permissions`، `content_scripts.matches` و `web_accessible_resources`
   را در `manifest.json` به‌روز کن.
۵. دکمه‌اش را در `popup.html` (کلاس `switch__item` با `data-store`) اضافه کن.
۶. یک تست در `tools/test_core.js` بنویس.

## تست‌ها

```bash
npm run check   # ایستا: بدون شبکه، همین در CI اجرا می‌شود
npm test        # زنده: واقعاً به کافه‌بازار و مایکت وصل می‌شود
```

`npm test` عمداً در CI اجرا نمی‌شود، چون به دسترسی شبکه به سرویس‌های ایرانی
نیاز دارد و رانرهای GitHub ممکن است به آن‌ها نرسند. اگر تغییری در `shared.js`
دادی که رفتار API را عوض می‌کند، **خروجی `npm test` را در توضیح PR بگذار.**

## Style

- JavaScript: دو فاصله، سمی‌کالن، `"use strict"` در toolها. کد افزونه از
  `var`/`async` سازگار با مرورگر استفاده می‌کند؛ از syntaxهای خیلی جدید که
  `minimum_chrome_version` پشتیبانی نمی‌کند پرهیز کن.
- توضیح‌های کد به فارسی‌اند (مثل بقیهٔ کد) و توضیح *چرا* می‌دهند، نه *چه*.
- سمت مرورگر: بدون فریمورک، بدون وابستگی، بدون build step.
- برای هر تغییر کاربرپسند، یک ورودی در `CHANGELOG.md` زیر `[Unreleased]` اضافه کن.
- نسخه را هم‌زمان در `manifest.json` و `package.json` بالا ببر
  (`tools/check.js` این را چک می‌کند).

## طراحی و برند

پالت و توکن‌های طراحی در `popup.css` از هویت بصری
[لیپک](https://leepaak.ir) آمده‌اند: آبی `#473BF0`، مرجانی `#EE675A`، شعاع‌های
۱۰/۱۶/۲۴ و آیکون‌های سبک Lucide با `stroke-width: 1.75`. اگر چیزی اضافه می‌کنی،
از همین توکن‌ها استفاده کن (`var(--lp-*)`)، نه رنگ هاردکد.

### Fork بدون برند

اگر می‌خواهی نسخهٔ خودت را منتشر کنی:

۱. `assets/leepaak-logo.webp` را با لوگوی خودت عوض کن و `npm run icons` را بزن.
۲. نام و `homepage_url` را در `manifest.json` تغییر بده.
۳. بخش Leepaak را از `LICENSES.md` حذف کن.
۴. بلوک برند در بالای `popup.css` را با پالت خودت جایگزین کن.

نام و لوگوی لیپک تحت مجوز MIT این مخزن نیستند (به `LICENSES.md` نگاه کن)، پس
لطفاً آن‌ها را با برند خودت عوض کن.

## Pull Request

- روی یک شاخهٔ جدا کار کن.
- PR را کوچک و متمرکز نگه دار.
- اگر UI را عوض کردی، یک اسکرین‌شات در PR بگذار.
- مطمئن شو `npm run check` پاس می‌شود.
- از قالب PR استفاده کن.

## گزارش باگ

از [issue template](https://github.com/mmehdishafiee/bar-andaz/issues/new/choose)
استفاده کن. اطلاعات مفید:

- نسخهٔ کروم و سیستمت
- نام پکیجی که کار نکرد (`com.example.app`)
- پیام دقیق خطا از `chrome://extensions` → آیکون افزونه → **Errors**
  یا از کنسول سرویس‌ورکر
- اگر UI مشکل داشت، اسکرین‌شات
