/* ===========================================================
   MMC CLUB — демо редизайна. Вся логика страницы.
   Ничего не отправляется на сервер: демонстрационный прототип.
   =========================================================== */

/* ---------- Мелкие помощники ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
const round50 = n => Math.round(n / 50) * 50;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const iso = d => d.toISOString().slice(0, 10);
const humanDate = d => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/* ---------- Иконки услуг ---------- */
const ICONS = {
  oil:    '<path d="M4 15h9l4-3h4v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2z"/><path d="M7 12V8h6l2 4"/><path d="M9 5h4"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5l-8 8a2.8 2.8 0 0 1-4-4l8-8a4 4 0 0 0-1-1z"/>',
  engine: '<path d="M5 10h3V7h5l2 3h2v3h3v6H8v-3H5z"/><path d="M10 4h4"/>',
  gear:   '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  scan:   '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M7 20h10M12 17v3M7 10l2.5 2.5L12 8l2 4 3-2"/>',
  fuel:   '<rect x="4" y="3" width="10" height="18" rx="2"/><path d="M14 8h2.5a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-2.5-2.5"/><path d="M7 8h4"/>',
  wd4:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17"/><circle cx="12" cy="12" r="2.4"/>',
  bolt:   '<path d="M13.5 3L5 13.5h5.5L10 21l8.5-10.5H13z"/>',
  align:  '<path d="M6 4v16M18 4v16"/><path d="M6 8l12-2M6 18l12-2"/><circle cx="12" cy="12" r="1.4"/>',
  check:  '<path d="M12 3l7 3v6c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  body:   '<path d="M3 16h18M5 16l1.8-5.4A3 3 0 0 1 9.6 8.5h4.8a3 3 0 0 1 2.5 1.4L20 16"/><path d="M17.5 5.5l2.5 2.5-4 1 1-4z"/>',
  tow:    '<path d="M3 17h11M3 17l1.4-4.4A3 3 0 0 1 7.2 10.5H12l3 6"/><circle cx="6.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/><path d="M15 10.5l3-4h3"/>'
};
const icon = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

const PIN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const TOOLS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5a4 4 0 0 0 5 5l-8 8a2.8 2.8 0 0 1-4-4l8-8a4 4 0 0 0-1-1z"/></svg>';

/* ===========================================================
   Шапка, меню, анимации появления
   =========================================================== */
const hdr = $('#hdr');
window.addEventListener('scroll', () => hdr.classList.toggle('is-stuck', window.scrollY > 12), { passive: true });

const burger = $('#burger');
const nav = $('#nav');
burger.addEventListener('click', () => {
  const open = nav.classList.toggle('is-open');
  burger.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
});
$$('.nav__link').forEach(a => a.addEventListener('click', () => {
  nav.classList.remove('is-open');
  burger.classList.remove('is-open');
  burger.setAttribute('aria-expanded', 'false');
}));

const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  });
}, { rootMargin: '0px 0px -60px 0px' });
$$('.reveal').forEach(el => io.observe(el));

/* ===========================================================
   Услуги, техцентры, отзывы
   =========================================================== */
$('#servicesGrid').innerHTML = SERVICES.map(s => `
  <article class="svc">
    <div class="svc__ico">${icon(s.icon)}</div>
    <h3 class="svc__title">${s.title}</h3>
    <p class="svc__text">${s.text}</p>
    <div class="svc__foot">
      <span class="svc__price"><small>от</small>${money(s.from)}</span>
      <button class="svc__link" data-service="${s.id}">Записаться →</button>
    </div>
  </article>`).join('');

$('#centersGrid').innerHTML = CENTERS.map(c => `
  <article class="center">
    <div class="center__map"><span class="center__tag">${c.district}</span></div>
    <div class="center__body">
      <h3 class="center__title">${c.title}</h3>
      <p class="center__addr">${c.address}</p>
      <ul class="center__list">
        <li>${TOOLS}<span>${c.shopsLabel}</span></li>
        <li>${CLOCK}<span>${c.hours}</span></li>
        <li>${PIN}<span>${c.posts} постов и подъёмников</span></li>
      </ul>
      <a class="center__phone" href="tel:${c.phone.replace(/[^\d+]/g, '')}">${c.phone}</a>
      <div class="center__actions">
        <button class="btn btn--primary btn--sm" data-center="${c.id}">Записаться сюда</button>
        <a class="btn btn--ghost btn--sm" href="${c.map}" target="_blank" rel="noopener">Как проехать</a>
      </div>
    </div>
  </article>`).join('');

