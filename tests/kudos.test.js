import { readFileSync } from 'node:fs'
import { Script } from 'node:vm'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const source = new Script(readFileSync(new URL('../src/js/strave_kudos.js', import.meta.url), 'utf8'))
const sessions = []

function fixture(name) {
    return readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8')
}

function setup(html = '<ul class="user-nav"></ul>') {
    const dom = new JSDOM(html, { runScripts: 'outside-only' })
    const { window } = dom
    const observers = []
    const Observer = window.MutationObserver
    window.MutationObserver = class extends Observer {
        constructor(callback) {
            super(callback)
            observers.push(this)
        }
    }
    const warn = vi.spyOn(window.console, 'warn').mockImplementation(() => {})
    const clicks = {}
    window.document.querySelectorAll('button').forEach(button => {
        clicks[button.id] = vi.fn()
        button.addEventListener('click', clicks[button.id])
    })
    sessions.push({ dom, observers })
    source.runInContext(dom.getInternalVMContext())
    return {
        window,
        document: window.document,
        warn,
        clicks,
        button: () => window.document.getElementById('strava-helper-kudos-all-button'),
        flush: () => new Promise(resolve => window.queueMicrotask(resolve)),
    }
}

afterEach(() => {
    for (const { dom, observers } of sessions.splice(0)) {
        observers.forEach(observer => observer.disconnect())
        dom.window.close()
    }
    vi.restoreAllMocks()
})

describe('kudos clicks', () => {
    it('uses each modern footer, not shared card actions, to determine eligibility', () => {
        const page = setup(fixture('modern-feed'))
        page.button().click()
        for (const id of ['modern-first', 'modern-other', 'modern-group-first']) {
            expect(page.clicks[id]).toHaveBeenCalledTimes(1)
        }
        for (const id of ['modern-own', 'modern-liked']) {
            expect(page.clicks[id]).not.toHaveBeenCalled()
        }
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('3x')
        expect(page.warn).not.toHaveBeenCalled()
    })

    it('compares localized labels without depending on English text', () => {
        const page = setup(fixture('modern-feed')
            .replaceAll('View all kudos', 'Alle Kudos ansehen')
            .replaceAll('Give kudos', 'Kudos geben'))
        page.button().click()
        expect(page.clicks['modern-other']).toHaveBeenCalledTimes(1)
        expect(page.clicks['modern-own']).not.toHaveBeenCalled()
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('3x')
    })

    it('does not borrow eligibility from another footer when labels are missing', () => {
        const page = setup(fixture('modern-feed').replace('title="Give kudos"', ''))
        page.button().click()
        expect(page.clicks['modern-other']).not.toHaveBeenCalled()
        expect(page.clicks['modern-own']).not.toHaveBeenCalled()
        expect(page.warn).toHaveBeenCalledExactlyOnceWith(
            'Strava Helper: skipping kudos button with unrecognized eligibility controls.'
        )
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('2x')
    })

    it('skips disabled modern controls and does not click duplicate selector matches twice', () => {
        const page = setup(fixture('modern-feed')
            .replace('id="modern-first"', 'id="modern-first" disabled')
            .replace('id="modern-other"', 'id="modern-other" class="js-add-kudo"'))
        page.button().click()
        expect(page.clicks['modern-first']).not.toHaveBeenCalled()
        expect(page.clicks['modern-other']).toHaveBeenCalledTimes(1)
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('2x')
    })

    it('does not click modern own activities with no recognition markers', () => {
        const page = setup('<ul class="user-nav"></ul><div data-testid="web-feed-entry">' +
            '<div data-testid="kudos_comments_container"><button id="own-zero" data-testid="kudos_button">' +
            '<svg data-testid="unfilled_kudos"></svg></button></div></div>')
        page.button().click()
        expect(page.clicks['own-zero']).not.toHaveBeenCalled()
        expect(page.warn).toHaveBeenCalledOnce()
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('0x')
    })

    it('handles hidden kudos avatars using the feed localized list title', () => {
        const page = setup(fixture('modern-feed').replace(
            '<div data-testid="avatar_group" title="View all kudos"></div>\n    <div data-testid="counts_wrapper"><button data-testid="kudos_count">2</button></div>',
            '<div data-testid="counts_wrapper"><button data-testid="kudos_count">2</button></div>'
        ))
        expect(page.document.getElementById('modern-other').parentElement
            .querySelector('[data-testid="avatar_group"]')).toBeNull()
        page.button().click()
        expect(page.clicks['modern-other']).toHaveBeenCalledTimes(1)
        expect(page.clicks['modern-own']).not.toHaveBeenCalled()
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('3x')
    })

    it('clicks eligible current cards and skips already-kudoed, disabled and own activities', () => {
        const page = setup(fixture('current-feed'))
        page.button().click()
        for (const id of ['eligible', 'react-card']) {
            expect(page.clicks[id]).toHaveBeenCalledTimes(1)
        }
        for (const id of ['already-kudoed', 'disabled', 'own-public', 'own-private', 'unknown-container']) {
            expect(page.clicks[id]).not.toHaveBeenCalled()
        }
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('2x')
        expect(page.warn).toHaveBeenCalledExactlyOnceWith(
            'Strava Helper: skipping kudos button with an unrecognized activity container.'
        )
    })

    it('counts only enabled legacy add-kudo clicks', () => {
        const page = setup(fixture('legacy-feed'))
        page.button().click()
        expect(page.clicks.legacy).toHaveBeenCalledTimes(1)
        expect(page.clicks['legacy-disabled']).not.toHaveBeenCalled()
        expect(page.clicks['legacy-already-kudoed']).not.toHaveBeenCalled()
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('1x')
    })

    it('clicks a button matching both selectors only once', () => {
        const page = setup(fixture('current-feed').replace(
            'id="eligible"', 'id="eligible" class="js-add-kudo"'
        ))
        page.button().click()
        expect(page.clicks.eligible).toHaveBeenCalledTimes(1)
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('2x')
    })

    it('applies current eligibility guards even when a button also has the legacy class', () => {
        const page = setup(fixture('current-feed').replaceAll(
            'data-testid="kudos_button"', 'class="js-add-kudo" data-testid="kudos_button"'
        ))
        page.button().click()
        expect(page.clicks['own-public']).not.toHaveBeenCalled()
        expect(page.clicks['own-private']).not.toHaveBeenCalled()
        expect(page.clicks['already-kudoed']).not.toHaveBeenCalled()
        expect(page.clicks['unknown-container']).not.toHaveBeenCalled()
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('2x')
    })

    it('displays zero when no eligible buttons exist', () => {
        const page = setup()
        page.button().click()
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('0x')
        expect(page.button().getAttribute('aria-label')).toBe('Kudos given: 0. Click to hide the count.')
        expect(page.button().classList.contains('strava-helper-kudos-all-button-result')).toBe(true)
    })

    it('resets the count on a second click without giving more kudos', () => {
        const page = setup(fixture('legacy-feed'))
        page.button().click()
        expect(page.button().title).toBe('Click to hide the kudos count.')
        expect(page.button().classList.contains('bounce')).toBe(true)
        page.button().click()
        expect(page.clicks.legacy).toHaveBeenCalledTimes(1)
        expect(page.button().querySelector('.strava-helper-kudos-count').textContent).toBe('')
        expect(page.button().className).toBe('')
        expect(page.button().getAttribute('aria-label')).toBe('Give Kudos to all visible activities')
        expect(page.button().title).toBe('Give Kudos to all visible items.')
    })
})

