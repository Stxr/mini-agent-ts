import type { LlmResponse, Message } from "../schema.js";

export interface LlmClient {
  generate(messages: Message[], tools?: unknown[]): Promise<LlmResponse>;
}
