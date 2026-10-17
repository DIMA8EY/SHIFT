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
  // Цитата должна быть из реплик менеджера: все пункты карты про его действия.
  // Реплики без разметки роли (unknown) пропускаем: проверить, чьи они, нельзя.
  const mgr = t.lines.filter((l) => l.who !== "client");
  const hay = norm(mgr.map((l) => l.text).join(" "));
  const snap = (s: number | null) => {
    if (s == null) return null;
    const before = t.lines.filter((l) => l.at <= s).map((l) => l.at);
    return before.length ? Math.max(...before) : null;
  };
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
        // Слабые модели ставят 0 вместо «не знаю»: нулевую секунду у bad моментом не считаем.
        findings.push({ code, verdict, quote: "", at: at && at > 0 ? snap(at) : null, why: why || "нужного в разговоре не прозвучало" });
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
        demoted: "вывод снят: такой фразы у менеджера в расшифровке нет" });
      continue;
    }

    // Время берём из места, где цитата найдена, а не из ответа модели.
    const hit = mgr.find((l) => norm(l.text).includes(q));
    findings.push({ code, verdict, quote, at: hit ? hit.at : snap(at), why });
  }

  return { findings, rejected };
}
