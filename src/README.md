# strava-kudos

A lightweight browser extension for Chrome, Edge, Brave, Opera, and Firefox
that adds a **Give Kudos to All** button to Strava navigation.

## Features

- Give kudos to eligible activities currently loaded on the page.
- Supports current feed cards and legacy kudos buttons.
- Current feed-card handling skips already-kudoed activities, disabled buttons,
  and your own activities.
- Displays a count of kudos button clicks. Click again to hide the count.
- Restores the button if Strava renders or replaces its navigation.

The extension does not automatically scroll or load additional activities.
The count represents clicks, not confirmed successful requests to Strava.
There are no feed filters, extra navigation links, or settings.

## Installation

### Chrome and Chromium browsers

1. Download or build the Chromium ZIP from the
   [project repository](https://github.com/geekatwork/strava-kudos).
2. Extract `chromium.zip` into a permanent folder on the computer running
   your browser.
3. Open the browser's extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
   - Opera: `opera://extensions`
4. Enable **Developer mode**, click **Load unpacked**, and select the extracted
   folder containing `manifest.json`.
5. Disable any original Strava Helper installation to avoid running two copies.
6. Open or refresh your [Strava dashboard](https://www.strava.com/dashboard).

Load the extracted folder, not the ZIP. Keep the folder in place while the
extension is installed. After replacing its files with a newer build, reload
the extension on the extensions page and refresh Strava.

### Firefox (temporary development installation)

1. Download or build `firefox.zip` and extract it.
2. Open `about:debugging`, select **This Firefox**, and click
   **Load Temporary Add-on**.
3. Select `manifest.json` in the extracted folder.
4. Disable any original Strava Helper installation and refresh Strava.

Temporary add-ons are removed when Firefox restarts. Normal Firefox
distribution requires a signed add-on; see Distribution below.

## Building

Requires the Node.js/npm setup described under Development tests.
From the project folder, run:

```bash
npm ci
npm run build -- --firefox-id strava-kudos@example.org
```

Replace the example ID with a unique, stable email-shaped Firefox add-on ID
before publishing. It does not need to be a real email address. Keep the same
ID for subsequent releases.

The build script uses the JavaScript, CSS, icons, and README from `src/` to
create:

| Output | Target |
| --- | --- |
| `dist/chromium.zip` | Chrome, Edge, Brave, and Opera |
| `dist/firefox.zip` | Firefox, with its add-on ID and data-collection declaration |

Each ZIP contains `manifest.json` at its root. Rebuilding overwrites these
ZIPs. Generated builds in `dist/` are tracked in Git alongside the source.
Safari builds are not provided.

## Development tests

Requires Node.js 22.12+ (22.x), 24.x, or 26+ and npm.

```bash
npm ci
npm test
```

The Vitest tests run the shipped content script in isolated jsdom pages with
synthetic current and legacy feed fixtures. They do not load remote resources
or send real kudos, and disconnect their observers after each test.
Test dependencies are development-only and are not included in browser ZIPs.

Tests cover eligibility, overlapping selectors, counts/reset, and navigation
mounting/replacement. Disabled legacy buttons are excluded from the count,
and buttons matching both selectors are clicked only once while retaining
current-card eligibility checks.

DOM tests do not prove compatibility with Strava's live markup. Before a
release, manually smoke-test the unpacked extension in Chrome and Firefox,
including navigation changes and kudos behavior on activities you intend to
give kudos to.

## Distribution

### Chrome Web Store

1. Register in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Create a new item and upload `dist/chromium.zip` directly.
3. Complete the listing, screenshots, privacy disclosures, site-access
   justification, and testing instructions.
4. Submit for review.

For updates, increase the version in `src/manifest.json` in the project, rebuild,
and upload the new ZIP to the same store listing.

See the [official publishing guide](https://developer.chrome.com/docs/webstore/publish).
Edge and Opera have their own store submission processes.

### Mozilla Add-ons

Upload `dist/firefox.zip` through [Mozilla Add-ons](https://addons.mozilla.org/developers/)
for review and signing. Choose listed distribution for a public store listing
or unlisted distribution for self-distribution of the signed add-on.
Keep the Firefox add-on ID unchanged across releases, increase the manifest
version, and rebuild for each update.

The generated Firefox manifest declares no extension data collection. The
extension interacts locally with page controls; clicking kudos causes Strava
itself to send its normal kudos requests. Keep store disclosures accurate if
the extension's behavior changes.

## Attribution

This extension is based on the kudos functionality of the **Strava Helper**
extension. It is an unofficial extension and is not affiliated with Strava.
