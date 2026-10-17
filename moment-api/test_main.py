# -*- coding: utf-8 -*-
import base64, json, os, unittest
from unittest import mock

import main


class Ctx:
    token = {"access_token": "iam-test"}


def ev(body, origin="https://example.test", ip="1.2.3.4", method="POST"):
    return {"httpMethod": method, "headers": {"Origin": origin},
            "body": json.dumps(body), "isBase64Encoded": False,
            "requestContext": {"identity": {"sourceIp": ip}}}


def call(body, **kw):
    r = main.handler(ev(body, **kw), Ctx())
    return r["statusCode"], (json.loads(r["body"]) if r["body"] else {})


LINES = [
    {"at": 0, "who": "manager", "text": "Алло."},
    {"at": 3, "who": "client", "text": "Здравствуйте. Хотел узнать, сколько это стоит."},
    {"at": 8, "who": "manager", "text": "Банкротство под ключ у нас от ста двадцати тысяч."},
    {"at": 25, "who": "manager", "text": "От шести до десяти месяцев, зависит от суда."},
    {"at": 31, "who": "client", "text": "Дороговато. Я подумаю."},
    {"at": 37, "who": "manager", "text": "Хорошо, думайте."},
]
ALL = {c["code"] for c in main.RUBRIC}


class Guard(unittest.TestCase):
    def g(self, raw, lines=LINES, dur=52):
        return main.guard(raw, lines, dur, ALL)

    def test_real_quote_passes_and_time_comes_from_transcript(self):
        f, rej = self.g([{"code": "C2", "verdict": "ok", "quote": "От шести до десяти месяцев, зависит от суда.", "at": 999, "why": "x"}])
        self.assertEqual(rej, 0)
        self.assertEqual((f[0]["verdict"], f[0]["at"]), ("ok", 25))  # 999 от модели отброшено

    def test_invented_quote_is_demoted(self):
        f, rej = self.g([{"code": "E2", "verdict": "ok", "quote": "Договорились, перезвоню в четверг в одиннадцать", "at": 40, "why": "x"}])
        self.assertEqual(rej, 1)
        self.assertEqual(f[0]["verdict"], "na")
        self.assertIn("нет", f[0]["demoted"])

    def test_client_quote_does_not_count_for_manager(self):
        f, rej = self.g([{"code": "D1", "verdict": "ok", "quote": "Дороговато. Я подумаю.", "at": 31, "why": "x"}])
        self.assertEqual(rej, 1)
        self.assertEqual(f[0]["verdict"], "na")

    def test_quote_from_unknown_roles_is_accepted(self):
        lines = [{"at": 0, "who": "unknown", "text": "Компания Ромашка, меня зовут Пётр."}]
        f, rej = main.guard([{"code": "A1", "verdict": "ok", "quote": "меня зовут Пётр", "at": 0, "why": "x"}], lines, 10, ALL)
        self.assertEqual((rej, f[0]["verdict"]), (0, "ok"))

    def test_positive_without_quote_rejected(self):
        f, rej = self.g([{"code": "E1", "verdict": "ok", "quote": "", "at": 5, "why": "x"}])
        self.assertEqual((rej, f[0]["verdict"]), (1, "na"))

    def test_bad_without_quote_allowed(self):
        f, rej = self.g([{"code": "E1", "verdict": "bad", "quote": "", "at": 37, "why": "шага нет"}])
        self.assertEqual((rej, f[0]["verdict"], f[0]["at"]), (0, "bad", 37))

    def test_bad_with_zero_second_is_not_a_moment(self):
        # слабые модели ставят 0 вместо «не знаю»: раньше это уводило момент потери в начало записи
        f, _ = self.g([{"code": "B1", "verdict": "bad", "quote": "", "at": 0, "why": "x"}])
        self.assertIsNone(f[0]["at"])

    def test_bad_minus_one_is_unknown(self):
        f, _ = self.g([{"code": "B1", "verdict": "bad", "quote": "", "at": -1, "why": "x"}])
        self.assertIsNone(f[0]["at"])

    def test_unknown_code_dropped(self):
        f, rej = self.g([{"code": "Z9", "verdict": "ok", "quote": "Алло.", "at": 0, "why": "x"}])
        self.assertEqual((len(f), rej), (0, 1))

    def test_code_outside_scenario_dropped(self):
        f, rej = main.guard([{"code": "A1", "verdict": "bad", "quote": "", "at": -1, "why": ""}], LINES, 52, {"E1"})
        self.assertEqual((len(f), rej), (0, 1))

    def test_duplicate_code_first_wins(self):
        f, rej = self.g([{"code": "A1", "verdict": "bad", "quote": "", "at": -1, "why": "a"},
                         {"code": "A1", "verdict": "ok", "quote": "Алло.", "at": 0, "why": "b"}])
        self.assertEqual((len(f), f[0]["verdict"], rej), (1, "bad", 1))

    def test_garbage_items_do_not_crash(self):
        f, rej = self.g(["строка", None, 5, {"code": None}])
        self.assertEqual(len(f), 0)

    def test_case_yo_punct_insensitive(self):
        f, rej = self.g([{"code": "D1", "verdict": "warn", "quote": "хорошо   ДУМАЙТЕ", "at": 37, "why": "x"}])
        self.assertEqual(rej, 0)


