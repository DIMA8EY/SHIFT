# -*- coding: utf-8 -*-
"""
Момент: облачная функция для Yandex Cloud Functions (Python, без внешних библиотек).
Точка входа: main.handler

Что умеет (поле action в JSON-запросе):
  ping    проверка связи и настроек, ничего не тратит
  stt     распознавание короткого куска речи (до 30 секунд)
  tts     озвучка реплики клиента для тренажёра (только реплики из сценария)
  analyze разбор расшифровки звонка по оценочной карте
  review  разбор тренировки

Ключи в код не пишутся. Лучший вариант: привязать к функции сервисный аккаунт,
тогда ключи не нужны вообще. Запасной: переменные YC_STT_KEY, YC_GPT_KEY, YC_TTS_KEY
(или один YC_API_KEY, если у него есть все нужные области).

Переменные окружения:
  YC_FOLDER_ID     идентификатор каталога (b1g...), нужен для YandexGPT
  ACCESS_CODE      код доступа; если задан, без него функция работает только как ping
  ALLOWED_ORIGINS  адреса сайтов через запятую; по умолчанию любой (*)
  YC_GPT_MODEL     yandexgpt (по умолчанию) или yandexgpt-lite
  TTS_VOICE, TTS_EMOTION, TTS_SPEED   голос тренажёра: jane, evil, 0.96

В журнал функции пишутся только служебные сведения. Тексты разговоров не пишутся:
это персональные данные, и журнал хранится дольше, чем нужно.
"""
import base64
import hmac
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

FOLDER = os.environ.get("YC_FOLDER_ID", "")
ACCESS_CODE = os.environ.get("ACCESS_CODE", "")
ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
GPT_MODEL = os.environ.get("YC_GPT_MODEL", "yandexgpt")
VOICE = os.environ.get("TTS_VOICE", "jane")
EMOTION = os.environ.get("TTS_EMOTION", "evil")
SPEED = os.environ.get("TTS_SPEED", "0.96")

STT_URL = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize"
TTS_URL = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize"
GPT_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"

MAX_BODY = 3_400_000          # у функции лимит 3,5 МБ на запрос
MAX_AUDIO = 1_000_000         # лимит синхронного распознавания: 1 МБ и 30 секунд
MIN_AUDIO = 3_200             # меньше 0,1 секунды речи не бывает
MAX_LINES = 600
MAX_LINE_CHARS = 500
MAX_TOTAL_CHARS = 60_000
MAX_ANSWER_CHARS = 600


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


# ---------------------------------------------------------------------------
# Оценочная карта. Список зафиксирован в коде: модель не может добавить свой пункт.
# ---------------------------------------------------------------------------
RUBRIC = [
    {"code": "A1", "block": "Начало", "weight": 4, "title": "Представился: компания и имя",
     "looks": "менеджер в первых репликах называет компанию и своё имя"},
    {"code": "A2", "block": "Начало", "weight": 4, "title": "Узнал и назвал имя клиента",
     "looks": "менеджер спрашивает имя клиента или обращается к нему по имени"},
    {"code": "A3", "block": "Начало", "weight": 6, "title": "Перехватил инициативу вопросом",
     "looks": "менеджер задаёт встречный вопрос, а не только отвечает"},
    {"code": "B1", "block": "Потребность", "weight": 10, "title": "Выяснил задачу, а не только запрос",
     "looks": "менеджер выясняет ситуацию клиента до того, как называет цену или решение"},
    {"code": "B2", "block": "Потребность", "weight": 7, "title": "Выяснил срок и срочность",
     "looks": "менеджер спрашивает, когда это нужно и что горит"},
    {"code": "B3", "block": "Потребность", "weight": 7, "title": "Нащупал бюджет или ориентир",
     "looks": "менеджер выясняет финансовые возможности до озвучивания суммы"},
    {"code": "C1", "block": "Презентация", "weight": 8, "title": "Говорил под задачу клиента",
     "looks": "аргументы привязаны к тому, что клиент сказал о себе"},
    {"code": "C2", "block": "Презентация", "weight": 6, "title": "Не обещал невыполнимого",
     "looks": "сроки и результат названы с оговорками, без гарантий, которые нельзя дать"},
    {"code": "D1", "block": "Возражения", "weight": 12, "title": "Отработал возражение хотя бы вопросом",
     "looks": "на «дорого», «я подумаю», «у других дешевле» менеджер задаёт уточняющий вопрос, а не соглашается"},
    {"code": "E1", "block": "Закрытие", "weight": 14, "title": "Назначил следующий шаг с датой",
     "looks": "менеджер называет конкретные дату и время следующего контакта"},
    {"code": "E2", "block": "Закрытие", "weight": 8, "title": "Зафиксировал договорённость вслух",
     "looks": "менеджер повторяет, что и когда произойдёт дальше"},
    {"code": "E3", "block": "Закрытие", "weight": 6, "title": "Взял второй канал связи",
     "looks": "менеджер берёт мессенджер или почту, а не только номер"},
]
BY_CODE = {c["code"]: c for c in RUBRIC}

