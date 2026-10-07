export async function handleRoomNotification(request, sender) {
    const source = new URL(sender.url);
    if (source.origin !== 'https://pt.nhncorp.com' || !/^\/room\/?$/.test(source.pathname)
        || !Number.isInteger(sender.tab?.id)) {
        throw new Error('회의실 페이지에서만 알림을 요청할 수 있습니다.');
    }
    const permission = await chrome.notifications.getPermissionLevel();
    if (permission !== 'granted') {
        throw new Error('브라우저 알림이 차단되어 있습니다. 확장 프로그램 알림을 허용한 뒤 다시 시작해 주세요.');
    }
    if (request.action === 'roomNotificationPermission') return;
    const time = /^(?:0[89]|1\d|2[01]):(?:00|30)$|^22:00$/;
    if (request.action !== 'roomAvailable' || !/^\d{4}-\d{2}-\d{2}$/.test(request.date)
        || !time.test(request.start) || !time.test(request.end) || request.start >= request.end
        || !Array.isArray(request.rooms) || !request.rooms.length
        || request.rooms.some(room => typeof room !== 'string' || !room.trim())) {
        throw new Error('회의실 알림 내용이 올바르지 않습니다.');
    }
    const names = request.rooms.slice(0, 5).join('\n');
    const remaining = request.rooms.length > 5 ? `\n외 ${request.rooms.length - 5}개` : '';
    await chrome.notifications.create(`nhn-room-available-${sender.tab.id}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/port629_128.png'),
        title: `빈 회의실 ${request.rooms.length}개 발견`,
        message: `${request.date} ${request.start}~${request.end}\n${names}${remaining}`
    });
}
