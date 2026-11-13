import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  INDEX_KEY,
  MAX_MESSAGES_PER_DAY,
  chatIdPattern,
  emptyTranscript,
  kualaLumpurDay,
  messageFingerprint,
  readIndex,
  readTranscript,
  transcriptKey,
} from "../lib/transcript.js";

export default defineTool({
  description:
    "Store one group-chat message on the Kuala Lumpur calendar day of sentAt. Repeating the same messageId is a no-op.",
  effect: "idempotent",
  inputSchema: z.object({
    chatId: z.string().regex(chatIdPattern),
    sender: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(4000),
    sentAt: z.iso.datetime({ offset: true }).optional(),
    messageId: z.string().trim().min(1).max(128).optional(),
  }),
  async execute(input, ctx) {
    const sentAt = input.sentAt ?? new Date().toISOString();
    const day = kualaLumpurDay(new Date(sentAt));
    const id = messageFingerprint({
      chatId: input.chatId,
      sender: input.sender,
      text: input.text,
      sentAt,
      messageId: input.messageId,
    });
    const key = transcriptKey(input.chatId, day);
    const transcript = readTranscript(await ctx.host.kv.get(key), input.chatId, day);
    const remember = async () => {
      const index = readIndex(await ctx.host.kv.get(INDEX_KEY));
      if (!index.entries.some((entry) => entry.chatId === input.chatId && entry.day === day)) {
        index.entries.push({ chatId: input.chatId, day });
        await ctx.host.kv.put(INDEX_KEY, index);
      }
    };
    if (transcript.messages.some((message) => message.id === id)) {
      await remember();
      return {
        stored: false,
        duplicate: true,
        chatId: input.chatId,
        day,
        messageId: id,
        count: transcript.messages.length,
      };
    }
    if (transcript.messages.length >= MAX_MESSAGES_PER_DAY) {
      return {
        stored: false,
        duplicate: false,
        reason: "day_full",
        chatId: input.chatId,
        day,
        messageId: id,
        count: transcript.messages.length,
      };
    }
    const next = transcript.messages.length === 0 ? emptyTranscript(input.chatId, day) : transcript;
    next.messages.push({ id, sender: input.sender, text: input.text, sentAt });
    await ctx.host.kv.put(key, next);
    await remember();
    return {
      stored: true,
      duplicate: false,
      chatId: input.chatId,
      day,
      messageId: id,
      count: next.messages.length,
    };
  },
});
