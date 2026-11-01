import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { unzipSync, zipSync, strToU8 } from 'fflate'
import { afterEach, expect, it } from 'vitest'
import { build } from '../scripts/build.js'
import { validateRelease, verifyArchives } from '../scripts/release.js'

const project = fileURLToPath(new URL('../', import.meta.url))
const temporary = []

async function setup() {
    const root = await mkdtemp(path.join(tmpdir(), 'strava-release-test-'))
    temporary.push(root)
    await cp(path.join(project, 'src'), path.join(root, 'src'), { recursive: true })
    const manifest = JSON.parse(await readFile(path.join(root, 'src/manifest.json'), 'utf8'))
    return { root, tag: `v${manifest.version}`, firefoxId: 'release@example.org', outputDir: path.join(root, 'output') }
}

afterEach(async () => {
    await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('validates a matching numeric tag and verifies fresh archives', async () => {
    const options = await setup()
    await validateRelease(options)
    await build(options)
    await verifyArchives(options)
})

it.each([undefined, '', '1.1.2', 'v1.2', 'v1.2.3.4', 'v1.2.3-beta', 'v01.2.3', 'v1.2.3\n'])(
    'rejects malformed tag %s', async tag => {
        await expect(validateRelease({ ...await setup(), tag })).rejects.toThrow('vMAJOR.MINOR.PATCH')
    }
)

it('rejects tag/version mismatches', async () => {
    await expect(validateRelease({ ...await setup(), tag: 'v99.99.99' })).rejects.toThrow('does not match')
})

it.each([undefined, '', 'invalid', 'a'.repeat(81) + '@example.org'])(
    'fails explicitly on missing or invalid Firefox identity %s', async firefoxId => {
        await expect(validateRelease({ ...await setup(), firefoxId })).rejects.toThrow('FIREFOX_ADDON_ID')
    }
)

it.each(['extra', 'missing', 'asset', 'version', 'identity'])(
    'rejects a tampered archive: %s', async tampering => {
        const options = await setup()
        await build(options)
        const filename = path.join(options.outputDir, 'firefox.zip')
        const files = unzipSync(await readFile(filename))
        if (tampering === 'extra') files['tests/extra.js'] = strToU8('unexpected')
        if (tampering === 'missing') delete files['README.md']
        if (tampering === 'asset') files['README.md'] = strToU8('not the source README')
        if (tampering === 'version' || tampering === 'identity') {
            const manifest = JSON.parse(Buffer.from(files['manifest.json']).toString())
            if (tampering === 'version') manifest.version = '99.99.99'
            else manifest.browser_specific_settings.gecko.id = 'wrong@example.org'
            files['manifest.json'] = strToU8(JSON.stringify(manifest))
        }
        await writeFile(filename, zipSync(files))
        await expect(verifyArchives(options)).rejects.toThrow()
    }
)

it('reports corrupt ZIPs rather than success', async () => {
    const options = await setup()
    await build(options)
    await writeFile(path.join(options.outputDir, 'chromium.zip'), 'not a ZIP')
    await expect(verifyArchives(options)).rejects.toThrow()
})

it('CLI validates and builds without overwriting tracked dist', async () => {
    const options = await setup()
    const manifest = JSON.parse(await readFile(path.join(project, 'src/manifest.json'), 'utf8'))
    const before = await readFile(path.join(project, 'dist/chromium.zip'))
    for (const command of ['validate', 'build']) {
        const result = spawnSync(process.execPath, [path.join(project, 'scripts/release.js'), command], {
            cwd: options.root,
            env: {
                ...process.env,
                RELEASE_TAG: `v${manifest.version}`,
                FIREFOX_ADDON_ID: options.firefoxId,
                RELEASE_OUTPUT_DIR: options.outputDir,
            },
            encoding: 'utf8',
        })
        expect(result.stderr).toBe('')
        expect(result.status).toBe(0)
    }
    await verifyArchives({ ...options, root: project })
    expect(await readFile(path.join(project, 'dist/chromium.zip'))).toEqual(before)
})

it('CLI configuration failures are nonzero and create no packages', async () => {
    const options = await setup()
    const result = spawnSync(process.execPath, [path.join(project, 'scripts/release.js'), 'build'], {
        env: { ...process.env, RELEASE_OUTPUT_DIR: '', RELEASE_TAG: options.tag, FIREFOX_ADDON_ID: '' },
        encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('RELEASE_OUTPUT_DIR')
    expect(result.stdout).toBe('')
    await expect(readFile(path.join(options.outputDir, 'chromium.zip'))).rejects.toThrow()
})
