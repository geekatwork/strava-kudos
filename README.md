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

1. Build the extension using the instructions below.
2. Extract `dist/chromium.zip` into a permanent folder on the computer running
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

1. Build the extension and extract `dist/firefox.zip`.
2. Open `about:debugging`, select **This Firefox**, and click
   **Load Temporary Add-on**.
3. Select `manifest.json` in the extracted folder.
4. Disable any original Strava Helper installation and refresh Strava.

Temporary add-ons are removed when Firefox restarts. Normal Firefox
distribution requires a signed add-on; see Distribution below.

## Building

Requires **Python 3.9 or newer** with no additional dependencies.
From the project folder, run:

```bash
python3 build.py --firefox-id strava-kudos@example.org
```

On Windows, use `py -3` instead of `python3` if that is your Python launcher.
Replace the example ID with a unique, stable email-shaped Firefox add-on ID
before publishing. It does not need to be a real email address. Keep the same
ID for subsequent releases.

The build script uses the shared JavaScript, CSS, icons, and this README to
create:

| Output | Target |
| --- | --- |
| `dist/chromium.zip` | Chrome, Edge, Brave, and Opera |
| `dist/firefox.zip` | Firefox, with its add-on ID and data-collection declaration |

Each ZIP contains `manifest.json` at its root. Rebuilding overwrites these
ZIPs. Generated builds are excluded from Git by [.gitignore](./.gitignore).
Safari builds are not provided.

## Distribution

### Chrome Web Store

1. Register in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Create a new item and upload `dist/chromium.zip` directly.
3. Complete the listing, screenshots, privacy disclosures, site-access
   justification, and testing instructions.
4. Submit for review.

For updates, increase the version in [manifest.json](./manifest.json), rebuild,
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
