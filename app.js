// ── State ──
let currentPage = 'home';
let currentVocabCategory = 'greetings';
let masteredWords = JSON.parse(localStorage.getItem('uyghur_mastered') || '{}');
let fcIndex = 0;
let fcCategory = 'greetings';
let fcShowAnswer = false;
let fcSelectedLevel = 1;
let fcWords = [];
let quizScore = 0;
let quizTotal = 0;
let quizWords = [];
let quizIdx = 0;
let quizAnswered = false;
let quizLevel = 1;
let matchSelected = null;
let matchedPairs = 0;
let matchWords = [];
let matchLevel = 1;

// ── XP (secondary, for games) ──
function getXP() { return parseInt(localStorage.getItem('uyghur_xp') || '0'); }
function saveXP(v) { localStorage.setItem('uyghur_xp', v); }
function addXP(amount) { saveXP(getXP() + amount); updateLevelDisplay(); }

// ── Level System (based on mastered word count) ──
function getMasteredWordCount() {
  let count = 0;
  Object.keys(UYGHUR_DATA.vocabulary).forEach(cat => {
    UYGHUR_DATA.vocabulary[cat].forEach((_, i) => {
      if (getWordProgress(cat, i) === 'mastered') count++;
    });
  });
  // also count words starred in vocab table
  Object.values(masteredWords).forEach(v => { if (v) count++; });
  // deduplicate: studySession mastered also sets masteredWords, so use max
  return Math.max(count,
    Object.values(masteredWords).filter(Boolean).length +
    Object.values(vocabProgress || {}).filter(v => v === 'mastered').length
  );
}

function getMasteredCount() {
  // Single source of truth: vocabProgress 'mastered' + starred words
  const fromStudy = Object.values(vocabProgress || {}).filter(v => v === 'mastered').length;
  const fromStars = Object.values(masteredWords).filter(Boolean).length;
  return Math.max(fromStudy, fromStars);
}

function getCurrentLevelData() {
  const count = getMasteredCount();
  let lvl = UYGHUR_DATA.levels[0];
  for (const l of UYGHUR_DATA.levels) {
    if (count >= l.wordsNeeded) lvl = l;
  }
  return lvl;
}

function getNextLevelData() {
  const count = getMasteredCount();
  return UYGHUR_DATA.levels.find(l => l.wordsNeeded > count) || null;
}

function checkLevelUp(beforeLevel) {
  const after = getCurrentLevelData();
  if (after.level > beforeLevel.level) showLevelUp(after);
}

function showLevelUp(lvl) {
  document.getElementById('lu-emoji').textContent = lvl.emoji;
  document.getElementById('lu-name').textContent = `Level ${lvl.level} · ${lvl.name}`;
  document.getElementById('lu-uyghur').textContent = lvl.uyghur;
  document.getElementById('lu-desc').textContent = lvl.desc;
  const overlay = document.getElementById('levelup-overlay');
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.add('hidden'), 4500);
}

function updateLevelDisplay() {
  const count = getMasteredCount();
  const lvl   = getCurrentLevelData();
  const next  = getNextLevelData();

  document.querySelectorAll('.nav-level-badge').forEach(el => {
    el.textContent = `${lvl.emoji} ${lvl.level} · ${lvl.name}`;
    el.style.background = lvl.color;
  });
  document.querySelectorAll('.nav-xp').forEach(el => el.textContent = `${count} words`);

  const pct = next
    ? Math.round(((count - lvl.wordsNeeded) / (next.wordsNeeded - lvl.wordsNeeded)) * 100)
    : 100;
  document.querySelectorAll('.xp-bar-fill').forEach(el => {
    el.style.width = pct + '%';
    el.style.background = lvl.color;
  });
  document.querySelectorAll('.xp-bar-label').forEach(el => {
    el.textContent = next
      ? `${count} / ${next.wordsNeeded} words mastered → Level ${next.level} ${next.name}`
      : `🏆 Max Level! ${count} words mastered`;
  });

  updateMasteryBadge();
  renderLevelCards();
}

function renderLevelCards() {
  const count = getMasteredCount();
  const container = document.getElementById('level-cards');
  if (!container) return;
  container.innerHTML = UYGHUR_DATA.levels.map(l => {
    const unlocked  = count >= l.wordsNeeded;
    const isCurrent = getCurrentLevelData().level === l.level;
    return `
      <div class="level-card ${isCurrent ? 'level-card-current' : ''} ${!unlocked ? 'level-card-locked' : ''}"
           style="${isCurrent ? `border-color:${l.color};box-shadow:0 0 0 3px ${l.color}33` : ''}">
        <div class="level-card-num" style="font-size:.7rem;font-weight:800;color:${unlocked ? l.color : '#94A3B8'};letter-spacing:.05em">LVL ${l.level}</div>
        <div class="level-card-emoji">${unlocked ? l.emoji : '🔒'}</div>
        <div class="level-card-name" style="${isCurrent ? `color:${l.color}` : ''}">${l.name}</div>
        <div class="level-card-uyghur">${l.uyghur}</div>
        <div class="level-card-xp">${unlocked ? (isCurrent ? '▶ Current level' : '✓ Unlocked') : `Master ${l.wordsNeeded} words`}</div>
      </div>`;
  }).join('');
}

