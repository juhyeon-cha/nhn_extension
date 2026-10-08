/**
 * 퍼플 타임 페이지 전용 content script
 * 우클릭 컨텍스트 메뉴 "퍼플 타임 일괄 조정" 시 모달 표시 및 일괄 적용
 */

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const PURPLE_TIME_URL = 'nharmony.nhncorp.com/user/hrms/odm/attend/purpleTime.nhn';

const STORAGE_KEYS = {
    remember: 'purpleTimeRemember',
    settings: 'purpleTimeSettings',
};

const DEFAULTS = {
    workStart: '1000',
    workEnd: '1930',
    restStart: '1800',
    restEnd: '1830',
};

const ID = {
    modal: 'port629-purple-time-modal',
    backdrop: 'port629-purple-time-backdrop',
    dialog: 'port629-purple-time-dialog',
    form: 'port629-purple-time-form',
    workStart: 'pt-work-start',
    workEnd: 'pt-work-end',
    restEnabled: 'pt-rest-enabled',
    restFields: 'port629-rest-fields',
    restStart: 'pt-rest-start',
    restEnd: 'pt-rest-end',
    remember: 'pt-remember-settings',
    apply: 'port629-pt-apply',
    cancel: 'port629-pt-cancel',
};

const SELECTOR = {
    weekdayGridDay: 'div.tui-full-calendar-weekday-grid-line.tui-full-calendar-near-month-day',
    weekdayWorkingTimeSpan: 'span.weekday-daily-working-time',
    tableRows: 'table > tbody > tr',
    restRegisterButtons: 'table > tbody > tr td button',
};

/** TUI Calendar는 클릭을 300ms 뒤 확정하므로, 다음 클릭까지 그보다 길게 기다린다. */
const CLICK_INTERVAL_MS = 400;
/** 마지막 클릭 후 이 시간만큼 대기한 뒤 테이블 안정 검사 시작 (마지막 클릭의 DOM 반영 여유) */
const DELAY_AFTER_LAST_CLICK_MS = 450;
/** 클릭 후 테이블이 추가되는 시간을 기다리기: 행 수가 이 시간 동안 같으면 안정된 것으로 봄 */
const TABLE_STABLE_MS = 250;
/** 안정 여부를 이 간격으로 확인 */
const TABLE_POLL_INTERVAL_MS = 50;
/** 최대 대기 시간 (무한 대기 방지) */
const TABLE_STABLE_MAX_WAIT_MS = 5000;
/** [휴게등록] 클릭 후 휴게 행이 DOM에 반영될 때까지 대기 */
const DELAY_AFTER_REST_REGISTER_MS = 200;
/** 휴게 시작 선택 후 휴게 종료 select가 갱신될 때까지 대기 (종료 옵션 필터 반영) */
const DELAY_BETWEEN_REST_START_END_MS = 100;

// ---------------------------------------------------------------------------
// DOM / 페이지 유틸
// ---------------------------------------------------------------------------

function isPurpleTimePage() {
    return globalThis.location?.href?.includes(PURPLE_TIME_URL) === true;
}

function getEl(id) {
    return document.getElementById(id);
}

/** select 요소에서 value에 해당하는 option을 선택하고 change 이벤트 발생 */
function clickOption(selectEl, value) {
    if (!selectEl) return;
    const option = [...selectEl.options].find((opt) => opt.value === value);
    if (!option) return;
    selectEl.focus();
    option.selected = true;
    selectEl.value = value;
    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * 요소 중앙 좌표로 마우스/포인터 이벤트 순서 발생.
 * 선택이 다시 해제되지 않도록 click 이벤트는 한 번만 보낸다.
 */
function dispatchMouseClickAtElement(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const view = globalThis.window ?? globalThis;
    const common = {
        bubbles: true,
        cancelable: true,
        view,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: 1,
    };
    const commonUp = { ...common, buttons: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...common, pointerType: 'mouse' }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...common, buttons: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...commonUp, pointerType: 'mouse' }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...commonUp }));
    el.dispatchEvent(new MouseEvent('click', { ...commonUp, detail: 1 }));
}

// ---------------------------------------------------------------------------
// 모달 UI
// ---------------------------------------------------------------------------