# Сценарий тренажёра. Реплики клиента заданы заранее и не реагируют на слова менеджера,
# поэтому их можно озвучить один раз и не платить за синтез на каждом занятии.
SCENARIOS = {
    "price": {
        "title": "Возражение «дорого»",
        "client": [
            "Здравствуйте. Я по поводу банкротства. Сколько это у вас стоит?",
            "Ну… долгов тысяч на восемьсот. Два кредита и микрозайм. Но вы цену скажите.",
            "Приставы уже пишут, да. Слушайте, у вас дорого. Рядом за сто тысяч делают.",
            "Да не знаю я, что там входит. Цена же меньше, вот и всё.",
            "Хм. Ладно, допустим. Я подумаю и перезвоню вам.",
            "Ну давайте в четверг. Телеграм мой запишите, там удобнее.",
        ],
        "criteria": ["A3", "B1", "C1", "D1", "E1", "E2", "E3"],
    }
}


# ---------------------------------------------------------------------------
# Защита от выдумок и расчёт оценки. Оценку считает код, а не модель.
# ---------------------------------------------------------------------------
def norm(s):
    """Для сверки цитаты: регистр, ё, знаки препинания и пробелы не считаются."""
    s = str(s).lower().replace("ё", "е")
    return re.sub(r"[\W_]+", " ", s, flags=re.UNICODE).strip()


def extract_json(text):
    """YandexGPT оборачивает ответ в ```json и добавляет фразы вокруг. Терпим и то, и другое."""
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    body = (m.group(1) if m else text).strip()
    start = body.find("{")
    if start < 0:
        raise ApiError(502, "model_format", "Модель вернула ответ без JSON. Повторите попытку.")
    depth, in_str, esc = 0, False, False
    for i in range(start, len(body)):
        ch = body[i]
        if esc:
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(body[start:i + 1])
                except ValueError:
                    raise ApiError(502, "model_format", "Модель вернула повреждённый JSON. Повторите попытку.")
    raise ApiError(502, "model_format", "Ответ модели обрезан. Повторите попытку.")


def _snap(at, lines):
    """Время вывода привязываем к началу реплики, где это прозвучало."""
    best = None
    for ln in lines:
        if ln["at"] <= at and (best is None or ln["at"] > best):
            best = ln["at"]
    return best