describe('navigation mounting', () => {
    it('mounts exactly one accessible button without giving kudos', () => {
        const page = setup(fixture('current-feed'))
        expect(page.document.querySelectorAll('#strava-helper-kudos-all-button')).toHaveLength(1)
        expect(page.button().parentElement.parentElement.matches('.user-nav')).toBe(true)
        expect(page.button().type).toBe('button')
        expect(page.button().querySelector('[aria-live="polite"]')).not.toBeNull()
        Object.values(page.clicks).forEach(click => expect(click).not.toHaveBeenCalled())
    })

    it('supports the current header navigation fallback', () => {
        const page = setup('<header id="global-header"><nav><ul></ul><ul id="target"></ul></nav></header>')
        expect(page.button().closest('ul').id).toBe('target')
    })

    it('mounts when navigation appears later and warns only once', async () => {
        const page = setup('<main></main>')
        expect(page.button()).toBeNull()
        page.document.body.appendChild(page.document.createElement('div'))
        await page.flush()
        expect(page.warn).toHaveBeenCalledExactlyOnceWith(
            'Strava Helper: waiting for the navigation to add the kudos button.'
        )
        page.document.body.insertAdjacentHTML('afterbegin', '<ul class="user-nav"></ul>')
        await page.flush()
        expect(page.button()).not.toBeNull()
    })

    it('moves the same button into replaced navigation and preserves the result', async () => {
        const page = setup()
        const button = page.button()
        button.click()
        page.document.querySelector('.user-nav').outerHTML = '<ul class="user-nav"></ul>'
        await page.flush()
        expect(page.button()).toBe(button)
        expect(button.isConnected).toBe(true)
        expect(button.querySelector('.strava-helper-kudos-count').textContent).toBe('0x')
        expect(page.document.querySelectorAll('#strava-helper-kudos-all-button')).toHaveLength(1)
    })

    it('does not duplicate the button after unrelated DOM changes', async () => {
        const page = setup()
        for (let index = 0; index < 3; index++) {
            page.document.body.appendChild(page.document.createElement('div'))
            await page.flush()
        }
        expect(page.document.querySelectorAll('#strava-helper-kudos-all-button')).toHaveLength(1)
    })
})
