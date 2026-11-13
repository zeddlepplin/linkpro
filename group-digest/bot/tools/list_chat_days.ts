import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { INDEX_KEY, dayPattern, readIndex, readTranscript, transcriptKey } from "../lib/transcript.js";

export default defineTool({
  description: "List group chats that have stored messages, optionally for one calendar day.",
  effect: "read",
  inputSchema: z.object({
    day: z.string().regex(dayPattern).optional(),
  }),
  async execute(input, ctx) {
    const index = readIndex(await ctx.host.kv.get(INDEX_KEY));
    const entries = index.entries.filter((entry) => input.day === undefined || entry.day === input.day);
    const chats: { chatId: string; day: string; count: number }[] = [];
    for (const entry of entries) {
      const transcript = readTranscript(
        await ctx.host.kv.get(transcriptKey(entry.chatId, entry.day)),
        entry.chatId,
        entry.day,
      );
      chats.push({ chatId: entry.chatId, day: entry.day, count: transcript.messages.length });
    }
    return { day: input.day ?? null, chats };
  },
});