$('#footerCenters').innerHTML = CENTERS.map(c => `
  <li>
    <div>${c.address}</div>
    <a href="tel:${c.phone.replace(/[^\d+]/g, '')}"><b>${c.phone}</b></a>
  </li>`).join('');

$('#reviewsGrid').innerHTML = REVIEWS.map((r, i) => `
  <article class="review${i === 3 ? ' review--wide' : ''}">
    <div class="review__stars" aria-label="Оценка 5 из 5">★★★★★</div>
    <p class="review__text">«${r.text}»</p>
    <div class="review__who">
      <span class="review__ava" aria-hidden="true">${r.name.split(' ').map(w => w[0]).join('')}</span>
      <span>
        <span class="review__name">${r.name}</span>
        <span class="review__meta">${r.car} · ${r.date}</span>
      </span>
    </div>
  </article>`).join('');

/* ===========================================================
   Калькулятор ТО
   =========================================================== */
const cBrand = $('#cBrand'), cModel = $('#cModel'), cYear = $('#cYear'), cEngine = $('#cEngine');
const cLevels = $('#cLevels'), cResult = $('#cResult');
let calcLevel = 30;
let lastCalc = null;

cBrand.innerHTML = Object.entries(BRANDS).map(([id, b]) => `<option value="${id}">${b.label}</option>`).join('');

function currentModel() {
  return BRANDS[cBrand.value].models.find(m => m.id === cModel.value) || BRANDS[cBrand.value].models[0];
}

function fillModels() {
  cModel.innerHTML = BRANDS[cBrand.value].models.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
  fillModelDetails();
}

function fillModelDetails() {
  const m = currentModel();
  const years = [];
  for (let y = m.years[1]; y >= m.years[0]; y--) years.push(y);
  cYear.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  cEngine.innerHTML = m.engines.map(e => `<option value="${e}">${e}</option>`).join('');
}

cLevels.innerHTML = Object.entries(REGULATIONS).map(([lvl, r]) => `
  <button type="button" class="chip${Number(lvl) === calcLevel ? ' is-active' : ''}" data-level="${lvl}">
    ${r.label}<small>${r.hint}</small>
  </button>`).join('');

cLevels.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  calcLevel = Number(chip.dataset.level);
  $$('.chip', cLevels).forEach(c => c.classList.toggle('is-active', c === chip));
});

cBrand.addEventListener('change', fillModels);
cModel.addEventListener('change', fillModelDetails);
fillModels();

/* Коэффициент по двигателю: объём и тип топлива */
function engineFactor(engineLabel) {
  const vol = parseFloat(String(engineLabel).replace(',', '.')) || 2.0;
  let k = 1 + (vol - 2.0) * 0.09;
  if (/DI-D|D-4D|CRDi/i.test(engineLabel)) k += 0.06;   // дизель: дороже расходники
  if (/гибрид|h\b/i.test(engineLabel)) k += 0.04;
  return Math.min(1.6, Math.max(0.85, k));
}