function getWordsForLevel(maxLevel) {
  const all = [];
  Object.entries(UYGHUR_DATA.vocabulary).forEach(([cat, words]) => {
    words.forEach(w => { if (w.level <= maxLevel) all.push({ ...w, cat }); });
  });
  return all;
}

function getCategoryWordsForLevel(category, maxLevel) {
  return UYGHUR_DATA.vocabulary[category].filter(w => w.level <= maxLevel);
}

// ── Navigation ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.getElementById('nav-' + id).classList.add('active');
  currentPage = id;
  window.scrollTo(0, 0);
  if (id === 'vocab')    renderVocabTable(currentVocabCategory);
  if (id === 'alphabet') { renderAlphabet(); buildPronunTable(); }
  if (id === 'phrases')  renderPhrases();
  if (id === 'study')    renderStudyHome();
  if (id === 'games')    updateLevelTestHint();
  if (typeof closeMobileMenu === 'function') closeMobileMenu();
}

// ── Vocabulary Builder ──
const STUDY_CATS = {
  greetings:  { name: 'Greetings',   emoji: '👋',  color: '#10B981' },
  numbers:    { name: 'Numbers',     emoji: '🔢',  color: '#3B82F6' },
  family:     { name: 'Family',      emoji: '👨‍👩‍👧',  color: '#F97316' },
  colors:     { name: 'Colors',      emoji: '🎨',  color: '#EC4899' },
  food:       { name: 'Food',        emoji: '🍎',  color: '#EF4444' },
  animals:    { name: 'Animals',     emoji: '🐾',  color: '#8B5CF6' },
  body:       { name: 'Body',        emoji: '🫀',  color: '#F59E0B' },
  clothing:   { name: 'Clothing',    emoji: '👕',  color: '#06B6D4' },
  nature:     { name: 'Nature',      emoji: '🌿',  color: '#22C55E' },
  school:     { name: 'School',      emoji: '📚',  color: '#6366F1' },
  home:       { name: 'Home',        emoji: '🏠',  color: '#A16207' },
  time:       { name: 'Time & Days', emoji: '⏰',  color: '#0891B2' },
  adjectives: { name: 'Adjectives',  emoji: '✨',  color: '#7C3AED' },
  verbs:      { name: 'Verbs',       emoji: '⚡',  color: '#DC2626' },
  city:       { name: 'City',        emoji: '🏙️',  color: '#475569' },
  emotions:   { name: 'Emotions',    emoji: '💙',  color: '#DB2777' },
  transport:  { name: 'Transport',   emoji: '🚌',  color: '#059669' },
  sports:     { name: 'Sports',      emoji: '⚽',  color: '#16A34A' },
  weather:    { name: 'Weather',     emoji: '☀️',  color: '#0EA5E9' },
  music:      { name: 'Music',       emoji: '🎵',  color: '#A855F7' },
  food2:      { name: 'Uyghur Food', emoji: '🥘',  color: '#B45309' },
  body2:      { name: 'Body II',     emoji: '💪',  color: '#D97706' },
  greetings2: { name: 'Greetings II',emoji: '🤝',  color: '#0D9488' },
  school2:    { name: 'School II',   emoji: '✏️',  color: '#4F46E5' },
  nature2:    { name: 'Nature II',   emoji: '🏔️',  color: '#15803D' },
  home2:      { name: 'Home II',     emoji: '🪴',  color: '#92400E' },
  colors2:    { name: 'Colors II',   emoji: '🌈',  color: '#BE185D' },
};

let vocabProgress = JSON.parse(localStorage.getItem('uyghur_vocab_progress') || '{}');
let studyWords = [];
let studyIdx = 0;
let studyFlipped = false;
let studyKnownCount = 0;
let studyPracticingCount = 0;
let studyXPEarned = 0;
let currentStudyCat = '';

function saveVocabProgress() {
  localStorage.setItem('uyghur_vocab_progress', JSON.stringify(vocabProgress));
}
function getWordProgress(cat, idx) { return vocabProgress[`${cat}_${idx}`] || 'new'; }
function setWordProgress(cat, idx, status) {
  vocabProgress[`${cat}_${idx}`] = status;
  saveVocabProgress();
}

