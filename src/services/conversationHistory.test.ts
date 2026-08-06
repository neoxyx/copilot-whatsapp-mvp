import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecentConversationWindow } from './conversationHistory';

test('devuelve los mensajes más recientes en orden cronológico', () => {
  const messages = [
    { role: 'user' as const, content: 'Hola' },
    { role: 'assistant' as const, content: 'Hola, ¿en qué te ayudo?' },
    { role: 'user' as const, content: 'Quiero saber sobre tu producto' },
    { role: 'assistant' as const, content: 'Claro, te cuento' },
    { role: 'user' as const, content: 'Necesito una demo' },
  ];

  const result = getRecentConversationWindow(messages, 3);

  assert.equal(result.length, 3);
  assert.deepEqual(result.map((m) => m.content), [
    'Quiero saber sobre tu producto',
    'Claro, te cuento',
    'Necesito una demo',
  ]);
});
