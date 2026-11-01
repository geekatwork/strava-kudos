import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { zipSync, strToU8 } from 'fflate'
import { afterEach, expect, it, vi } from 'vitest'
import { chromeStore, compareVersions } from '../scripts/chrome-store.js'

const extensionId = 'a'.repeat(32)
const name = `publishers/test-publisher/items/${extensionId}`
const credentials = { clientId: 'private-client', clientSecret: 'private-secret', refreshToken: 'private-refresh' }
const token = { access_token: 'private-access', token_type: 'Bearer' }
const revision = (state = 'PUBLISHED', version = '1.1.1') => ({
    state, distributionChannels: [{ crxVersion: version, deployPercentage: 100 }],
})
const status = extra => ({ name, itemId: extensionId, publishedItemRevisionStatus: revision(), ...extra })
const upload = extra => ({ name, itemId: extensionId, uploadState: 'SUCCEEDED', crxVersion: '1.1.4', ...extra })
const submitted = { name, itemId: extensionId, state: 'PENDING_REVIEW' }
const temporary = []

async function setup(responses = []) {
    const root = await mkdtemp(path.join(tmpdir(), 'strava-chrome-test-'))
    temporary.push(root)
    const packagePath = path.join(root, 'chromium.zip')
    await writeFile(packagePath, zipSync({
        'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, version: '1.1.4' })),
    }))
    const fetchImpl = vi.fn(async () => {
        if (!responses.length) throw new Error('Unexpected network request')
        const response = responses.shift()
        if (response instanceof Error) throw response
        return { ok: true, status: 200, json: async () => response }
    })
    return {
        mode: 'submit', credentials, publisherId: 'test-publisher', extensionId,
        packagePath, expectedVersion: '1.1.4', fetchImpl, sleep: vi.fn(), pollAttempts: 2,
    }
}