def guard(raw, lines, duration, codes):
    """
    Вывод живёт, только если его цитата найдена дословно в репликах менеджера.
    Положительный вывод без цитаты, цитата из реплики клиента, чужой пункт карты:
    всё это снимается. Снятый вывод не исчезает, а превращается в na с пометкой.
    Время для положительного вывода берётся из места, где цитата найдена, а не из ответа модели.
    """
    mgr = [l for l in lines if l["who"] in ("manager", "unknown")]
    hay = " ".join(norm(l["text"]) for l in mgr)
    seen, out, rejected = set(), [], 0
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            rejected += 1
            continue
        code = str(item.get("code", "")).strip().upper()
        if code not in codes or code in seen:
            rejected += 1
            continue
        seen.add(code)
        verdict = item.get("verdict") if item.get("verdict") in ("ok", "warn", "bad", "na") else "na"
        quote = str(item.get("quote") or "").strip()
        why = str(item.get("why") or "").strip()[:300]
        at_raw = item.get("at")
        at = int(at_raw) if isinstance(at_raw, (int, float)) and not isinstance(at_raw, bool) and 0 <= at_raw <= duration else None

        if verdict == "na":
            out.append({"code": code, "verdict": "na", "quote": "", "at": None,
                        "why": why or "в записи нет данных по этому пункту"})
            continue
        if not quote:
            if verdict == "bad":
                # bad без цитаты допустим: это утверждение об отсутствии. Нулевую секунду не принимаем:
                # слабые модели ставят 0 вместо «не знаю», и момент потери уезжал бы в начало записи.
                snapped = _snap(at, mgr + lines) if at else None
                out.append({"code": code, "verdict": "bad", "quote": "", "at": snapped,
                            "why": why or "нужного в разговоре не прозвучало"})
            else:
                rejected += 1
                out.append({"code": code, "verdict": "na", "quote": "", "at": None, "why": why,
                            "demoted": "вывод снят: положительная оценка без цитаты не принимается"})
            continue
        q = norm(quote)
        if len(q) < 3 or q not in hay:
            rejected += 1
            out.append({"code": code, "verdict": "na", "quote": "", "at": None, "why": why,
                        "demoted": "вывод снят: такой фразы у менеджера в расшифровке нет"})
            continue
        found_at = next((l["at"] for l in mgr if q in norm(l["text"])), None)
        out.append({"code": code, "verdict": verdict, "quote": quote,
                    "at": found_at if found_at is not None else (_snap(at, mgr) if at is not None else None),
                    "why": why})
    return out, rejected


SHARE = {"ok": 1.0, "warn": 0.5, "bad": 0.0, "na": 0.0}


def score(findings, codes):
    """Пункты с вердиктом na выходят из знаменателя: отсутствие данных не вина менеджера."""
    fmap = {f["code"]: f for f in findings}
    counts = {"ok": 0, "warn": 0, "bad": 0, "na": 0}
    blocks, got, mx = {}, 0.0, 0
    for c in RUBRIC:
        if c["code"] not in codes:
            continue
        v = fmap[c["code"]]["verdict"] if c["code"] in fmap else "na"
        counts[v] += 1
        b = blocks.setdefault(c["block"], [0.0, 0])
        if v != "na":
            pts = c["weight"] * SHARE[v]
            got += pts
            mx += c["weight"]
            b[0] += pts
            b[1] += c["weight"]
    return {
        "score": 0 if mx == 0 else int(round(got / mx * 100 + 1e-9)),
        "blocks": [{"block": k, "percent": (int(round(v[0] / v[1] * 100)) if v[1] else None)} for k, v in blocks.items()],
        "counts": counts,
    }


def loss_moment(findings, duration):
    """Первая секунда, где провален тяжёлый пункт (вес от 8). Эвристика по весу, её легко объяснить клиенту."""
    heavy = sorted(
        (f for f in findings if f["verdict"] == "bad" and f["at"] is not None and BY_CODE[f["code"]]["weight"] >= 8),
        key=lambda f: f["at"])
    return min(heavy[0]["at"], max(0, duration - 1)) if heavy else None


