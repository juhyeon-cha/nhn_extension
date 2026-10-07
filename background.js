import { registerMenuAlarm } from './menu-alarm/listener.js';
import { sendMenuToDoory } from './menu-alarm/message.js';
import { getSettings, fetchPaycoMenu } from './popup/message.js';
import { handleRoomNotification } from './room/notifications.js';

registerMenuAlarm();

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'roomNotificationPermission' || request.action === 'roomAvailable') {
        handleRoomNotification(request, sender).then(
            () => sendResponse({ ok: true }),
            error => sendResponse({ ok: false, error: error.message })
        );
        return true;
    }
    getSettings(request, sender, sendResponse);
    fetchPaycoMenu(request, sender, sendResponse);
    sendMenuToDoory(request, sender, sendResponse);
    return true;
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'purple-time-batch',
        title: '퍼플 타임 일괄 조정',
        contexts: ['page'],
        documentUrlPatterns: ['*://nharmony.nhncorp.com/user/hrms/odm/attend/purpleTime.nhn*']
    });

    chrome.storage.local.get(['botName', 'textTemplate', 'doorayUrl', 'menuAlarmEnabled', 'packedOnly'], (result) => {
        // 세팅되어 있지 않은 경우 초기 값 세팅
        if (result.botName === undefined) {
            chrome.storage.local.set({ botName: 'PORT629 메뉴 알림' });
        }
        if (result.textTemplate === undefined) {
            chrome.storage.local.set({ textTemplate: '{} 메뉴!!' });
        }
        if (result.doorayUrl === undefined) {
            chrome.storage.local.set({ doorayUrl: '' });
        }
        if (result.menuAlarmEnabled === undefined) {
            chrome.storage.local.set({ menuAlarmEnabled: false });
        }
        if (result.packedOnly === undefined) {
            chrome.storage.local.set({ packedOnly: false });
        }
    });
    console.log('Extension installed');
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'purple-time-batch') return;
    chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PURPLE_TIME_MODAL' });
});
