import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function releasePlan({ event, ref, mode, stores }) {
    if (!/^refs\/tags\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(ref ?? '')) {
        throw new Error('Select an existing numeric release tag, not a branch.')
    }
    if (event === 'push') return 'auto'
    if (event !== 'workflow_dispatch') throw new Error('Unsupported release event.')
    if (stores !== 'chrome') throw new Error('Only stores=chrome is supported; no stores were submitted.')
    if (!['validate', 'check', 'submit'].includes(mode)) {
        throw new Error('Mode must be validate, check, or submit.')
    }
    return mode === 'validate' ? 'none' : mode
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const mode = releasePlan({
            event: process.env.GITHUB_EVENT_NAME,
            ref: process.env.GITHUB_REF,
            mode: process.env.RELEASE_MODE,
            stores: process.env.RELEASE_STORES,
        })
        if (!process.env.GITHUB_OUTPUT) throw new Error('Missing GitHub Actions output file.')
        await appendFile(process.env.GITHUB_OUTPUT, `chrome_mode=${mode}\n`)
        console.log(`Release plan validated; Chrome mode: ${mode}.`)
    } catch (error) {
        console.error(error.message)
        process.exitCode = 1
    }
}