def complete(findings, codes):
    """Каждый пункт набора присутствует в ответе: нет вывода значит na, а не пропуск."""
    have = {f["code"] for f in findings}
    for c in RUBRIC:
        if c["code"] in codes and c["code"] not in have:
            findings.append({"code": c["code"], "verdict": "na", "quote": "", "at": None, "why": "вывод не получен"})
    order = {c["code"]: i for i, c in enumerate(RUBRIC)}
    findings.sort(key=lambda f: order[f["code"]])
    for f in findings:
        f["title"], f["block"] = BY_CODE[f["code"]]["title"], BY_CODE[f["code"]]["block"]
    return findings


# ---------------------------------------------------------------------------
# Модель
# ---------------------------------------------------------------------------
SYSTEM = """Ты разбираешь расшифровку телефонного разговора менеджера с клиентом по фиксированной оценочной карте.

Жёсткие правила:
1. Оценивай ТОЛЬКО пункты из карты. Свои критерии не добавляй.
2. На каждый пункт карты ровно один объект в ответе.
3. Для вердиктов ok и warn приводи дословную цитату из реплик МЕНЕДЖЕРА. Копируй текст посимвольно, не пересказывай. Цитата проверяется автоматически; вывод без точного совпадения будет снят. Цитата из реплики клиента не принимается.
4. Вердикт bad: нужного менеджер не сделал. Тогда quote пустая строка.
5. Вердикт na: по записи судить нельзя (обрыв, шум, тема не возникла). Это нормальный исход.
6. Ничего не додумывай о клиенте и сделке сверх сказанного вслух.
7. why: одна короткая фраза, без оценок личности менеджера.
8. at: секунда из расшифровки. Для bad укажи секунду, где нужное должно было прозвучать (например, когда менеджер назвал цену, не задав вопросов). Если определить нельзя, пиши -1. Для na всегда -1.
9. Если реплики помечены «?» (роли не разделены), определи по смыслу, кто менеджер: тот, кто представляет компанию и продаёт.
{extra}
Ответ: только JSON без пояснений и без разметки:
{{"findings":[{{"code":"A1","verdict":"bad","quote":"","at":-1,"why":"..."}}]}}"""

TRAIN_EXTRA = ("10. Это тренировка: клиент вымышленный, его реплики заданы сценарием и не зависят от слов менеджера. "
               "Не оценивай то, что определялось сценарием, оценивай только ответы менеджера.\n")


def _prompt(lines, duration, codes):
    card = "\n".join("%s [%s] %s: ищем: %s" % (c["code"], c["block"], c["title"], c["looks"])
                     for c in RUBRIC if c["code"] in codes)
    who = {"manager": "Менеджер", "client": "Клиент"}
    body = "\n".join("[%d] %s: %s" % (l["at"], who.get(l["who"], "?"), l["text"]) for l in lines)
    return "Оценочная карта:\n%s\n\nРасшифровка (в скобках секунда):\n%s\n\nДлительность: %d с." % (card, body, duration)


def ask_gpt(system, user, context):
    if not FOLDER:
        raise ApiError(500, "no_folder", "На функции не задана переменная YC_FOLDER_ID.")
    body = {"modelUri": "gpt://%s/%s/latest" % (FOLDER, GPT_MODEL),
            # temperature 0: один и тот же разговор должен давать один и тот же разбор
            "completionOptions": {"stream": False, "temperature": 0, "maxTokens": "4000"},
            "messages": [{"role": "system", "text": system}, {"role": "user", "text": user}]}
    status, data = _http(GPT_URL, json.dumps(body).encode("utf-8"),
                         {"Authorization": _auth(context, "GPT"), "Content-Type": "application/json",
                          "x-folder-id": FOLDER}, 80)
    try:
        j = json.loads(data.decode("utf-8"))
    except ValueError:
        j = {}
    if status != 200:
        _yandex_error(status, j, "YandexGPT")
    try:
        return j["result"]["alternatives"][0]["message"]["text"]
    except (KeyError, IndexError, TypeError):
        raise ApiError(502, "model_empty", "YandexGPT вернул пустой ответ.")


