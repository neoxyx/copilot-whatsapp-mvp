"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const conversationHistory_1 = require("./conversationHistory");
(0, node_test_1.default)('devuelve los mensajes más recientes en orden cronológico', () => {
    const messages = [
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: 'Hola, ¿en qué te ayudo?' },
        { role: 'user', content: 'Quiero saber sobre tu producto' },
        { role: 'assistant', content: 'Claro, te cuento' },
        { role: 'user', content: 'Necesito una demo' },
    ];
    const result = (0, conversationHistory_1.getRecentConversationWindow)(messages, 3);
    strict_1.default.equal(result.length, 3);
    strict_1.default.deepEqual(result.map((m) => m.content), [
        'Quiero saber sobre tu producto',
        'Claro, te cuento',
        'Necesito una demo',
    ]);
});
