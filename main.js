"use strict";

const _ = browser.i18n.getMessage;


let menusCreated = false;

async function createMenus () {
    const { options } = await browser.storage.sync.get("options");

    if (!options || menusCreated) {
        return;
    }

    browser.menus.create({
        id: "copyExtensionMutedState"
      , title: _("copyExtensionMutedStateTitle")
      , type: "checkbox"
      , checked: options.copyExtensionMutedState
      , contexts: [ "tab", "tools_menu" ]
    });
    browser.menus.create({
        id: "linkMutedState"
      , title: _("linkMutedStateTitle")
      , type: "checkbox"
      , checked: options.linkMutedState
      , contexts: [ "tab", "tools_menu" ]
    });
    browser.menus.create({
        id: "linkMutedStateRemute"
      , title: _("linkMutedStateRemuteTitle")
      , type: "checkbox"
      , checked: options.linkMutedStateRemute
      , contexts: [ "tab", "tools_menu" ]
    });

    menusCreated = true;

    browser.menus.onClicked.addListener((info, tab) => {
        options[info.menuItemId] = info.checked;
        browser.storage.sync.set({ options });
    });
}

createMenus();


const defaultOptions = {
    copyExtensionMutedState: true
  , linkMutedState: false
  , linkMutedStateRemute: false
};

browser.runtime.onInstalled.addListener(async details => {
    switch (details.reason) {
        // Set default options
        case "install": {
            await browser.storage.sync.set({
                options: defaultOptions
            });
            break;
        };

        // Set newly added options
        case "update": {
            const { options: existingOptions }
                    = await browser.storage.sync.get("options");

            const newOptions = {};

            // Find options not already in storage
            for (const [ key, val ] of Object.entries(defaultOptions)) {
                if (!existingOptions.hasOwnProperty(key)) {
                    newOptions[key] = val;
                }
            }

            // Update storage with default values of new options
            await browser.storage.sync.set({
                options: {
                    ...existingOptions
                  , ...newOptions
                }
            });

            break;
        };
    }
    
    createMenus();
});


browser.tabs.onCreated.addListener(async tab => {
    const { options } = await browser.storage.sync.get("options");

    if (!tab.openerTabId) {
        return;
    }

    const openerTab = await browser.tabs.get(tab.openerTabId);
    const { mutedInfo } = openerTab;

    if (!mutedInfo.muted) {
        return;
    }

    switch (mutedInfo.reason) {
        case "extension": {
            if (!options.copyExtensionMutedState) {
                break;
            }
        };
        case "user": {
            // Set muted
            browser.tabs.update(tab.id, {
                muted: true
            });

            /**
             * Update muted state of descendant tab if opener tab is
             * muted/unmuted.
             */
            browser.tabs.onUpdated.addListener(
                    async function onUpdated (tabId, changeInfo) {

                const { options } = await browser.storage.sync.get("options");

                switch (changeInfo.mutedInfo.reason) {
                    case "extension": {
                        if (!options.copyExtensionMutedState) {
                            break;
                        }
                    };
                    case "user": {
                        if (options.linkMutedState) {
                            try {
                                await browser.tabs.update(tab.id, {
                                    muted: changeInfo.mutedInfo.muted
                                });
                            } catch (err) {}

                            // Disable after unmuting descendant tabs
                            if (!options.linkMutedStateRemute) {
                                browser.tabs.onUpdated.removeListener(
                                        onUpdated);
                            }
                        }
                        break;
                    };
                }
            }, {
                // Filters
                tabId: openerTab.id
              , properties: [ "mutedInfo" ]
            });

            break;
        };
    }
});
