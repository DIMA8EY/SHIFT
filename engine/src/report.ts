import { RUBRIC, byCode } from "./rubric.js";
import type { Analysis, Verdict } from "./types.js";

const MARK: Record<Verdict, [string, string]> = {
  ok: ["+", "#067647"], warn: ["~", "#b54708"], bad: ["−", "#b42318"], na: ["·", "#6b7280"],
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Отчёт на одной странице: его отдают клиенту, поэтому он самодостаточен. */
export function report(a: Analysis, title: string): string {
  const { scored: s } = a;
  const rows = RUBRIC.map((c) => {
    const f = a.findings.find((x) => x.code === c.code);
    const v: Verdict = f?.verdict ?? "na";
    const [mark, color] = MARK[v];
    const note = f?.why || (f?.demoted ? "" : "вывод не получен");
    return `<tr>
      <td class="c">${c.code}</td>
      <td><b>${esc(c.title)}</b>${note ? `<div class="n">${esc(note)}</div>` : ""}
        ${f?.quote ? `<div class="q">«${esc(f.quote)}»${f.at != null ? ` <i>${mmss(f.at)}</i>` : ""}</div>` : ""}
        ${f?.demoted ? `<div class="d">${esc(f.demoted)}</div>` : ""}</td>
      <td class="v" style="color:${color}">${mark}</td>
    </tr>`;
  }).join("");

  const blocks = s.byBlock
    .map((b) => `<li><span>${esc(b.block)}</span><b>${b.max ? Math.round((b.got / b.max) * 100) : 0}%</b></li>`)
    .join("");

  const lines = a.transcript.lines
    .map((l) => `<div class="l${l.who === "manager" ? " m" : ""}"><i>${mmss(l.at)}</i><span>${
      l.who === "manager" ? "Менеджер" : l.who === "client" ? "Клиент" : "—"}</span><p>${esc(l.text)}</p></div>`)
    .join("");

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Разбор звонка — ${esc(title)}</title>
<style>
:root{--ink:#111827;--ink2:#4b5563;--ink3:#6b7280;--line:#e5e7eb;--bg:#f7f8fa;--acc:#2563eb}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif}
.w{max-width:860px;margin:0 auto;padding:28px 18px 60px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--ink3);font-size:13.5px;margin-bottom:22px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;margin-bottom:16px;overflow:hidden}
.card>h2{font-size:15px;margin:0;padding:15px 18px;border-bottom:1px solid var(--line)}
.pad{padding:16px 18px}
.big{font-size:44px;font-weight:700;letter-spacing:-.02em}
.big span{font-size:17px;color:var(--ink3);font-weight:400}
ul{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:7px}
ul li{display:flex;justify-content:space-between;font-size:13.5px;border-bottom:1px solid #f1f2f4;padding-bottom:6px}
table{width:100%;border-collapse:collapse}
td{padding:11px 14px;border-bottom:1px solid #f1f2f4;vertical-align:top}
tr:last-child td{border-bottom:0}
.c{font:12px ui-monospace,monospace;color:var(--ink3);width:40px}
.v{width:34px;text-align:center;font-size:19px;font-weight:700}
.n{color:var(--ink2);font-size:13px;margin-top:3px}
.q{margin-top:6px;font-size:13px;color:var(--ink2);border-left:2px solid var(--acc);padding-left:9px;font-style:italic}
.q i{font-style:normal;font-family:ui-monospace,monospace;font-size:11.5px;color:var(--ink3)}
.d{margin-top:6px;font-size:12.5px;color:#b42318}
.l{display:grid;grid-template-columns:48px 78px minmax(0,1fr);gap:10px;padding:7px 0;font-size:13.5px;border-bottom:1px solid #f6f7f8}
.l i{font-style:normal;font-family:ui-monospace,monospace;font-size:12px;color:var(--ink3)}
.l span{color:var(--ink3);font-size:12.5px}
.l.m span{color:var(--acc);font-weight:600}
.l p{margin:0}
.note{font-size:12.5px;color:var(--ink3);padding:14px 18px;background:#fff;border:1px solid var(--line);border-radius:12px}
@media(max-width:560px){.l{grid-template-columns:44px minmax(0,1fr);}.l span{grid-column:2}.l p{grid-column:2}}
</style></head><body><div class="w">
<h1>Разбор звонка — ${esc(title)}</h1>
<div class="sub">Длительность ${mmss(a.transcript.duration)} · расшифровка: ${esc(a.transcript.engine)} · разбор: ${esc(a.model)}</div>

<div class="card"><div class="pad">
  <div class="big">${s.score}<span> из 100</span></div>
  ${a.lossAt != null ? `<p style="margin:10px 0 0;color:#b42318">Разговор перестал двигаться к сделке на ${mmss(a.lossAt)}.</p>` : ""}
  <ul>${blocks}</ul>
</div></div>

<div class="card"><h2>Оценочная карта</h2><table><tbody>${rows}</tbody></table></div>

<div class="card"><h2>Расшифровка</h2><div class="pad">${lines}</div></div>

<div class="note">Оценка посчитана кодом по фиксированным весам, а не моделью: один и тот же разговор всегда даёт одно и то же число.
Каждый положительный вывод подтверждён дословной цитатой — утверждения без цитаты система снимает сама${
  a.rejected ? ` (в этом разборе снято: ${a.rejected})` : ""}.
Пункты с «·» означают, что по записи судить нельзя, а не что менеджер ошибся.
Запись разговора — персональные данные: храните и передавайте её по тем же правилам, что и остальные данные клиента.</div>
</div></body></html>`;
}
