/** Кто говорит. Разделение каналов даёт диаризацию бесплатно, если запись стерео. */
export type Speaker = "manager" | "client" | "unknown";

export type Line = {
  /** Секунда начала реплики от начала записи. */
  at: number;
  who: Speaker;
  text: string;
};

export type Transcript = {
  /** Длительность записи в секундах. */
  duration: number;
  lines: Line[];
  /** Чем расшифровано — попадает в отчёт, чтобы источник был виден. */
  engine: string;
};

export type Verdict = "ok" | "warn" | "bad" | "na";

/** Пункт оценочной карты. Список фиксирован в коде: модель не может добавить свой. */
export type Criterion = {
  code: string;
  block: string;
  title: string;
  /** Вес в итоговой оценке. */
  weight: number;
  /** Что именно ищем — попадает в промпт. */
  looksFor: string;
};

export type Finding = {
  code: string;
  verdict: Verdict;
  /** Дословная цитата из расшифровки. Проверяется кодом, а не на слово. */
  quote: string;
  /** Секунда, где это прозвучало. null — если пункт не про конкретный момент. */
  at: number | null;
  /** Почему такой вердикт. */
  why: string;
  /** Проставляется защитой, если цитату не удалось подтвердить. */
  demoted?: string;
};

export type Scored = {
  score: number;
  max: number;
  byBlock: { block: string; got: number; max: number }[];
  counts: Record<Verdict, number>;
};

export type Analysis = {
  transcript: Transcript;
  findings: Finding[];
  scored: Scored;
  /** Момент, после которого разговор перестал двигаться к сделке. */
  lossAt: number | null;
  /** Сколько выводов модели отклонила защита. */
  rejected: number;
  model: string;
};
