export function fetchPaycoMenu(request, sender, sendResponse) {
    if (request.action === "fetchPaycoMenu") {
        chrome.storage.local.get(['cachedAt', 'menuContent'], function (result) {
            if (result.menuContent) {
                const now = new Date();
                const cachedAt = new Date(result.cachedAt);
                const diff = now - cachedAt;
                const diffInDays = diff / (1000 * 60 * 60 * 24);
                if (diffInDays <= 1) {
                    sendResponse({ data: result.menuContent });
                    return true;
                }
            }

            fetch(`https://menu.payco.com/mrc/818490`)
                .then(response => response.text())
                .then(data => {
                    const now = new Date();
                    const content = data.replaceAll('/inc', 'https://menu.payco.com/inc');
                    chrome.storage.local.set({ cachedAt: now, menuContent: content });
                    sendResponse({ data: content });
                })
                .catch(error => {
                    console.error("Error fetching data:", error);
                    sendResponse({ data: null });
                });
        });

        return true;
    }
}

export function getSettings(request, sender, sendResponse) {
    if (request.action === "getSettings") {
        chrome.storage.local.get(['doorayUrl', 'menuAlarmEnabled', 'packedOnly'], function (result) {
            sendResponse({ data: result });
        });
        return true;
    }
}
