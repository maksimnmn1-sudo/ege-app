import { CARDS_DATA } from './data.js';

// --- 1. ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP ---
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand(); // Раскрываем Mini App на всю высоту экрана
  // Отключаем вертикальные свайпы закрытия Telegram (доступно с версии Bot API 7.7+)
  if (typeof tg.disableVerticalSwipes === 'function') {
    tg.disableVerticalSwipes();
  }
}

/**
 * Обёртка над Telegram HapticFeedback с безопасным фоллбэком для обычного браузера
 */
const haptic = {
  selection() {
    tg?.HapticFeedback?.selectionChanged();
  },
  impact(style = 'light') {
    tg?.HapticFeedback?.impactOccurred(style);
  },
  notify(type = 'success') {
    tg?.HapticFeedback?.notificationOccurred(type);
  }
};

// --- 2. ЭЛЕМЕНТЫ DOM ---
const dom = {
  card: document.getElementById('active-card'),
  cardFront: document.getElementById('card-front'),
  cardExplanation: document.getElementById('card-explanation'),

  cardTopic: document.getElementById('card-topic'),
  cardWord: document.getElementById('card-word'),

  explanationStatus: document.getElementById('explanation-status'),
  explanationWord: document.getElementById('explanation-word'),
  explanationRule: document.getElementById('explanation-rule'),

  badgeLeft: document.getElementById('badge-left'),
  badgeRight: document.getElementById('badge-right'),

  btnNext: document.getElementById('btn-next'),
  btnSwipeLeft: document.getElementById('btn-swipe-left'),
  btnSwipeRight: document.getElementById('btn-swipe-right'),
  btnIdk: document.getElementById('btn-idk'),
  btnTextLeft: document.getElementById('btn-text-left'),
  btnTextRight: document.getElementById('btn-text-right'),
  footerControls: document.getElementById('footer-controls'),

  progressFill: document.getElementById('progress-fill'),
  counterCurrent: document.getElementById('counter-current'),
  counterTotal: document.getElementById('counter-total'),
  scoreCorrect: document.getElementById('score-correct'),
  scoreWrong: document.getElementById('score-wrong'),

  finishScreen: document.getElementById('finish-screen'),
  finalCorrect: document.getElementById('final-correct'),
  finalWrong: document.getElementById('final-wrong'),
  finalSkipped: document.getElementById('final-skipped'),
  btnRestart: document.getElementById('btn-restart'),

  tabSwipes: document.getElementById('tab-swipes'),
  tabMistakes: document.getElementById('tab-mistakes'),
  tabProfile: document.getElementById('tab-profile'),
  tabButtons: document.querySelectorAll('.tab-btn'),
  mistakesBadge: document.getElementById('mistakes-badge'),
  mistakesList: document.getElementById('mistakes-list'),
  profileName: document.getElementById('profile-name'),
  profTotal: document.getElementById('prof-total'),
  profWinrate: document.getElementById('prof-winrate'),
  btnResetProgress: document.getElementById('btn-reset-progress')
};

// --- 3. СОСТОЯНИЕ ПРИЛОЖЕНИЯ ---
const SWIPE_THRESHOLD = 95; // Дистанция в пикселях для засчитывания свайпа
const TAP_THRESHOLD = 8;    // Максимальное смещение пальца для распознавания тапа

// Ключ, под которым данные будут лежать в памяти браузера/телефона
const STORAGE_KEY = 'ege_tinder_stats_v1';

// Пытаемся достать старую статистику. Если её нет — создаём пустую
const savedStats = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
  totalSwipes: 0,
  correctAnswers: 0,
  wrongAnswers: 0,
  mistakesArray: [] // Сюда будут записываться ID карточек с ошибками
};

let state = {
  currentTab: 'swipes', // Какая вкладка открыта сейчас
  storage: savedStats,  // Ссылка на нашу долгосрочную статистику

  cards: [...CARDS_DATA],
  currentIndex: 0,
  correctCount: 0,
  wrongCount: 0,
  skippedCount: 0,

  isExplanationMode: false,
  isAnimating: false,

  isDragging: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  crossedThreshold: false
};