const MODAL_HTML = `
    <div id="${ID.backdrop}"></div>
    <div id="${ID.dialog}" role="dialog" aria-modal="true" aria-labelledby="port629-pt-title">
        <h3 id="port629-pt-title">퍼플 타임 일괄 조정</h3>
        <form id="${ID.form}">
            <div class="port629-time-row">
                <div class="port629-field">
                    <label for="${ID.workStart}">근무 시작</label>
                    <input type="text" id="${ID.workStart}" value="${DEFAULTS.workStart}" placeholder="${DEFAULTS.workStart}" maxlength="4" />
                </div>
                <div class="port629-field">
                    <label for="${ID.workEnd}">근무 종료</label>
                    <input type="text" id="${ID.workEnd}" value="${DEFAULTS.workEnd}" placeholder="${DEFAULTS.workEnd}" maxlength="4" />
                </div>
            </div>
            <div class="port629-field port629-check-row">
                <label>
                    <input type="checkbox" id="${ID.restEnabled}" />
                    휴게 설정
                </label>
            </div>
            <div id="${ID.restFields}" class="port629-rest-fields" style="display:none;">
                <div class="port629-time-row">
                    <div class="port629-field">
                        <label for="${ID.restStart}">휴게 시작</label>
                        <input type="text" id="${ID.restStart}" value="${DEFAULTS.restStart}" placeholder="${DEFAULTS.restStart}" maxlength="4" />
                    </div>
                    <div class="port629-field">
                        <label for="${ID.restEnd}">휴게 종료</label>
                        <input type="text" id="${ID.restEnd}" value="${DEFAULTS.restEnd}" placeholder="${DEFAULTS.restEnd}" maxlength="4" />
                    </div>
                </div>
            </div>
            <div class="port629-field port629-check-row">
                <label>
                    <input type="checkbox" id="${ID.remember}" />
                    이전 설정 값 기억
                </label>
            </div>
            <div class="port629-actions">
                <button type="submit" id="${ID.apply}">적용</button>
                <button type="button" id="${ID.cancel}">취소</button>
            </div>
        </form>
    </div>
`;

const MODAL_CSS = `
    #${ID.modal} {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        padding: 16px; color: #172033;
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #${ID.modal}, #${ID.modal} * { box-sizing: border-box; }
    #${ID.backdrop} {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.5);
    }
    #${ID.dialog} {
        position: relative; width: 360px; max-width: 100%;
        max-height: 100%; overflow-y: auto;
        padding: 12px 16px; border: 1px solid #cbd5e1; border-radius: 8px;
        background: #f8fafc; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    }
    #${ID.dialog} h3 { margin: 0 0 8px; color: inherit; font-size: 14px; font-weight: 700; line-height: inherit; }
    #${ID.form} { margin: 0; display: flex; flex-direction: column; gap: 12px; }
    #${ID.form} .port629-time-row { display: flex; gap: 12px; }
    #${ID.form} .port629-time-row .port629-field { flex: 1; min-width: 0; }
    #${ID.form} .port629-field label { display: block; margin: 0 0 4px; font-size: 12px; }
    #${ID.form} input[type="text"], #${ID.form} button {
        height: 32px; padding: 4px 8px;
        border: 1px solid #94a3b8; border-radius: 4px;
        background: #fff; color: #172033; font: inherit;
    }
    #${ID.form} input[type="text"] { width: 100%; font-size: 12px; }
    #${ID.form} .port629-check-row label { display: flex; align-items: center; gap: 8px; margin: 0; cursor: pointer; }
    #${ID.form} input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: #2459a6; }
    #${ID.form} .port629-actions { display: flex; gap: 12px; justify-content: flex-end; }
    #${ID.form} button { cursor: pointer; }
    #${ID.form} button[type="submit"] { background: #2459a6; color: #fff; border-color: #2459a6; }
    #${ID.modal} :focus-visible { outline: 2px solid #2459a6; outline-offset: 2px; }
`;

function createModal() {
    if (getEl(ID.modal)) return;

    const wrap = document.createElement('div');
    wrap.id = ID.modal;
    wrap.innerHTML = MODAL_HTML;

    const style = document.createElement('style');
    style.textContent = MODAL_CSS;
    document.head.appendChild(style);
    document.body.appendChild(wrap);

    // 휴게 설정 체크 시 휴게 입력 영역 표시
    getEl(ID.restEnabled).addEventListener('change', () => {
        getEl(ID.restFields).style.display = getEl(ID.restEnabled).checked ? 'block' : 'none';
    });

    getEl(ID.cancel).addEventListener('click', closeModal);
    getEl(ID.backdrop).addEventListener('click', closeModal);
    getEl(ID.form).addEventListener('submit', (e) => {
        e.preventDefault();
        applyBatch();
    });

    loadSavedSettings();
}

function closeModal() {
    getEl(ID.modal)?.remove();
}

// ---------------------------------------------------------------------------
// 설정 저장/불러오기
// ---------------------------------------------------------------------------