function renderStudyHome() {
  const grid = document.getElementById('study-cats-grid');
  if (!grid) return;
  grid.innerHTML = Object.entries(STUDY_CATS).map(([key, meta]) => {
    const words = UYGHUR_DATA.vocabulary[key];
    if (!words) return '';
    const total    = words.length;
    const mastered = words.filter((_, i) => getWordProgress(key, i) === 'mastered').length;
    const learning = words.filter((_, i) => getWordProgress(key, i) === 'learning').length;
    const pct = total ? Math.round((mastered / total) * 100) : 0;
    const allDone  = mastered === total;
    return `
      <div class="study-cat-card" onclick="startStudySession('${key}')"
           style="border-top:4px solid ${meta.color}">
        <div class="study-cat-top">
          <span class="study-cat-emoji">${meta.emoji}</span>
          <span class="study-cat-name">${meta.name}</span>
        </div>
        <div class="study-cat-stats">
          <span style="color:${meta.color};font-weight:700">${mastered}/${total}</span> mastered
          ${learning ? `<span style="color:#F59E0B"> · ${learning} learning</span>` : ''}
        </div>
        <div class="study-cat-bar"><div class="study-cat-bar-fill" style="width:${pct}%;background:${meta.color}"></div></div>
        <button class="study-cat-btn" style="background:${meta.color}">
          ${allDone ? '🔄 Review All' : mastered === 0 && learning === 0 ? '🌱 Start' : '📖 Continue'}
        </button>
      </div>`;
  }).join('');
}

function startStudySession(cat) {
  currentStudyCat = cat;
  const words = UYGHUR_DATA.vocabulary[cat] || [];
  const allMastered = words.every((_, i) => getWordProgress(cat, i) === 'mastered');

  let pool = [];
  if (allMastered) {
    pool = words.map((w, i) => ({ word: w, cat, idx: i }));
  } else {
    const learning = [], fresh = [];
    words.forEach((w, i) => {
      const p = getWordProgress(cat, i);
      if (p === 'learning') learning.push({ word: w, cat, idx: i });
      else if (p === 'new') fresh.push({ word: w, cat, idx: i });
    });
    pool = [...learning, ...fresh].slice(0, 10);
  }

  studyWords = shuffle(pool);
  studyIdx = 0; studyFlipped = false;
  studyKnownCount = 0; studyPracticingCount = 0; studyXPEarned = 0;

  document.getElementById('study-home').classList.add('hidden');
  document.getElementById('study-complete').classList.add('hidden');
  document.getElementById('study-session').classList.remove('hidden');
  showStudyCard();
}

function showStudyCard() {
  if (studyIdx >= studyWords.length) { showStudyComplete(); return; }
  const { word, cat, idx } = studyWords[studyIdx];
  const meta = STUDY_CATS[cat];
  const lvl  = UYGHUR_DATA.levels[word.level - 1];
  studyFlipped = false;

  document.getElementById('study-card-inner').classList.remove('flipped');
  document.getElementById('study-actions').classList.add('hidden');

  const pct = Math.round((studyIdx / studyWords.length) * 100);
  document.getElementById('study-progress').style.width = pct + '%';
  document.getElementById('study-counter').textContent = `${studyIdx + 1} / ${studyWords.length}`;
  document.getElementById('study-cat-badge').textContent = `${meta.emoji} ${meta.name}`;
  document.getElementById('study-cat-badge').style.background = meta.color;

  document.getElementById('study-level-pill').textContent = `${lvl.emoji} ${lvl.name}`;
  document.getElementById('study-level-pill').style.background = lvl.color;
  document.getElementById('study-word-uyghur').textContent = word.uyghur;

  document.getElementById('study-word-english').textContent = word.english;
  document.getElementById('study-word-latin').textContent   = word.latin;
  document.getElementById('study-word-tip').textContent     = '💡 ' + word.tip;

  // Color the card faces
  document.getElementById('study-front').style.background =
    `linear-gradient(135deg, ${meta.color}dd, ${meta.color}99)`;
  document.getElementById('study-back').style.background =
    `linear-gradient(135deg, ${meta.color}bb, ${meta.color}77)`;
}

function flipStudyCard() {
  if (studyFlipped) return;
  studyFlipped = true;
  document.getElementById('study-card-inner').classList.add('flipped');
  setTimeout(() => document.getElementById('study-actions').classList.remove('hidden'), 350);
  speakStudyWord();
}

function speakStudyWord() {
  if (studyIdx >= studyWords.length || !window.speechSynthesis) return;
  const { word } = studyWords[studyIdx];
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(`${word.latin}. ${word.english}.`);
  utt.lang = 'en-US'; utt.rate = 0.8;
  window.speechSynthesis.speak(utt);
}

function markStudyWord(known) {
  if (studyIdx >= studyWords.length) return;
  const { cat, idx } = studyWords[studyIdx];

  if (known) {
    const beforeLevel = getCurrentLevelData();
    setWordProgress(cat, idx, 'mastered');
    masteredWords[`${cat}_${idx}`] = true;
    localStorage.setItem('uyghur_mastered', JSON.stringify(masteredWords));
    studyKnownCount++;
    addXP(1); studyXPEarned += 1;
    showToast('Know it! ✓');
    checkLevelUp(beforeLevel);
  } else {
    setWordProgress(cat, idx, 'learning');
    studyPracticingCount++;
    showToast('Noted — will come back 🔄');
  }
  studyIdx++;
  showStudyCard();
}