class Score(unittest.TestCase):
    def fs(self, v, codes=None):
        return [{"code": c["code"], "verdict": v, "quote": "x", "at": None, "why": ""} for c in main.RUBRIC if not codes or c["code"] in codes]

    def test_zero_and_hundred(self):
        self.assertEqual(main.score(self.fs("bad"), ALL)["score"], 0)
        self.assertEqual(main.score(self.fs("ok"), ALL)["score"], 100)

    def test_na_leaves_denominator(self):
        f = self.fs("ok")[:6] + [dict(x, verdict="na") for x in self.fs("ok")[6:]]
        self.assertEqual(main.score(f, ALL)["score"], 100)

    def test_all_na_is_zero_not_crash(self):
        self.assertEqual(main.score(self.fs("na"), ALL)["score"], 0)

    def test_subset_scored_only_over_subset(self):
        sub = {"E1", "E2"}
        self.assertEqual(main.score(self.fs("ok", sub), sub)["score"], 100)

    def test_hand_computed_example(self):
        # C1 warn (8*0.5), C2 ok (6), остальные bad, E2 и E3 сняты (na) и из знаменателя выходят
        v = {"C1": "warn", "C2": "ok", "E2": "na", "E3": "na"}
        f = [{"code": c["code"], "verdict": v.get(c["code"], "bad"), "quote": "", "at": None, "why": ""} for c in main.RUBRIC]
        den = sum(c["weight"] for c in main.RUBRIC if c["code"] not in ("E2", "E3"))
        self.assertEqual(main.score(f, ALL)["score"], round((8 * 0.5 + 6) / den * 100))

    def test_loss_moment_first_heavy_bad(self):
        f = [{"code": "A1", "verdict": "bad", "at": 0}, {"code": "B1", "verdict": "bad", "at": 8},
             {"code": "E1", "verdict": "bad", "at": 37}]
        self.assertEqual(main.loss_moment(f, 52), 8)

    def test_loss_moment_none_without_heavy(self):
        self.assertIsNone(main.loss_moment([{"code": "A1", "verdict": "bad", "at": 0}], 52))


class Json(unittest.TestCase):
    good = '{"findings":[{"code":"A1","verdict":"bad","quote":"","at":-1,"why":"нет"}]}'

    def test_plain_fenced_chatter(self):
        for t in (self.good, "```json\n" + self.good + "\n```", "```\n" + self.good + "\n```",
                  "Конечно! Вот разбор:\n" + self.good + "\nНадеюсь, помог."):
            self.assertIn("findings", main.extract_json(t))

    def test_braces_and_quotes_inside_strings(self):
        t = '{"findings":[{"code":"A1","verdict":"ok","quote":"сказал } и \\"дорого\\"","at":1,"why":"x"}]}'
        self.assertEqual(main.extract_json(t)["findings"][0]["quote"], 'сказал } и "дорого"')

    def test_truncated_and_missing(self):
        for t in ('{"findings":[{"code":"A1"', "Извините, не могу помочь."):
            with self.assertRaises(main.ApiError):
                main.extract_json(t)


