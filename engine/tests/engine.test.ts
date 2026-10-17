import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { guard } from "../src/guard.js";
import { score, lossMoment } from "../src/score.js";
import { report } from "../src/report.js";
import { extractJson } from "../src/analyze-yandex.js";
import { RUBRIC, MAX_SCORE } from "../src/rubric.js";
import type { Transcript } from "../src/types.js";

const t = JSON.parse(fs.readFileSync("fixtures/sample.json", "utf8")) as Transcript;

describe("защита от выдумок", () => {
  it("пропускает вывод с настоящей цитатой", () => {
    const { findings, rejected } = guard(
      [{ code: "C2", verdict: "ok", quote: "От шести до десяти месяцев, зависит от суда.", at: 25, why: "срок с оговоркой" }], t);
    expect(rejected).toBe(0);
    expect(findings[0]?.verdict).toBe("ok");
  });

  it("снимает вывод, если такой фразы не было", () => {
    const { findings, rejected } = guard(
      [{ code: "A1", verdict: "ok", quote: "Меня зовут Пётр, компания Ромашка", at: 1, why: "представился" }], t);
    expect(rejected).toBe(1);
    expect(findings[0]?.verdict).toBe("na");
    expect(findings[0]?.demoted).toMatch(/нет/);
  });

  it("сверяет цитату без учёта регистра, ё и пунктуации", () => {
    const { rejected } = guard(
      [{ code: "D1", verdict: "warn", quote: "хорошо   ДУМАЙТЕ", at: 37, why: "согласился" }], t);
    expect(rejected).toBe(0);
  });

  it("выбрасывает критерий, которого нет в карте", () => {
    const { findings, rejected } = guard([{ code: "Z9", verdict: "ok", quote: "Алло.", at: 0, why: "" }], t);
    expect(rejected).toBe(1);
    expect(findings).toHaveLength(0);
  });

  it("не даёт поставить ok без цитаты", () => {
    const { findings, rejected } = guard([{ code: "E1", verdict: "ok", quote: "", at: 5, why: "назначил" }], t);
    expect(rejected).toBe(1);
    expect(findings[0]?.verdict).toBe("na");
  });

  it("разрешает bad без цитаты: это отсутствие, а не слова", () => {
    const { findings, rejected } = guard([{ code: "E1", verdict: "bad", quote: "", at: 37, why: "шага нет" }], t);
    expect(rejected).toBe(0);
    expect(findings[0]?.verdict).toBe("bad");
  });

  it("берёт только первый вывод по каждому пункту", () => {
    const { findings, rejected } = guard([
      { code: "A1", verdict: "bad", quote: "", at: 0, why: "не представился" },
      { code: "A1", verdict: "ok", quote: "Алло.", at: 0, why: "передумал" },
    ], t);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe("bad");
    expect(rejected).toBe(1);
  });
});

describe("оценка", () => {
  it("всё провалено — ноль", () => {
    const f = RUBRIC.map((c) => ({ code: c.code, verdict: "bad" as const, quote: "", at: null, why: "" }));
    expect(score(f).score).toBe(0);
  });

  it("всё выполнено — сто", () => {
    const f = RUBRIC.map((c) => ({ code: c.code, verdict: "ok" as const, quote: "x", at: null, why: "" }));
    expect(score(f).score).toBe(100);
  });

  it("na не занижает оценку, а выходит из знаменателя", () => {
    const half = RUBRIC.slice(0, 6);
    const rest = RUBRIC.slice(6);
    const f = [
      ...half.map((c) => ({ code: c.code, verdict: "ok" as const, quote: "x", at: null, why: "" })),
      ...rest.map((c) => ({ code: c.code, verdict: "na" as const, quote: "", at: null, why: "" })),
    ];
    expect(score(f).score).toBe(100);
  });

  it("один и тот же набор всегда даёт одно число", () => {
    const f = RUBRIC.map((c, i) => ({ code: c.code, verdict: i % 2 ? ("ok" as const) : ("warn" as const), quote: "x", at: null, why: "" }));
    expect(score(f).score).toBe(score([...f].reverse()).score);
  });

  it("сумма весов карты равна максимуму", () => {
    expect(MAX_SCORE).toBe(RUBRIC.reduce((a, c) => a + c.weight, 0));
  });
});

describe("момент потери", () => {
  it("берёт первый проваленный тяжёлый пункт", () => {
    const f = [
      { code: "A1", verdict: "bad" as const, quote: "", at: 0, why: "" },
      { code: "B1", verdict: "bad" as const, quote: "", at: 8, why: "" },
      { code: "E1", verdict: "bad" as const, quote: "", at: 37, why: "" },
    ];
    expect(lossMoment(f, t)).toBe(8);
  });

  it("нет тяжёлых провалов — нет момента", () => {
    expect(lossMoment([{ code: "A1", verdict: "bad", quote: "", at: 0, why: "" }], t)).toBeNull();
  });
});

describe("отчёт", () => {
  const a = {
    transcript: t,
    findings: [{ code: "B1", verdict: "bad" as const, quote: "", at: 8, why: "цена до вопросов" }],
    scored: score([{ code: "B1", verdict: "bad" as const, quote: "", at: 8, why: "" }]),
    lossAt: 8, rejected: 1, model: "claude-opus-5-5",
  };

  it("собирается и содержит оценку", () => {
    const html = report(a, "тест.mp3");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("из 100");
    expect(html).toContain("снято: 1");
  });

  it("экранирует разметку из расшифровки", () => {
    const evil: Transcript = { ...t, lines: [{ at: 0, who: "client", text: "<script>alert(1)</script>" }] };
    const html = report({ ...a, transcript: evil }, "x");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("разбор ответа YandexGPT", () => {
  const good = '{"findings":[{"code":"A1","verdict":"bad","quote":"","at":0,"why":"нет"}]}';

  it("берёт чистый JSON", () => {
    expect(extractJson(good)).toEqual({ findings: [{ code: "A1", verdict: "bad", quote: "", at: 0, why: "нет" }] });
  });

  it("снимает ограждение ```json", () => {
    expect(extractJson("```json\n" + good + "\n```")).toHaveProperty("findings");
  });

  it("снимает ограждение без языка", () => {
    expect(extractJson("```\n" + good + "\n```")).toHaveProperty("findings");
  });

  it("выкусывает JSON из болтовни вокруг", () => {
    expect(extractJson("Конечно! Вот разбор:\n" + good + "\nНадеюсь, помог.")).toHaveProperty("findings");
  });

  it("не ломается на фигурных скобках внутри цитаты", () => {
    const tricky = '{"findings":[{"code":"A1","verdict":"ok","quote":"он сказал } и ушёл","at":1,"why":"x"}]}';
    const r = extractJson(tricky) as { findings: { quote: string }[] };
    expect(r.findings[0]?.quote).toBe("он сказал } и ушёл");
  });

  it("не ломается на экранированной кавычке в цитате", () => {
    const tricky = '{"findings":[{"code":"A1","verdict":"ok","quote":"сказал \\"дорого\\" и всё","at":1,"why":"x"}]}';
    const r = extractJson(tricky) as { findings: { quote: string }[] };
    expect(r.findings[0]?.quote).toBe('сказал "дорого" и всё');
  });

  it("внятно жалуется на обрезанный ответ", () => {
    expect(() => extractJson('{"findings":[{"code":"A1"')).toThrow(/обрезан/);
  });

  it("внятно жалуется, когда JSON вообще нет", () => {
    expect(() => extractJson("Извините, не могу помочь.")).toThrow(/без JSON/);
  });
});
