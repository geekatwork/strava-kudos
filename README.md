# strava-kudos

A lightweight browser extension that adds **Give Kudos to All** to Strava
navigation. Supports Chrome, Edge, Brave, Opera, and Firefox. It works on
loaded activities and does not automatically scroll.

See the [extension README](./src/README.md) for installation, usage,
limitations, supported browsers, and attribution.

## Downloads

- [Chromium ZIP](https://github.com/geekatwork/strava-kudos/raw/refs/heads/main/dist/chromium.zip)
- [Firefox ZIP](https://github.com/geekatwork/strava-kudos/raw/refs/heads/main/dist/firefox.zip)

Extract the Chromium ZIP and use **Load unpacked** on your browser's
extensions page. The Firefox ZIP is an unsigned development package; use
**Load Temporary Add-on** in `about:debugging`. Normal Firefox distribution
requires Mozilla signing.

## Project layout

```text
src/          Extension manifest, JavaScript, CSS, icons, and packaged README
scripts/      Build tooling
tests/        Offline behavior tests and synthetic feed fixtures
dist/         Tracked browser ZIPs
```

## Development

Requires Node.js 22.12+ (22.x), 24.x, or 26+ and npm.

```bash
npm ci
npm test
node --check src/js/strave_kudos.js
```

Vitest runs the actual content script in isolated jsdom pages. Tests use
synthetic fixtures, load no remote resources, send no real kudos, and clean
up their observers. Test dependencies are not shipped in the extension.
Live-site Chrome and Firefox smoke tests are still needed before release.

## Build

Requires Python 3.9+ with no additional dependencies. From the project root:

```bash
python3 scripts/build.py --firefox-id strava-kudos@example.org
```

On Windows, use `py -3` if that is your Python launcher. Choose a unique,
permanent Firefox add-on ID before publishing, and keep it for future updates.
The example ID is a placeholder, not a real email address.

The script resolves paths relative to the project, so it can also be called
by absolute path from another directory. It packages `src/README.md`, not
this developer README, and writes `dist/chromium.zip` and `dist/firefox.zip`
with `manifest.json` at the ZIP root. Rebuilding overwrites those tracked
files; commit them with the source when preparing a release.

For a version update, edit `src/manifest.json`, run tests, rebuild both ZIPs,
and commit. Store submission is currently manual; see the
[distribution instructions](./src/README.md#distribution).

## Roadmap

Tests, CI, store publishing, and additional browser support are tracked in
[GitHub issues](https://github.com/geekatwork/strava-kudos/issues) and the
[project board](https://github.com/users/geekatwork/projects/5).

## Attribution

Based on the kudos functionality of Strava Helper. This is an unofficial
extension and is not affiliated with Strava.
