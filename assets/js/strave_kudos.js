var strava_helper = {}

strava_helper = (function (strava_helper) {

    strava_helper.kudos_all = {
        getKudosAllImage: function () {
            return '<span class="strava-helper-kudos-icon" title="Give Kudos to all visible activities!"></span>' +
                '<span class="strava-helper-kudos-count" aria-live="polite"></span>'
        },

        giveKudosToAll: function () {
            let button = document.getElementById('strava-helper-kudos-all-button')
            if (button.classList.contains('strava-helper-kudos-all-button-result')) {
                strava_helper.kudos_all.resetKudosButton()
                return
            }

            let kudos_count = 0

            document.querySelectorAll('button.js-add-kudo, button[data-testid="kudos_button"]').forEach(function (element) {
                if (element.disabled) {
                    return
                }

                if (element.matches('[data-testid="kudos_button"]')) {
                    if (!element.querySelector('svg[data-testid="unfilled_kudos"]')) {
                        return
                    }

                    let container = element.closest('[data-testid="web-feed-entry"], div.react-card-container')
                    if (!container) {
                        console.warn('Strava Helper: skipping kudos button with an unrecognized activity container.')
                        return
                    }
                    if (container.querySelector('[data-testid="visibility_section"]') ||
                        container.querySelector('[data-testid="entry_actions_container"]')) {
                        return
                    }
                }

                element.click()
                kudos_count++
            })

            strava_helper.kudos_all.showKudosCount(kudos_count)
        },

        showKudosCount: function (count) {
            let button = document.getElementById('strava-helper-kudos-all-button')
            button.querySelector('.strava-helper-kudos-count').textContent = count.toString() + 'x'
            button.classList.add('strava-helper-kudos-all-button-result', 'animated', 'bounce')
            button.title = 'Click to hide the kudos count.'
            button.setAttribute('aria-label', 'Kudos given: ' + count.toString() + '. Click to hide the count.')
        },

        resetKudosButton: function () {
            let button = document.getElementById('strava-helper-kudos-all-button')
            button.innerHTML = strava_helper.kudos_all.getKudosAllImage()
            button.classList.remove('strava-helper-kudos-all-button-result', 'animated', 'bounce')
            button.title = 'Give Kudos to all visible items.'
            button.setAttribute('aria-label', 'Give Kudos to all visible activities')
        },

        init: function () {
            let item = document.createElement('li')
            let button = document.createElement('button')
            button.type = 'button'
            button.id = 'strava-helper-kudos-all-button'
            button.title = 'Give Kudos to all visible items.'
            button.setAttribute('aria-label', 'Give Kudos to all visible activities')
            button.innerHTML = strava_helper.kudos_all.getKudosAllImage()
            button.addEventListener('click', strava_helper.kudos_all.giveKudosToAll)
            item.appendChild(button)

            let warned = false
            function mountButton() {
                let navigation = document.querySelector('.user-nav') ||
                    document.querySelector('#global-header nav > ul:last-child')
                if (!navigation) {
                    if (!warned) {
                        console.warn('Strava Helper: waiting for the navigation to add the kudos button.')
                        warned = true
                    }
                    return
                }
                if (item.parentElement !== navigation) {
                    navigation.appendChild(item)
                }
            }

            mountButton()
            new MutationObserver(mountButton).observe(document.documentElement, {
                childList: true,
                subtree: true
            })
        }
    }

    strava_helper.kudos_all.init()

    return strava_helper

}(strava_helper))
