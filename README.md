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
and commit. For manual store submission, see the
[distribution instructions](./src/README.md#distribution).

## Continuous integration

Pull requests and pushes to `main` run the
[validation workflow](./.github/workflows/test.yml): syntax checks, offline
behavior/build tests, isolated ZIP builds, and Firefox `web-ext lint`.
Build tests use temporary directories and never overwrite tracked `dist/`.

CI artifacts use a test Firefox ID and are not store release packages.
The workflow has read-only repository permissions and no publishing secrets.
Chrome release submission is configured separately below; Firefox automation
remains planned work.

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
installers. A separate Chrome job uses the `chrome-web-store` protected
environment, a store-wide concurrency lock without cancellation, and bounded
upload-status polling. Firefox submission remains tracked in #6.

Prepare releases by updating the source version, testing, rebuilding and
committing tracked `dist/`, then creating and pushing an annotated version tag.
Only commits containing the new workflow can run it. Do not move existing
release tags to trigger it retroactively. CI does not commit files or require
publishing credentials for its build job, and it compares extracted content
rather than ZIP timestamps.

### Chrome Web Store check and submission

Configure the `chrome-web-store` environment:

- Secrets: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.
- Variables: `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`.
- Restrict environment deployments to tags matching `v*`, with a repository
  tag ruleset limiting creation/update/deletion to trusted maintainers.
- Optional variable `CWS_AUTO_SUBMIT`: leave unset or `false` for check-only
  tag runs initially; set to exactly `true` only when ready to submit releases.

With auto-submit enabled, a new numeric release tag runs shared tests/build
verification/Firefox lint before downloading the validated Chromium artifact
and submitting it to the existing Chrome listing. Normal review is requested;
Google may block the submission on warnings. Submission is not proof of store
approval or public availability.

### One-command tagged release pipeline

Dispatch directly on an existing numeric release tag containing this workflow.
The selected tag must match the manifest version. Manual runs always run the
shared tests, syntax checks, builds, archive verification and Firefox lint first.
Only Chrome store selection is supported; other or combined selections fail
explicitly before any upload. Firefox packaging remains part of shared validation,
not Firefox publishing.

Credential-free validation/build only (the default mode):

```bash
gh workflow run publish.yml --ref v1.1.7 -f mode=validate -f stores=chrome
```

Validate/build, then authenticate and read Chrome status without uploading:

```bash
gh workflow run publish.yml --ref v1.1.7 -f mode=check -f stores=chrome
```

Validate/build, then upload and submit for normal Google review:

```bash
gh workflow run publish.yml --ref v1.1.7 -f mode=submit -f stores=chrome
```

These are example commands: use a real release tag containing the new inputs.
Manual `submit` is an explicit authorization to upload, independent of
`CWS_AUTO_SUBMIT`; that variable controls automatic tag-push runs only.
Validation mode skips the protected Chrome job entirely and needs no publishing
credentials (the permanent `FIREFOX_ADDON_ID` build variable is still required).
Check and submit modes use the protected environment and Chrome-wide lock.

Dispatch returns before the workflow completes. Find the correct manual run,
watch it, and inspect its result:

```bash
gh run list --workflow publish.yml --branch v1.1.7 --event workflow_dispatch
gh run watch RUN_ID
gh run view RUN_ID
```

Trigger success does not mean validation passed, submission succeeded or the
store approved the release. Inspect the Chrome job summary and store dashboard
for upload, review and public availability status.

Dispatch on `main` fails release-ref validation before accessing store secrets.
Existing tags do not gain new workflow code; do not move published tags.
Leave auto-submit off for the first new tag, verify the check result, then
enable it for a later higher-version release. Old tags retain their old manual
check-only behavior.

The first check requires Google's OAuth endpoint and reads store status, but
never uploads a package. Local automated tests mock all API calls and use no
real credentials. Publishing scripts never print raw API bodies or tokens.
Missing configuration, API failures, unknown states, and upload timeouts fail
explicitly. Already-published/submitted versions and active submissions block
uploads. Requests with publishing side effects are never retried automatically:
inspect the store dashboard before attempting recovery or another release.
Before a manual submission retry, run check mode and inspect the dashboard.
An already-submitted/published version, active submission or upload in progress
blocks uploads with an actionable error. The status API's last asynchronous
upload state does not identify the uploaded version: after an upload succeeds
but submission fails or times out, do not blindly rerun submit. Resolve the
uploaded draft in the dashboard first, or prepare a higher-version release
after confirming the previous operation's outcome. The pipeline does not
automatically resume or retry an ambiguous upload/publish operation.
GitHub may queue or replace pending concurrency runs; inspect every release
run rather than assuming all pushed tags were submitted.

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
