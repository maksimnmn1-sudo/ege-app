import { loadSubjectDatabase } from './data.js';

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
 * Обёртка над Telegram HapticFeedback с безопасным фоллбэком
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
  // Элементы стартового экрана
  startScreen: document.getElementById('start-screen'),
  subjectButtons: document.querySelectorAll('.subject-btn'),

  // Элементы карточки
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
const SWIPE_THRESHOLD = 95;
const TAP_THRESHOLD = 8;
const BATCH_SIZE = 5; // Размер порции карточек
const STORAGE_KEY = 'ege_tinder_stats_v1';

const savedStats = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
  totalSwipes: 0,
  correctAnswers: 0,
  wrongAnswers: 0,
  mistakesArray: []
};

let state = {
  currentTab: 'swipes',
  storage: savedStats,

  currentSubjectData: [], // Полная база текущего предмета
  seenCardIds: new Set(), // ID пройденных карточек в рамках круга
  cards: [],              // Текущий батч (до 5 карточек)

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

function saveStatsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.storage));
  updateMistakesBadge();
}

// Утилита: Алгоритм Фишера-Йетса для идеального рандома
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --- 3.1 РОУТИНГ ПРЕДМЕТОВ (НОВОЕ ИЗ ШАГА 5) ---
dom.subjectButtons.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const subjectKey = e.currentTarget.getAttribute('data-subject');
    await startSession(subjectKey);
  });
});

async function startSession(subjectKey) {
  // Подгружаем базу данных динамически
  const rawData = await loadSubjectDatabase(subjectKey);
  if (!rawData || rawData.length === 0) return;

  // Копируем и перемешиваем колоду
  state.currentSubjectData = JSON.parse(JSON.stringify(rawData));
  shuffleArray(state.currentSubjectData);
  state.seenCardIds.clear(); // Сбрасываем прогресс круга

  // Сбрасываем локальную статистику сессии (не глобальную)
  state.correctCount = 0;
  state.wrongCount = 0;
  state.skippedCount = 0;

  // Скрываем меню, показываем интерфейс
  dom.startScreen.classList.add('hidden');

  if (tg?.BackButton) {
    tg.BackButton.show();
    tg.BackButton.onClick(goBackToMenu);
  }

  // Загружаем первые 5 карточек
  loadNextBatch();
}

function goBackToMenu() {
  dom.startScreen.classList.remove('hidden');
  if (tg?.BackButton) {
    tg.BackButton.hide();
    tg.BackButton.offClick(goBackToMenu); // отписываемся от события
  }
}

// --- 3.2 ЛОГИКА БАТЧЕЙ (ПОРЦИЙ ПО 5 ШТУК) ---
function loadNextBatch() {
  // Ищем карточки, которые в этом круге еще не показывались
  let unseen = state.currentSubjectData.filter(c => !state.seenCardIds.has(c.id));

  // Если не пройденных не осталось — круг завершён, зацикливаем!
  if (unseen.length === 0) {
    state.seenCardIds.clear();
    shuffleArray(state.currentSubjectData);
    unseen = [...state.currentSubjectData];

    haptic.notify('success');
    if (tg?.showAlert) {
      tg.showAlert('Все задания пройдены! Начинаем новый круг с перемешанной колодой.');
    }
  }

  // Берем до 5 карточек
  const batch = unseen.slice(0, BATCH_SIZE);

  // Запоминаем, что мы их выдали
  batch.forEach(c => state.seenCardIds.add(c.id));

  // Устанавливаем текущий батч в качестве активной колоды
  state.cards = batch;
  state.currentIndex = 0;

  renderCurrentCard();
}

