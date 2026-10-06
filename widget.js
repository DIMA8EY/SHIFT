/* Виджет AI-ассистента SHIFT. Подключение: <script src="/widget.js" defer></script> перед </body> */
(function () {
  "use strict";
  var ENDPOINT = "https://functions.yandexcloud.net/d4e0i3utl1akjhihtog0";
  var GREETING = "Здравствуйте! Я AI-ассистент студии SHIFT. Подскажу по тарифам и помогу оставить заявку на бесплатное демо.";
  var STORE = "shift_chat_v1";

  var history = [];
  var leadSent = false;
  var busy = false;

  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE) || "null");
    if (saved && Array.isArray(saved.history)) { history = saved.history; leadSent = !!saved.leadSent; }
  } catch (e) {}

  function save() {
    try { sessionStorage.setItem(STORE, JSON.stringify({ history: history, leadSent: leadSent })); } catch (e) {}
  }

  var css = [
    ".shc-btn{position:fixed;right:16px;bottom:16px;z-index:250;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;background:#ff5a1f;color:#fff;font-size:24px;box-shadow:0 6px 24px rgba(0,0,0,.45)}",
    ".shc-panel{position:fixed;right:16px;bottom:84px;z-index:250;width:min(360px,calc(100vw - 32px));height:min(520px,calc(100vh - 110px));display:none;flex-direction:column;background:#111116;color:#f2f2f5;border:1px solid #2a2a33;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.55);font:14px/1.45 system-ui,Arial,sans-serif;overflow:hidden}",
    ".shc-panel.open{display:flex}",
    ".shc-head{padding:12px 14px;background:#17171d;border-bottom:1px solid #2a2a33;font-weight:600;display:flex;justify-content:space-between;align-items:center}",
    ".shc-head small{display:block;font-weight:400;color:#9a9aa6;font-size:12px}",
    ".shc-x{background:none;border:0;color:#9a9aa6;font-size:20px;cursor:pointer}",
    ".shc-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}",
    ".shc-m{max-width:85%;padding:8px 11px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}",
    ".shc-u{align-self:flex-end;background:#ff5a1f;color:#fff}",
    ".shc-a{align-self:flex-start;background:#1f1f27}",
    ".shc-row{display:flex;gap:6px;padding:10px;border-top:1px solid #2a2a33}",
    ".shc-in{flex:1;padding:9px 10px;border-radius:10px;border:1px solid #2a2a33;background:#0b0b0f;color:#f2f2f5;font:inherit}",
    ".shc-send{padding:0 14px;border:0;border-radius:10px;background:#ff5a1f;color:#fff;cursor:pointer;font-weight:600}",
    ".shc-send:disabled{opacity:.5;cursor:default}",
    ".shc-note{padding:0 12px 10px;color:#7d7d89;font-size:11px}",
    ".shc-note a{color:#9a9aa6}"
  ].join("\n");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  var btn = el("button", "shc-btn", "\u{1F4AC}");
  btn.setAttribute("aria-label", "Открыть чат");
  var panel = el("div", "shc-panel");
  var head = el("div", "shc-head");
  var title = el("div", "", "SHIFT");
  title.appendChild(el("small", "", "AI-ассистент"));
  var close = el("button", "shc-x", "\u00D7");
  close.setAttribute("aria-label", "Закрыть чат");
  head.appendChild(title);
  head.appendChild(close);
  var log = el("div", "shc-log");
  var row = el("div", "shc-row");
  var input = el("input", "shc-in");
  input.placeholder = "Напишите вопрос…";
  input.maxLength = 500;
  var send = el("button", "shc-send", "\u2192");
  row.appendChild(input);
  row.appendChild(send);
  var note = el("div", "shc-note");
  note.appendChild(document.createTextNode("Отправляя сообщение, вы соглашаетесь на "));
  var link = el("a", "", "обработку персональных данных");
  link.href = "/privacy.html";
  link.target = "_blank";
  link.rel = "noopener";
  note.appendChild(link);
  note.appendChild(document.createTextNode("."));

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(row);
  panel.appendChild(note);
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  function add(role, text) {
    var m = el("div", "shc-m " + (role === "user" ? "shc-u" : "shc-a"), text);
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }

  add("assistant", GREETING);
  history.forEach(function (m) { add(m.role, m.text); });

  function toggle(open) {
    var willOpen = typeof open === "boolean" ? open : !panel.classList.contains("open");
    panel.classList.toggle("open", willOpen);
    if (willOpen) input.focus();
  }
  btn.onclick = function () { toggle(); };
  close.onclick = function () { toggle(false); };

  // Яндекс Облако не достаёт до Telegram, поэтому заявку шлёт браузер (как форма в script.js)
  var TG = { token: "8684145030:AAFvR_Kf7gGD5bovd-dc2fvsUWLc6Ss9NM4", chat: "1275636122" };
  function notifyTelegram() {
    try {
      var lines = history.map(function (m) { return (m.role === "user" ? "Клиент: " : "Ассистент: ") + m.text; });
      fetch("https://api.telegram.org/bot" + TG.token + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TG.chat, text: ("🚀 Новая заявка из чата SHIFT\n\n" + lines.join("\n")).slice(0, 3900) })
      }).catch(function () {});
    } catch (e) {}
  }

  function submit() {
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    add("user", text);
    history.push({ role: "user", text: text });
    busy = true;
    send.disabled = true;
    var typing = add("assistant", "Печатает…");

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, lead_sent: leadSent })
    })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (data) {
        typing.textContent = data.reply || "…";
        history.push({ role: "assistant", text: data.reply || "" });
        if (data.lead) { leadSent = true; notifyTelegram(); }
        save();
      })
      .catch(function () {
        typing.textContent = "Не получилось ответить. Оставьте заявку через форму на сайте, мы свяжемся с вами.";
        history.pop();
        save();
      })
      .then(function () {
        busy = false;
        send.disabled = false;
        log.scrollTop = log.scrollHeight;
      });
  }
  send.onclick = submit;
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
})();