class Handler(unittest.TestCase):
    def setUp(self):
        main._hits.clear()
        main.ORIGINS[:] = ["*"]
        main.ACCESS_CODE = ""
        main.FOLDER = "b1gtest"

    def test_options(self):
        r = main.handler(ev({}, method="OPTIONS"), Ctx())
        self.assertEqual(r["statusCode"], 204)

    def test_only_post(self):
        self.assertEqual(call({}, method="GET")[0], 405)

    def test_ping_reports_setup(self):
        s, b = call({"action": "ping"})
        self.assertEqual((s, b["ok"], b["auth"], b["folder"]), (200, True, "iam", True))
        self.assertEqual(b["scenarios"], {"price": 6})

    def test_bad_json_and_action(self):
        r = main.handler({"httpMethod": "POST", "headers": {}, "body": "{не json"}, Ctx())
        self.assertEqual(r["statusCode"], 400)
        self.assertEqual(call({"action": "rm -rf"})[0], 400)

    def test_origin_list_enforced_when_set(self):
        main.ORIGINS[:] = ["https://good.test"]
        self.assertEqual(call({"action": "ping"}, origin="https://evil.test")[0], 403)
        self.assertEqual(call({"action": "ping"}, origin="https://good.test")[0], 200)
        self.assertEqual(call({"action": "ping"}, origin="")[0], 403)

    def test_access_code(self):
        main.ACCESS_CODE = "sekret"
        s, b = call({"action": "ping", "code": "nope"})
        self.assertEqual((s, b["code_ok"], b["needs_code"]), (200, False, True))
        self.assertEqual(call({"action": "tts", "scenario": "price", "line": 0})[0], 401)
        self.assertEqual(call({"action": "tts", "scenario": "price", "line": 0, "code": "bad"})[0], 401)
        s, b = call({"action": "ping", "code": "sekret"})
        self.assertTrue(b["code_ok"])

    def test_body_too_big(self):
        r = main.handler({"httpMethod": "POST", "headers": {}, "body": "x" * (main.MAX_BODY + 1)}, Ctx())
        self.assertEqual(r["statusCode"], 413)

    def test_rate_limit(self):
        for _ in range(main.LIMITS["analyze"]):
            call({"action": "analyze", "lines": []})
        self.assertEqual(call({"action": "analyze", "lines": []})[0], 429)
        self.assertEqual(call({"action": "analyze", "lines": []}, ip="9.9.9.9")[0], 400)  # другой адрес не задет

    def test_internal_error_hides_details(self):
        with mock.patch.dict(main.ACTIONS, {"stt": lambda b, c: 1 / 0}):
            s, b = call({"action": "stt"})
        self.assertEqual(s, 500)
        self.assertNotIn("division", json.dumps(b))