function calculate() {
  const brand = BRANDS[cBrand.value];
  const model = currentModel();
  const engine = cEngine.value;
  const reg = REGULATIONS[calcLevel];
  const ek = engineFactor(engine);

  const works = reg.works.map(w => {
    const price = round50(w.hours * LABOR_RATE * model.laborK * (1 + (ek - 1) * 0.5));
    return { title: w.title, hours: w.hours, price };
  });
  const parts = reg.parts.map(p => ({ title: p.title, price: round50(p.price * model.partsK * ek) }));

  const laborSum = works.reduce((s, w) => s + w.price, 0);
  const partsSum = parts.reduce((s, p) => s + p.price, 0);
  const total = laborSum + partsSum;
  const discount = round50(laborSum * 0.15);          // акция −15% на работы
  const totalWithDiscount = total - discount;

  lastCalc = {
    car: `${brand.label} ${model.label}`,
    year: cYear.value,
    engine,
    level: reg.label,
    total: totalWithDiscount
  };

  cResult.innerHTML = `
    <div class="res__head">
      <div>
        <div class="res__car">${brand.label} ${model.label}</div>
        <div class="res__meta">${cYear.value} г. · ${engine} · ${reg.label} (${reg.hint})</div>
      </div>
      <div class="res__meta">Время работ: ${reg.duration}</div>
    </div>

    <ul class="res__list">
      <li class="res__group">Работы · нормочас ${money(LABOR_RATE)}</li>
      ${works.map(w => `<li class="res__row"><span>${w.title}<span class="muted nums"> · ${w.hours} н/ч</span></span><b>${money(w.price)}</b></li>`).join('')}
      <li class="res__group">Запчасти и расходники</li>
      ${parts.map(p => `<li class="res__row"><span>${p.title}</span><b>${money(p.price)}</b></li>`).join('')}
    </ul>

    <div class="res__sums">
      <div class="res__sum"><span>Работы</span><b>${money(laborSum)}</b></div>
      <div class="res__sum"><span>Запчасти</span><b>${money(partsSum)}</b></div>
      <div class="res__sum"><span>Скидка на работы по акции, 15%</span><b class="accent">−${money(discount)}</b></div>

      <div class="res__total">
        <div>
          <div class="res__total-label">Итого при записи через сайт</div>
          <div class="res__total-val">${money(totalWithDiscount)}</div>
        </div>
        <div class="res__old">${money(total)}</div>
      </div>

      <div class="res__badge">${CLOCK} Запись в ближайшие дни — свободные посты есть</div>
      <p class="res__note">Расчёт ориентировочный: точная стоимость определяется после осмотра автомобиля мастером-приёмщиком. Цены в демоверсии условные.</p>

      <div class="res__actions">
        <button class="btn btn--primary" id="cToBooking">Записаться с этим расчётом</button>
        <button class="btn btn--ghost" id="cPrint">Распечатать смету</button>
      </div>
    </div>`;

  $('#cToBooking').addEventListener('click', () => {
    setService('to');
    $('#bCar').value = `${brand.label} ${model.label}`;
    $('#bYear').value = cYear.value;
    $('#bComment').value = `${reg.label}, двигатель ${engine}. Расчёт с сайта: ${money(totalWithDiscount)}.`;
    goToStep(3);   // техцентр и услуга уже определены — остаётся выбрать время
    scrollToId('booking');
  });
  $('#cPrint').addEventListener('click', () => window.print());
}

$('#cCalc').addEventListener('click', calculate);

/* ===========================================================
   Онлайн-запись
   =========================================================== */
const state = { step: 1, center: null, service: null, date: null, time: null };

const wCenters = $('#wCenters'), wServices = $('#wServices'), wDays = $('#wDays'), wSlots = $('#wSlots');
const wPrev = $('#wPrev'), wNext = $('#wNext'), wSummary = $('#wSummary'), wFoot = $('#wFoot');

/* Шаг 1 — техцентры */
wCenters.innerHTML = CENTERS.map(c => `
  <button type="button" class="opt" data-center="${c.id}">
    <div class="opt__title">${c.title}</div>
    <div class="opt__text">${c.address}<br>${c.district}</div>
    <span class="opt__tag">${c.shops.includes('body') ? 'слесарный + кузовной' : 'слесарный цех'}</span>
  </button>`).join('');

wCenters.addEventListener('click', e => {
  const btn = e.target.closest('.opt');
  if (!btn) return;
  setCenter(btn.dataset.center);
});

function setCenter(id) {
  state.center = id;
  $$('.opt', wCenters).forEach(o => o.classList.toggle('is-active', o.dataset.center === id));
  renderServices();
  renderSlots();
  updateFoot();
}

/* Шаг 2 — услуги (кузовной цех только на Энтузиастов) */
function renderServices() {
  const center = CENTERS.find(c => c.id === state.center);
  const shops = center ? center.shops : ['mech', 'body'];
  const list = SERVICES.filter(s => shops.includes(s.shop));

  if (state.service && !list.some(s => s.id === state.service)) state.service = null;

  wServices.innerHTML = list.map(s => `
    <button type="button" class="chip${state.service === s.id ? ' is-active' : ''}" data-service="${s.id}">
      ${s.title}<small>от ${money(s.from)}</small>
    </button>`).join('');

  $('#wServicesHint').textContent = center && !center.shops.includes('body')
    ? 'В этом техцентре — слесарные работы и диагностика. Кузовной ремонт выполняем на шоссе Энтузиастов.'
    : 'Выберите основную услугу — детали уточним по телефону.';
}
renderServices();

wServices.addEventListener('click', e => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  setService(btn.dataset.service, false);
});

function setService(id, jump = true) {
  const svc = SERVICES.find(s => s.id === id);
  if (!svc) return;
  /* Кузовной ремонт возможен только там, где есть кузовной цех */
  if (svc.shop === 'body') setCenter('entuziastov');
  else if (!state.center) setCenter(CENTERS[0].id);

  state.service = id;
  renderServices();
  updateFoot();
  if (jump) { goToStep(2); scrollToId('booking'); }
}