function showStudyComplete() {
  document.getElementById('study-session').classList.add('hidden');
  document.getElementById('study-complete').classList.remove('hidden');
  const pct = studyWords.length ? Math.round((studyKnownCount / studyWords.length) * 100) : 0;
  document.getElementById('study-done-emoji').textContent =
    pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪';
  document.getElementById('study-done-known').textContent     = studyKnownCount;
  document.getElementById('study-done-practicing').textContent = studyPracticingCount;
  document.getElementById('study-done-xp').textContent        = studyXPEarned;
  updateLevelDisplay();
}

function repeatStudySession() { if (currentStudyCat) startStudySession(currentStudyCat); }

function backToStudyHome() {
  document.getElementById('study-session').classList.add('hidden');
  document.getElementById('study-complete').classList.add('hidden');
  document.getElementById('study-home').classList.remove('hidden');
  window.speechSynthesis && window.speechSynthesis.cancel();
  renderStudyHome();
}

// ── Alphabet ──
const LETTER_COLORS = [
  '#EF4444','#F97316','#F59E0B','#10B981',
  '#06B6D4','#3B82F6','#8B5CF6','#EC4899',
  '#EF4444','#F97316','#F59E0B','#10B981',
  '#06B6D4','#3B82F6','#8B5CF6','#EC4899',
  '#EF4444','#F97316','#F59E0B','#10B981',
  '#06B6D4','#3B82F6','#8B5CF6','#EC4899',
  '#EF4444','#F97316','#F59E0B','#10B981',
  '#06B6D4','#3B82F6','#8B5CF6','#EC4899',
];

let currentLetterIdx = -1;

function renderAlphabet() {
  const grid = document.getElementById('alphabet-grid');
  grid.innerHTML = UYGHUR_DATA.alphabet.map((l, i) => {
    const color = LETTER_COLORS[i];
    return `
      <div class="letter-card" onclick="showLetterDetail(${i})"
           style="background:linear-gradient(135deg,${color},${color}cc)">
        <div class="letter-card-number">${i + 1}</div>
        <div class="letter-card-emoji">${l.emoji}</div>
        <div class="letter-main">${l.letter}</div>
        <div class="letter-name">${l.name}</div>
        <div class="letter-latin">"${l.latin}"</div>
      </div>`;
  }).join('');
}

function showLetterDetail(idx) {
  currentLetterIdx = idx;
  const l = UYGHUR_DATA.alphabet[idx];
  const color = LETTER_COLORS[idx];

  document.getElementById('lm-color-bar').style.background = color;
  document.getElementById('lm-emoji-big').textContent = l.emoji;
  document.getElementById('lm-letter-big').textContent = l.letter;
  document.getElementById('lm-letter-big').style.color = color;
  document.getElementById('lm-name').textContent = l.name;
  const typeBadge = document.getElementById('lm-type-badge');
  typeBadge.textContent = l.type === 'vowel' ? '🔵 vowel' : '🟠 consonant';
  typeBadge.style.background = l.type === 'vowel' ? '#DBEAFE' : '#FEF3C7';
  typeBadge.style.color = l.type === 'vowel' ? '#1D4ED8' : '#92400E';
  document.getElementById('lm-romanization').textContent = `Latin: "${l.latin}"`;
  document.getElementById('lm-ipa').textContent = `IPA: /${l.ipa}/`;
  document.getElementById('lm-how-to-read').textContent = '🔊 ' + l.howToRead;
  document.getElementById('lm-how-to-read').style.color = color;
  document.getElementById('lm-example-uyghur').textContent = l.example;
  document.getElementById('lm-example-latin').textContent = l.exampleLatin;
  document.getElementById('lm-example-en').textContent = l.exampleEn;
  document.getElementById('lm-listen-btn').style.background = color;

  document.getElementById('letter-modal-overlay').classList.remove('hidden');
  speakCurrentLetter();
}

// ── Pronunciation guide table ──
function togglePronunGuide() {
  const guide = document.getElementById('pronun-guide');
  const btn   = document.querySelector('.pronun-toggle-btn');
  const nowHidden = guide.classList.toggle('hidden');
  btn.textContent = nowHidden ? '📖 Show Pronunciation Guide' : '📖 Hide Pronunciation Guide';
  if (!nowHidden && !document.getElementById('pronun-table').innerHTML) {
    buildPronunTable();
  }
}