class Stt(unittest.TestCase):
    def setUp(self):
        main._hits.clear(); main.ORIGINS[:] = ["*"]; main.ACCESS_CODE = ""

    def pcm(self, n):
        return base64.b64encode(b"\x01\x00" * (n // 2)).decode()

    def test_validation(self):
        self.assertEqual(call({"action": "stt"})[1]["error"], "no_audio")
        self.assertEqual(call({"action": "stt", "audio": "###"})[1]["error"], "bad_audio")
        self.assertEqual(call({"action": "stt", "audio": self.pcm(100)})[1]["error"], "too_short")
        self.assertEqual(call({"action": "stt", "audio": self.pcm(1_000_002)})[1]["error"], "too_long")

    def test_success_sends_lpcm_16k_with_bearer(self):
        with mock.patch.object(main, "_http", return_value=(200, '{"result":" Привет "}'.encode())) as h:
            s, b = call({"action": "stt", "audio": self.pcm(64000)})
        self.assertEqual((s, b["text"]), (200, "Привет"))
        url, data, headers, _ = h.call_args[0]
        self.assertIn("format=lpcm", url); self.assertIn("sampleRateHertz=16000", url); self.assertIn("lang=ru-RU", url)
        self.assertEqual(headers["Authorization"], "Bearer iam-test")
        self.assertEqual(len(data), 64000)

    def test_yandex_denied_is_explained(self):
        with mock.patch.object(main, "_http", return_value=(403, b'{"message":"nope"}')):
            s, b = call({"action": "stt", "audio": self.pcm(64000)})
        self.assertEqual(b["error"], "yandex_denied")
        self.assertIn("роли", b["message"])


class Tts(unittest.TestCase):
    def setUp(self):
        main._hits.clear(); main._tts_cache.clear(); main.ORIGINS[:] = ["*"]; main.ACCESS_CODE = ""

    def test_only_scenario_lines(self):
        for body in ({"scenario": "price", "line": 99}, {"scenario": "price", "line": -1},
                     {"scenario": "x", "line": 0}, {"scenario": "price", "line": True},
                     {"scenario": "price", "line": "0"}, {"scenario": "price", "text": "любой текст"}):
            self.assertEqual(call(dict(body, action="tts"))[1]["error"], "bad_line", body)

    def test_synthesizes_once_then_caches(self):
        with mock.patch.object(main, "_http", return_value=(200, b"ID3mp3")) as h:
            s, b = call({"action": "tts", "scenario": "price", "line": 2})
            call({"action": "tts", "scenario": "price", "line": 2})
        self.assertEqual(h.call_count, 1)
        self.assertEqual(base64.b64decode(b["audio"]), b"ID3mp3")
        form = h.call_args[0][1].decode()
        self.assertIn("voice=jane", form); self.assertIn("emotion=evil", form); self.assertIn("format=mp3", form)
        self.assertIn("%D0%B4%D0%BE%D1%80%D0%BE%D0%B3%D0%BE", form)  # «дорого» из реплики 2


def fake_gpt(findings):
    return mock.patch.object(main, "ask_gpt", return_value="Вот:\n```json\n" + json.dumps({"findings": findings}, ensure_ascii=False) + "\n```")


class Analyze(unittest.TestCase):
    def setUp(self):
        main._hits.clear(); main.ORIGINS[:] = ["*"]; main.ACCESS_CODE = ""; main.FOLDER = "b1gtest"

    def test_full_pipeline_catches_invented_claims(self):
        raw = [{"code": "B1", "verdict": "bad", "quote": "", "at": 8, "why": "цена до вопросов"},
               {"code": "C2", "verdict": "ok", "quote": "От шести до десяти месяцев, зависит от суда.", "at": 25, "why": "оговорка"},
               {"code": "E2", "verdict": "ok", "quote": "Договорились на четверг в одиннадцать", "at": 40, "why": "выдумка"},
               {"code": "E3", "verdict": "ok", "quote": "", "at": 42, "why": "без цитаты"}]
        with fake_gpt(raw):
            s, b = call({"action": "analyze", "lines": LINES, "duration": 52})
        self.assertEqual(s, 200)
        self.assertEqual(b["rejected"], 2)
        self.assertEqual(len(b["findings"]), 12)            # все пункты карты на месте
        by = {f["code"]: f for f in b["findings"]}
        self.assertEqual(by["E2"]["verdict"], "na"); self.assertEqual(by["E3"]["verdict"], "na")
        self.assertEqual(by["A1"]["why"], "вывод не получен")  # модель про него промолчала
        self.assertEqual(b["lossAt"], 8)
        self.assertIn("title", by["B1"])

    def test_input_validation(self):
        for lines, err in (([], "no_lines"), ("x", "no_lines"), ([{"at": 0, "text": ""}], "no_lines"),
                           ([{"at": 0, "text": "a"}] * (main.MAX_LINES + 1), "too_many_lines")):
            self.assertEqual(call({"action": "analyze", "lines": lines})[1]["error"], err)

    def test_model_garbage_gives_clear_error(self):
        with mock.patch.object(main, "ask_gpt", return_value="Извините, не могу."):
            s, b = call({"action": "analyze", "lines": LINES})
        self.assertEqual((s, b["error"]), (502, "model_format"))

    def test_prompt_never_contains_other_roles_confusion(self):
        seen = {}
        def spy(system, user, ctx):
            seen["user"] = user
            return '{"findings":[{"code":"A1","verdict":"bad","quote":"","at":-1,"why":"x"}]}'
        with mock.patch.object(main, "ask_gpt", side_effect=spy):
            call({"action": "analyze", "lines": LINES})
        self.assertIn("[8] Менеджер: Банкротство", seen["user"])
        self.assertIn("[3] Клиент:", seen["user"])


class Review(unittest.TestCase):
    def setUp(self):
        main._hits.clear(); main.ORIGINS[:] = ["*"]; main.ACCESS_CODE = ""; main.FOLDER = "b1gtest"

    ANS = ["Понимаю. А какая сумма долга?", "Какие у вас кредиты?", "А что входит в те сто тысяч?",
           "Давайте я объясню разницу", "Давайте в четверг в 11", "Записал телеграм, итак в четверг в 11"]

    def test_needs_three_answers(self):
        self.assertEqual(call({"action": "review", "scenario": "price", "answers": ["да"]})[1]["error"], "too_few")
        self.assertEqual(call({"action": "review", "scenario": "x", "answers": self.ANS})[1]["error"], "bad_scenario")

    def test_review_uses_only_scenario_criteria_and_server_side_client_lines(self):
        seen = {}
        def spy(system, user, ctx):
            seen["u"], seen["s"] = user, system
            return json.dumps({"findings": [
                {"code": "A3", "verdict": "ok", "quote": "А какая сумма долга?", "at": 1, "why": "вопрос"},
                {"code": "A1", "verdict": "ok", "quote": "Алло", "at": 0, "why": "чужой пункт"}]})
        with mock.patch.object(main, "ask_gpt", side_effect=spy):
            s, b = call({"action": "review", "scenario": "price", "answers": self.ANS})
        self.assertEqual(s, 200)
        self.assertEqual({f["code"] for f in b["findings"]}, {"A3", "B1", "C1", "D1", "E1", "E2", "E3"})
        self.assertEqual(b["rejected"], 1)                     # A1 вне сценария
        self.assertIn("Рядом за сто тысяч", seen["u"])          # реплика клиента взята с сервера
        self.assertIn("Это тренировка", seen["s"])
        self.assertIsNone(b["lossAt"])

    def test_client_cannot_inject_client_lines(self):
        seen = {}
        def spy(system, user, ctx):
            seen["u"] = user
            return '{"findings":[{"code":"A3","verdict":"bad","quote":"","at":-1,"why":"x"}]}'
        with mock.patch.object(main, "ask_gpt", side_effect=spy):
            call({"action": "review", "scenario": "price", "answers": self.ANS, "client": ["ВЗЛОМ"]})
        self.assertNotIn("ВЗЛОМ", seen["u"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
