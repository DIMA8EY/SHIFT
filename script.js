/* ============================================================
   SHIFT — логика лендинга
   ============================================================ */

/* --- НАСТРОЙКИ TELEGRAM ---
   Впишите сюда токен бота (от @BotFather) и chat_id получателя.
   Пока поля пустые — заявка НЕ отправляется в Telegram,
   но показывается окно "Заявка успешно отправлена".
   ВНИМАНИЕ: токен виден в коде страницы. Используйте бота
   только для этой задачи (см. план проекта).                */
const TELEGRAM = {
    BOT_TOKEN: '8684145030:AAFvR_Kf7gGD5bovd-dc2fvsUWLc6Ss9NM4',
    CHAT_ID:   '1275636122'
};

document.addEventListener('DOMContentLoaded', () => {

    /* ---------- Шапка: фон при скролле ---------- */
    const header = document.getElementById('header');
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    /* ---------- Мобильное меню ---------- */
    const burger = document.getElementById('burger');
    const nav = document.getElementById('nav');
    const toggleNav = (open) => {
        nav.classList.toggle('open', open);
        burger.classList.toggle('open', open);
    };
    burger.addEventListener('click', () => toggleNav(!nav.classList.contains('open')));
    nav.querySelectorAll('.nav__link').forEach(link =>
        link.addEventListener('click', () => toggleNav(false))
    );

    /* ---------- FAQ-аккордеон ---------- */
    document.querySelectorAll('.faq__item').forEach(item => {
        const q = item.querySelector('.faq__q');
        const a = item.querySelector('.faq__a');
        q.addEventListener('click', () => {
            const isOpen = item.classList.contains('open');
            document.querySelectorAll('.faq__item').forEach(other => {
                other.classList.remove('open');
                other.querySelector('.faq__a').style.maxHeight = null;
            });
            if (!isOpen) {
                item.classList.add('open');
                a.style.maxHeight = a.scrollHeight + 'px';
            }
        });
    });

    /* ---------- Reveal при скролле ---------- */
    const reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });
        reveals.forEach(el => io.observe(el));
    } else {
        reveals.forEach(el => el.classList.add('visible'));
    }

    /* ---------- Модальные окна ---------- */
    const modal = document.getElementById('modal');
    const successModal = document.getElementById('successModal');

    const openModal = (m) => {
        m.classList.add('open');
        m.setAttribute('aria-hidden', 'false');
        document.body.classList.add('no-scroll');
    };
    const closeModal = (m) => {
        m.classList.remove('open');
        m.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal.open')) {
            document.body.classList.remove('no-scroll');
        }
    };

    document.querySelectorAll('[data-open-modal]').forEach(btn =>
        btn.addEventListener('click', () => { toggleNav(false); openModal(modal); })
    );
    document.querySelectorAll('[data-close-modal]').forEach(btn =>
        btn.addEventListener('click', () => closeModal(modal))
    );
    document.querySelectorAll('[data-close-success]').forEach(btn =>
        btn.addEventListener('click', () => closeModal(successModal))
    );

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.open').forEach(closeModal);
        }
    });

    /* ---------- Форма заявки ---------- */
    const form = document.getElementById('orderForm');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Валидация обязательных полей
        let valid = true;
        form.querySelectorAll('[required]').forEach(field => {
            const isCheckbox = field.type === 'checkbox';
            const ok = isCheckbox ? field.checked : field.value.trim() !== '';
            const target = isCheckbox ? field.closest('.form__check') : field;
            target?.classList.toggle('invalid', !ok);
            if (!ok) valid = false;
        });
        if (!valid) return;

        const data = {
            name:     form.name.value.trim(),
            contact:  form.contact.value.trim(),
            business: form.business.value.trim(),
            budget:   form.budget.value,
            comment:  form.comment.value.trim() || '—'
        };

        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляем...';

        await sendToTelegram(data);

        // Показываем успех независимо от наличия токена
        form.reset();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить заявку';
        closeModal(modal);
        openModal(successModal);
    });

    // Убираем подсветку ошибки при вводе
    form.querySelectorAll('.form__input').forEach(field =>
        field.addEventListener('input', () => field.classList.remove('invalid'))
    );
    document.getElementById('formConsent')?.addEventListener('change', function () {
        this.closest('.form__check')?.classList.remove('invalid');
    });

    /* ---------- Пиксельные звёзды на фоне блока тарифов ---------- */
    initPixelStarsBackground();

    async function sendToTelegram(data) {
        if (!TELEGRAM.BOT_TOKEN || !TELEGRAM.CHAT_ID) {
            console.info('[SHIFT] Токен Telegram не задан — заявка не отправлена (демо-режим).', data);
            return;
        }
        const text =
            '🚀 Новая заявка с сайта SHIFT\n\n' +
            '👤 Имя: ' + data.name + '\n' +
            '📩 Контакт: ' + data.contact + '\n' +
            '💼 Бизнес: ' + data.business + '\n' +
            '💰 Бюджет: ' + data.budget + '\n' +
            '📝 Комментарий: ' + data.comment;
        try {
            await fetch(`https://api.telegram.org/bot${TELEGRAM.BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM.CHAT_ID,
                    text,
                    parse_mode: 'HTML'
                })
            });
        } catch (err) {
            console.error('[SHIFT] Ошибка отправки в Telegram:', err);
        }
    }

    function initPixelStarsBackground() {
        const section = document.querySelector('.pricing');
        const canvas = section && section.querySelector('.pricing__stars');
        if (!section || !canvas || !canvas.getContext) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const ctx = canvas.getContext('2d');
        const STAR_COLORS = ['#FFFFFF', '#FFFFAA', '#AAAAFF', '#FFAAAA', '#AAFFAA', '#FFAAFF', '#AAFFFF'];
        const STAR_DENSITY = 0.00015;
        const TWINKLE_PROB = 0.7;
        const MIN_TWINKLE = 2, MAX_TWINKLE = 4;
        const PIXEL = 4;
        const REGEN_INTERVAL = 5000;
        const REGEN_PERCENT = 0.15;
        const SHOOT_PIXEL = 2;
        const FPS = 16;
        const FRAME_MS = 1000 / FPS;

        let stars = [];
        let shootingStars = [];
        let rafId = null;
        let lastFrame = 0;
        let shootTimeout = null;
        let regenInterval = null;
        let running = false;

        function makeStar() {
            const gridX = Math.floor(Math.random() * (canvas.width / PIXEL)) * PIXEL;
            const gridY = Math.floor(Math.random() * (canvas.height / PIXEL)) * PIXEL;
            const baseOpacity = Math.random() * 0.5 + 0.5;
            return {
                x: gridX, y: gridY,
                color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
                baseOpacity, currentOpacity: baseOpacity,
                twinkle: Math.random() < TWINKLE_PROB,
                twinkleSpeed: MIN_TWINKLE + Math.random() * (MAX_TWINKLE - MIN_TWINKLE),
                twinkleDirection: -1,
                twinkleTimer: 0
            };
        }

        function initStars() {
            const count = Math.floor(canvas.width * canvas.height * STAR_DENSITY);
            stars = Array.from({ length: count }, makeStar);
        }

        function regenerateStars() {
            if (!stars.length) return;
            const n = Math.max(1, Math.floor(stars.length * REGEN_PERCENT));
            for (let i = 0; i < n; i++) {
                stars[Math.floor(Math.random() * stars.length)] = makeStar();
            }
        }

        function createShootingStar() {
            shootingStars.push({
                x: Math.random() * canvas.width,
                y: 0,
                angle: 45 + Math.random() * 90,
                speed: Math.random() * 5 + 8,
                distance: 0,
                trail: []
            });
        }

        function scheduleShootingStar() {
            shootTimeout = setTimeout(() => {
                createShootingStar();
                scheduleShootingStar();
            }, Math.random() * 4000 + 2000);
        }

        function resize() {
            canvas.width = section.clientWidth;
            canvas.height = section.clientHeight;
            initStars();
        }

        function draw(timestamp) {
            if (timestamp - lastFrame < FRAME_MS) {
                rafId = requestAnimationFrame(draw);
                return;
            }
            lastFrame = timestamp;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            stars.forEach(star => {
                if (star.twinkle) {
                    star.twinkleTimer += 1 / FPS;
                    if (star.twinkleTimer >= star.twinkleSpeed) {
                        star.twinkleTimer = 0;
                        star.twinkleDirection *= -1;
                    }
                    const progress = star.twinkleTimer / star.twinkleSpeed;
                    const dim = star.baseOpacity * 0.3;
                    if (progress < 0.5) {
                        star.currentOpacity = star.twinkleDirection < 0 ? star.baseOpacity : dim;
                    } else {
                        star.currentOpacity = star.twinkleDirection < 0 ? dim : star.baseOpacity;
                    }
                }
                ctx.globalAlpha = star.currentOpacity;
                ctx.fillStyle = star.color;
                ctx.fillRect(star.x, star.y, PIXEL, PIXEL);
            });

            if (shootingStars.length) {
                shootingStars = shootingStars
                    .map(star => {
                        const rad = star.angle * Math.PI / 180;
                        const newX = star.x + star.speed * Math.cos(rad);
                        const newY = star.y + star.speed * Math.sin(rad);
                        const newDistance = star.distance + star.speed;
                        const trail = star.trail
                            .map(p => ({ x: p.x, y: p.y, opacity: p.opacity - 0.1 }))
                            .filter(p => p.opacity > 0);
                        if (newDistance % 8 < star.speed) {
                            trail.push({ x: star.x, y: star.y, opacity: 1 });
                        }
                        return { ...star, x: newX, y: newY, distance: newDistance, trail };
                    })
                    .filter(star =>
                        star.x >= -30 && star.x <= canvas.width + 30 &&
                        star.y >= -30 && star.y <= canvas.height + 30
                    );

                shootingStars.forEach(star => {
                    ctx.globalAlpha = 1;
                    star.trail.forEach(p => {
                        ctx.fillStyle = `rgba(180,242,255,${p.opacity})`;
                        ctx.fillRect(p.x, p.y, SHOOT_PIXEL, SHOOT_PIXEL);
                    });
                    ctx.fillStyle = '#ffffff';
                    for (let y = 0; y < 2; y++) {
                        for (let x = 0; x < 4; x++) {
                            if ((x === 0 && y === 1) || (x === 3 && y === 0)) continue;
                            ctx.fillRect(star.x + x * SHOOT_PIXEL, star.y + y * SHOOT_PIXEL, SHOOT_PIXEL, SHOOT_PIXEL);
                        }
                    }
                });
            }

            ctx.globalAlpha = 1;
            rafId = requestAnimationFrame(draw);
        }

        function start() {
            if (running) return;
            running = true;
            resize();
            lastFrame = 0;
            rafId = requestAnimationFrame(draw);
            scheduleShootingStar();
            regenInterval = setInterval(regenerateStars, REGEN_INTERVAL);
        }

        function stop() {
            running = false;
            if (rafId) cancelAnimationFrame(rafId);
            if (shootTimeout) clearTimeout(shootTimeout);
            if (regenInterval) clearInterval(regenInterval);
        }

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(entries => {
                entries.forEach(entry => (entry.isIntersecting ? start() : stop()));
            }, { threshold: 0.05 });
            io.observe(section);
        } else {
            start();
        }

        window.addEventListener('resize', () => { if (running) resize(); }, { passive: true });
    }

/* --- Баннер cookie --- */
(function initCookieBanner() {
    const bar = document.getElementById('cookiebar');
    const btn = document.getElementById('cookiebarBtn');
    if (!bar || !btn) return;
    if (localStorage.getItem('shift_cookie_ok') === '1') return;

    requestAnimationFrame(() => bar.classList.add('is-visible'));
    btn.addEventListener('click', () => {
        localStorage.setItem('shift_cookie_ok', '1');
        bar.classList.remove('is-visible');
    });
})();

/* --- Кейс: кликабельное переключение "до/после" --- */
document.querySelectorAll('.case-featured__shots').forEach(initCaseCompare);

function initCaseCompare(shots) {
    const before = shots.querySelector('.case-featured__shot--before');
    const after  = shots.querySelector('.case-featured__shot--after');
    if (!before || !after) return;

    let showAfter = true;
    let autoTimer = null;

    function render() {
        before.classList.toggle('is-active', !showAfter);
        after.classList.toggle('is-active', showAfter);
    }
    function flip() { showAfter = !showAfter; render(); }
    function stopAuto() { clearInterval(autoTimer); autoTimer = null; }
    function startAuto() {
        stopAuto();
        autoTimer = setInterval(flip, 2600);
    }

    shots.setAttribute('role', 'button');
    shots.setAttribute('tabindex', '0');
    shots.setAttribute('aria-label', 'Сравнить старую и новую версию сайта');

    shots.addEventListener('click', () => { stopAuto(); flip(); shots.classList.add('is-touched'); });
    shots.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stopAuto(); flip(); }
    });

    render();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) startAuto();
}
});
