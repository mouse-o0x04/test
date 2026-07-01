import api from "./client";

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

export interface ChatResponse {
  reply: string;
  tool_calls: ToolCall[];
}

export async function sendChatMessage(
  message: string,
  history: { role: string; content: string }[] = []
): Promise<ChatResponse> {
  const { data } = await api.post<ChatResponse>("/ai/chat", { message, history });
  return data;
}
