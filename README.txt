strava-kudos

Adds a "Give Kudos to All" button to Strava navigation. The button gives kudos
to eligible activities currently loaded in the feed, skipping activities that
already have kudos and your own activities. It does not automatically load more
activities.

This extension is based on the kudos functionality of the Strava Helper
extension.

Browser builds (Python 3.9 or newer; no additional dependencies):
Run: python3 build.py --firefox-id strava-kudos@example.org
Replace the example ID with a unique, stable email-shaped add-on ID before
publishing to Firefox. It does not need to be a real email address. Keep the
same ID for subsequent releases.

The script creates dist/chromium.zip and dist/firefox.zip.
Each ZIP contains manifest.json at its root and can
be extracted for local testing. Rebuilding overwrites these ZIPs.
The Chromium build is for Chrome, Edge, Brave, and Opera. The Firefox build
includes its add-on ID and declares no extension data collection.
Firefox distribution still requires Mozilla signing.
