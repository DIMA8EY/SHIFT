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
    CHAT_ID:   ''    // ← сюда впишем ваш chat_id (получим после сообщения боту)
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
            const ok = field.value.trim() !== '';
            field.classList.toggle('invalid', !ok);
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
});
