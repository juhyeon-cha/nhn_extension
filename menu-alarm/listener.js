import { sendDoorayAlarm } from "./utils.js";

function getNextAlarmTime(hours, minutes) {
    let now = new Date();
    let alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    if (alarmTime <= now) {
        alarmTime.setDate(alarmTime.getDate() + 1);
    }
    return alarmTime.getTime();
}

function createScheduledAlarms() {
    chrome.alarms.create("noon", {
        when: getNextAlarmTime(11, 50),
        periodInMinutes: 24 * 60
    });

    chrome.alarms.create("evening", {
        when: getNextAlarmTime(18, 30),
        periodInMinutes: 24 * 60
    });
}

export function registerMenuAlarm() {
    createScheduledAlarms();

    chrome.alarms.onAlarm.addListener((alarm) => {
        chrome.storage.local.get(["menuAlarmEnabled", "doorayUrl"], (result) => {
            if (result.menuAlarmEnabled && result.doorayUrl) {
                // noon 이면서 12시 +- 5분, evening 이면서 18시 30분 +- 5분에 실행할 로직
                if (alarm.name === "noon" && Math.abs(new Date().getHours() - 11) <= 1 && Math.abs(new Date().getMinutes() - 50) <= 5) {
                    sendDoorayAlarm();
                }
                if (alarm.name === "evening" && Math.abs(new Date().getHours() - 18) <= 1 && Math.abs(new Date().getMinutes() - 30) <= 5) {
                    sendDoorayAlarm();
                }
            }
        });
    });
}
