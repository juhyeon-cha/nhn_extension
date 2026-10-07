/* 콘텐츠 스크립트와 로컬 검증에서 공유하는 예약표 해석 규칙. */
const NHNRoomModel = (() => {
    function minutes(value) {
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
            throw new Error('시간은 00:00~23:59 형식이어야 합니다.');
        }
        const [hour, minute] = value.split(':').map(Number);
        return hour * 60 + minute;
    }

    function parseSlot(label, classes) {
        const match = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s+(.+)$/.exec(label || '');
        if (!match) throw new Error('예약표의 시간 정보를 읽을 수 없습니다.');
        const start = minutes(match[1]);
        const end = minutes(match[2]);
        if (end - start !== 30) throw new Error('예약표가 30분 단위가 아닙니다.');
        const reserved = classes.includes('cell--reservation');
        const available = match[3] === '예약 가능'
            && classes.includes('cell--clickable')
            && !classes.includes('cell--unbookable') && !reserved;
        return { start, end, description: match[3], reserved, available };
    }

    function validateSlots(slots, start, end) {
        if (!slots.length || slots[0].start !== start || slots.at(-1).end !== end
            || slots.some((slot, index) => index > 0 && slots[index - 1].end !== slot.start)) {
            throw new Error('예약표가 완전히 로드되지 않았거나 시간 칸이 누락되었습니다.');
        }
    }

    function isAvailable(slots, start, end) {
        if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
            throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');
        }
        let cursor = start;
        for (const slot of slots) {
            if (slot.end <= start || slot.start >= end) continue;
            if (!slot.available || slot.start > cursor) return false;
            cursor = Math.max(cursor, slot.end);
        }
        return cursor >= end;
    }

    function isSearchableFloor(floor) {
        return !/(?:^|[^a-z0-9])B1(?:층)?(?=$|[^a-z0-9])|지하\s*1\s*층/i.test(floor);
    }

    function reservationGroups(slots) {
        const groups = [];
        let current = null;
        slots.forEach((slot, index) => {
            if (!slot.reserved) {
                current = null;
                return;
            }
            if (!current || current.end !== slot.start || current.description !== slot.description) {
                current = { start: slot.start, end: slot.end, description: slot.description, indexes: [] };
                groups.push(current);
            }
            current.end = slot.end;
            current.indexes.push(index);
        });
        return groups;
    }

    function colorIndex(key, previous = -1) {
        let hash = 2166136261;
        for (const char of key) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
        const index = (hash >>> 0) % 8;
        return index === previous ? (index + 1) % 8 : index;
    }

    return { minutes, parseSlot, validateSlots, isAvailable, isSearchableFloor, reservationGroups, colorIndex };
})();
