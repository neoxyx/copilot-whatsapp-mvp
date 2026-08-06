"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentConversationWindow = getRecentConversationWindow;
function getRecentConversationWindow(messages, limit = 10) {
    const recent = messages.slice(-limit);
    return recent.map((message) => ({ ...message }));
}
