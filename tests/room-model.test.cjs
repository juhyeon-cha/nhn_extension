const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = vm.runInNewContext(`${fs.readFileSync(require('node:path').join(__dirname, '../room/model.js'), 'utf8')}\nNHNRoomModel`);
const slot = (label, classes = ['cell--clickable']) => model.parseSlot(label, classes);

test('전체 요청 구간이 비어 있어야 하며 예약 끝과 다음 시작은 겹치지 않는다', () => {
    const slots = [slot('10:00 - 10:30 예약자 A 예약', ['cell--reservation']), slot('10:30 - 11:00 예약 가능'), slot('11:00 - 11:30 예약 가능')];
    assert.equal(model.isAvailable(slots, 630, 690), true);
    assert.equal(model.isAvailable(slots, 615, 660), false);
    assert.equal(model.isAvailable(slots, 645, 675), true);
    assert.equal(model.isAvailable(slots, 660, 720), false);
    assert.equal(model.isAvailable(slots, 570, 600), false);
});

test('예약 불가·모르는 상태·누락된 칸은 빈 회의실로 표시하지 않는다', () => {
    for (const bad of [slot('10:00 - 10:30 예약 불가', ['cell--unbookable']), slot('10:00 - 10:30 조회 실패'), slot('10:00 - 10:30 예약 가능', ['cell--reservation', 'cell--clickable'])]) {
        assert.equal(model.isAvailable([bad], 600, 630), false);
    }
    const gaps = [slot('10:00 - 10:30 예약 가능'), slot('11:00 - 11:30 예약 가능')];
    assert.equal(model.isAvailable(gaps, 600, 690), false);
    assert.throws(() => model.validateSlots(gaps, 600, 690));
    assert.throws(() => model.validateSlots([], 600, 690));
});

test('예약자 전환과 빈 칸으로 예약 구간을 구분한다', () => {
    const booked = label => slot(label, ['cell--reservation', 'cell--clickable']);
    const groups = model.reservationGroups([
        booked('10:00 - 10:30 예약자 A 예약'), booked('10:30 - 11:00 예약자 A 예약'),
        booked('11:00 - 11:30 예약자 B 예약'), slot('11:30 - 12:00 예약 가능'),
        booked('12:00 - 12:30 예약자 A 예약')
    ]);
    assert.equal(groups.length, 3);
    assert.equal(groups[0].indexes.length, 2);
    assert.equal(groups[1].start, 660);
    assert.notEqual(model.colorIndex('same'), model.colorIndex('same', model.colorIndex('same')));
    assert.equal(model.colorIndex('stable'), model.colorIndex('stable'));
});

test('시간 형식·역전·30분 칸 변경을 명확하게 거부한다', () => {
    for (const value of ['', '25:00', '09:70', '9:00']) assert.throws(() => model.minutes(value));
    assert.throws(() => slot('10:00 - 11:00 예약 가능'));
    assert.throws(() => slot('불러오는 중'));
    assert.throws(() => model.isAvailable([], 600, 600));
    assert.throws(() => model.isAvailable([], 660, 600));
    model.validateSlots([slot('10:00 - 10:30 예약 가능'), slot('10:30 - 11:00 예약 가능')], 600, 660);
});

test('B1·지하 1층은 검색에서 제외하고 B10·지상층은 유지한다', () => {
    for (const floor of ['B1', '플레이뮤지엄 B1층', '플레이뮤지엄 지하 1층']) {
        assert.equal(model.isSearchableFloor(floor), false);
    }
    for (const floor of ['플레이뮤지엄 1층', '플레이뮤지엄 B10층', '플레이뮤지엄 10층']) {
        assert.equal(model.isSearchableFloor(floor), true);
    }
});
