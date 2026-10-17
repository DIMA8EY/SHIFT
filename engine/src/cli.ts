import fs from "node:fs";
import path from "node:path";
import { pickTranscriber } from "./transcribe/index.js";
import { analyze } from "./analyze.js";
import { analyzeYandex } from "./analyze-yandex.js";
import { report } from "./report.js";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Как пользоваться:  npm run analyze -- запись.mp3\n" +
      "Без ключей движок работает в mock-режиме: нужна готовая расшифровка рядом с файлом.");
    process.exit(1);
  }
  if (!fs.existsSync(file)) { console.error(`Файл не найден: ${file}`); process.exit(1); }

  const tr = pickTranscriber();
  console.log(`Расшифровка (${tr.name})…`);
  const transcript = await tr.run(file);
  console.log(`  реплик: ${transcript.lines.length}, длительность: ${transcript.duration} с`);

  // Claude точнее, YandexGPT дешевле и остаётся внутри страны.
  // Берём то, на что есть ключ; если есть оба — Claude.
  const useClaude = !!process.env.ANTHROPIC_API_KEY;
  const hasYa = !!(process.env.YANDEX_GPT_KEY || process.env.YANDEX_API_KEY) && !!process.env.YANDEX_FOLDER_ID;
  if (!useClaude && !hasYa) {
    console.error(
      "Разбирать нечем. Задайте в .env либо ANTHROPIC_API_KEY,\n" +
      "либо YANDEX_GPT_KEY (область yc.ai.languageModels.execute) вместе с YANDEX_FOLDER_ID."
    );
    process.exit(1);
  }
  console.log(`Разбор (${useClaude ? "Claude" : "YandexGPT"})…`);
  const a = useClaude ? await analyze(transcript) : await analyzeYandex(transcript);

  const out = path.join("out", path.basename(file, path.extname(file)) + ".html");
  fs.mkdirSync("out", { recursive: true });
  fs.writeFileSync(out, report(a, path.basename(file)), "utf8");

  console.log(`\nОценка: ${a.scored.score} из 100`);
  if (a.lossAt != null) console.log(`Момент потери: ${Math.floor(a.lossAt / 60)}:${String(a.lossAt % 60).padStart(2, "0")}`);
  if (a.rejected) console.log(`Выводов снято защитой: ${a.rejected}`);
  console.log(`Отчёт: ${out}`);
}

main().catch((e: unknown) => { console.error("\n" + (e instanceof Error ? e.message : String(e))); process.exit(1); });
