const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../room/notifications.js'), 'utf8').replace('export ', '');
const sender = { url: 'https://pt.nhncorp.com/room', tab: { id: 7 } };
const message = { action: 'roomAvailable', date: '2026-10-07', start: '10:00', end: '11:30', rooms: ['플레이뮤지엄 1층 · 1-1 회의실'] };
function setup(permission = 'granted', fail = false) {
    const notifications = [];
    const chrome = {
        runtime: { getURL: name => `chrome-extension://test/${name}` },
        notifications: {
            getPermissionLevel: async () => permission,
            create: async (id, options) => {
                if (fail) throw new Error('알림 생성 실패');
                notifications.push({ id, options });
                return id;
            }
        }
    };
    const context = vm.createContext({ URL, chrome });
    vm.runInContext(source, context);
    return { context, notifications, handle: context.handleRoomNotification };
}

test('알림에 선택 날짜·시간·빈 회의실을 담으며 권한 확인만으로는 알리지 않는다', async () => {
    const { handle, notifications } = setup();
    await handle({ action: 'roomNotificationPermission' }, sender);
    assert.equal(notifications.length, 0);
    await handle(message, sender);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].options.title, '빈 회의실 1개 발견');
    assert.equal(notifications[0].options.message, '2026-10-07 10:00~11:30\n플레이뮤지엄 1층 · 1-1 회의실');
});

test('차단된 권한·생성 실패·잘못된 출처와 시간은 성공으로 응답하지 않는다', async () => {
    await assert.rejects(setup('denied').handle(message, sender), /차단/);
    await assert.rejects(setup('granted', true).handle(message, sender), /알림 생성 실패/);
    const { handle, notifications } = setup();
    await assert.rejects(handle(message, { ...sender, url: 'https://menu.payco.com/room' }), /회의실 페이지/);
    for (const bad of [{ start: '07:30' }, { end: '22:30' }, { start: '10:15' }, { end: '09:00' }, { rooms: [] }]) {
        await assert.rejects(handle({ ...message, ...bad }, sender), /올바르지/);
    }
    assert.equal(notifications.length, 0);
});

test('백그라운드 메시지 분기는 회의실 알림 결과를 응답하고 기존 메뉴 처리와 분리한다', async () => {
    const { context, notifications } = setup();
    let listener;
    let menuCalls = 0;
    context.chrome.runtime.onMessage = { addListener: fn => { listener = fn; } };
    context.chrome.runtime.onInstalled = { addListener() {} };
    context.chrome.contextMenus = { onClicked: { addListener() {} } };
    context.registerMenuAlarm = () => {};
    for (const name of ['getSettings', 'fetchPaycoMenu', 'sendMenuToDoory']) context[name] = () => { menuCalls++; };
    const background = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8').replace(/^import .*;\n/gm, '');
    vm.runInContext(background, context);
    const response = await new Promise(resolve => {
        assert.equal(listener(message, sender, resolve), true);
    });
    assert.equal(response.ok, true);
    assert.equal(notifications.length, 1);
    assert.equal(menuCalls, 0);
    const failure = await new Promise(resolve => listener({ ...message, rooms: [] }, sender, resolve));
    assert.equal(failure.ok, false);
    listener({ action: 'getSettings' }, sender, () => {});
    assert.equal(menuCalls, 3);
});
