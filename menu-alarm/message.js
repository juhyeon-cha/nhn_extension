import { sendDoorayAlarm } from "./utils.js";

export function sendMenuToDoory(request, sender, sendResponse) {
    if (request.action === "sendMenuToDoory") {
        sendDoorayAlarm();
        sendResponse({ data: null });
        return true;
    }
}