/* Шаг 3 — дни и слоты */
const DAYS = [];
for (let i = 1; i <= 14; i++) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + i);
  DAYS.push(d);
}

wDays.innerHTML = DAYS.map(d => {
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  return `<button type="button" class="day${weekend ? ' is-weekend' : ''}" data-date="${iso(d)}">
      <div class="day__dow">${DOW[d.getDay()]}</div>
      <div class="day__num">${d.getDate()}</div>
      <div class="day__mon">${MONTHS_SHORT[d.getMonth()]}</div>
    </button>`;
}).join('');

wDays.addEventListener('click', e => {
  const btn = e.target.closest('.day');
  if (!btn) return;
  state.date = btn.dataset.date;
  state.time = null;
  $$('.day', wDays).forEach(d => d.classList.toggle('is-active', d === btn));
  renderSlots();
  updateFoot();
});

function renderSlots() {
  if (!state.date) {
    wSlots.innerHTML = '<p class="muted" style="grid-column:1/-1">Выберите дату — покажем свободное время.</p>';
    return;
  }
  const centerId = state.center || CENTERS[0].id;
  wSlots.innerHTML = SLOT_HOURS.map(t => {
    const busy = slotIsBusy(centerId, state.date, t);
    return `<button type="button" class="slot${state.time === t ? ' is-active' : ''}" data-time="${t}"${busy ? ' disabled' : ''}>${t}</button>`;
  }).join('');
}
renderSlots();

wSlots.addEventListener('click', e => {
  const btn = e.target.closest('.slot');
  if (!btn || btn.disabled) return;
  state.time = btn.dataset.time;
  $$('.slot', wSlots).forEach(s => s.classList.toggle('is-active', s === btn));
  updateFoot();
});

/* Шаг 4 — контакты, маска телефона */
const bPhone = $('#bPhone');
bPhone.addEventListener('input', () => {
  let digits = bPhone.value.replace(/\D/g, '');
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (!digits.startsWith('7')) digits = '7' + digits;
  digits = digits.slice(0, 11);

  let out = '+7';
  if (digits.length > 1) out += ' (' + digits.slice(1, 4);
  if (digits.length >= 5) out += ') ' + digits.slice(4, 7);
  if (digits.length >= 8) out += '-' + digits.slice(7, 9);
  if (digits.length >= 10) out += '-' + digits.slice(9, 11);
  bPhone.value = out;
});
bPhone.addEventListener('focus', () => { if (!bPhone.value) bPhone.value = '+7 ('; });

function fieldError(id, on) { $(id).classList.toggle('has-err', on); }

function validateStep4() {
  const name = $('#bName').value.trim();
  const phoneOk = $('#bPhone').value.replace(/\D/g, '').length === 11;
  const car = $('#bCar').value.trim();
  const agree = $('#bAgree').checked;

  fieldError('#fName', !name);
  fieldError('#fPhone', !phoneOk);
  fieldError('#fCar', !car);
  fieldError('#fAgree', !agree);

  return name && phoneOk && car && agree;
}
['#bName', '#bPhone', '#bCar'].forEach(sel => $(sel).addEventListener('input', () => $(sel).closest('.field').classList.remove('has-err')));
$('#bAgree').addEventListener('change', () => fieldError('#fAgree', false));

/* Навигация по шагам */
function goToStep(n) {
  state.step = n;
  $$('.wpane').forEach(p => p.classList.toggle('is-active', Number(p.dataset.pane) === n));
  $$('.wstep').forEach(s => {
    const i = Number(s.dataset.step);
    s.classList.toggle('is-active', i === n);
    s.classList.toggle('is-done', i < n);
  });
  wFoot.style.display = n === 5 ? 'none' : '';
  wPrev.disabled = n === 1;
  wNext.textContent = n === 4 ? 'Отправить заявку' : 'Далее';
  updateFoot();
}

function stepValid(n) {
  if (n === 1) return !!state.center;
  if (n === 2) return !!state.service;
  if (n === 3) return !!(state.date && state.time);
  if (n === 4) return validateStep4();
  return true;
}

const HINTS = {
  1: 'Шаг 1 из 4 — выберите техцентр',
  2: 'Шаг 2 из 4 — выберите услугу',
  3: 'Шаг 3 из 4 — выберите дату и время',
  4: 'Шаг 4 из 4 — заполните контакты'
};