function buildPronunTable() {
  document.getElementById('pronun-table').innerHTML =
    UYGHUR_DATA.alphabet.map((l, i) => `
      <div class="pronun-row" onclick="showLetterDetail(${i})">
        <span class="pronun-arabic">${l.letter}</span>
        <span class="pronun-name-col" style="direction:rtl">${l.name}</span>
        <span class="pronun-latin-col">${l.latin}</span>
        <span class="pronun-ipa-col">/${l.ipa}/</span>
        <span class="pronun-type-col" style="color:${l.type==='vowel'?'#1D4ED8':'#92400E'};font-size:.75rem;font-weight:700">${l.type}</span>
        <span class="pronun-how-col">${l.howToRead}</span>
      </div>`).join('');
}

function closeLetterModal() {
  document.getElementById('letter-modal-overlay').classList.add('hidden');
  window.speechSynthesis && window.speechSynthesis.cancel();
}

function handleLetterOverlayClick(e) {
  if (e.target === document.getElementById('letter-modal-overlay')) closeLetterModal();
}

function navLetter(dir) {
  const next = (currentLetterIdx + dir + UYGHUR_DATA.alphabet.length) % UYGHUR_DATA.alphabet.length;
  showLetterDetail(next);
}

function speakCurrentLetter() {
  if (currentLetterIdx < 0 || !window.speechSynthesis) return;
  const l = UYGHUR_DATA.alphabet[currentLetterIdx];
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(
    `${l.name}. ${l.exampleLatin}. ${l.exampleEn}.`
  );
  utt.lang = 'en-US';
  utt.rate = 0.8;
  utt.pitch = 1.05;
  window.speechSynthesis.speak(utt);
}

// ── Vocabulary Table ──
function renderVocabTable(category) {
  currentVocabCategory = category;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === category));
  const words = UYGHUR_DATA.vocabulary[category];
  document.getElementById('vocab-tbody').innerHTML = words.map((w, i) => {
    const key = category + '_' + i;
    const isMastered = masteredWords[key];
    const lvl = UYGHUR_DATA.levels[w.level - 1];
    return `
      <tr class="${isMastered ? 'mastered' : ''}" onclick="highlightRow(this)">
        <td class="row-num">${i + 1}</td>
        <td class="uyghur-cell">${w.uyghur}</td>
        <td class="latin-cell">${w.latin}</td>
        <td class="english-cell">${w.english}</td>
        <td class="tip-cell">${w.tip}</td>
        <td><span class="level-pip" style="background:${lvl.color}" title="Level ${w.level}: ${lvl.name}">${lvl.emoji}</span></td>
        <td>
          <button class="star-btn" onclick="toggleMastered(event,'${key}',this)" title="Mark as mastered">
            ${isMastered ? '⭐' : '☆'}
          </button>
        </td>
      </tr>`;
  }).join('');
  updateMasteryBadge();
}

function highlightRow(row) {
  document.querySelectorAll('#vocab-tbody tr').forEach(r => r.style.background = '');
  row.style.background = '#DBEAFE';
}

function toggleMastered(e, key, btn) {
  e.stopPropagation();
  const beforeLevel = getCurrentLevelData();
  masteredWords[key] = !masteredWords[key];
  localStorage.setItem('uyghur_mastered', JSON.stringify(masteredWords));
  btn.textContent = masteredWords[key] ? '⭐' : '☆';
  btn.closest('tr').classList.toggle('mastered', masteredWords[key]);
  if (masteredWords[key]) { addXP(1); checkLevelUp(beforeLevel); }
  updateMasteryBadge();
  showToast(masteredWords[key] ? 'Mastered! ⭐' : 'Unmarked');
}

function updateMasteryBadge() {
  const total = Object.values(masteredWords).filter(Boolean).length;
  document.querySelectorAll('.mastery-count').forEach(el => el.textContent = total);
}

// ── Difficulty Selector Helper (for games — uses word tier 1-6) ──
const DIFFICULTY_TIERS = [
  { tier: 1, label: 'Tier 1 — Beginner',           emoji: '🌱' },
  { tier: 2, label: 'Tier 2 — Elementary',          emoji: '📗' },
  { tier: 3, label: 'Tier 3 — Intermediate',        emoji: '⭐' },
  { tier: 4, label: 'Tier 4 — Upper-Intermediate',  emoji: '🌟' },
  { tier: 5, label: 'Tier 5 — Advanced',            emoji: '🏆' },
  { tier: 6, label: 'Tier 6 — Expert',              emoji: '💎' },
];

function buildLevelSelect(id, defaultVal) {
  return DIFFICULTY_TIERS.map(t =>
    `<option value="${t.tier}" ${t.tier == defaultVal ? 'selected' : ''}>${t.emoji} ${t.label}</option>`
  ).join('');
}

function refreshLevelSelects() {
  document.querySelectorAll('.game-level-select').forEach(sel => {
    const val = sel.value;
    sel.innerHTML = buildLevelSelect(sel.id, val);
  });
}

