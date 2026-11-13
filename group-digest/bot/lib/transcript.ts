import { createHash } from "node:crypto";

export const TIME_ZONE = "Asia/Kuala_Lumpur";
export const INDEX_KEY = "transcript-index";
export const MAX_MESSAGES_PER_DAY = 2000;
export const MAX_TEXT_LENGTH = 4000;

export const chatIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
export const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export type StoredMessage = {
  id: string;
  sender: string;
  text: string;
  sentAt: string;
};

export type DayTranscript = {
  chatId: string;
  day: string;
  messages: StoredMessage[];
};

export type IndexEntry = {
  chatId: string;
  day: string;
};

export type TranscriptIndex = {
  entries: IndexEntry[];
};

export type StoredSummary = {
  chatId: string;
  day: string;
  text: string;
  savedAt: string;
};

export function transcriptKey(chatId: string, day: string): string {
  return `transcript:${chatId}:${day}`;
}

export function summaryKey(chatId: string, day: string): string {
  return `summary:${chatId}:${day}`;
}

export function kualaLumpurDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function previousKualaLumpurDay(date: Date = new Date()): string {
  const [year, month, day] = kualaLumpurDay(date).split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  return cursor.toISOString().slice(0, 10);
}

export function messageFingerprint(input: {
  chatId: string;
  sender: string;
  text: string;
  sentAt: string;
  messageId?: string;
}): string {
  if (input.messageId !== undefined && input.messageId.length > 0) {
    return input.messageId;
  }
  return createHash("sha256")
    .update(`${input.chatId}\n${input.sender}\n${input.sentAt}\n${input.text}`)
    .digest("hex")
    .slice(0, 32);
}

export function emptyTranscript(chatId: string, day: string): DayTranscript {
  return { chatId, day, messages: [] };
}

export function readTranscript(value: unknown, chatId: string, day: string): DayTranscript {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return emptyTranscript(chatId, day);
  }
  const messages = (value as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) {
    return emptyTranscript(chatId, day);
  }
  const stored: StoredMessage[] = [];
  for (const item of messages) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as { id?: unknown; sender?: unknown; text?: unknown; sentAt?: unknown };
    if (
      typeof row.id !== "string" ||
      typeof row.sender !== "string" ||
      typeof row.text !== "string" ||
      typeof row.sentAt !== "string"
    ) {
      continue;
    }
    stored.push({ id: row.id, sender: row.sender, text: row.text, sentAt: row.sentAt });
  }
  return { chatId, day, messages: stored };
}

export function readIndex(value: unknown): TranscriptIndex {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { entries: [] };
  }
  const entries = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    return { entries: [] };
  }
  const stored: IndexEntry[] = [];
  for (const item of entries) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as { chatId?: unknown; day?: unknown };
    if (typeof row.chatId !== "string" || typeof row.day !== "string") {
      continue;
    }
    stored.push({ chatId: row.chatId, day: row.day });
  }
  return { entries: stored };
}

export function readSummary(value: unknown): StoredSummary | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as { chatId?: unknown; day?: unknown; text?: unknown; savedAt?: unknown };
  if (
    typeof row.chatId !== "string" ||
    typeof row.day !== "string" ||
    typeof row.text !== "string" ||
    typeof row.savedAt !== "string"
  ) {
    return null;
  }
  return { chatId: row.chatId, day: row.day, text: row.text, savedAt: row.savedAt };
}