function loadSavedSettings() {
    chrome.storage.local.get([STORAGE_KEYS.remember, STORAGE_KEYS.settings], (result) => {
        const saved = result[STORAGE_KEYS.settings];
        const remember = result[STORAGE_KEYS.remember];

        const rememberEl = getEl(ID.remember);
        if (rememberEl) rememberEl.checked = Boolean(remember);

        if (!saved || typeof saved !== 'object') return;

        const workStartEl = getEl(ID.workStart);
        const workEndEl = getEl(ID.workEnd);
        const restEnabledEl = getEl(ID.restEnabled);
        const restStartEl = getEl(ID.restStart);
        const restEndEl = getEl(ID.restEnd);
        const restFieldsEl = getEl(ID.restFields);

        if (workStartEl && saved.workStart != null) workStartEl.value = String(saved.workStart);
        if (workEndEl && saved.workEnd != null) workEndEl.value = String(saved.workEnd);
        if (restEnabledEl) restEnabledEl.checked = Boolean(saved.restEnabled);
        if (restStartEl && saved.restStart != null) restStartEl.value = String(saved.restStart);
        if (restEndEl && saved.restEnd != null) restEndEl.value = String(saved.restEnd);
        if (restFieldsEl) restFieldsEl.style.display = restEnabledEl?.checked ? 'block' : 'none';
    });
}

function saveSettings(payload) {
    const { workStart, workEnd, restEnabled, restStart, restEnd, remember } = payload;
    chrome.storage.local.set({
        [STORAGE_KEYS.remember]: remember,
        [STORAGE_KEYS.settings]: remember ? { workStart, workEnd, restEnabled, restStart, restEnd } : null,
    });
}

// ---------------------------------------------------------------------------
// 일괄 적용 로직
// ---------------------------------------------------------------------------

function getFormValues() {
    return {
        workStart: getEl(ID.workStart)?.value?.trim() ?? '',
        workEnd: getEl(ID.workEnd)?.value?.trim() ?? '',
        restEnabled: getEl(ID.restEnabled)?.checked ?? false,
        restStart: getEl(ID.restStart)?.value?.trim() ?? '',
        restEnd: getEl(ID.restEnd)?.value?.trim() ?? '',
        remember: getEl(ID.remember)?.checked ?? false,
    };
}

function validateForm(values) {
    if (!values.workStart || !values.workEnd) {
        alert('근무 시작/종료 시간을 입력해 주세요.');
        return false;
    }
    if (values.restEnabled && (!values.restStart || !values.restEnd)) {
        alert('휴게 설정이 켜져 있으면 휴게 시작/종료 시간을 입력해 주세요.');
        return false;
    }
    return true;
}

/**
 * span.weekday-daily-working-time 중 display가 none이 아닌 것의 부모 그리드 div 목록
 */
function getVisibleWeekdayGridDays() {
    const spans = document.querySelectorAll(SELECTOR.weekdayWorkingTimeSpan);
    const divs = [];
    for (const span of spans) {
        if (getComputedStyle(span).display === 'none') continue;
        const grid = span.closest(SELECTOR.weekdayGridDay);
        if (grid && !divs.includes(grid)) divs.push(grid);
    }
    return divs;
}

function getTableRowCount() {
    return document.querySelectorAll(SELECTOR.tableRows).length;
}

/**
 * 테이블 행 수가 TABLE_STABLE_MS 동안 변하지 않을 때까지 대기 후 onComplete 호출.
 * TABLE_STABLE_MAX_WAIT_MS 초과 시에는 강제로 onComplete 호출.
 */
function runAfterTableStable(onComplete) {
    const startTime = Date.now();
    let lastCount = -1;
    let countStableSince = 0;

    const check = () => {
        const count = getTableRowCount();
        const now = Date.now();

        if (count === lastCount && lastCount >= 0) {
            countStableSince = countStableSince || now;
            if (now - countStableSince >= TABLE_STABLE_MS) {
                onComplete();
                return;
            }
        } else {
            countStableSince = 0;
        }
        lastCount = count;

        if (now - startTime >= TABLE_STABLE_MAX_WAIT_MS) {
            onComplete();
            return;
        }
        setTimeout(check, TABLE_POLL_INTERVAL_MS);
    };

    setTimeout(check, TABLE_POLL_INTERVAL_MS);
}

/**
 * 시작 시 보이는 근무일의 달력 위치를 기록하고, 매 클릭 직전에 현재 날짜 칸을 조회한다.
 * 같은 달의 그리드 순서가 유지되는 동안, 선택 후 근무시간 표시가 숨겨져도 다음 날짜를 놓치지 않는다.
 * 마지막 날짜도 같은 방식으로 클릭한 뒤 테이블 행 수가 안정될 때까지 기다린다.
 */
