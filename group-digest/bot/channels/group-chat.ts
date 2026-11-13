import {
  defineChannel,
  localDevStrict,
  POST,
  GET,
  sharedSecretAuth,
} from "@grok/agent-sdk/channels";
import * as z from "zod/v4";
import {
  chatIdPattern,
  dayPattern,
  kualaLumpurDay,
  readSummary,
  summaryKey,
} from "../lib/transcript.js";

type GroupChatState = {
  kind: "summary" | "";
  chatId: string;
  day: string;
};

const messageBody = z.object({
  chatId: z.string().regex(chatIdPattern),
  sender: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(4000),
  sentAt: z.iso.datetime({ offset: true }).optional(),
  messageId: z.string().trim().min(1).max(128).optional(),
});

const summarizeBody = z.object({
  chatId: z.string().regex(chatIdPattern),
  day: z.string().regex(dayPattern).optional(),
});

const summaryQuery = z.object({
  chatId: z.string().regex(chatIdPattern),
  day: z.string().regex(dayPattern),
});

function summaryPrompt(chatId: string, day: string): string {
  return [
    `Write the daily summary for group chat "${chatId}" on ${day} (${"Asia/Kuala_Lumpur"}).`,
    "Call read_transcript with that chatId and day.",
    "Use only the messages that tool returns.",
    "Do not call record_message.",
  ].join(" ");
}

export default defineChannel<GroupChatState>({
  state: { kind: "", chatId: "", day: "" },
  auth: [
    localDevStrict(),
    sharedSecretAuth({
      header: "Authorization",
      secret: "GROUP_DIGEST_BOT_TOKEN",
    }),
  ],
  routes: [
    POST("/message", {
      description: "Store one group-chat message for the daily summary.",
      bodySchema: messageBody,
      handler: async (_request, { callTool, body }) => {
        const recorded = await callTool("record_message", body);
        if (recorded.isError) {
          return Response.json({ error: recorded.errorMessage ?? "record failed" }, { status: 400 });
        }
        return Response.json(recorded.result, { status: 202 });
      },
    }),
    POST("/summarize", {
      description: "Summarize one stored chat day. Defaults to today in Asia/Kuala_Lumpur.",
      bodySchema: summarizeBody,
      handler: async (_request, { callTool, send, host, body }) => {
        const day = body.day ?? kualaLumpurDay();
        const transcript = await callTool("read_transcript", { chatId: body.chatId, day });
        if (transcript.isError) {
          return Response.json({ error: transcript.errorMessage ?? "read failed" }, { status: 400 });
        }
        const count =
          transcript.result !== null &&
          typeof transcript.result === "object" &&
          "count" in transcript.result &&
          typeof transcript.result.count === "number"
            ? transcript.result.count
            : 0;
        if (count === 0) {
          const text = `No messages were stored for ${body.chatId} on ${day}.`;
          const savedAt = new Date().toISOString();
          await host.kv.put(summaryKey(body.chatId, day), {
            chatId: body.chatId,
            day,
            text,
            savedAt,
          });
          return Response.json({ status: "empty", chatId: body.chatId, day, summary: text }, { status: 202 });
        }
        const session = await send(summaryPrompt(body.chatId, day), {
          title: `Summary ${body.chatId} ${day}`,
          state: { kind: "summary", chatId: body.chatId, day },
        });
        const outcome = await session.waitForCompletion();
        return Response.json(
          {
            status: outcome.status,
            chatId: body.chatId,
            day,
            sessionId: session.id,
            summary: outcome.result ?? "",
            error: outcome.errorMessage ?? null,
          },
          { status: 202 },
        );
      },
    }),
    GET("/summary", {
      description: "Read the saved daily summary for one chat and day.",
      querySchema: summaryQuery,
      handler: async (_request, { host, query }) => {
        const summary = readSummary(await host.kv.get(summaryKey(query.chatId, query.day)));
        if (summary === null) {
          return Response.json({ error: "no summary stored" }, { status: 404 });
        }
        return Response.json(summary, { status: 200 });
      },
    }),
  ],
  receive: async (input, { send }) => {
    const target = input.target ?? {};
    const chatId = typeof target.chatId === "string" ? target.chatId : "";
    const day = typeof target.day === "string" ? target.day : "";
    return send(input.message, {
      auth: input.auth,
      title: chatId.length > 0 && day.length > 0 ? `Summary ${chatId} ${day}` : "Group summary",
      state: { kind: "summary", chatId, day },
    });
  },
  events: {
    async "message.completed"(event, channel, ctx) {
      if (event.data.finishReason === "tool_call" || event.data.text.trim() === "") {
        return;
      }
      if (channel.state.kind !== "summary" || channel.state.chatId === "" || channel.state.day === "") {
        return;
      }
      await ctx.host.kv.put(summaryKey(channel.state.chatId, channel.state.day), {
        chatId: channel.state.chatId,
        day: channel.state.day,
        text: event.data.text,
        savedAt: new Date().toISOString(),
      });
    },
  },
});
