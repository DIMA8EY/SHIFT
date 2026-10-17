import fs from "node:fs";
import path from "node:path";
import type { Transcript } from "../types.js";
import { yandexTranscribe } from "./yandex.js";

export type Transcriber = (file: string) => Promise<Transcript>;

/**
 * Mock не распознаёт звук. Он берёт готовую расшифровку рядом с файлом
 * (имя.json) или из fixtures и прогоняет остальной пайплайн — чтобы можно
 * было работать над разбором, не тратя деньги на распознавание.
 */
async function mockTranscribe(file: string): Promise<Transcript> {
  const sidecar = file.replace(path.extname(file), ".json");
  const src = fs.existsSync(sidecar) ? sidecar : "fixtures/sample.json";
  if (!fs.existsSync(src)) {
    throw new Error(
      `Mock-режим: нужна готовая расшифровка. Положите рядом с записью файл ${path.basename(sidecar)} ` +
      `или задайте YANDEX_API_KEY и YANDEX_FOLDER_ID для настоящего распознавания.`
    );
  }
  const t = JSON.parse(fs.readFileSync(src, "utf8")) as Transcript;
  return { ...t, engine: `mock (${path.basename(src)})` };
}

export function pickTranscriber(): { run: Transcriber; name: string } {
  if (process.env.YANDEX_API_KEY && process.env.YANDEX_FOLDER_ID) {
    return { run: yandexTranscribe, name: "Yandex SpeechKit" };
  }
  return { run: mockTranscribe, name: "mock" };
}
