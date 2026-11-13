import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { chatIdPattern, dayPattern, readTranscript, transcriptKey } from "../lib/transcript.js";

export default defineTool({
  description: "Read the stored messages for one group chat on one calendar day (Asia/Kuala_Lumpur).",
  effect: "read",
  inputSchema: z.object({
    chatId: z.string().regex(chatIdPattern),
    day: z.string().regex(dayPattern),
  }),
  async execute({ chatId, day }, ctx) {
    const transcript = readTranscript(await ctx.host.kv.get(transcriptKey(chatId, day)), chatId, day);
    return {
      chatId,
      day,
      count: transcript.messages.length,
      messages: transcript.messages,
    };
  },
});