// --- 4. ОТРИСОВКА КАРТОЧКИ И ИНТЕРФЕЙСА ---
function renderCurrentCard() {
  // Если батч из 5 карточек закончился — бесшовно грузим следующий
  if (state.currentIndex >= state.cards.length) {
    loadNextBatch();
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

  dom.cardTopic.textContent = `${cardData.taskId} • ${cardData.theme}`;

  // Если контент содержит "..", подсвечиваем. Иначе выводим как есть.
  const contentText = cardData.content || cardData.question || "";
  const formattedWord = contentText.replace('..', '<span class="missing-dots">..</span>');
  dom.cardWord.innerHTML = formattedWord;

  const leftLabel = cardData.type === 'binary' ? 'Неверно' : (cardData.options?.left || 'А');
  const rightLabel = cardData.type === 'binary' ? 'Верно' : (cardData.options?.right || 'Б');

  dom.badgeLeft.textContent = leftLabel;
  dom.badgeRight.textContent = rightLabel;
  dom.btnTextLeft.textContent = leftLabel;
  dom.btnTextRight.textContent = rightLabel;

  dom.badgeLeft.classList.toggle('binary-mode', cardData.type === 'binary');
  dom.badgeRight.classList.toggle('binary-mode', cardData.type === 'binary');

  resetBadges();
  updateHeaderStats();
}

function updateHeaderStats() {
  const total = state.cards.length; // В батче до 5 карточек
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
  if (state.isExplanationMode) return;

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
  const deltaY = (e.clientY - state.startY) * 0.25;
  state.currentX = deltaX;

  const rotate = deltaX * 0.06;
  dom.card.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(${rotate}deg)`;

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

  if (absX < TAP_THRESHOLD && absY < TAP_THRESHOLD && !state.isExplanationMode) {
    handleDontKnow();
    return;
  }

  if (state.currentX <= -SWIPE_THRESHOLD) {
    processChoice('left');
  } else if (state.currentX >= SWIPE_THRESHOLD) {
    processChoice('right');
  } else {
    dom.card.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
    dom.card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
  }
}

// --- 6. ИГРОВАЯ ЛОГИКА И ПРОВЕРКА ОТВЕТА ---
function processChoice(direction) {
  if (state.isAnimating || state.isExplanationMode) return;

  const cardData = state.cards[state.currentIndex];
  state.storage.totalSwipes++;

  const isCorrect = direction === cardData.correctAnswer;

  if (isCorrect) {
    state.storage.correctAnswers++;
    saveStatsToStorage();
    handleCorrectAnswer(direction);
  } else {
    state.storage.wrongAnswers++;
    if (!state.storage.mistakesArray.includes(cardData.id)) {
      state.storage.mistakesArray.push(cardData.id);
    }
    saveStatsToStorage();
    handleWrongAnswer();
  }
}

function handleCorrectAnswer(direction) {
  state.isAnimating = true;
  state.correctCount++;
  updateHeaderStats();

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

function handleWrongAnswer() {
  state.isAnimating = true;
  state.wrongCount++;
  updateHeaderStats();

  haptic.notify('error');

  dom.card.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
  dom.card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
  dom.card.classList.add('state-wrong', 'shake');

  setTimeout(() => {
    dom.card.classList.remove('shake');
    showExplanationOverlay('wrong');
    state.isAnimating = false;
  }, 350);
}

function handleDontKnow() {
  if (state.isAnimating || state.isExplanationMode) return;
  state.skippedCount++;

  haptic.impact('medium');
  dom.card.style.transition = 'transform 0.25s ease';
  dom.card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
  dom.card.classList.add('state-info');

  showExplanationOverlay('info');
}

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

  const textToShow = cardData.fullWord || cardData.content || cardData.question || "";
  const highlightedWord = textToShow.replace(/([А-ЯЁ])/g, '<span class="highlight-letter">$1</span>');
  dom.explanationWord.innerHTML = highlightedWord;
  dom.explanationRule.textContent = cardData.explanation;
}

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

// --- 7. ПОДПИСКА НА СОБЫТИЯ ---
dom.card.addEventListener('pointerdown', onPointerDown);
dom.card.addEventListener('pointermove', onPointerMove);
dom.card.addEventListener('pointerup', onPointerUp);
dom.card.addEventListener('pointercancel', onPointerUp);

dom.btnNext.addEventListener('click', goToNextCard);
dom.cardExplanation.addEventListener('click', goToNextCard);

dom.btnSwipeLeft.addEventListener('click', () => processChoice('left'));
dom.btnSwipeRight.addEventListener('click', () => processChoice('right'));
dom.btnIdk.addEventListener('click', handleDontKnow);

// --- 8. РОУТИНГ И НИЖНЯЯ НАВИГАЦИЯ (TabBar) ---
function switchTab(tabName) {
  state.currentTab = tabName;
  haptic.selection();

  dom.tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  dom.tabSwipes.classList.toggle('hidden', tabName !== 'swipes');
  dom.tabMistakes.classList.toggle('hidden', tabName !== 'mistakes');
  dom.tabProfile.classList.toggle('hidden', tabName !== 'profile');

  if (tabName === 'mistakes') renderMistakesScreen();
  if (tabName === 'profile') renderProfileScreen();
}

function updateMistakesBadge() {
  const count = state.storage.mistakesArray.length;
  dom.mistakesBadge.textContent = count;
  dom.mistakesBadge.classList.toggle('hidden', count === 0);
}

// --- 9. ЭКРАН «ОШИБКИ» ---
function renderMistakesScreen() {
  dom.mistakesList.innerHTML = '';

  // Фильтруем ошибки только из ТЕКУЩЕГО предмета
  const mistakeCards = state.currentSubjectData.filter(card =>
    state.storage.mistakesArray.includes(card.id)
  );

  if (mistakeCards.length === 0) {
    dom.mistakesList.innerHTML = `
      <div class="empty-state">
        🎉 Нет неотработанных ошибок по этому предмету!<br>Продолжай решать карточки.
      </div>
    `;
    return;
  }

  mistakeCards.forEach(card => {
    const item = document.createElement('div');
    item.className = 'mistake-item';
    const textTitle = card.fullWord || card.content || card.question || "";

    item.innerHTML = `
      <div class="mistake-header">
        <div>
          <div class="mistake-word">${textTitle}</div>
          <div class="mistake-theme">${card.taskId} • ${card.theme}</div>
        </div>
        <button class="btn-learned" type="button">Я выучил ✓</button>
      </div>
      <div class="mistake-explanation hidden">${card.explanation}</div>
    `;

    item.addEventListener('click', () => {
      haptic.selection();
      const expBox = item.querySelector('.mistake-explanation');
      expBox.classList.toggle('hidden');
    });

    const learnedBtn = item.querySelector('.btn-learned');
    learnedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      haptic.notify('success');
      state.storage.mistakesArray = state.storage.mistakesArray.filter(id => id !== card.id);
      saveStatsToStorage();
      renderMistakesScreen();
    });

    dom.mistakesList.appendChild(item);
  });
}

// --- 10. ЭКРАН «ПРОФИЛЬ» ---
function renderProfileScreen() {
  const tgUser = tg?.initDataUnsafe?.user;
  if (tgUser?.first_name) {
    dom.profileName.textContent = tgUser.first_name;
  }

  const { totalSwipes, correctAnswers } = state.storage;
  const winrate = totalSwipes > 0 ? Math.round((correctAnswers / totalSwipes) * 100) : 0;

  dom.profTotal.textContent = totalSwipes;
  dom.profWinrate.textContent = `${winrate}%`;
}

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

dom.tabButtons.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

updateMistakesBadge();
// renderCurrentCard() больше не вызываем при загрузке файла.
// Он вызовется сам, когда пользователь выберет предмет.