def run_review(lines, duration, codes, extra, context):
    text = ask_gpt(SYSTEM.format(extra=extra), _prompt(lines, duration, codes), context)
    parsed = extract_json(text)
    raw = parsed.get("findings") if isinstance(parsed, dict) else None
    if not isinstance(raw, list) or not raw:
        raise ApiError(502, "model_empty", "Модель не вернула ни одного вывода. Повторите попытку.")
    findings, rejected = guard(raw, lines, duration, codes)
    findings = complete(findings, codes)
    s = score(findings, codes)
    return {"score": s["score"], "blocks": s["blocks"], "counts": s["counts"], "findings": findings,
            "lossAt": loss_moment(findings, duration), "rejected": rejected, "model": "YandexGPT (%s)" % GPT_MODEL}


# ---------------------------------------------------------------------------
# Действия
# ---------------------------------------------------------------------------
def _b64(value, what):
    if not isinstance(value, str) or not value:
        raise ApiError(400, "no_audio", "Нет аудио в запросе.")
    try:
        return base64.b64decode(value, validate=True)
    except Exception:
        raise ApiError(400, "bad_audio", "Аудио повреждено при передаче.")


def do_stt(body, context):
    raw = _b64(body.get("audio"), "audio")
    if len(raw) < MIN_AUDIO:
        raise ApiError(400, "too_short", "Запись слишком короткая.")
    if len(raw) > MAX_AUDIO:
        raise ApiError(413, "too_long", "Кусок записи длиннее 30 секунд.")
    qs = urllib.parse.urlencode({"topic": "general", "lang": "ru-RU", "format": "lpcm", "sampleRateHertz": "16000"})
    status, data = _http(STT_URL + "?" + qs, raw, {"Authorization": _auth(context, "STT")}, 25)
    try:
        j = json.loads(data.decode("utf-8"))
    except ValueError:
        j = {}
    if status != 200:
        _yandex_error(status, j, "SpeechKit")
    return {"text": str(j.get("result", "")).strip()}


_tts_cache = {}


def do_tts(body, context):
    sc = SCENARIOS.get(body.get("scenario"))
    idx = body.get("line")
    if not sc or not isinstance(idx, int) or isinstance(idx, bool) or not 0 <= idx < len(sc["client"]):
        raise ApiError(400, "bad_line", "Такой реплики нет в сценарии.")
    key = (body["scenario"], idx, VOICE, EMOTION, SPEED)
    if key not in _tts_cache:
        form = urllib.parse.urlencode({"text": sc["client"][idx], "lang": "ru-RU", "voice": VOICE,
                                       "emotion": EMOTION, "speed": SPEED, "format": "mp3"})
        status, data = _http(TTS_URL, form.encode("utf-8"),
                             {"Authorization": _auth(context, "TTS"),
                              "Content-Type": "application/x-www-form-urlencoded"}, 25)
        if status != 200:
            try:
                j = json.loads(data.decode("utf-8"))
            except ValueError:
                j = {}
            _yandex_error(status, j, "синтез речи")
        if len(_tts_cache) > 60:
            _tts_cache.clear()
        _tts_cache[key] = base64.b64encode(data).decode("ascii")
    return {"audio": _tts_cache[key], "mime": "audio/mpeg"}


