import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { RUBRIC } from "./rubric.js";
import { guard } from "./guard.js";
import { score, lossMoment } from "./score.js";
import type { Analysis, Transcript } from "./types.js";

export const MODEL = "claude-opus-5-5";

const Out = z.object({
  findings: z.array(
    z.object({
      code: z.string(),
      verdict: z.enum(["ok", "warn", "bad", "na"]),
      quote: z.string(),
      at: z.number(),
      why: z.string(),
    })
  ),
});

const SYSTEM = `Ты разбираешь расшифровку телефонного разговора менеджера с клиентом по фиксированной оценочной карте.

Жёсткие правила:
1. Оценивай ТОЛЬКО пункты из карты. Свои критерии не добавляй.
2. На каждый пункт — ровно один вывод.
3. Для вердиктов ok и warn приводи дословную цитату из реплик МЕНЕДЖЕРА. Цитата из реплики клиента не принимается. Копируй текст посимвольно, не пересказывай. Цитата проверяется автоматически; вывод без совпадения будет снят.
4. Вердикт bad ставится, когда нужного в разговоре не прозвучало. Тогда quote оставь пустой строкой.
5. Вердикт na — когда по записи нельзя судить: обрыв, шум, тема не возникла. Это нормальный исход, а не крайний случай.
6. Ничего не додумывай о клиенте, компании и сделке сверх того, что сказано вслух.
7. Поле why — одна короткая фраза по-русски, без оценок личности менеджера.
8. at — секунда из расшифровки. Для bad укажи секунду, где нужное должно было прозвучать (например, когда менеджер назвал цену, не задав вопросов). Если определить нельзя, пиши -1. Для na всегда -1.`;

function asPrompt(t: Transcript): string {
  const card = RUBRIC.map((c) => `${c.code} [${c.block}] ${c.title} — ищем: ${c.looksFor}`).join("\n");
  const body = t.lines
    .map((l) => `[${l.at}] ${l.who === "manager" ? "Менеджер" : l.who === "client" ? "Клиент" : "?"}: ${l.text}`)
    .join("\n");
  return `Оценочная карта:\n${card}\n\nРасшифровка (в квадратных скобках — секунда):\n${body}\n\nДлительность: ${t.duration} с.`;
}

/**
 * Разбор. Модель расставляет вердикты, дальше всё решает код:
 * guard проверяет цитаты, score считает оценку. Нестабильность модели
 * не может сдвинуть число — только изменить набор подтверждённых выводов.
 */
export async function analyze(t: Transcript): Promise<Analysis> {
  if (t.lines.length === 0) throw new Error("Расшифровка пустая — разбирать нечего");

  const client = new Anthropic();
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(Out) },
    messages: [{ role: "user", content: asPrompt(t) }],
  });

  if (res.stop_reason === "refusal") {
    throw new Error("Модель отказалась разбирать эту запись");
  }
  const parsed = res.parsed_output;
  if (!parsed) throw new Error("Не удалось разобрать ответ модели");

  const { findings, rejected } = guard(parsed.findings, t);
  return { transcript: t, findings, scored: score(findings), lossAt: lossMoment(findings, t), rejected, model: MODEL };
}