afterEach(async () => {
    await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('check-only authenticates and reads status without uploading or publishing', async () => {
    const options = await setup([token, status()])
    const result = await chromeStore({ ...options, mode: 'check', packagePath: undefined })
    expect(result).toContain('Check-only')
    expect(result).toContain('PUBLISHED (1.1.1)')
    expect(options.fetchImpl).toHaveBeenCalledTimes(2)
    expect(options.fetchImpl.mock.calls[1][0]).toMatch(/:fetchStatus$/)
    expect(result).not.toContain(token.access_token)
    expect(result).not.toContain(credentials.clientSecret)
})

it('uploads once and submits normally without skipping review', async () => {
    const options = await setup([token, status(), upload(), submitted])
    expect(await chromeStore(options)).toContain('PENDING_REVIEW')
    expect(options.fetchImpl).toHaveBeenCalledTimes(4)
    const calls = options.fetchImpl.mock.calls
    expect(calls[0][1].body.get('grant_type')).toBe('refresh_token')
    expect(calls[2][0]).toBe(`https://chromewebstore.googleapis.com/upload/v2/${name}:upload`)
    expect(calls[2][1].headers['Content-Type']).toBe('application/zip')
    expect(JSON.parse(calls[3][1].body)).toEqual({
        publishType: 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true,
    })
})

it('polls asynchronous uploads within a bounded limit before submission', async () => {
    const options = await setup([
        token, status(), upload({ uploadState: 'IN_PROGRESS', crxVersion: undefined }),
        status({ lastAsyncUploadState: 'IN_PROGRESS' }),
        status({ lastAsyncUploadState: 'SUCCEEDED' }), submitted,
    ])
    await chromeStore(options)
    expect(options.sleep).toHaveBeenCalledTimes(2)
    expect(options.fetchImpl).toHaveBeenCalledTimes(6)
})

it.each(['FAILED', 'NOT_FOUND', 'UNKNOWN'])('does not publish after asynchronous state %s', async state => {
    const options = await setup([
        token, status(), upload({ uploadState: 'IN_PROGRESS' }),
        status({ lastAsyncUploadState: state }),
    ])
    await expect(chromeStore(options)).rejects.toThrow('Asynchronous upload')
    expect(options.fetchImpl).toHaveBeenCalledTimes(4)
})

it('times out upload polling without retrying upload or publishing', async () => {
    const options = await setup([
        token, status(), upload({ uploadState: 'IN_PROGRESS' }),
        status({ lastAsyncUploadState: 'IN_PROGRESS' }),
        status({ lastAsyncUploadState: 'IN_PROGRESS' }),
    ])
    await expect(chromeStore(options)).rejects.toThrow('polling timed out')
    expect(options.fetchImpl.mock.calls.filter(([url]) => url.endsWith(':upload'))).toHaveLength(1)
    expect(options.fetchImpl.mock.calls.some(([url]) => url.endsWith(':publish'))).toBe(false)
})

it.each([
    { publishedItemRevisionStatus: revision('PUBLISHED', '1.1.4') },
    { publishedItemRevisionStatus: revision('PUBLISHED', '1.2.0') },
    { submittedItemRevisionStatus: revision('PENDING_REVIEW', '1.1.4') },
    { submittedItemRevisionStatus: revision('STAGED', '1.1.3') },
    { lastAsyncUploadState: 'IN_PROGRESS' },
    { takenDown: true },
    { warned: true },
])('blocks unsafe re-submission before upload: %j', async extra => {
    const options = await setup([token, status(extra)])
    await expect(chromeStore(options)).rejects.toThrow()
    expect(options.fetchImpl).toHaveBeenCalledTimes(2)
})

it.each(['REJECTED', 'CANCELLED'])('allows a newer release after a %s revision', async state => {
    const options = await setup([token, status({ submittedItemRevisionStatus: revision(state, '1.1.3') }), upload(), submitted])
    await chromeStore(options)
    expect(options.fetchImpl).toHaveBeenCalledTimes(4)
})

it.each([
    { uploadState: 'FAILED' }, { uploadState: 'UNKNOWN' },
    { crxVersion: '1.1.5' }, { name: 'wrong' },
])('rejects failed or mismatched upload responses: %j', async extra => {
    const options = await setup([token, status(), upload(extra)])
    await expect(chromeStore(options)).rejects.toThrow()
    expect(options.fetchImpl).toHaveBeenCalledTimes(3)
})

it('rejects unrecognized revision state or missing version information', async () => {
    const options = await setup([token, status({ publishedItemRevisionStatus: { state: 'UNKNOWN' } })])
    await expect(chromeStore(options)).rejects.toThrow('unrecognized revision')
})

it('rejects an unexpected store item', async () => {
    const options = await setup([token, status({ itemId: 'wrong' })])
    await expect(chromeStore(options)).rejects.toThrow('unexpected item')
})

it('does not expose credentials from HTTP error responses', async () => {
    const options = await setup()
    options.fetchImpl.mockResolvedValue({
        ok: false, status: 403, json: async () => ({ error: credentials.clientSecret }),
    })
    await expect(chromeStore(options)).rejects.toThrow('HTTP 403')
    try { await chromeStore(options) } catch (error) {
        expect(error.message).not.toContain(credentials.clientSecret)
    }
})

it('does not expose raw network exception messages or retry requests', async () => {
    const options = await setup([new Error(credentials.refreshToken)])
    await expect(chromeStore(options)).rejects.toThrow('network error or timeout')
    expect(options.fetchImpl).toHaveBeenCalledTimes(1)
})

it('reports invalid JSON explicitly', async () => {
    const options = await setup()
    options.fetchImpl.mockResolvedValue({ ok: true, json: async () => { throw new Error(credentials.clientSecret) } })
    await expect(chromeStore(options)).rejects.toThrow('invalid JSON')
})

it.each([{}, { error: 'failed' }, { access_token: 'token', token_type: 'other' }])(
    'rejects invalid authentication results %j', async result => {
        const options = await setup([result])
        await expect(chromeStore(options)).rejects.toThrow()
        expect(options.fetchImpl).toHaveBeenCalledTimes(1)
    }
)

it.each(['REJECTED', 'STAGED', 'UNKNOWN'])('reports unexpected publish state %s', async state => {
    const options = await setup([token, status(), upload(), { ...submitted, state }])
    await expect(chromeStore(options)).rejects.toThrow('unexpected state')
})

it('reports publish HTTP failure without a duplicate side effect', async () => {
    const options = await setup([token, status(), upload()])
    const mock = options.fetchImpl
    mock.mockImplementationOnce(async () => ({ ok: true, json: async () => token }))
    mock.mockImplementationOnce(async () => ({ ok: true, json: async () => status() }))
    mock.mockImplementationOnce(async () => ({ ok: true, json: async () => upload() }))
    mock.mockImplementationOnce(async () => ({ ok: false, status: 409 }))
    await expect(chromeStore(options)).rejects.toThrow('HTTP 409')
    expect(mock).toHaveBeenCalledTimes(4)
})

it.each([1, 2, 3])('does not retry HTTP failures at store request %s', async failedRequest => {
    const options = await setup()
    let requestIndex = 0
    const responses = [token, status(), upload(), submitted]
    options.fetchImpl.mockImplementation(async () => {
        const index = requestIndex++
        return index === failedRequest
            ? { ok: false, status: 500 }
            : { ok: true, json: async () => responses[index] }
    })
    await expect(chromeStore(options)).rejects.toThrow('HTTP 500')
    expect(options.fetchImpl).toHaveBeenCalledTimes(failedRequest + 1)
})

it('check-only reports pending review without resubmitting', async () => {
    const options = await setup([token, status({ submittedItemRevisionStatus: revision('PENDING_REVIEW', '1.1.4') })])
    expect(await chromeStore({ ...options, mode: 'check' })).toContain('PENDING_REVIEW (1.1.4)')
    expect(options.fetchImpl).toHaveBeenCalledTimes(2)
})

it('reports upload state and actionable version details without retrying a pending release', async () => {
    const options = await setup([token, status({
        submittedItemRevisionStatus: revision('PENDING_REVIEW', '1.1.4'),
        lastAsyncUploadState: 'SUCCEEDED',
    })])
    await expect(chromeStore(options)).rejects.toThrow('PENDING_REVIEW (1.1.4)')
    expect(options.fetchImpl).toHaveBeenCalledTimes(2)
})

it('rejects an unknown initial upload state without exposing the raw response', async () => {
    const options = await setup([token, status({ lastAsyncUploadState: credentials.clientSecret })])
    await expect(chromeStore(options)).rejects.toThrow('unrecognized asynchronous upload state')
    expect(options.fetchImpl).toHaveBeenCalledTimes(2)
})

it('reports a published response without claiming to have waited for review', async () => {
    const options = await setup([token, status(), upload(), { ...submitted, state: 'PUBLISHED' }])
    const result = await chromeStore(options)
    expect(result).toContain('reported state: PUBLISHED')
    expect(result).toContain('must be checked separately')
})

it('fails before network activity for missing configuration or wrong packages', async () => {
    const options = await setup()
    await expect(chromeStore({ ...options, credentials: {} })).rejects.toThrow('Missing Chrome credential')
    await expect(chromeStore({ ...options, publisherId: '../bad' })).rejects.toThrow('Configure valid')
    await expect(chromeStore({ ...options, extensionId: 'bad' })).rejects.toThrow('Configure valid')
    await expect(chromeStore({ ...options, expectedVersion: '1.1.5' })).rejects.toThrow('package does not match')
    expect(options.fetchImpl).not.toHaveBeenCalled()
})

it('rejects branch/PR CLI invocations before accessing credentials', () => {
    const script = fileURLToPath(new URL('../scripts/chrome-store.js', import.meta.url))
    const result = spawnSync(process.execPath, [script, 'submit'], {
        env: { ...process.env, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'pull_request' },
        encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('authorized numeric release tag')
})

it('compares extension versions numerically with optional fourth components', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.1.4', '1.1.4.0')).toBe(0)
    expect(compareVersions('1.1.4', '1.1.4.1')).toBe(-1)
    expect(() => compareVersions('invalid', '1')).toThrow('invalid version')
})
