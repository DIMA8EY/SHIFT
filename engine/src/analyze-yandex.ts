import { RUBRIC } from "./rubric.js";
import { guard } from "./guard.js";
import { score, lossMoment } from "./score.js";
import type { Analysis, Transcript } from "./types.js";

const URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";

const SYSTEM = `Ты разбираешь расшифровку телефонного разговора менеджера с клиентом по фиксированной оценочной карте.

Жёсткие правила:
1. Оценивай ТОЛЬКО пункты из карты. Свои критерии не добавляй.
2. На каждый пункт карты — ровно один объект в ответе.
3. Для вердиктов ok и warn приводи дословную цитату из расшифровки. Копируй текст посимвольно, не пересказывай. Цитата проверяется автоматически; вывод без точного совпадения будет снят.
4. Вердикт bad — когда нужного в разговоре не прозвучало. Тогда quote — пустая строка.
5. Вердикт na — когда по записи судить нельзя: обрыв, шум, тема не возникла.
6. Ничего не додумывай о клиенте и сделке сверх сказанного вслух.
7. why — одна короткая фраза, без оценок личности менеджера.

Ответ — только JSON, без пояснений и без разметки:
{"findings":[{"code":"A1","verdict":"bad","quote":"","at":0,"why":"..."}]}`;

/**
 * Вытаскивает JSON из ответа модели.
 *
 * YandexGPT регулярно оборачивает ответ в ```json ... ``` или добавляет
 * фразу до и после, даже когда просишь этого не делать. Поэтому парсер
 * терпимый: снимает ограждение и берёт первый сбалансированный объект.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? text).trim();

  const start = body.indexOf("{");
  if (start < 0) throw new Error("Модель вернула ответ без JSON");

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1));
    }
  }
  throw new Error("JSON в ответе модели не закрыт — вероятно, ответ обрезан по лимиту токенов");
}

function asPrompt(t: Transcript): string {
  const card = RUBRIC.map((c) => `${c.code} [${c.block}] ${c.title} — ищем: ${c.looksFor}`).join("\n");
  const body = t.lines
    .map((l) => `[${l.at}] ${l.who === "manager" ? "Менеджер" : l.who === "client" ? "Клиент" : "?"}: ${l.text}`)
    .join("\n");
  return `Оценочная карта:\n${card}\n\nРасшифровка (в скобках — секунда):\n${body}\n\nДлительность: ${t.duration} с.`;
}

type YaResponse = {
  result?: { alternatives?: { message?: { text?: string }; status?: string }[] };
  error?: { message?: string };
  message?: string;
};

/**
 * Разбор через YandexGPT.
 *
 * Модель только расставляет вердикты. Цитаты проверяет guard, оценку считает
 * score — поэтому более слабая модель не портит число, она лишь даёт больше
 * снятых выводов, и это видно в отчёте.
 */
export async function analyzeYandex(t: Transcript): Promise<Analysis> {
  if (t.lines.length === 0) throw new Error("Расшифровка пустая — разбирать нечего");

  const key = process.env.YANDEX_GPT_KEY || process.env.YANDEX_API_KEY;
  const folder = process.env.YANDEX_FOLDER_ID;
  if (!key) throw new Error("Нет YANDEX_GPT_KEY — ключа с областью yc.ai.languageModels.execute");
  if (!folder) throw new Error("Нет YANDEX_FOLDER_ID — ID каталога нужен в каждом запросе");

  const model = process.env.YANDEX_GPT_MODEL || "yandexgpt";
  const modelUri = `gpt://${folder}/${model}/latest`;

  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Api-Key ${key}`, "Content-Type": "application/json", "x-folder-id": folder },
    body: JSON.stringify({
      modelUri,
      // temperature 0: один и тот же разговор должен давать один и тот же разбор
      completionOptions: { stream: false, temperature: 0, maxTokens: "8000" },
      messages: [
        { role: "system", text: SYSTEM },
        { role: "user", text: asPrompt(t) },
      ],
    }),
  });

  const data = (await res.json()) as YaResponse;
  if (!res.ok) {
    const why = data.error?.message || data.message || `код ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `YandexGPT отклонил ключ (${why}). Проверьте: область действия ключа — yc.ai.languageModels.execute, ` +
        `роль ai.languageModels.user выдана, YANDEX_FOLDER_ID — это ID каталога, а не его имя.`
      );
    }
    throw new Error(`YandexGPT вернул ошибку: ${why}`);
  }

  const text = data.result?.alternatives?.[0]?.message?.text;
  if (!text) throw new Error("YandexGPT вернул пустой ответ");

  const parsed = extractJson(text) as { findings?: unknown[] };
  const raw = Array.isArray(parsed.findings) ? parsed.findings : [];
  if (raw.length === 0) throw new Error("Модель не вернула ни одного вывода");

  const { findings, rejected } = guard(raw, t);
  return { transcript: t, findings, scored: score(findings), lossAt: lossMoment(findings, t), rejected, model: `YandexGPT (${model})` };
}
