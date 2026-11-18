# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] — 2026-11-18

### Added

- Myket (`myket.ir`) support alongside Cafebazaar, with automatic store
  detection from the page URL.
- Store switcher in the popup, and a store chip in the result card.
- Bundled Vazirmatn variable font (Arabic subset) for Persian typography.
- `tools/check.js` — offline static checks (manifest, referenced files, syntax,
  popup wiring), used by CI.
- `tools/build.js` — packaged `dist/bar-andaz-v<version>.zip` with a built-in
  ZIP writer, so the project needs no npm dependencies.
- GitHub scaffolding: CI workflow, release workflow, issue and PR templates.

### Changed

- **Renamed to «بار انداز»** and rebranded with Leepaak's identity: the site's
  blue (`#473BF0`) and coral (`#EE675A`) palette, the Leepaak mark in the icon
  and header, and the site's radius/easing tokens.
- Popup redesigned: light and dark themes that follow the OS preference,
  Lucide-style icons, chip-based metadata, a status badge, and an inline clear
  button on the input.
- Floating in-page button restyled to match, sharing the same design tokens.
- Errors now carry a machine-readable `code` so the UI can localise messages
  ("این پکیج در … پیدا نشد" instead of a raw HTTP status).
- `README.md`, `CONTRIBUTING.md` and licence documentation rewritten; third-party
  attributions moved to `LICENSES.md`.

### Fixed

- The `<a>` "open link" control in the popup inherited no `button` styles and
  rendered at the wrong size.

## [1.1.0] — 2026-11-18

### Added

- Myket download support (page `ld+json` metadata + `/dl` redirect resolution).
- Store selector in the popup.

## [1.0.0] — 2026-11-18

### Added

- Initial rewrite of the broken 2022 "Cafebazaar APK Downloader".
- `AppDownloadInfoRequest` / `AppDetailsV2Request` integration.
- Popup, floating in-page button, and `packageName.apk` file naming.
- Manifest V3 service worker as the single network egress point.

[Unreleased]: https://github.com/mmehdishafiee/bar-andaz/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/mmehdishafiee/bar-andaz/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mmehdishafiee/bar-andaz/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mmehdishafiee/bar-andaz/releases/tag/v1.0.0