// ── Flashcard Game ──
function startRandomPractice() {
  const cat   = document.getElementById('rp-cat-select')?.value || 'all';
  const count = parseInt(document.getElementById('rp-count-select')?.value) || 10;
  const allWords = Object.entries(UYGHUR_DATA.vocabulary).flatMap(([c, ws]) => ws.map(w => ({ ...w, cat: c })));
  const pool  = cat === 'all'
    ? allWords
    : allWords.filter(w => w.cat === cat);
  if (pool.length === 0) { showToast('No words in this category yet!'); return; }
  fcWords         = shuffle([...pool]).slice(0, count);
  fcCategory      = cat;
  fcSelectedLevel = 0;
  fcIndex         = 0;
  fcShowAnswer    = false;
  document.getElementById('game-select').classList.add('hidden');
  document.getElementById('flashcard-area').style.display = 'block';
  renderFlashcard();
}

function startFlashcards(catOrLevel) {
  const levelSel = document.getElementById('fc-level-select');
  fcSelectedLevel = levelSel ? parseInt(levelSel.value) : 1;
  fcCategory = document.getElementById('fc-cat-select')?.value || 'all';
  const countVal = document.getElementById('fc-count-select')?.value || 'all';

  let pool;
  if (fcCategory === 'all') {
    pool = shuffle(getWordsForLevel(fcSelectedLevel));
  } else {
    pool = shuffle(getCategoryWordsForLevel(fcCategory, fcSelectedLevel));
  }

  fcWords = countVal === 'all' ? pool : pool.slice(0, parseInt(countVal));

  if (fcWords.length === 0) {
    showToast('No words for this level yet — try a higher level!');
    return;
  }

  fcIndex = 0;
  fcShowAnswer = false;
  document.getElementById('game-select').classList.add('hidden');
  document.getElementById('flashcard-area').style.display = 'block';
  renderFlashcard();
}

function renderFlashcard() {
  const w = fcWords[fcIndex];
  fcShowAnswer = false;
  const lvl = UYGHUR_DATA.levels[w.level - 1];

  document.getElementById('fc-counter').textContent =
    `Card ${fcIndex + 1} of ${fcWords.length} · Level ${fcSelectedLevel} · ${w.cat ? capitalize(w.cat) : ''}`;
  document.getElementById('fc-uyghur').textContent = w.uyghur;
  document.getElementById('fc-latin').textContent = w.latin;
  document.getElementById('fc-level-pip').textContent = `${lvl.emoji} ${lvl.name}`;
  document.getElementById('fc-level-pip').style.background = lvl.color;
  document.getElementById('fc-answer').classList.add('hidden');
  document.getElementById('fc-tip').classList.add('hidden');
  document.getElementById('fc-hint').textContent = 'Tap card to reveal answer';
  document.getElementById('fc-progress').style.width = ((fcIndex + 1) / fcWords.length * 100) + '%';
}

function flipCard() {
  const w = fcWords[fcIndex];
  if (!fcShowAnswer) {
    document.getElementById('fc-answer').textContent = w.english;
    document.getElementById('fc-answer').classList.remove('hidden');
    document.getElementById('fc-tip').textContent = 'Pronunciation: ' + w.tip;
    document.getElementById('fc-tip').classList.remove('hidden');
    document.getElementById('fc-hint').textContent = '✅ Got it? Press Next  ·  ❌ Press Shuffle';
    fcShowAnswer = true;
    addXP(1);
    showToast('+1 XP');
  }
}

function fcNext() { fcIndex = (fcIndex + 1) % fcWords.length; renderFlashcard(); }
function fcPrev() { fcIndex = (fcIndex - 1 + fcWords.length) % fcWords.length; renderFlashcard(); }
function fcShuffle() { fcWords = shuffle(fcWords); fcIndex = 0; renderFlashcard(); showToast('Shuffled!'); }

function stopGame() {
  document.getElementById('game-select').classList.remove('hidden');
  document.getElementById('flashcard-area').style.display = 'none';
  document.getElementById('quiz-area').style.display = 'none';
  document.getElementById('match-area').style.display = 'none';
  refreshLevelSelects();
}

// ── Level Test ──
let isLevelTest = false;

function updateLevelTestHint() {
  const hint = document.getElementById('level-test-hint');
  if (!hint) return;
  const count = getMasteredCount();
  const lvl   = getCurrentLevelData();
  const next  = getNextLevelData();
  hint.textContent = next
    ? `Level ${lvl.level} ${lvl.emoji} ${lvl.name} · ${count} words mastered · Master ${next.wordsNeeded} words to reach Level ${next.level} ${next.name}`
    : '🏆 You have reached the highest level — Fluent!';
}