function summaryText() {
  const parts = [];
  const c = CENTERS.find(x => x.id === state.center);
  if (c) parts.push(`<b>${c.title}</b>`);
  const s = SERVICES.find(x => x.id === state.service);
  if (s) parts.push(s.title);
  if (state.date && state.time) {
    const d = new Date(state.date + 'T12:00:00');
    parts.push(`<b>${humanDate(d)}, ${state.time}</b>`);
  }
  return parts.length ? parts.join(' · ') : HINTS[state.step];
}

function updateFoot() {
  wSummary.innerHTML = state.step === 1 && !state.center ? HINTS[1] : summaryText();
  if (state.step < 4 && !stepValidSoft(state.step)) wSummary.innerHTML = HINTS[state.step];
}
function stepValidSoft(n) {
  if (n === 1) return !!state.center;
  if (n === 2) return !!state.service;
  if (n === 3) return !!(state.date && state.time);
  return true;
}

wNext.addEventListener('click', () => {
  if (!stepValid(state.step)) {
    if (state.step < 4) { wSummary.innerHTML = `<span class="accent">${HINTS[state.step]}</span>`; }
    return;
  }
  if (state.step === 4) { submitDemo(); return; }
  goToStep(state.step + 1);
  scrollToId('booking');
});

wPrev.addEventListener('click', () => {
  if (state.step > 1) { goToStep(state.step - 1); scrollToId('booking'); }
});

$('#wRestart').addEventListener('click', () => {
  state.service = null; state.date = null; state.time = null;
  $$('.day', wDays).forEach(d => d.classList.remove('is-active'));
  renderServices();
  renderSlots();
  goToStep(1);
  scrollToId('booking');
});

function submitDemo() {
  const c = CENTERS.find(x => x.id === state.center);
  const s = SERVICES.find(x => x.id === state.service);
  const d = new Date(state.date + 'T12:00:00');
  const rows = [
    ['Техцентр', `${c.title}<br><span class="muted">${c.address}</span>`],
    ['Услуга', s.title],
    ['Дата и время', `${humanDate(d)}, ${DOW[d.getDay()]}, ${state.time}`],
    ['Автомобиль', `${$('#bCar').value.trim()}${$('#bYear').value.trim() ? ', ' + $('#bYear').value.trim() : ''}`],
    ['Клиент', `${$('#bName').value.trim()}<br><span class="muted">${$('#bPhone').value}</span>`]
  ];
  const comment = $('#bComment').value.trim();
  if (comment) rows.push(['Комментарий', comment]);

  $('#wSummaryCard').innerHTML = rows
    .map(([k, v]) => `<div class="done__row"><span>${k}</span><b>${v}</b></div>`)
    .join('');
  goToStep(5);
  scrollToId('booking');
}

/* ===========================================================
   Быстрые сценарии: карточки услуг, кнопки техцентров, hero
   =========================================================== */
document.addEventListener('click', e => {
  const svcBtn = e.target.closest('[data-service]');
  if (svcBtn && !svcBtn.closest('#wServices')) { setService(svcBtn.dataset.service); return; }

  const centerBtn = e.target.closest('.center [data-center]');
  if (centerBtn) { setCenter(centerBtn.dataset.center); goToStep(2); scrollToId('booking'); }
});

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84, behavior: 'smooth' });
}

/* Карточка «Ближайшая запись» в hero */
(function heroCard() {
  const day = DAYS[0];
  const dateISO = iso(day);
  $('#heroDate').textContent = `${humanDate(day)}, ${DOW[day.getDay()]}`;

  const free = SLOT_HOURS.filter(t => !slotIsBusy('entuziastov', dateISO, t)).slice(0, 3);
  $('#heroSlots').innerHTML = free.length
    ? free.map(t => `<button type="button" class="hero-card__slot" data-time="${t}">${t}</button>`).join('')
    : '<p class="muted" style="grid-column:1/-1;text-align:center">На завтра запись закрыта — выберите другой день.</p>';

  $('#heroSlots').addEventListener('click', e => {
    const btn = e.target.closest('.hero-card__slot');
    if (!btn) return;
    setCenter('entuziastov');
    state.date = dateISO;
    state.time = btn.dataset.time;
    $$('.day', wDays).forEach(d => d.classList.toggle('is-active', d.dataset.date === dateISO));
    renderSlots();
    goToStep(2);
    scrollToId('booking');
  });
})();

/* Стартовое состояние мастера */
setCenter(CENTERS[1].id);
goToStep(1);
