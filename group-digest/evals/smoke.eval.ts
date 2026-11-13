import { defineEval, includes } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "A short group chat is stored, then summarized from the transcript.",
  async test(t) {
    await t.send(
      [
        "Record these two messages in chat project-alpha, then summarize that chat for the day they land on.",
        'First message: sender Alex, text "Let us ship the webhook on Friday.", messageId m-alex.',
        'Second message: sender Priya, text "Decision: post the daily summary at 9am. I will draft the template.", messageId m-priya.',
        "After both are stored, call read_transcript for project-alpha on that day and write the daily summary.",
      ].join(" "),
    );
    t.succeeded();
    t.calledTool("record_message");
    t.calledTool("read_transcript");
    t.notCalledTool("list_chat_days");
    t.check(t.reply, includes(/Priya/));
    t.check(t.reply, includes(/Alex/));
  },
});