// Функция сохранения статистики в память телефона и обновления счётчика ошибок
function saveStatsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.storage));
  updateMistakesBadge();
}

// --- 4. ОТРИСОВКА КАРТОЧКИ И ИНТЕРФЕЙСА ---
function renderCurrentCard() {
  if (state.currentIndex >= state.cards.length) {
    showFinishScreen();
    return;
  }

  const cardData = state.cards[state.currentIndex];
  state.isExplanationMode = false;
  state.isAnimating = false;

  dom.card.style.transition = 'none';
  dom.card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
  dom.card.style.opacity = '1';
  dom.card.className = 'card';

  dom.cardFront.classList.remove('hidden');
  dom.cardExplanation.classList.add('hidden');
  dom.footerControls.style.visibility = 'visible';

  // Собираем заголовок из новых полей taskId и theme
  dom.cardTopic.textContent = `${cardData.taskId} • ${cardData.theme}`;

  // Берём текст из поля content (если там есть "..", красиво подсвечиваем пропуск)
  const formattedWord = cardData.content.replace('..', '<span class="missing-dots">..</span>');
  dom.cardWord.innerHTML = formattedWord;

  // Определяем подписи по бокам: для 'binary' — "Неверно"/"Верно", для 'choice' — буквы
  const leftLabel = cardData.type === 'binary' ? 'Неверно' : cardData.options.left;
  const rightLabel = cardData.type === 'binary' ? 'Верно' : cardData.options.right;

  dom.badgeLeft.textContent = leftLabel;
  dom.badgeRight.textContent = rightLabel;
  dom.btnTextLeft.textContent = leftLabel;
  dom.btnTextRight.textContent = rightLabel;

  // Для длинных слов "Верно"/"Неверно" включаем широкий стиль боковых кнопок
  dom.badgeLeft.classList.toggle('binary-mode', cardData.type === 'binary');
  dom.badgeRight.classList.toggle('binary-mode', cardData.type === 'binary');

  resetBadges();
  updateHeaderStats();
}

function updateHeaderStats() {
  const total = state.cards.length;
  const current = Math.min(state.currentIndex + 1, total);
  const progressPercent = (state.currentIndex / total) * 100;

  dom.counterCurrent.textContent = current;
  dom.counterTotal.textContent = total;
  dom.scoreCorrect.textContent = state.correctCount;
  dom.scoreWrong.textContent = state.wrongCount;
  dom.progressFill.style.width = `${progressPercent}%`;
}

function resetBadges() {
  dom.badgeLeft.style.transform = 'translateY(-50%) scale(0.9)';
  dom.badgeRight.style.transform = 'translateY(-50%) scale(0.9)';
  dom.badgeLeft.classList.remove('active');
  dom.badgeRight.classList.remove('active');
}

