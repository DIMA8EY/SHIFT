import { RUBRIC, MAX_SCORE, byCode } from "./rubric.js";
import type { Finding, Scored, Transcript, Verdict } from "./types.js";

/** Доля веса, которую даёт каждый вердикт. */
const SHARE: Record<Verdict, number> = { ok: 1, warn: 0.5, bad: 0, na: 0 };

/**
 * Оценка считается кодом, а не моделью. Модель только расставляет вердикты
 * по пунктам; арифметика детерминирована, поэтому один и тот же разговор
 * всегда даёт одно и то же число.
 *
 * Пункты с вердиктом na исключаются из знаменателя: если в записи нет данных,
 * это не вина менеджера и не повод занижать оценку.
 */
export function score(findings: Finding[]): Scored {
  const map = new Map(findings.map((f) => [f.code, f]));
  const counts: Record<Verdict, number> = { ok: 0, warn: 0, bad: 0, na: 0 };
  const blocks = new Map<string, { got: number; max: number }>();
  let got = 0;
  let max = 0;

  for (const c of RUBRIC) {
    const f = map.get(c.code);
    const v: Verdict = f ? f.verdict : "na";
    counts[v]++;
    const b = blocks.get(c.block) ?? { got: 0, max: 0 };
    if (v !== "na") {
      const pts = c.weight * SHARE[v];
      got += pts;
      max += c.weight;
      b.got += pts;
      b.max += c.weight;
    }
    blocks.set(c.block, b);
  }

  return {
    score: max === 0 ? 0 : Math.round((got / max) * 100),
    max: MAX_SCORE,
    byBlock: [...blocks].map(([block, b]) => ({ block, got: Math.round(b.got), max: b.max })),
    counts,
  };
}

/**
 * Момент потери — первая секунда, где провален тяжёлый пункт.
 * Это эвристика по весу, а не вывод модели: её легко объяснить клиенту.
 */
export function lossMoment(findings: Finding[], t: Transcript): number | null {
  const heavy = findings
    .filter((f) => f.verdict === "bad" && f.at != null && (byCode.get(f.code)?.weight ?? 0) >= 8)
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const first = heavy[0];
  if (!first || first.at == null) return null;
  return Math.min(first.at, Math.max(0, t.duration - 1));
}
