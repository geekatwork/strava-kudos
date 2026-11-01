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

Requires Node.js 22.22.2+ (22.x), 24.15.0+ (24.x), or 26+ and npm.

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

Uses the same Node.js/npm setup as the tests; Python is not required.
From the project root:

```bash
npm ci
npm run build -- --firefox-id strava-kudos@example.org
```

Choose a unique, permanent Firefox add-on ID before publishing, and keep it for future updates.
The example ID is a placeholder, not a real email address.

The script resolves paths relative to the project, so it can also be called
by absolute path from another directory. It packages `src/README.md`, not
this developer README, and writes `dist/chromium.zip` and `dist/firefox.zip`
with `manifest.json` at the ZIP root. Rebuilding overwrites those tracked
files; commit them with the source when preparing a release.

For an isolated build without changing tracked ZIPs:

```bash
npm run build -- --firefox-id strava-kudos@example.org --output-dir /path/to/output
```

From another directory, invoke `node /path/to/project/scripts/build.js`
with the same arguments (after installing project dependencies).

For a version update, edit `src/manifest.json`, run tests, rebuild both ZIPs,
and commit. Store submission is currently manual; see the
[distribution instructions](./src/README.md#distribution).

## Continuous integration

Pull requests and pushes to `main` run the
[validation workflow](./.github/workflows/test.yml): syntax checks, offline
behavior/build tests, isolated ZIP builds, and Firefox `web-ext lint`.
Build tests use temporary directories and never overwrite tracked `dist/`.

CI artifacts use a test Firefox ID and are not store release packages.
The workflow has read-only repository permissions and no publishing secrets.
Tag-triggered store submission remains separate planned work.

### Tagged release builds

The [tagged release workflow](./.github/workflows/publish.yml) runs when a
new `v*` tag is pushed. It checks out the exact tagged commit, requires
`vMAJOR.MINOR.PATCH` to match `src/manifest.json`, runs tests, rebuilds from
source into temporary output, verifies archive contents and browser metadata,
and lints the Firefox package.

Before using it, set the repository Actions variable `FIREFOX_ADDON_ID` to
your permanent Firefox manifest ID. Missing or invalid configuration fails
explicitly; there is no default test identity for releases.

After a successful run, download `release-packages-vX.Y.Z` from its Actions
artifacts. These are unsigned packages, not store approvals or signed Firefox
installers. No store uploads occur yet; Chrome/Firefox submission jobs are
tracked in #5 and #6. Those jobs must use independent protected environments,
per-store concurrency with `cancel-in-progress: false`, and bounded status
checks when they are implemented.

Prepare releases by updating the source version, testing, rebuilding and
committing tracked `dist/`, then creating and pushing an annotated version tag.
Only commits containing the new workflow can run it. Do not move existing
release tags to trigger it retroactively. CI does not commit files or require
publishing credentials, and it compares extracted content rather than ZIP
timestamps.

Firefox lint errors fail CI. Its existing warnings about constant HTML icon
markup are displayed for review rather than suppressed. `web-ext` is pinned;
its current transitive dependencies have npm audit advisories (minimatch and
deepmerge) without a compatible upstream fix. These are development tools,
not shipped code; do not use a force downgrade or incompatible override as
a substitute for an upstream fix.

## Roadmap

Tests, CI, store publishing, and additional browser support are tracked in
[GitHub issues](https://github.com/geekatwork/strava-kudos/issues) and the
[project board](https://github.com/users/geekatwork/projects/5).

## Public website

The homepage and privacy policy are in [docs/](./docs/). After merging, enable
GitHub Pages under **Settings > Pages > Deploy from a branch**, selecting
`main` and `/docs`. Wait for the Pages deployment to finish, then confirm:

- Homepage: https://geekatwork.github.io/strava-kudos/
- Privacy policy: https://geekatwork.github.io/strava-kudos/privacy.html

These are intended URLs, not confirmation that Pages is already enabled.
Use them in Google OAuth Branding only after confirming they are accessible.
Google may require domain ownership verification; GitHub Pages hosting alone
does not guarantee OAuth verification or production approval.

The policy separates extension behavior from planned maintainer OAuth
publishing. Review it when publishing automation or data handling changes.
The website files are not included in extension ZIPs.

## Attribution

Based on the kudos functionality of Strava Helper. This is an unofficial
extension and is not affiliated with Strava.
