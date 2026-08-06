export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
}

export function getRecentConversationWindow(
  messages: ConversationMessage[],
  limit: number = 10,
): ConversationMessage[] {
  const recent = messages.slice(-limit);
  return recent.map((message) => ({ ...message }));
}
