import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, strFromU8 } from 'fflate'
import { build } from './build.js'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

export async function validateRelease({ tag, firefoxId, root = projectRoot }) {
    if (typeof tag !== 'string' || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
        throw new Error('Release tag must be vMAJOR.MINOR.PATCH with numeric components.')
    }
    const manifest = JSON.parse(await readFile(path.join(root, 'src/manifest.json'), 'utf8'))
    if (manifest.version !== tag.slice(1)) {
        throw new Error(`Tag ${tag} does not match manifest version ${manifest.version}.`)
    }
    if (typeof firefoxId !== 'string' || firefoxId.length > 80 ||
        !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/.test(firefoxId)) {
        throw new Error('Set FIREFOX_ADDON_ID to a valid, permanent Firefox add-on ID.')
    }
}

export async function verifyArchives({ tag, firefoxId, outputDir, root = projectRoot }) {
    await validateRelease({ tag, firefoxId, root })
    const sourceRoot = path.join(root, 'src')
    const manifest = JSON.parse(await readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'))
    const resources = new Set(['README.md', ...Object.values(manifest.icons ?? {})])
    for (const entry of manifest.content_scripts) {
        for (const resource of [...(entry.js ?? []), ...(entry.css ?? [])]) {
            resources.add(resource)
        }
    }
    const expectedNames = ['manifest.json', ...resources].sort()
    for (const browser of ['chromium', 'firefox']) {
        const files = unzipSync(await readFile(path.join(outputDir, `${browser}.zip`)))
        if (!isDeepStrictEqual(Object.keys(files).sort(), expectedNames)) {
            throw new Error(`${browser} archive has unexpected or missing files.`)
        }
        const expectedManifest = structuredClone(manifest)
        delete expectedManifest.browser_specific_settings
        if (browser === 'firefox') {
            expectedManifest.browser_specific_settings = {
                gecko: {
                    id: firefoxId,
                    data_collection_permissions: { required: ['none'] },
                },
            }
        }
        if (!isDeepStrictEqual(JSON.parse(strFromU8(files['manifest.json'])), expectedManifest)) {
            throw new Error(`${browser} archive manifest does not match the release.`)
        }
        for (const resource of resources) {
            if (!Buffer.from(files[resource]).equals(await readFile(path.join(sourceRoot, resource)))) {
                throw new Error(`${browser} archive resource differs from source: ${resource}`)
            }
        }
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const options = {
            tag: process.env.RELEASE_TAG,
            firefoxId: process.env.FIREFOX_ADDON_ID,
            outputDir: process.env.RELEASE_OUTPUT_DIR,
        }
        if (!options.outputDir) {
            throw new Error('Set RELEASE_OUTPUT_DIR to an isolated release output directory.')
        }
        await validateRelease(options)
        if (process.argv[2] === 'validate') {
            console.log(`Validated ${options.tag}.`)
        } else if (process.argv[2] === 'build') {
            await build(options)
            await verifyArchives(options)
            console.log(`Built and verified ${options.tag}: chromium.zip and firefox.zip.`)
        } else {
            throw new Error('Usage: node scripts/release.js validate|build')
        }
    } catch (error) {
        console.error(error.message)
        process.exitCode = 1
    }
}