function startLevelTest() {
  const lvl = getCurrentLevelData();
  isLevelTest = true;
  quizLevel = lvl.level;
  quizWords = shuffle(getWordsForLevel(lvl.level)).slice(0, 15);
  quizIdx = 0; quizScore = 0; quizTotal = quizWords.length;

  document.getElementById('game-select').classList.add('hidden');
  const area = document.getElementById('quiz-area');
  area.style.display = 'block';
  area.innerHTML = `
    <button class="btn btn-outline" style="border-color:#64748B;color:#64748B;margin-bottom:1rem" onclick="stopGame()">← Back</button>
    <div style="text-align:center;background:${lvl.color}18;border:2px solid ${lvl.color};border-radius:14px;padding:.75rem;margin-bottom:1rem;font-weight:700;color:${lvl.color}">
      🎯 Level Test — Level ${lvl.level} ${lvl.emoji} ${lvl.name} &nbsp;·&nbsp; Pass 80%+ to level up!
    </div>
    <div class="quiz-score" id="quiz-score"></div>
    <div class="progress-bar"><div class="progress-fill" id="quiz-progress" style="width:0%"></div></div>
    <div class="quiz-question">
      <div class="quiz-word" id="quiz-word"></div>
      <div class="quiz-latin" id="quiz-latin"></div>
    </div>
    <div class="quiz-options" id="quiz-options"></div>`;
  renderQuizQuestion();
}

// ── Quiz Game ──
function startQuiz() {
  const sel = document.getElementById('quiz-level-select');
  quizLevel = sel ? parseInt(sel.value) : 1;
  quizWords = shuffle(getWordsForLevel(quizLevel)).slice(0, 15);
  quizIdx = 0; quizScore = 0; quizTotal = quizWords.length;

  document.getElementById('game-select').classList.add('hidden');
  const area = document.getElementById('quiz-area');
  area.style.display = 'block';
  area.innerHTML = `
    <button class="btn btn-outline" style="border-color:#64748B;color:#64748B;margin-bottom:1.25rem" onclick="stopGame()">← Back</button>
    <div class="quiz-score" id="quiz-score"></div>
    <div class="progress-bar"><div class="progress-fill" id="quiz-progress" style="width:0%"></div></div>
    <div class="quiz-question">
      <div class="quiz-word" id="quiz-word"></div>
      <div class="quiz-latin" id="quiz-latin"></div>
    </div>
    <div class="quiz-options" id="quiz-options"></div>`;
  renderQuizQuestion();
}

function renderQuizQuestion() {
  if (quizIdx >= quizWords.length) { showQuizResult(); return; }
  const w = quizWords[quizIdx];
  quizAnswered = false;
  document.getElementById('quiz-score').textContent = `Score: ${quizScore} / ${quizTotal} · Q${quizIdx + 1} of ${quizTotal}`;
  document.getElementById('quiz-word').textContent = w.uyghur;
  document.getElementById('quiz-latin').textContent = w.latin;
  document.getElementById('quiz-progress').style.width = (quizIdx / quizTotal * 100) + '%';

  const pool = getWordsForLevel(quizLevel);
  const wrongs = shuffle(pool.filter(x => x.english !== w.english)).slice(0, 3);
  const options = shuffle([w, ...wrongs]);
  document.getElementById('quiz-options').innerHTML = options.map(opt => `
    <button class="quiz-opt" onclick="checkAnswer(this,'${escStr(opt.english)}','${escStr(w.english)}')">
      ${opt.english}
    </button>`).join('');
}

function checkAnswer(btn, chosen, correct) {
  if (quizAnswered) return;
  quizAnswered = true;
  document.querySelectorAll('.quiz-opt').forEach(b => {
    if (b.textContent.trim() === correct) b.classList.add('correct');
  });
  if (chosen === correct) {
    btn.classList.add('correct');
    quizScore++;
    addXP(1);
    showToast('Correct! +1 XP ✅');
  } else {
    btn.classList.add('wrong');
    showToast('Not quite — answer: ' + correct);
  }
  setTimeout(() => { quizIdx++; renderQuizQuestion(); }, 1400);
}

function showQuizResult() {
  const pct = Math.round((quizScore / quizTotal) * 100);
  const passed = pct >= 80;
  let headline, emoji, extra = '';

  if (isLevelTest) {
    isLevelTest = false;
    const lvl  = getCurrentLevelData();
    const next = getNextLevelData();
    if (passed) {
      addXP(1);
      emoji    = '🏆';
      headline = 'Level Test Passed!';
      extra    = `<p style="color:#10B981;font-weight:700;font-size:1.1rem;margin-bottom:.5rem">🎉 Great work!</p>
                  ${next ? `<p style="color:#64748B">Keep going — master ${next.wordsNeeded} words total to reach Level ${next.level} ${next.emoji} ${next.name}!</p>` : '<p style="color:#8B5CF6">You\'ve reached the highest level! 🌟</p>'}`;
    } else {
      emoji    = '💪';
      headline = `Level ${lvl.level} ${lvl.emoji} ${lvl.name} — Keep Practicing!`;
      extra    = `<p style="color:#64748B;margin-bottom:.5rem">You need 80% to pass. Practice more and try again!</p>
                  <p style="color:#64748B;font-size:.9rem">Use 📚 Vocabulary Builder and 🃏 Flashcards to study.</p>`;
    }
  } else {
    emoji    = passed ? '🏆' : pct >= 60 ? '👍' : '📚';
    headline = 'Quiz Complete!';
  }

  document.getElementById('quiz-area').innerHTML = `
    <div style="text-align:center;background:white;border-radius:20px;padding:3rem 2rem;box-shadow:0 4px 20px rgba(0,0,0,.1)">
      <div style="font-size:4rem">${emoji}</div>
      <h2 style="font-size:2rem;margin:.5rem 0">${headline}</h2>
      <p style="font-size:1.3rem;color:#64748B;margin-bottom:1rem">
        <strong style="color:#2563EB">${quizScore} / ${quizTotal}</strong> correct (${pct}%)
      </p>
      ${extra}
      <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-top:1.5rem">
        <button class="btn btn-primary" onclick="startQuiz()">Try Again</button>
        <button class="btn btn-outline" style="border-color:#2563EB;color:#2563EB" onclick="stopGame()">Back to Games</button>
      </div>
    </div>`;
}

