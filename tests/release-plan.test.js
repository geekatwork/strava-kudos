import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { releasePlan } from '../scripts/release-plan.js'

const options = { event: 'workflow_dispatch', ref: 'refs/tags/v1.1.7', mode: 'validate', stores: 'chrome' }

it.each([['validate', 'none'], ['check', 'check'], ['submit', 'submit']])(
    'selects manual %s without consulting auto-submit settings', (mode, expected) => {
        expect(releasePlan({ ...options, mode })).toBe(expected)
    }
)

it('preserves automatic tag behavior', () => {
    expect(releasePlan({ event: 'push', ref: options.ref })).toBe('auto')
})

it.each(['refs/heads/main', '', undefined, 'refs/tags/v01.1.7', 'refs/tags/v1.1.7-beta'])(
    'rejects invalid release refs %s', ref => {
        expect(() => releasePlan({ ...options, ref })).toThrow('numeric release tag')
    }
)

it.each(['firefox', 'chrome,firefox', 'edge', 'safari', '', undefined, 'Chrome', 'chrome\n'])(
    'explicitly rejects unsupported selections %s', stores => {
        expect(() => releasePlan({ ...options, stores })).toThrow('Only stores=chrome')
    }
)

it.each(['', undefined, 'publish'])('rejects invalid modes %s', mode => {
    expect(() => releasePlan({ ...options, mode })).toThrow('Mode must be')
})

it('rejects PR events', () => {
    expect(() => releasePlan({ ...options, event: 'pull_request' })).toThrow('Unsupported release event')
})

it('writes a credential-free validation plan through the CLI', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'strava-plan-test-'))
    try {
        const output = path.join(root, 'output')
        const result = spawnSync(process.execPath, [
            fileURLToPath(new URL('../scripts/release-plan.js', import.meta.url)),
        ], {
            env: {
                PATH: process.env.PATH,
                GITHUB_EVENT_NAME: options.event, GITHUB_REF: options.ref,
                RELEASE_MODE: options.mode, RELEASE_STORES: options.stores,
                GITHUB_OUTPUT: output,
            },
            encoding: 'utf8',
        })
        expect(result.status).toBe(0)
        expect(await readFile(output, 'utf8')).toBe('chrome_mode=none\n')
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

it('gates the protected job on shared validation and serializes Chrome uploads', async () => {
    const workflow = await readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')
    expect(workflow).toContain("needs.build-release.result == 'success'")
    expect(workflow).toContain("needs.build-release.outputs.chrome_mode != 'none'")
    expect(workflow).toContain('environment: chrome-web-store')
    expect(workflow).toContain('group: chrome-web-store-publishing')
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).not.toContain("if: github.event_name == 'push'")
})

it.each([
    ['auto', 'true', 0, 'submit'],
    ['auto', 'false', 0, 'check'],
    ['auto', '', 0, 'check'],
    ['auto', 'invalid', 1, ''],
    ['submit', 'false', 0, 'submit'],
    ['check', 'true', 0, 'check'],
    ['none', 'true', 1, ''],
])('executes the workflow mode guard for %s / %s', async (mode, autoSubmit, exitCode, command) => {
    const workflow = await readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')
    const marker = '        run: |\n'
    const script = workflow.slice(workflow.lastIndexOf(marker) + marker.length).replace(/^ {10}/gm, '')
    const result = spawnSync('bash', ['-c', `node() { printf '%s\\n' "$*"; }\n${script}`], {
        env: { PATH: process.env.PATH, CHROME_MODE: mode, CWS_AUTO_SUBMIT: autoSubmit },
        encoding: 'utf8',
    })
    expect(result.status).toBe(exitCode)
    expect(result.stdout.trim()).toBe(command ? `scripts/chrome-store.js ${command}` : '')
    if (exitCode) expect(result.stderr).not.toBe('')
})