def _clean_lines(raw):
    if not isinstance(raw, list) or not raw:
        raise ApiError(400, "no_lines", "Расшифровка пустая: разбирать нечего.")
    if len(raw) > MAX_LINES:
        raise ApiError(413, "too_many_lines", "В расшифровке больше %d реплик." % MAX_LINES)
    lines, total = [], 0
    for it in raw:
        if not isinstance(it, dict):
            continue
        text = str(it.get("text") or "").strip()[:MAX_LINE_CHARS]
        at = it.get("at")
        if not text or not isinstance(at, (int, float)) or isinstance(at, bool) or at < 0:
            continue
        who = it.get("who") if it.get("who") in ("manager", "client") else "unknown"
        total += len(text)
        lines.append({"at": int(at), "who": who, "text": text})
    if total > MAX_TOTAL_CHARS:
        raise ApiError(413, "too_long_text", "Расшифровка слишком длинная для одного разбора.")
    if not lines:
        raise ApiError(400, "no_lines", "В расшифровке нет текста.")
    lines.sort(key=lambda l: l["at"])
    return lines


def do_analyze(body, context):
    lines = _clean_lines(body.get("lines"))
    d = body.get("duration")
    duration = int(d) if isinstance(d, (int, float)) and not isinstance(d, bool) and d > 0 else lines[-1]["at"] + 5
    duration = max(duration, lines[-1]["at"] + 1)
    return run_review(lines, duration, {c["code"] for c in RUBRIC}, "", context)


def do_review(body, context):
    sc = SCENARIOS.get(body.get("scenario"))
    if not sc:
        raise ApiError(400, "bad_scenario", "Неизвестный сценарий.")
    answers = body.get("answers")
    if not isinstance(answers, list):
        raise ApiError(400, "no_answers", "Нет ответов менеджера.")
    answers = [str(a).strip()[:MAX_ANSWER_CHARS] for a in answers[:len(sc["client"])]]
    if sum(1 for a in answers if a) < 3:
        raise ApiError(400, "too_few", "Для разбора нужно хотя бы три ответа.")
    lines = []
    for i, a in enumerate(answers):
        lines.append({"at": i * 2, "who": "client", "text": sc["client"][i]})
        lines.append({"at": i * 2 + 1, "who": "manager", "text": a or "(молчание)"})
    codes = set(sc["criteria"])
    res = run_review(lines, len(lines) * 2, codes, TRAIN_EXTRA, context)
    res["lossAt"] = None  # у тренировки нет «момента потери»: клиент не живой
    return res


def do_ping(body, context, code_ok):
    tok = getattr(context, "token", None)
    mode = "iam" if isinstance(tok, dict) and tok.get("access_token") else \
        ("keys" if any(os.environ.get(k) for k in ("YC_API_KEY", "YC_STT_KEY", "YC_GPT_KEY", "YC_TTS_KEY")) else "none")
    return {"ok": True, "auth": mode, "folder": bool(FOLDER), "needs_code": bool(ACCESS_CODE),
            "code_ok": code_ok, "scenarios": {k: len(v["client"]) for k, v in SCENARIOS.items()}}


ACTIONS = {"stt": do_stt, "tts": do_tts, "analyze": do_analyze, "review": do_review}
# Сколько обращений в 10 минут с одного адреса. Память живёт, пока жив экземпляр функции,
# поэтому это защита от случайного цикла, а не от целенаправленной атаки.
LIMITS = {"ping": 60, "stt": 240, "tts": 60, "analyze": 20, "review": 20}
_hits = {}


# ---------------------------------------------------------------------------
# Служебное
# ---------------------------------------------------------------------------
def _auth(context, service):
    tok = getattr(context, "token", None)
    if isinstance(tok, dict) and tok.get("access_token"):
        return "Bearer " + tok["access_token"]
    key = os.environ.get("YC_%s_KEY" % service) or os.environ.get("YC_API_KEY")
    if key:
        return "Api-Key " + key
    raise ApiError(500, "no_credentials",
                   "У функции нет доступа к Яндексу: привяжите сервисный аккаунт или задайте ключ YC_%s_KEY." % service)


def _http(url, data, headers, timeout):
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception:
        raise ApiError(502, "network", "Не удалось связаться с Яндексом. Повторите попытку.")