function clickWeekdayGridDaysWithInterval(onComplete) {
    const grids = [...document.querySelectorAll(SELECTOR.weekdayGridDay)];
    const indexes = getVisibleWeekdayGridDays().map(el => grids.indexOf(el));
    if (indexes.length === 0) {
        onComplete();
        return;
    }
    let i = 0;
    function runNext() {
        if (i >= indexes.length) {
            setTimeout(() => runAfterTableStable(onComplete), DELAY_AFTER_LAST_CLICK_MS);
            return;
        }
        const currentGrids = document.querySelectorAll(SELECTOR.weekdayGridDay);
        const el = currentGrids[indexes[i]];
        if (currentGrids.length !== grids.length || !el || !getVisibleWeekdayGridDays().includes(el)) {
            alert('달력의 날짜 상태가 바뀌어 일괄 조정을 중단했습니다. 선택된 날짜를 확인한 뒤 다시 시도해 주세요.');
            return;
        }
        dispatchMouseClickAtElement(el);
        i += 1;
        setTimeout(runNext, CLICK_INTERVAL_MS);
    }
    runNext();
}

/** [휴게등록] 버튼만 클릭 (휴게 행 추가). minus 버튼은 제외 */
function clickRestRowButtons() {
    document.querySelectorAll(SELECTOR.restRegisterButtons).forEach((btn) => {
        if (btn.textContent?.includes('휴게등록')) btn.click();
    });
}

/**
 * 테이블 행 구조:
 * - 근무 행: 5개 td → td[0]=날짜, td[1]=근무시간, td[2]=시작 select, td[3]=종료 select, td[4]=[휴게등록] 버튼
 * - 휴게 행: 4개 td ([휴게등록] 클릭 후 추가) → td[0]=휴게시간, td[1]=시작 select, td[2]=종료 select, td[3]=minus 버튼
 */
function applyWorkTimesToTableRows(values) {
    const { workStart, workEnd } = values;
    document.querySelectorAll(SELECTOR.tableRows).forEach((tr) => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return;
        const workStartSelect = tds[2]?.querySelector('select');
        const workEndSelect = tds[3]?.querySelector('select');
        if (workStartSelect && workEndSelect) {
            clickOption(workStartSelect, workStart);
            clickOption(workEndSelect, workEnd);
        }
    });
}

/** 휴게 행에만 휴게 시작/종료 설정. [휴게등록] 클릭 후 DOM에 생긴 행 대상. 시작 선택 시 종료 select가 갱신되므로 시작 적용 → 대기 → 종료 적용 */
function applyRestTimesToTableRows(values) {
    const { restStart, restEnd } = values;
    const restRows = [...document.querySelectorAll(SELECTOR.tableRows)].filter((tr) => {
        const tds = tr.querySelectorAll('td');
        return tds.length === 4 && tds[1]?.querySelector('select') && tds[2]?.querySelector('select');
    });
    restRows.forEach((tr) => {
        const tds = tr.querySelectorAll('td');
        const restStartSelect = tds[1]?.querySelector('select');
        if (restStartSelect) clickOption(restStartSelect, restStart);
    });
    setTimeout(() => {
        restRows.forEach((tr) => {
            const tds = tr.querySelectorAll('td');
            const restEndSelect = tds[2]?.querySelector('select');
            if (restEndSelect) clickOption(restEndSelect, restEnd);
        });
    }, DELAY_BETWEEN_REST_START_END_MS);
}

function runBatchAfterClicks(values) {
    // 근무 행은 이미 DOM에 있음 → 먼저 근무 시간 적용
    applyWorkTimesToTableRows(values);
    if (values.restEnabled) {
        // [휴게등록] 클릭 시 휴게 행이 DOM에 추가됨 → 대기 후 휴게 시간만 적용
        clickRestRowButtons();
        setTimeout(() => applyRestTimesToTableRows(values), DELAY_AFTER_REST_REGISTER_MS);
    }
}

function applyBatch() {
    const values = getFormValues();
    if (!validateForm(values)) return;

    saveSettings(values);
    closeModal();

    clickWeekdayGridDaysWithInterval(() => runBatchAfterClicks(values));
}

// ---------------------------------------------------------------------------
// 메시지 리스너
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'OPEN_PURPLE_TIME_MODAL') return;

    if (!isPurpleTimePage()) {
        alert('이 기능은 퍼플 타임 설정 페이지에서만 사용할 수 있습니다.');
        sendResponse({ ok: false });
        return;
    }

    createModal();
    sendResponse({ ok: true });
});
