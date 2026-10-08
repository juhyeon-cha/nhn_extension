const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../content-purple-time.js'), 'utf8');

function setup({
    redraw = false,
    hideSelected = false,
    removeLast = false,
    delayedCalendar = false,
    dayCount = 4,
} = {}) {
    let now = 1;
    let grids;
    let completed = 0;
    let pendingSelection = false;
    const timers = [];
    const clicks = [];
    const alerts = [];
    const selected = new Set();
    // 두 번째 칸은 근무일이 아니다. 선택된 날의 표시가 사라져도 날짜 순번은 유지되어야 한다.
    const visible = index => index !== 1 && !(hideSelected && selected.has(index));
    function render(count = dayCount) {
        grids = Array.from({ length: count }, (_, index) => {
            const cell = {
                getBoundingClientRect: () => ({ left: index * 100, top: 0, width: 100, height: 100 }),
                dispatchEvent(event) {
                    if (event.type === 'click') clicks.push(index);
                    if (delayedCalendar) {
                        if (event.type === 'mouseup') {
                            // 실제 TUI Calendar는 모든 날짜가 이 대기 플래그를 공유한다.
                            pendingSelection = true;
                            schedule(() => {
                                if (pendingSelection) selected.add(index);
                                pendingSelection = false;
                            }, 300);
                        }
                        return;
                    }
                    if (event.type !== 'click') return;
                    if (selected.has(index)) selected.delete(index);
                    else selected.add(index);
                    if (redraw) render(removeLast ? 3 : dayCount);
                },
                click() { this.dispatchEvent({ type: 'click' }); },
            };
            cell.span = { closest: () => cell, index };
            return cell;
        });
    }
    render();
    class DOMEvent {
        constructor(type, options) { this.type = type; Object.assign(this, options); }
    }
    function schedule(fn, delay) { timers.push({ fn, at: now + delay }); }
    const context = vm.createContext({
        chrome: { runtime: { onMessage: { addListener() {} } } },
        document: {
            querySelectorAll(selector) {
                if (selector === 'span.weekday-daily-working-time') return grids.map(cell => cell.span);
                if (selector === 'div.tui-full-calendar-weekday-grid-line.tui-full-calendar-near-month-day') return grids;
                if (selector === 'table > tbody > tr') return [...selected];
                throw new Error(`Unexpected selector: ${selector}`);
            },
        },
        getComputedStyle: span => ({ display: visible(span.index) ? 'inline' : 'none' }),
        PointerEvent: DOMEvent,
        MouseEvent: DOMEvent,
        Date: { now: () => now },
        setTimeout: schedule,
        alert: message => alerts.push(message),
    });
    vm.runInContext(source, context);
    return {
        clicks, alerts, selected,
        run() {
            context.clickWeekdayGridDaysWithInterval(() => { completed++; });
            let iterations = 0;
            while (timers.length) {
                assert.ok(++iterations < 200, 'date selection must finish');
                timers.sort((a, b) => a.at - b.at);
                const timer = timers.shift();
                now = timer.at;
                timer.fn();
            }
            return completed;
        },
    };
}

test('마지막 근무일까지 클릭을 한 번씩 보내 선택을 유지한다', () => {
    const fixture = setup();
    assert.equal(fixture.run(), 1);
    assert.deepEqual(fixture.clicks, [0, 2, 3]);
    assert.deepEqual([...fixture.selected], [0, 2, 3]);
    assert.deepEqual(fixture.alerts, []);
});

test('매 클릭 후 달력이 교체되고 선택한 날의 표시가 숨겨져도 남은 근무일을 선택한다', () => {
    const fixture = setup({ redraw: true, hideSelected: true });
    assert.equal(fixture.run(), 1);
    assert.deepEqual(fixture.clicks, [0, 2, 3]);
    assert.deepEqual([...fixture.selected], [0, 2, 3]);
    assert.deepEqual(fixture.alerts, []);
});

test('도중에 날짜 칸이 없어지면 누락된 상태로 시간 적용을 진행하지 않는다', () => {
    const fixture = setup({ redraw: true, removeLast: true });
    assert.equal(fixture.run(), 0);
    assert.deepEqual(fixture.clicks, [0]);
    assert.equal(fixture.alerts.length, 1);
    assert.match(fixture.alerts[0], /중단/);
});

test('TUI Calendar의 300ms 선택 확정과 겹치지 않아 21번째 마지막 근무일까지 선택한다', () => {
    const fixture = setup({ delayedCalendar: true, dayCount: 22 });
    const expected = Array.from({ length: 22 }, (_, index) => index).filter(index => index !== 1);
    assert.equal(fixture.run(), 1);
    assert.deepEqual(fixture.clicks, expected);
    assert.deepEqual([...fixture.selected], expected);
    assert.deepEqual(fixture.alerts, []);
});