def _yandex_error(status, j, what):
    msg = ""
    if isinstance(j, dict):
        err = j.get("error")
        msg = str(j.get("error_message") or j.get("message") or (err.get("message") if isinstance(err, dict) else err) or "")
    if status in (401, 403):
        raise ApiError(502, "yandex_denied",
                       "%s отклонил доступ (%s). Проверьте роли сервисного аккаунта и область ключа." % (what, status))
    if status == 429:
        raise ApiError(503, "yandex_busy", "%s сейчас перегружен. Повторите через минуту." % what)
    raise ApiError(502, "yandex_error", "%s вернул ошибку %s%s" % (what, status, (": " + msg[:160]) if msg else ""))


def _header(event, name):
    for k, v in (event.get("headers") or {}).items():
        if k.lower() == name.lower():
            return v
    return ""


def _ip(event):
    ident = ((event.get("requestContext") or {}).get("identity") or {})
    return ident.get("sourceIp") or _header(event, "X-Forwarded-For").split(",")[0].strip() or "?"


def _limited(ip, action):
    now = time.time()
    if len(_hits) > 5000:
        _hits.clear()
    q = [t for t in _hits.get((ip, action), []) if now - t < 600]
    if len(q) >= LIMITS.get(action, 20):
        _hits[(ip, action)] = q
        return True
    q.append(now)
    _hits[(ip, action)] = q
    return False


def _resp(status, payload, origin):
    allow = "*" if "*" in ORIGINS else (origin if origin in ORIGINS else ORIGINS[0])
    return {"statusCode": status,
            "headers": {"Content-Type": "application/json; charset=utf-8",
                        "Access-Control-Allow-Origin": allow,
                        "Access-Control-Allow-Methods": "POST, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type",
                        "Vary": "Origin"},
            "body": json.dumps(payload, ensure_ascii=False)}


def handler(event, context):
    origin = _header(event, "Origin")
    method = (event.get("httpMethod") or "").upper()
    if method == "OPTIONS":
        return _resp(204, {}, origin)
    if method != "POST":
        return _resp(405, {"error": "method", "message": "Только POST."}, origin)
    if "*" not in ORIGINS and origin not in ORIGINS:
        return _resp(403, {"error": "origin", "message": "Этот сайт не в списке разрешённых."}, origin)
    action = "?"
    try:
        raw = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw).decode("utf-8")
        if len(raw) > MAX_BODY:
            raise ApiError(413, "too_big", "Запрос слишком большой.")
        try:
            body = json.loads(raw)
        except ValueError:
            raise ApiError(400, "bad_json", "Запрос не разобран.")
        if not isinstance(body, dict):
            raise ApiError(400, "bad_json", "Запрос не разобран.")
        action = body.get("action")
        code_ok = (not ACCESS_CODE) or hmac.compare_digest(str(body.get("code", "")).encode(), ACCESS_CODE.encode())
        if action == "ping":
            if _limited(_ip(event), "ping"):
                raise ApiError(429, "rate", "Слишком часто. Подождите несколько минут.")
            return _resp(200, do_ping(body, context, code_ok), origin)
        fn = ACTIONS.get(action)
        if not fn:
            raise ApiError(400, "bad_action", "Неизвестное действие.")
        if not code_ok:
            raise ApiError(401, "code", "Неверный код доступа.")
        if _limited(_ip(event), action):
            raise ApiError(429, "rate", "Слишком часто. Подождите несколько минут.")
        result = fn(body, context)
        print("ok action=%s" % action)  # только служебное: ни текстов, ни аудио
        return _resp(200, result, origin)
    except ApiError as e:
        print("fail action=%s code=%s status=%s" % (action, e.code, e.status))
        return _resp(e.status, {"error": e.code, "message": e.message}, origin)
    except Exception as e:  # непредвиденное: наружу без подробностей
        print("crash action=%s type=%s" % (action, type(e).__name__))
        return _resp(500, {"error": "internal", "message": "Внутренняя ошибка функции."}, origin)
