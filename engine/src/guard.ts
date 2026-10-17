import { byCode } from "./rubric.js";
import type { Finding, Transcript, Verdict } from "./types.js";

const VERDICTS: Verdict[] = ["ok", "warn", "bad", "na"];

/** Нормализация для сверки цитаты: регистр, ё, пунктуация и пробелы не считаются. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Защита от выдумок.
 *
 * Правило одно: вывод живёт, только если его цитату удалось найти в расшифровке
 * дословно. Модель не может сослаться на слова, которых не было. Если цитата
 * не подтвердилась — вердикт понижается до na с пометкой, а не выбрасывается
 * молча: пользователь должен видеть, что здесь система отказалась утверждать.
 */
export function guard(raw: unknown[], t: Transcript): { findings: Finding[]; rejected: number } {
  const hay = norm(t.lines.map((l) => l.text).join(" "));
  const seen = new Set<string>();
  const findings: Finding[] = [];
  let rejected = 0;

  for (const item of raw) {
    const f = item as Partial<Finding>;
    const code = typeof f.code === "string" ? f.code.trim().toUpperCase() : "";

    // Пункта нет в карте — модель придумала критерий.
    if (!byCode.has(code) || seen.has(code)) { rejected++; continue; }
    seen.add(code);

    const verdict: Verdict = VERDICTS.includes(f.verdict as Verdict) ? (f.verdict as Verdict) : "na";
    const quote = typeof f.quote === "string" ? f.quote.trim() : "";
    const why = typeof f.why === "string" ? f.why.trim() : "";
    const at = typeof f.at === "number" && f.at >= 0 && f.at <= t.duration ? Math.round(f.at) : null;

    // na не требует цитаты: это честное «данных нет».
    if (verdict === "na") {
      findings.push({ code, verdict, quote: "", at: null, why: why || "в записи нет данных по этому пункту" });
      continue;
    }

    // Вердикт «не сделал» подтверждается отсутствием, цитировать нечего —
    // но тогда и ссылаться на слова нельзя: пустая цитата допустима только здесь.
    if (!quote) {
      if (verdict === "bad") {
        findings.push({ code, verdict, quote: "", at, why: why || "нужного в разговоре не прозвучало" });
      } else {
        rejected++;
        findings.push({ code, verdict: "na", quote: "", at: null, why: why,
          demoted: "вывод снят: положительная оценка без цитаты не принимается" });
      }
      continue;
    }

    const q = norm(quote);
    if (q.length < 3 || !hay.includes(q)) {
      rejected++;
      findings.push({ code, verdict: "na", quote: "", at: null, why,
        demoted: "вывод снят: такой фразы в расшифровке нет" });
      continue;
    }

    findings.push({ code, verdict, quote, at, why });
  }

  return { findings, rejected };
}
