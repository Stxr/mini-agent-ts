import type { ContentBlock, SessionId, SessionNotification, SessionUpdate, ToolCallContent, ToolCallStatus } from "@agentclientprotocol/sdk";

function textBlock(text: string): ContentBlock {
  return { type: "text", text };
}

function sessionNotification(sessionId: SessionId, update: SessionUpdate): SessionNotification {
  return { sessionId, update };
}

function toolContent(text: string): ToolCallContent {
  return {
    type: "content",
    content: textBlock(text)
  };
}

function updateWithText(sessionUpdate: "agent_message_chunk" | "agent_thought_chunk", text: string): SessionUpdate {
  return {
    sessionUpdate,
    content: textBlock(text)
  };
}

export function createAgentMessageNotification(sessionId: SessionId, text: string): SessionNotification {
  return sessionNotification(sessionId, updateWithText("agent_message_chunk", text));
}

export function createAgentThoughtNotification(sessionId: SessionId, text: string): SessionNotification {
  return sessionNotification(sessionId, updateWithText("agent_thought_chunk", text));
}

export function createToolCallNotification(
  sessionId: SessionId,
  toolCallId: string,
  title: string,
  rawInput: unknown
): SessionNotification {
  return sessionNotification(sessionId, {
    sessionUpdate: "tool_call",
    toolCallId,
    title,
    kind: "execute",
    status: "pending",
    rawInput
  });
}

export function createToolCallUpdateNotification(
  sessionId: SessionId,
  toolCallId: string,
  status: ToolCallStatus,
  text: string
): SessionNotification {
  return sessionNotification(sessionId, {
    sessionUpdate: "tool_call_update",
    toolCallId,
    status,
    rawOutput: text,
    content: [toolContent(text)]
  });
}