// --- 5. ОБРАБОТКА ЖЕСТОВ (POINTER EVENTS) ---
function onPointerDown(e) {
  if (state.isAnimating) return;

  // Если уже открыто правило — тап в любом месте карточки ведёт дальше
  if (state.isExplanationMode) {
    return;
  }

  state.isDragging = true;
  state.startX = e.clientX;
  state.startY = e.clientY;
  state.currentX = 0;
  state.crossedThreshold = false;

  dom.card.style.transition = 'none';
  dom.card.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (!state.isDragging || state.isExplanationMode || state.isAnimating) return;

  const deltaX = e.clientX - state.startX;
  const deltaY = (e.clientY - state.startY) * 0.25; // Небольшое вертикальное смещение
  state.currentX = deltaX;

  // Наклон карточки пропорционально смещению
  const rotate = deltaX * 0.06;
  dom.card.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(${rotate}deg)`;

  // Анимация боковых бейджей с буквами
  const progress = Math.min(Math.abs(deltaX) / SWIPE_THRESHOLD, 1.3);
  if (deltaX < -10) {
    dom.badgeLeft.style.transform = `translateY(-50%) scale(${0.9 + progress * 0.35})`;
    dom.badgeLeft.classList.toggle('active', Math.abs(deltaX) >= SWIPE_THRESHOLD);
    dom.badgeRight.classList.remove('active');
  } else if (deltaX > 10) {
    dom.badgeRight.style.transform = `translateY(-50%) scale(${0.9 + progress * 0.35})`;
    dom.badgeRight.classList.toggle('active', Math.abs(deltaX) >= SWIPE_THRESHOLD);
    dom.badgeLeft.classList.remove('active');
  } else {
    resetBadges();
  }

  // Лёгкий виброотклик при пересечении порога срабатывания свайпа
  if (Math.abs(deltaX) >= SWIPE_THRESHOLD && !state.crossedThreshold) {
    state.crossedThreshold = true;
    haptic.selection();
  } else if (Math.abs(deltaX) < SWIPE_THRESHOLD && state.crossedThreshold) {
    state.crossedThreshold = false;
  }
}

function onPointerUp(e) {
  if (!state.isDragging) return;
  state.isDragging = false;

  const absX = Math.abs(state.currentX);
  const absY = Math.abs(e.clientY - state.startY);

  resetBadges();

  // 1. Проверка на одиночный ТАП ("Не знаю")
  if (absX < TAP_THRESHOLD && absY < TAP_THRESHOLD && !state.isExplanationMode) {
    handleDontKnow();
    return;
  }

  // 2. Проверка на СВАЙП влево или вправо
  if (state.currentX <= -SWIPE_THRESHOLD) {
    processChoice('left');
  } else if (state.currentX >= SWIPE_THRESHOLD) {
    processChoice('right');
  } else {
    // 3. Свайп не дотянут — плавно возвращаем карточку в центр
    dom.card.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
    dom.card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
  }
}

// --- 6. ИГРОВАЯ ЛОГИКА И ПРОВЕРКА ОТВЕТА ---
function processChoice(direction) {
  if (state.isAnimating || state.isExplanationMode) return;

  const cardData = state.cards[state.currentIndex];

  // Прибавляем +1 к общему числу решённых карточек в профиле
  state.storage.totalSwipes++;

  // Проверяем ответ: direction ('left' или 'right') сравниваем с correctAnswer
  // Для 'binary' свайп вправо ('right') = Верно
  // Для 'choice' свайп влево ('left') = левый вариант, вправо ('right') = правый
  const isCorrect = direction === cardData.correctAnswer;

  if (isCorrect) {
    state.storage.correctAnswers++;
    saveStatsToStorage();
    handleCorrectAnswer(direction);
  } else {
    state.storage.wrongAnswers++;
    // Если такой ошибки ещё нет в списке — добавляем её ID в mistakesArray
    if (!state.storage.mistakesArray.includes(cardData.id)) {
      state.storage.mistakesArray.push(cardData.id);
    }
    saveStatsToStorage();
    handleWrongAnswer();
  }
}

/**
 * Сценарий: ПРАВИЛЬНЫЙ ОТВЕТ
 * Карточка загорается зелёным, улетает в сторону свайпа, загружается следующая
 */
function handleCorrectAnswer(direction) {
  state.isAnimating = true;
  state.correctCount++;
  updateHeaderStats();

  // Вибрация успеха
  haptic.notify('success');

  dom.card.classList.add('state-correct');
  const flyX = direction === 'left' ? -window.innerWidth * 1.2 : window.innerWidth * 1.2;
  const flyRotate = direction === 'left' ? -25 : 25;

  dom.card.style.transition = 'transform 0.38s ease-out, opacity 0.38s ease-out';
  dom.card.style.transform = `translate3d(${flyX}px, 20px, 0) rotate(${flyRotate}deg)`;
  dom.card.style.opacity = '0';

  setTimeout(() => {
    state.currentIndex++;
    renderCurrentCard();
  }, 380);
}

/**
 * Сценарий: ОШИБКА
 * Карточка загорается красным, свайп отменяется (возврат в центр), показывается правило
 */
function handleWrongAnswer() {
  state.isAnimating = true;
  state.wrongCount++;
  updateHeaderStats();

  // Вибрация ошибки
  haptic.notify('error');

  // Возвращаем карточку в центр и трясём
  dom.card.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
  dom.card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
  dom.card.classList.add('state-wrong', 'shake');

  setTimeout(() => {
    dom.card.classList.remove('shake');
    showExplanationOverlay('wrong');
    state.isAnimating = false;
  }, 350);
}

/**
 * Сценарий: ТАП "НЕ ЗНАЮ"
 * Ошибка не засчитывается, сразу открывается правило
 */
function handleDontKnow() {
  if (state.isAnimating || state.isExplanationMode) return;
  state.skippedCount++;

  haptic.impact('medium');
  dom.card.style.transition = 'transform 0.25s ease';
  dom.card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
  dom.card.classList.add('state-info');

  showExplanationOverlay('info');
}

/**
 * Показ оверлея с правильным ответом и объяснением на карточке
 */
function showExplanationOverlay(mode) {
  state.isExplanationMode = true;
  const cardData = state.cards[state.currentIndex];

  dom.cardFront.classList.add('hidden');
  dom.cardExplanation.classList.remove('hidden');
  dom.footerControls.style.visibility = 'hidden';

  if (mode === 'wrong') {
    dom.explanationStatus.textContent = 'Ошибка';
    dom.explanationStatus.className = 'status-pill wrong';
  } else {
    dom.explanationStatus.textContent = 'Подсказка • Без штрафа';
    dom.explanationStatus.className = 'status-pill info';
  }

  // 1. Безопасно берём fullWord, а если его нет (например, в карточке типа binary) — берём content
  // (В Python это аналогично: cardData.get('fullWord') or cardData['content'])
  const textToShow = cardData.fullWord || cardData.content;

  // 2. Подсвечиваем заглавную букву зелёным цветом
  const highlightedWord = textToShow.replace(
    /([А-ЯЁ])/g,
    '<span class="highlight-letter">$1</span>'
  );

  dom.explanationWord.innerHTML = highlightedWord;

  // 3. Подставляем текст правила из нового ключа explanation (вместо старого rule)
  dom.explanationRule.textContent = cardData.explanation;
}

/**
 * Переход к следующей карточке после прочтения правила
 */
function goToNextCard(e) {
  if (e) e.stopPropagation();
  if (!state.isExplanationMode || state.isAnimating) return;

  haptic.impact('light');
  state.isAnimating = true;

  dom.card.style.transition = 'transform 0.25s ease-in, opacity 0.25s ease-in';
  dom.card.style.transform = 'translate3d(0, -40px, 0) scale(0.92)';
  dom.card.style.opacity = '0';

  setTimeout(() => {
    state.currentIndex++;
    renderCurrentCard();
  }, 250);
}

// --- 7. ФИНАЛЬНЫЙ ЭКРАН И ПЕРЕЗАПУСК ---
function showFinishScreen() {
  dom.progressFill.style.width = '100%';
  dom.finalCorrect.textContent = state.correctCount;
  dom.finalWrong.textContent = state.wrongCount;
  dom.finalSkipped.textContent = state.skippedCount;

  dom.finishScreen.classList.remove('hidden');
  haptic.notify('success');
}

function restartGame() {
  haptic.impact('medium');
  state.currentIndex = 0;
  state.correctCount = 0;
  state.wrongCount = 0;
  state.skippedCount = 0;
  // Перемешиваем карточки для повторного прохождения
  state.cards = [...CARDS_DATA].sort(() => Math.random() - 0.5);

  dom.finishScreen.classList.add('hidden');
  renderCurrentCard();
}

// --- 8. ПОДПИСКА НА СОБЫТИЯ ---
dom.card.addEventListener('pointerdown', onPointerDown);
dom.card.addEventListener('pointermove', onPointerMove);
dom.card.addEventListener('pointerup', onPointerUp);
dom.card.addEventListener('pointercancel', onPointerUp);

// Переход дальше по кнопке "Понятно" или тапу по самой карточке в режиме объяснения
dom.btnNext.addEventListener('click', goToNextCard);
dom.cardExplanation.addEventListener('click', goToNextCard);

// Дублирующие кнопки внизу экрана
dom.btnSwipeLeft.addEventListener('click', () => processChoice('left'));
dom.btnSwipeRight.addEventListener('click', () => processChoice('right'));
dom.btnIdk.addEventListener('click', handleDontKnow);
dom.btnRestart.addEventListener('click', restartGame);

// --- 9. РОУТИНГ И НИЖНЯЯ НАВИГАЦИЯ (TabBar) ---
function switchTab(tabName) {
  state.currentTab = tabName;
  haptic.selection();

  // Подсвечиваем активную кнопку внизу
  dom.tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Показываем нужный экран, остальные прячем
  dom.tabSwipes.classList.toggle('hidden', tabName !== 'swipes');
  dom.tabMistakes.classList.toggle('hidden', tabName !== 'mistakes');
  dom.tabProfile.classList.toggle('hidden', tabName !== 'profile');

  // При открытии вкладки обновляем данные на ней
  if (tabName === 'mistakes') renderMistakesScreen();
  if (tabName === 'profile') renderProfileScreen();
}

// Обновляем красный кружок с цифрой на вкладке "Ошибки"
function updateMistakesBadge() {
  const count = state.storage.mistakesArray.length;
  dom.mistakesBadge.textContent = count;
  dom.mistakesBadge.classList.toggle('hidden', count === 0);
}

// --- 10. ЭКРАН «ОШИБКИ» (MistakesScreen) ---
function renderMistakesScreen() {
  dom.mistakesList.innerHTML = '';

  // Фильтруем общую базу: оставляем только те карточки, чьи ID есть в mistakesArray
  const mistakeCards = CARDS_DATA.filter(card =>
    state.storage.mistakesArray.includes(card.id)
  );

  // Если ошибок нет — показываем заглушку
  if (mistakeCards.length === 0) {
    dom.mistakesList.innerHTML = `
      <div class="empty-state">
        🎉 У тебя нет неотработанных ошибок!<br>Продолжай решать карточки.
      </div>
    `;
    return;
  }

  // Рисуем каждую карточку с ошибкой
  mistakeCards.forEach(card => {
    const item = document.createElement('div');
    item.className = 'mistake-item';
    item.innerHTML = `
      <div class="mistake-header">
        <div>
          <div class="mistake-word">${card.fullWord || card.content}</div>
          <div class="mistake-theme">${card.taskId} • ${card.theme}</div>
        </div>
        <button class="btn-learned" type="button">Я выучил ✓</button>
      </div>
      <div class="mistake-explanation hidden">${card.explanation}</div>
    `;

    // Клик по самой карточке открывает или прячет объяснение правила
    item.addEventListener('click', () => {
      haptic.selection();
      const expBox = item.querySelector('.mistake-explanation');
      expBox.classList.toggle('hidden');
    });

    // Клик по кнопке "Я выучил" удаляет ID из массива ошибок и перерисовывает список
    const learnedBtn = item.querySelector('.btn-learned');
    learnedBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Не даём клику сработать на родительскую карточку
      haptic.notify('success');
      state.storage.mistakesArray = state.storage.mistakesArray.filter(id => id !== card.id);
      saveStatsToStorage();
      renderMistakesScreen();
    });

    dom.mistakesList.appendChild(item);
  });
}

// --- 11. ЭКРАН «ПРОФИЛЬ» (Profile) ---
function renderProfileScreen() {
  // Если открыто в Telegram — подставляем реальное имя пользователя
  const tgUser = tg?.initDataUnsafe?.user;
  if (tgUser?.first_name) {
    dom.profileName.textContent = tgUser.first_name;
  }

  const { totalSwipes, correctAnswers } = state.storage;
  const winrate = totalSwipes > 0 ? Math.round((correctAnswers / totalSwipes) * 100) : 0;

  dom.profTotal.textContent = totalSwipes;
  dom.profWinrate.textContent = `${winrate}%`;
}

// Кнопка "Сбросить прогресс" в Профиле
dom.btnResetProgress.addEventListener('click', () => {
  haptic.notify('warning');
  state.storage = {
    totalSwipes: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    mistakesArray: []
  };
  saveStatsToStorage();
  renderProfileScreen();
});

// Вешаем клики на все 3 кнопки нижней навигации
dom.tabButtons.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Обновляем бейдж ошибок сразу при запуске приложения
updateMistakesBadge();

// Старт приложения
renderCurrentCard();
