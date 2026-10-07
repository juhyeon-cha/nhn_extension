(() => {
    'use strict';
    const model = NHNRoomModel;
    const STORAGE_KEY = 'nhn-room-watch-v1';
    const COLORS = ['#b9d5fa', '#b7e3d1', '#f4d49e', '#cbbafa', '#aee0e6', '#f6c5dd', '#d9e7a8', '#efbea5'];
    const PANEL_ID = 'nhn-room-helper';
    let panel = null;
    let watch = null;
    let reloadTimer = null;
    let renderTimer = null;
    let pendingResume = null;
    let storageError = '';
    let lastSnapshot = null;
    let lastSignature = '';
    let stableSince = Date.now();
    let watchReady = false;

    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
            pendingResume = JSON.parse(raw);
            // 재개는 이번 로드에서만 시도한다. 로그인 만료/오류 후 무한 재시작하지 않는다.
            sessionStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        storageError = '반복 조회 설정을 읽을 수 없습니다. 다시 시작해 주세요.';
    }

    function isRoomPage() {
        return /^\/room\/?$/.test(location.pathname);
    }

    function selectedScope() {
        const calendar = document.querySelector('.app-lnb .app-calendar');
        const month = /^(\d{4})\.(\d{1,2})$/.exec(calendar?.querySelector('.cal-title')?.textContent.trim() || '');
        const selected = calendar?.querySelector('.cal-day--selected');
        const day = Number(selected?.querySelector('.cal-day__num')?.textContent);
        if (!month || !Number.isInteger(day) || day < 1 || day > 31) {
            throw new Error('왼쪽 달력에서 조회할 날짜를 선택해 주세요.');
        }
        let monthIndex = Number(month[2]) - 1;
        if (selected.classList.contains('cal-day--other')) monthIndex += day > 15 ? -1 : 1;
        const date = new Date(Number(month[1]), monthIndex, day);
        const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const type = document.querySelector('.app-lnb [aria-label="회의실 유형"] [aria-checked="true"]')?.textContent.trim();
        const floors = [...document.querySelectorAll('.app-lnb [aria-label="선호 층"] [aria-checked="true"]')]
            .map(el => el.textContent.trim()).sort();
        const building = document.querySelector('.app-lnb .filter-dropdown .app-select__value')?.textContent.trim();
        if (!type || !floors.length || !building) throw new Error('회의실 유형·층·사옥 선택 상태를 읽을 수 없습니다.');
        return { date: dateText, type, floors, building };
    }

    function readSnapshot() {
        const scope = selectedScope();
        const hours = [...document.querySelectorAll('#tt-header-slot .tt-header__hours > span')]
            .map(el => Number(el.textContent.trim()));
        if (!hours.length || hours.some((hour, index) => !Number.isInteger(hour) || hour < 0 || hour > 23
            || (index > 0 && hour !== hours[index - 1] + 1))) {
            throw new Error('예약표의 시간 머리글을 읽을 수 없습니다.');
        }
        const start = hours[0] * 60;
        const end = (hours.at(-1) + 1) * 60;
        const body = document.querySelector('.time-table__body');
        if (!body) throw new Error('회의실 예약표를 기다리고 있습니다.');
        let floor = '';
        const rooms = [];
        for (const child of body.children) {
            if (child.classList.contains('time-table__group-header')) {
                floor = child.querySelector('.time-table__group-label')?.textContent.trim() || '';
            } else if (child.classList.contains('tt-row')) {
                const name = child.querySelector('.tt-row__name')?.textContent.trim();
                if (!floor || !name) throw new Error('회의실 이름 또는 층을 읽을 수 없습니다.');
                const elements = [...child.querySelectorAll('.tt-row__cells > .cell')];
                const slots = elements.map(el => model.parseSlot(el.getAttribute('aria-label'), [...el.classList]));
                model.validateSlots(slots, start, end);
                rooms.push({ name, floor, capacity: child.querySelector('.tt-row__cap')?.textContent.trim() || '', elements, slots });
            }
        }
        if (!rooms.length) throw new Error('표시된 회의실이 없습니다. 로딩 상태와 필터를 확인해 주세요.');
        return { scope, rooms, start, end };
    }

    function decorate(snapshot) {
        for (const room of snapshot.rooms) {
            room.elements.forEach((el, index) => {
                el.toggleAttribute('data-nhn-hour', room.slots[index].start % 60 === 0);
                el.removeAttribute('data-nhn-meeting');
                el.style.removeProperty('--nhn-meeting-color');
            });
            let previous = -1;
            for (const group of model.reservationGroups(room.slots)) {
                const key = JSON.stringify([snapshot.scope.date, room.floor, room.name, group.start, group.description]);
                const color = model.colorIndex(key, previous);
                previous = color;
                group.indexes.forEach(index => {
                    const el = room.elements[index];
                    el.setAttribute('data-nhn-meeting', '');
                    el.style.setProperty('--nhn-meeting-color', COLORS[color]);
                });
            }
        }
    }

    function clearDecorations() {
        document.querySelectorAll('[data-nhn-meeting]').forEach(el => {
            el.removeAttribute('data-nhn-meeting');
            el.style.removeProperty('--nhn-meeting-color');
        });
    }

    function setStatus(text, error = false) {
        if (!panel) return;
        const el = panel.querySelector('[data-role=status]');
        if (el.textContent !== text) el.textContent = text;
        el.toggleAttribute('data-error', error);
    }

    function stop(message, error = false) {
        clearTimeout(reloadTimer);
        reloadTimer = null;
        watch = null;
        watchReady = false;
        pendingResume = null;
        try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* 중단 자체는 저장소와 무관하게 수행한다. */ }
        if (panel) {
            panel.querySelector('[data-action=stop]').disabled = true;
            setStatus(message, error);
            panel.querySelector('[data-role=hint]').textContent = '현재 선택한 날짜·유형·층에서 B1을 제외하고 검색합니다. 칸 위쪽 색상은 예약 구간, 아래쪽 색상은 기존 예약 상태입니다.';
        }
    }

    function parameters(snapshot) {
        const start = model.minutes(panel.querySelector('[name=start]').value);
        const end = model.minutes(panel.querySelector('[name=end]').value);
        const interval = Number(panel.querySelector('[name=interval]').value);
        if (start < 480 || end > 1320 || start % 30 !== 0 || end % 30 !== 0) {
            throw new Error('08:00~22:00 사이의 30분 단위 시간을 선택해 주세요.');
        }
        if (start >= end) throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');
        if (start < snapshot.start || end > snapshot.end) throw new Error('예약표에 표시된 시간 범위 안에서 검색해 주세요.');
        if (!Number.isInteger(interval) || interval < 1 || interval > 1440) throw new Error('조회 간격은 1~1440분의 정수로 입력해 주세요.');
        return { start, end, interval, scope: snapshot.scope };
    }

    function showResults(snapshot, query) {
        const list = panel.querySelector('[data-role=results]');
        list.replaceChildren();
        const candidates = snapshot.rooms.filter(room => model.isSearchableFloor(room.floor));
        const available = candidates.filter(room => model.isAvailable(room.slots, query.start, query.end));
        for (const room of available) {
            const item = document.createElement('li');
            item.textContent = `${room.floor} · ${room.name} (${room.capacity})`;
            list.appendChild(item);
        }
        const checked = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        setStatus(`${snapshot.scope.date} ${formatTime(query.start)}~${formatTime(query.end)} · B1 제외 ${candidates.length}개 중 예약 가능 ${available.length}개 · 페이지 확인 ${checked}`);
        void notifyAvailable(snapshot, query, available);
    }

    async function roomMessage(message) {
        const response = await chrome.runtime.sendMessage(message);
        if (!response?.ok) throw new Error(response?.error || '회의실 알림 처리에 실패했습니다.');
    }

    async function startWatch(query, availableKeys = []) {
        const expected = { ...query, availableKeys };
        watch = expected;
        watchReady = false;
        panel.querySelector('[data-action=stop]').disabled = false;
        setStatus('알림 권한을 확인하고 있습니다.');
        try {
            await roomMessage({ action: 'roomNotificationPermission' });
            if (watch !== expected) return;
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...expected, savedAt: Date.now() }));
            watchReady = true;
            scheduleReload();
            update();
        } catch (error) {
            if (watch === expected) stop(error.message, true);
        }
    }

    async function notifyAvailable(snapshot, query, available) {
        if (watch !== query || !watchReady) return;
        const key = room => JSON.stringify([room.floor, room.name]);
        const previous = new Set(query.availableKeys);
        const newRooms = available.filter(room => !previous.has(key(room)));
        // 비교 기준을 새로고침 사이에도 보존한다. 같은 결과의 DOM 갱신은 재알림하지 않는다.
        query.availableKeys = available.map(key);
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...query, savedAt: Date.now() }));
            if (!newRooms.length) return;
            await roomMessage({
                action: 'roomAvailable',
                date: snapshot.scope.date,
                start: formatTime(query.start), end: formatTime(query.end),
                rooms: newRooms.map(room => `${room.floor} · ${room.name}`)
            });
        } catch (error) {
            if (watch === query) stop(error.message, true);
        }
    }

    function formatTime(value) {
        return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    }

    function scheduleReload() {
        clearTimeout(reloadTimer);
        if (!watch) return;
        const expected = watch;
        reloadTimer = setTimeout(() => {
            if (watch !== expected || !isRoomPage()) return;
            try {
                if (JSON.stringify(selectedScope()) !== JSON.stringify(watch.scope)) {
                    throw new Error('날짜 또는 필터가 변경되어 반복 조회를 중단했습니다.');
                }
                const dialogs = [...document.querySelectorAll('dialog[open], [role=dialog][aria-modal=true], #popup-container:not([hidden])')];
                if (dialogs.some(el => el.getClientRects().length > 0)) {
                    throw new Error('열린 대화상자가 있어 반복 조회를 중단했습니다.');
                }
                // 타이머가 지연된 경우에도 새로고침을 한 번만 한다.
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...watch, savedAt: Date.now() }));
                location.reload();
            } catch (error) {
                stop(error.message, true);
            }
        }, watch.interval * 60_000);
        panel.querySelector('[data-action=stop]').disabled = false;
        panel.querySelector('[data-role=hint]').textContent = `${watch.interval}분마다 새로고침하고 새로 빈 회의실을 알림으로 알려드립니다. 페이지에서 다른 작업을 시작하면 중단합니다. 브라우저 절전 중에는 조회가 늦어질 수 있습니다.`;
    }

    function createPanel() {
        const host = document.querySelector('.reservation-fixed-head');
        if (!host) return;
        panel = document.createElement('section');
        panel.id = PANEL_ID;
        const timeOptions = '<option value="">선택</option>' + Array.from({ length: 29 }, (_, index) => {
            const time = formatTime(480 + index * 30);
            return `<option value="${time}">${time}</option>`;
        }).join('');
        panel.innerHTML = `
            <h2>빈 회의실 찾기</h2>
            <form>
                <label>시작 시간<select name="start" required>${timeOptions}</select></label>
                <label>종료 시간<select name="end" required>${timeOptions}</select></label>
                <label>조회 간격 (분)<input name="interval" type="number" min="1" max="1440" step="1" value="5" required></label>
                <button type="submit">반복 조회 시작</button>
                <button type="button" data-action="find">현재 표에서 찾기</button>
                <button type="button" data-action="stop" disabled>중단</button>
            </form>
            <p data-role="scope"></p>
            <p data-role="status" role="status" aria-live="polite">시간대를 선택해 주세요.</p>
            <ul data-role="results" aria-label="예약 가능한 회의실"></ul>
            <p data-role="hint">현재 선택한 날짜·유형·층에서 B1을 제외하고 검색합니다. 칸 위쪽 색상은 예약 구간, 아래쪽 색상은 기존 예약 상태입니다. 같은 예약자의 연속 구간은 한 회의로 표시합니다.</p>`;
        host.insertBefore(panel, document.querySelector('#tt-header-slot'));
        const form = panel.querySelector('form');
        function search(repeat) {
            stop('');
            panel.querySelector('[data-role=results]').replaceChildren();
            try {
                if (!form.reportValidity()) return;
                if (!lastSnapshot || Date.now() - stableSince < 800) throw new Error('예약표가 바뀌고 있습니다. 잠시 후 다시 시도해 주세요.');
                const snapshot = readSnapshot();
                const query = parameters(snapshot);
                showResults(snapshot, query);
                if (repeat) {
                    void startWatch(query);
                }
            } catch (error) { stop(error.message, true); }
        }
        form.addEventListener('submit', event => { event.preventDefault(); search(true); });
        panel.querySelector('[data-action=find]').addEventListener('click', () => search(false));
        panel.querySelector('[data-action=stop]').addEventListener('click', () => stop('반복 조회를 중단했습니다.'));
        form.addEventListener('input', () => {
            stop('검색 조건이 바뀌었습니다. 다시 검색해 주세요.');
            panel.querySelector('[data-role=results]').replaceChildren();
        });
        if (pendingResume) {
            panel.querySelector('[name=start]').value = formatTime(pendingResume.start);
            panel.querySelector('[name=end]').value = formatTime(pendingResume.end);
            panel.querySelector('[name=interval]').value = pendingResume.interval;
        }
        if (storageError) setStatus(storageError, true);
    }

    function update() {
        if (!isRoomPage()) {
            stop('회의실 페이지를 벗어나 반복 조회를 중단했습니다.');
            panel?.remove();
            panel = null;
            lastSnapshot = null;
            clearDecorations();
            document.documentElement.removeAttribute('data-nhn-room');
            return;
        }
        document.documentElement.setAttribute('data-nhn-room', '');
        if (!panel?.isConnected) createPanel();
        if (!panel) return;
        try {
            const snapshot = readSnapshot();
            const signature = JSON.stringify([snapshot.scope, snapshot.rooms.map(room => [room.floor, room.name, room.slots])]);
            if (signature !== lastSignature) {
                lastSignature = signature;
                stableSince = Date.now();
                panel.querySelector('[data-role=results]').replaceChildren();
                setStatus('예약표를 확인하고 있습니다.');
            }
            lastSnapshot = snapshot;
            decorate(snapshot);
            const scopeText = `${snapshot.scope.date} · ${snapshot.scope.building} · ${snapshot.scope.type} · ${snapshot.scope.floors.join(', ')}`;
            const scopeEl = panel.querySelector('[data-role=scope]');
            if (scopeEl.textContent !== scopeText) scopeEl.textContent = scopeText;
            if (Date.now() - stableSince < 800) {
                clearTimeout(renderTimer);
                renderTimer = setTimeout(update, 850);
                return;
            }
            if (pendingResume) {
                const saved = pendingResume;
                pendingResume = null;
                if (!Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > (Number(saved.interval) + 5) * 60_000
                    || JSON.stringify(saved.scope) !== JSON.stringify(snapshot.scope)) {
                    throw new Error('새로고침 후 날짜·필터가 달라졌거나 조회 설정이 만료되었습니다. 조건을 확인하고 다시 시작해 주세요.');
                }
                if (!Array.isArray(saved.availableKeys) || saved.availableKeys.some(key => typeof key !== 'string')) {
                    throw new Error('저장된 알림 비교 정보가 없습니다. 반복 조회를 다시 시작해 주세요.');
                }
                void startWatch(parameters(snapshot), saved.availableKeys);
            } else if (watch) {
                if (JSON.stringify(watch.scope) !== JSON.stringify(snapshot.scope)) {
                    throw new Error('날짜 또는 필터가 변경되어 반복 조회를 중단했습니다.');
                }
                if (watchReady) showResults(snapshot, watch);
            } else if (panel.querySelector('[data-role=status]').textContent === '예약표를 확인하고 있습니다.') {
                setStatus('시간대를 선택하고 검색해 주세요.');
            }
        } catch (error) {
            clearDecorations();
            lastSnapshot = null;
            panel.querySelector('[data-role=results]').replaceChildren();
            if (watch) stop(error.message, true);
            else setStatus(error.message, true);
        }
    }

    const observer = new MutationObserver(records => {
        // 자신의 스타일/패널 변경은 재실행하지 않는다. 사이트가 바꾼 표와 선택 상태만 감시한다.
        const changed = records.some(record => {
            const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
            if (target?.closest(`#${PANEL_ID}`)) return false;
            return record.type !== 'attributes' || ['class', 'aria-label', 'aria-checked'].includes(record.attributeName);
        });
        if (!changed) return;
        clearTimeout(renderTimer);
        renderTimer = setTimeout(update, 150);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['class', 'aria-label', 'aria-checked'] });
    for (const eventName of ['pointerdown', 'keydown']) {
        document.addEventListener(eventName, event => {
            if ((watch || pendingResume) && !panel?.contains(event.target)) stop('페이지 조작으로 반복 조회를 중단했습니다.');
        }, true);
    }
    window.addEventListener('popstate', update);
    update();
})();
