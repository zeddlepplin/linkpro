import { defineSchedule } from "@grok/agent-sdk/schedules";
import groupChat from "../channels/group-chat.js";
import { previousKualaLumpurDay, TIME_ZONE } from "../lib/transcript.js";

type ListedChat = {
  chatId: string;
  day: string;
  count: number;
};

export default defineSchedule({
  // 09:00 Asia/Kuala_Lumpur. Malaysia does not observe daylight saving.
  cron: "0 1 * * *",
  async run({ receive, callTool, waitUntil, appAuth }) {
    const day = previousKualaLumpurDay();
    const listed = await callTool("list_chat_days", { day });
    if (listed.isError || listed.result === null || typeof listed.result !== "object") {
      return;
    }
    const chats = "chats" in listed.result && Array.isArray(listed.result.chats) ? listed.result.chats : [];
    for (const chat of chats) {
      if (chat === null || typeof chat !== "object" || Array.isArray(chat)) {
        continue;
      }
      const row = chat as Partial<ListedChat>;
      if (typeof row.chatId !== "string" || typeof row.count !== "number" || row.count < 1) {
        continue;
      }
      waitUntil(
        receive(groupChat, {
          auth: appAuth,
          target: { chatId: row.chatId, day },
          message: `Write the daily summary for group chat "${row.chatId}" on ${day} (${TIME_ZONE}). Call read_transcript with that chatId and day. Use only those messages. Do not call record_message.`,
        }),
      );
    }
  },
});
