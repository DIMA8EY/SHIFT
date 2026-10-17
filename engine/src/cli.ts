import fs from "node:fs";
import path from "node:path";
import { pickTranscriber } from "./transcribe/index.js";
import { analyze } from "./analyze.js";
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

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Нет ANTHROPIC_API_KEY — разбирать нечем. Задайте ключ в .env");
    process.exit(1);
  }
  console.log("Разбор…");
  const a = await analyze(transcript);

  const out = path.join("out", path.basename(file, path.extname(file)) + ".html");
  fs.mkdirSync("out", { recursive: true });
  fs.writeFileSync(out, report(a, path.basename(file)), "utf8");

  console.log(`\nОценка: ${a.scored.score} из 100`);
  if (a.lossAt != null) console.log(`Момент потери: ${Math.floor(a.lossAt / 60)}:${String(a.lossAt % 60).padStart(2, "0")}`);
  if (a.rejected) console.log(`Выводов снято защитой: ${a.rejected}`);
  console.log(`Отчёт: ${out}`);
}

main().catch((e: unknown) => { console.error("\n" + (e instanceof Error ? e.message : String(e))); process.exit(1); });