// ── Matching Game ──
function startMatching() {
  const sel = document.getElementById('match-level-select');
  matchLevel = sel ? parseInt(sel.value) : 1;
  const pool = getWordsForLevel(matchLevel);
  matchWords = shuffle(pool).slice(0, 6);
  matchedPairs = 0; matchSelected = null;

  document.getElementById('game-select').classList.add('hidden');
  document.getElementById('match-area').style.display = 'block';
  document.getElementById('match-score').textContent = `Matched: 0 / ${matchWords.length}`;

  document.getElementById('match-uyghur-col').innerHTML =
    shuffle([...matchWords]).map(w => `
      <div class="match-tile uyghur-tile" data-word="${escStr(w.english)}" data-side="uyghur" onclick="selectMatchTile(this)">
        ${w.uyghur}
      </div>`).join('');

  document.getElementById('match-english-col').innerHTML =
    shuffle([...matchWords]).map(w => `
      <div class="match-tile" data-word="${escStr(w.english)}" data-side="english" onclick="selectMatchTile(this)">
        ${w.english}
      </div>`).join('');
}

function selectMatchTile(tile) {
  if (tile.classList.contains('matched')) return;
  if (!matchSelected) { tile.classList.add('selected'); matchSelected = tile; return; }
  if (matchSelected === tile) { tile.classList.remove('selected'); matchSelected = null; return; }
  if (matchSelected.dataset.side === tile.dataset.side) {
    matchSelected.classList.remove('selected');
    matchSelected = tile; tile.classList.add('selected'); return;
  }
  const a = matchSelected, b = tile;
  matchSelected = null;
  if (a.dataset.word === b.dataset.word) {
    a.classList.remove('selected'); a.classList.add('matched'); b.classList.add('matched');
    matchedPairs++;
    document.getElementById('match-score').textContent = `Matched: ${matchedPairs} / ${matchWords.length}`;
    addXP(1); showToast('Match! +1 XP ✅');
    if (matchedPairs === matchWords.length) {
      setTimeout(() => { showToast('All matched! 🎉 New round…'); setTimeout(startMatching, 1500); }, 400);
    }
  } else {
    a.classList.add('wrong'); b.classList.add('wrong');
    setTimeout(() => { a.classList.remove('wrong','selected'); b.classList.remove('wrong'); }, 700);
    showToast('Keep trying! 💪');
  }
}

// ── Phrases ──
function renderPhrases() {
  document.getElementById('phrases-list').innerHTML = UYGHUR_DATA.phraseGroups.map((g, gi) => `
    <div class="phrase-group">
      <div class="phrase-group-header" onclick="togglePhraseGroup(${gi})">
        <span class="phrase-group-emoji">${g.emoji}</span>
        <span class="phrase-group-name">${g.name}</span>
        <span class="phrase-group-count">${g.phrases.length} phrases</span>
        <span class="phrase-group-arrow" id="pg-arrow-${gi}">▼</span>
      </div>
      <div class="phrase-group-body" id="pg-body-${gi}">
        ${g.phrases.map(p => `
          <div class="phrase-card">
            <div class="phrase-uyghur">${p.uyghur}</div>
            <div class="phrase-info">
              <div class="phrase-latin">${p.latin}</div>
              <div class="phrase-english">${p.english}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function togglePhraseGroup(idx) {
  const body  = document.getElementById(`pg-body-${idx}`);
  const arrow = document.getElementById(`pg-arrow-${idx}`);
  const collapsed = body.classList.toggle('collapsed');
  if (arrow) arrow.textContent = collapsed ? '▶' : '▼';
}

// ── Helpers ──
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escStr(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  showPage('home');
  updateLevelDisplay();
  refreshLevelSelects();
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLetterModal();
    if (e.key === 'ArrowRight' && currentLetterIdx >= 0) navLetter(1);
    if (e.key === 'ArrowLeft'  && currentLetterIdx >= 0) navLetter(-1);
  });
});
