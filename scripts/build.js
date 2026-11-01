import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { zipSync, strToU8 } from 'fflate'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

export async function build({ firefoxId, root = projectRoot, outputDir = path.join(root, 'dist') }) {
    if (typeof firefoxId !== 'string' || firefoxId.length > 80 ||
        !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/.test(firefoxId)) {
        throw new Error('--firefox-id must be an email-shaped add-on ID of at most 80 characters.')
    }

    const sourceRoot = await realpath(path.join(root, 'src'))
    const manifest = JSON.parse(await readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'))
    if (manifest.manifest_version !== 3 || typeof manifest.name !== 'string' ||
        !manifest.name || typeof manifest.version !== 'string' ||
        !/^\d+(?:\.\d+){0,3}$/.test(manifest.version) ||
        !Array.isArray(manifest.content_scripts)) {
        throw new Error('Invalid extension manifest: expected Manifest V3, name, version and content_scripts.')
    }

    const resources = new Set(['README.md', ...Object.values(manifest.icons ?? {})])
    for (const entry of manifest.content_scripts) {
        if (!Array.isArray(entry.matches) || entry.matches.length === 0 ||
            !Array.isArray(entry.js ?? []) || !Array.isArray(entry.css ?? [])) {
            throw new Error('Invalid content script: expected matches and resource arrays.')
        }
        for (const resource of [...(entry.js ?? []), ...(entry.css ?? [])]) {
            resources.add(resource)
        }
    }

    const files = {}
    for (const resource of [...resources].sort()) {
        if (typeof resource !== 'string' || !resource || path.posix.isAbsolute(resource) ||
            /^[a-zA-Z]:/.test(resource) || resource.includes('\\') ||
            resource.split('/').some(part => !part || part === '.' || part === '..')) {
            throw new Error(`Invalid resource path: ${resource}`)
        }
        const source = await realpath(path.join(sourceRoot, resource))
        const relative = path.relative(sourceRoot, source)
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
            throw new Error(`Resource is outside the source directory: ${resource}`)
        }
        files[resource] = new Uint8Array(await readFile(source))
    }

    const archives = []
    for (const browser of ['chromium', 'firefox']) {
        const browserManifest = structuredClone(manifest)
        delete browserManifest.browser_specific_settings
        if (browser === 'firefox') {
            browserManifest.browser_specific_settings = {
                gecko: {
                    id: firefoxId,
                    data_collection_permissions: { required: ['none'] },
                },
            }
        }
        archives.push({
            name: `${browser}.zip`,
            data: zipSync({
                ...files,
                'manifest.json': strToU8(JSON.stringify(browserManifest, null, 2) + '\n'),
            }),
        })
    }

    await mkdir(outputDir, { recursive: true })
    const outputs = []
    for (const archive of archives) {
        const destination = path.join(outputDir, archive.name)
        await writeFile(destination, archive.data)
        outputs.push(destination)
    }
    return outputs
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const { values } = parseArgs({
            options: {
                'firefox-id': { type: 'string' },
                'output-dir': { type: 'string' },
            },
        })
        const outputs = await build({
            firefoxId: values['firefox-id'],
            outputDir: values['output-dir'],
        })
        outputs.forEach(output => console.log(`Created ${output}`))
    } catch (error) {
        console.error(error.message)
        process.exitCode = 1
    }
}
