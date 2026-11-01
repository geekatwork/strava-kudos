import { readFile, appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, strFromU8 } from 'fflate'

const itemStates = new Set(['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS', 'REJECTED', 'CANCELLED'])

export function compareVersions(left, right) {
    const parts = value => {
        if (typeof value !== 'string' || !/^\d+(?:\.\d+){0,3}$/.test(value)) {
            throw new Error('Store returned an invalid version.')
        }
        return value.split('.').map(Number)
    }
    const a = parts(left)
    const b = parts(right)
    for (let index = 0; index < 4; index++) {
        const difference = (a[index] ?? 0) - (b[index] ?? 0)
        if (difference) return Math.sign(difference)
    }
    return 0
}

export async function chromeStore({
    mode, credentials, publisherId, extensionId, packagePath, expectedVersion,
    fetchImpl = fetch, sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    pollAttempts = 30,
}) {
    if (!['check', 'submit'].includes(mode)) throw new Error('Mode must be check or submit.')
    for (const name of ['clientId', 'clientSecret', 'refreshToken']) {
        if (typeof credentials?.[name] !== 'string' || !credentials[name].trim()) {
            throw new Error(`Missing Chrome credential: ${name}.`)
        }
    }
    if (typeof publisherId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(publisherId) ||
        typeof extensionId !== 'string' || !/^[a-p]{32}$/.test(extensionId)) {
        throw new Error('Configure valid CWS_PUBLISHER_ID and CWS_EXTENSION_ID environment variables.')
    }
    if (!Number.isInteger(pollAttempts) || pollAttempts < 1 || pollAttempts > 60) {
        throw new Error('Invalid upload polling limit.')
    }

    let packageData
    if (mode === 'submit') {
        compareVersions(expectedVersion, '0')
        packageData = await readFile(packagePath)
        const files = unzipSync(packageData)
        const manifest = JSON.parse(strFromU8(files['manifest.json']))
        if (manifest.version !== expectedVersion || manifest.browser_specific_settings) {
            throw new Error('Chromium package does not match the expected release version/variant.')
        }
    }

    async function request(url, options, label) {
        let response
        try {
            response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(30000) })
        } catch {
            throw new Error(`${label}: network error or timeout. No automatic retry; check store status before retrying.`)
        }
        // Never include raw OAuth/API bodies in errors: they may contain credentials.
        if (!response.ok) throw new Error(`${label}: HTTP ${response.status}. Check configuration and the store dashboard before retrying.`)
        let data
        try {
            data = await response.json()
        } catch {
            throw new Error(`${label}: invalid JSON response.`)
        }
        if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) {
            throw new Error(`${label}: unsuccessful API response.`)
        }
        return data
    }

    const token = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            refresh_token: credentials.refreshToken,
            grant_type: 'refresh_token',
        }),
    }, 'OAuth authentication')
    if (typeof token.access_token !== 'string' || !token.access_token ||
        token.token_type?.toLowerCase() !== 'bearer') {
        throw new Error('OAuth authentication: missing bearer access token.')
    }

    const name = `publishers/${publisherId}/items/${extensionId}`
    const itemUrl = `https://chromewebstore.googleapis.com/v2/${name}`
    const headers = { Authorization: `Bearer ${token.access_token}` }
    function identity(data) {
        if (data.name !== name || (data.itemId && data.itemId !== extensionId)) {
            throw new Error('Chrome API response references an unexpected item.')
        }
    }
    async function status() {
        const data = await request(`${itemUrl}:fetchStatus`, { headers }, 'Fetch store status')
        identity(data)
        for (const revision of [data.publishedItemRevisionStatus, data.submittedItemRevisionStatus]) {
            if (revision) {
                if (!itemStates.has(revision.state) || !Array.isArray(revision.distributionChannels) ||
                    !revision.distributionChannels.length) {
                    throw new Error('Store returned an unrecognized revision state or missing version information.')
                }
                revision.distributionChannels.forEach(channel => compareVersions(channel.crxVersion, '0'))
            }
        }
        return data
    }
    const initial = await status()
    if (initial.lastAsyncUploadState !== undefined &&
        !['SUCCEEDED', 'IN_PROGRESS', 'FAILED', 'NOT_FOUND'].includes(initial.lastAsyncUploadState)) {
        throw new Error('Store returned an unrecognized asynchronous upload state. No upload performed.')
    }
    if (initial.takenDown || initial.warned) {
        throw new Error('The item has a policy warning or takedown. Resolve it in the store dashboard.')
    }
    const describe = revision => revision
        ? `${revision.state} (${revision.distributionChannels.map(channel => channel.crxVersion).join(', ')})`
        : 'none'
    const summary = [
        `Published revision: ${describe(initial.publishedItemRevisionStatus)}.`,
        `Submitted revision: ${describe(initial.submittedItemRevisionStatus)}.`,
        `Last asynchronous upload state: ${initial.lastAsyncUploadState ?? 'not reported'}.`,
    ]
    if (mode === 'check') {
        return ['Authentication and item access verified. Check-only: no upload or publish call made.', ...summary].join('\n')
    }

    for (const revision of [initial.publishedItemRevisionStatus, initial.submittedItemRevisionStatus]) {
        if (revision?.distributionChannels.some(channel => compareVersions(expectedVersion, channel.crxVersion) <= 0)) {
            throw new Error(`Release version is already published/submitted or is not newer. No upload performed; check the store dashboard.\n${summary.join('\n')}`)
        }
    }
    if (initial.submittedItemRevisionStatus &&
        !['REJECTED', 'CANCELLED'].includes(initial.submittedItemRevisionStatus.state)) {
        throw new Error('Another submission is pending, staged or active. No upload performed.')
    }
    if (initial.lastAsyncUploadState === 'IN_PROGRESS') {
        throw new Error('Another upload is in progress. No upload performed.')
    }

    const upload = await request(`https://chromewebstore.googleapis.com/upload/v2/${name}:upload`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: packageData,
    }, 'Upload package')
    identity(upload)
    if (!['SUCCEEDED', 'IN_PROGRESS'].includes(upload.uploadState)) {
        throw new Error('Upload did not succeed. No publish call made; check store status.')
    }
    if (upload.uploadState === 'SUCCEEDED' && upload.crxVersion !== expectedVersion) {
        throw new Error('Upload response has an unexpected version. No publish call made.')
    }
    if (upload.uploadState === 'IN_PROGRESS') {
        let succeeded = false
        for (let attempt = 0; attempt < pollAttempts; attempt++) {
            await sleep(10000)
            const current = await status()
            if (current.lastAsyncUploadState === 'SUCCEEDED') {
                succeeded = true
                break
            }
            if (current.lastAsyncUploadState !== 'IN_PROGRESS') {
                throw new Error('Asynchronous upload failed or returned an unknown state. No publish call made.')
            }
        }
        if (!succeeded) throw new Error('Upload polling timed out. Check store status before retrying; no publish call made.')
    }
    const published = await request(`${itemUrl}:publish`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true }),
    }, 'Submit for review')
    identity(published)
    if (!['PENDING_REVIEW', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'].includes(published.state)) {
        throw new Error('Submission returned an unexpected state. Inspect the store dashboard before retrying.')
    }
    return `Chrome accepted version ${expectedVersion}; reported state: ${published.state}. Store approval/public availability must be checked separately.${published.warningInfo ? '\nAPI returned warnings; inspect the store dashboard.' : ''}`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (!/^refs\/tags\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(process.env.GITHUB_REF ?? '') ||
            !['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)) {
            throw new Error('Chrome publishing/checks require an authorized numeric release tag event.')
        }
        const result = await chromeStore({
            mode: process.argv[2],
            credentials: {
                clientId: process.env.CWS_CLIENT_ID,
                clientSecret: process.env.CWS_CLIENT_SECRET,
                refreshToken: process.env.CWS_REFRESH_TOKEN,
            },
            publisherId: process.env.CWS_PUBLISHER_ID,
            extensionId: process.env.CWS_EXTENSION_ID,
            packagePath: process.env.CHROMIUM_PACKAGE,
            expectedVersion: process.env.GITHUB_REF.slice('refs/tags/v'.length),
        })
        console.log(result)
        if (process.env.GITHUB_STEP_SUMMARY) {
            await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Chrome Web Store\n\n${result}\n`)
        }
    } catch (error) {
        console.error(error.message)
        process.exitCode = 1
    }
}
