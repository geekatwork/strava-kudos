import { mkdtemp, readFile, writeFile, cp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { unzipSync, strFromU8 } from 'fflate'
import { afterEach, expect, it } from 'vitest'
import { build } from '../scripts/build.js'

const project = fileURLToPath(new URL('../', import.meta.url))
const temporary = []

async function setup() {
    const root = await mkdtemp(path.join(tmpdir(), 'strava-kudos-build-test-'))
    temporary.push(root)
    await cp(path.join(project, 'src'), path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'README.md'), 'Developer README: do not package')
    return { root, outputDir: path.join(root, 'output'), firefoxId: 'test@example.org' }
}

async function editManifest(root, edit) {
    const filename = path.join(root, 'src/manifest.json')
    const manifest = JSON.parse(await readFile(filename, 'utf8'))
    edit(manifest)
    await writeFile(filename, JSON.stringify(manifest))
}

afterEach(async () => {
    await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('packages exactly the source resources with browser-specific metadata', async () => {
    const options = await setup()
    const manifest = JSON.parse(await readFile(path.join(options.root, 'src/manifest.json'), 'utf8'))
    const resources = ['README.md', ...Object.values(manifest.icons)]
    manifest.content_scripts.forEach(entry => resources.push(...entry.js, ...entry.css))
    const outputs = await build(options)
    expect(outputs.map(output => path.basename(output))).toEqual(['chromium.zip', 'firefox.zip'])
    for (const output of outputs) {
        const files = unzipSync(await readFile(output))
        expect(Object.keys(files).sort()).toEqual([...resources, 'manifest.json'].sort())
        const built = JSON.parse(strFromU8(files['manifest.json']))
        if (path.basename(output) === 'firefox.zip') {
            expect(built.browser_specific_settings).toEqual({
                gecko: { id: options.firefoxId, data_collection_permissions: { required: ['none'] } },
            })
            delete built.browser_specific_settings
        }
        expect(built).toEqual(manifest)
        for (const resource of resources) {
            expect(Buffer.from(files[resource])).toEqual(await readFile(path.join(options.root, 'src', resource)))
        }
    }
})

it('rebuilds from changed source without stale archive entries', async () => {
    const options = await setup()
    await build(options)
    await writeFile(path.join(options.root, 'src/README.md'), 'Updated extension README')
    await build(options)
    const files = unzipSync(await readFile(path.join(options.outputDir, 'chromium.zip')))
    expect(strFromU8(files['README.md'])).toBe('Updated extension README')
})

it.each([undefined, '', 'invalid', 'a'.repeat(81) + '@example.org', 'test@example.org\n'])(
    'rejects invalid Firefox ID %s before writing builds',
    async firefoxId => {
        const options = await setup()
        await expect(build({ ...options, firefoxId })).rejects.toThrow('--firefox-id')
        await expect(readFile(path.join(options.outputDir, 'chromium.zip'))).rejects.toThrow()
    }
)

it.each(['../outside.js', '/outside.js', 'C:/outside.js', 'js\\outside.js', 'js/../outside.js', ''])(
    'rejects unsafe resource path %s',
    async resource => {
        const options = await setup()
        await editManifest(options.root, manifest => { manifest.content_scripts[0].js = [resource] })
        await expect(build(options)).rejects.toThrow('Invalid resource path')
    }
)

it('rejects symlinks escaping the source directory', async () => {
    const options = await setup()
    const outside = path.join(options.root, 'outside.js')
    await writeFile(outside, 'outside')
    await symlink(outside, path.join(options.root, 'src/escape.js'))
    await editManifest(options.root, manifest => { manifest.content_scripts[0].js = ['escape.js'] })
    await expect(build(options)).rejects.toThrow('outside the source directory')
})

it('reports missing resources', async () => {
    const options = await setup()
    await editManifest(options.root, manifest => { manifest.content_scripts[0].js = ['missing.js'] })
    await expect(build(options)).rejects.toThrow('ENOENT')
})

it('reports invalid manifests', async () => {
    const options = await setup()
    await writeFile(path.join(options.root, 'src/manifest.json'), '{}')
    await expect(build(options)).rejects.toThrow('Invalid extension manifest')
})

it('reports malformed JSON and content-script resource arrays', async () => {
    const options = await setup()
    await editManifest(options.root, manifest => { manifest.content_scripts[0].js = 'not-an-array' })
    await expect(build(options)).rejects.toThrow('Invalid content script')
    await writeFile(path.join(options.root, 'src/manifest.json'), '{')
    await expect(build(options)).rejects.toThrow()
})

it('replaces source browser-specific settings only in the Firefox variant', async () => {
    const options = await setup()
    await editManifest(options.root, manifest => {
        manifest.browser_specific_settings = { gecko: { id: 'old@example.org' } }
    })
    await build(options)
    const chromium = unzipSync(await readFile(path.join(options.outputDir, 'chromium.zip')))
    const firefox = unzipSync(await readFile(path.join(options.outputDir, 'firefox.zip')))
    expect(JSON.parse(strFromU8(chromium['manifest.json']))).not.toHaveProperty('browser_specific_settings')
    expect(JSON.parse(strFromU8(firefox['manifest.json'])).browser_specific_settings.gecko.id).toBe(options.firefoxId)
})

it('does not overwrite existing builds when resource validation fails', async () => {
    const options = await setup()
    await build(options)
    const before = await readFile(path.join(options.outputDir, 'chromium.zip'))
    await editManifest(options.root, manifest => { manifest.content_scripts[0].js = ['missing.js'] })
    await expect(build(options)).rejects.toThrow()
    expect(await readFile(path.join(options.outputDir, 'chromium.zip'))).toEqual(before)
})

it('runs the CLI from another directory with isolated output', async () => {
    const options = await setup()
    const result = execFileSync(process.execPath, [
        path.join(project, 'scripts/build.js'), '--firefox-id', options.firefoxId,
        '--output-dir', options.outputDir,
    ], { cwd: options.root, encoding: 'utf8' })
    expect(result).toContain('Created')
    const files = unzipSync(await readFile(path.join(options.outputDir, 'firefox.zip')))
    expect(JSON.parse(strFromU8(files['manifest.json'])).browser_specific_settings.gecko.id).toBe(options.firefoxId)
})

it('CLI failures are nonzero with explicit errors', async () => {
    const options = await setup()
    for (const args of [[], ['--firefox-id', 'invalid'], ['--unknown']]) {
        const result = spawnSync(process.execPath, [path.join(project, 'scripts/build.js'), ...args], {
            cwd: options.root, encoding: 'utf8',
        })
        expect(result.status).toBe(1)
        expect(result.stderr).not.toBe('')
        expect(result.stdout).not.toContain('Created')
    }
})
