import fs from "node:fs";
import type { Line, Transcript } from "../types.js";

const OPERATION = "https://operation.api.cloud.yandex.net/operations/";
const RECOGNIZE = "https://stt.api.cloud.yandex.net/stt/v3/recognizeFileAsync";

/**
 * Распознавание через Yandex SpeechKit.
 *
 * Выбран не из любви к Яндексу: записи разговоров граждан РФ — персональные
 * данные по 152-ФЗ, и обработка внутри страны снимает вопрос трансграничной
 * передачи. Зарубежный провайдер потребовал бы отдельного согласия и уведомления.
 *
 * Асинхронный режим: загружаем, получаем id операции, опрашиваем до готовности.
 */
export async function yandexTranscribe(file: string): Promise<Transcript> {
  // Ключ со своей областью: speechkitStt.execute. Ключ от YandexGPT здесь не подойдёт.
  const key = (process.env.YANDEX_STT_KEY || process.env.YANDEX_API_KEY)!;
  const folder = process.env.YANDEX_FOLDER_ID!;
  const audio = fs.readFileSync(file).toString("base64");

  const start = await fetch(RECOGNIZE, {
    method: "POST",
    headers: { Authorization: `Api-Key ${key}`, "Content-Type": "application/json", "x-folder-id": folder },
    body: JSON.stringify({
      content: audio,
      recognitionModel: {
        model: "general",
        languageRestriction: { restrictionType: "WHITELIST", languageCode: ["ru-RU"] },
        audioProcessingType: "FULL_DATA",
      },
      // Два канала — менеджер и клиент. Диаризация без отдельной модели.
      speakerLabeling: { speakerLabeling: "SPEAKER_LABELING_ENABLED" },
    }),
  });
  if (!start.ok) throw new Error(`SpeechKit не принял файл: ${start.status} ${await start.text()}`);
  const { id } = (await start.json()) as { id: string };

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const op = await fetch(OPERATION + id, { headers: { Authorization: `Api-Key ${key}` } });
    if (!op.ok) throw new Error(`Не удалось получить результат: ${op.status}`);
    const data = (await op.json()) as { done?: boolean; error?: { message?: string }; response?: unknown };
    if (data.error) throw new Error(`SpeechKit вернул ошибку: ${data.error.message ?? "без текста"}`);
    if (data.done) return shape(data.response);
  }
  throw new Error("Распознавание не завершилось за 10 минут");
}

type Chunk = {
  channelTag?: string;
  alternatives?: { text?: string; words?: { startTimeMs?: string }[] }[];
};

function shape(resp: unknown): Transcript {
  const chunks = ((resp as { chunks?: Chunk[] })?.chunks ?? []) as Chunk[];
  const lines: Line[] = [];
  for (const c of chunks) {
    const alt = c.alternatives?.[0];
    const text = alt?.text?.trim();
    if (!text) continue;
    const ms = Number(alt?.words?.[0]?.startTimeMs ?? 0);
    lines.push({
      at: Math.round(ms / 1000),
      // Первый канал — исходящая сторона, то есть менеджер.
      who: c.channelTag === "1" ? "manager" : c.channelTag ? "client" : "unknown",
      text,
    });
  }
  lines.sort((a, b) => a.at - b.at);
  const last = lines[lines.length - 1];
  return { duration: last ? last.at + 5 : 0, lines, engine: "Yandex SpeechKit v3" };
}
