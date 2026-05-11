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

// ── Level / XP System ──
function getXP() { return parseInt(localStorage.getItem('uyghur_xp') || '0'); }
function saveXP(v) { localStorage.setItem('uyghur_xp', v); }

function getCurrentLevelData() {
  const xp = getXP();
  let lvl = UYGHUR_DATA.levels[0];
  for (const l of UYGHUR_DATA.levels) {
    if (xp >= l.xpRequired) lvl = l;
  }
  return lvl;
}

function getNextLevelData() {
  const xp = getXP();
  return UYGHUR_DATA.levels.find(l => l.xpRequired > xp) || null;
}

function addXP(amount) {
  const before = getCurrentLevelData();
  const newXP = getXP() + amount;
  saveXP(newXP);
  const after = getCurrentLevelData();
  updateLevelDisplay();
  if (after.level > before.level) showLevelUp(after);
}

function showLevelUp(lvl) {
  document.getElementById('lu-emoji').textContent = lvl.emoji;
  document.getElementById('lu-name').textContent = lvl.name;
  document.getElementById('lu-uyghur').textContent = lvl.uyghur;
  document.getElementById('lu-desc').textContent = lvl.desc;
  const overlay = document.getElementById('levelup-overlay');
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.add('hidden'), 4000);
}

function updateLevelDisplay() {
  const xp = getXP();
  const lvl = getCurrentLevelData();
  const next = getNextLevelData();

  document.querySelectorAll('.nav-level-badge').forEach(el => {
    el.textContent = `${lvl.emoji} ${lvl.name}`;
    el.style.background = lvl.color;
  });
  document.querySelectorAll('.nav-xp').forEach(el => el.textContent = `${xp} XP`);

  const pct = next
    ? Math.round(((xp - lvl.xpRequired) / (next.xpRequired - lvl.xpRequired)) * 100)
    : 100;
  document.querySelectorAll('.xp-bar-fill').forEach(el => {
    el.style.width = pct + '%';
    el.style.background = lvl.color;
  });
  document.querySelectorAll('.xp-bar-label').forEach(el => {
    el.textContent = next ? `${xp} / ${next.xpRequired} XP to ${next.name}` : `Max level reached! ${xp} XP`;
  });

  updateMasteryBadge();
  renderLevelCards();
}

function renderLevelCards() {
  const xp = getXP();
  const container = document.getElementById('level-cards');
  if (!container) return;
  container.innerHTML = UYGHUR_DATA.levels.map(l => {
    const unlocked = xp >= l.xpRequired;
    const isCurrent = getCurrentLevelData().level === l.level;
    return `
      <div class="level-card ${isCurrent ? 'level-card-current' : ''} ${!unlocked ? 'level-card-locked' : ''}"
           style="${isCurrent ? `border-color:${l.color};box-shadow:0 0 0 3px ${l.color}33` : ''}">
        <div class="level-card-emoji">${unlocked ? l.emoji : '🔒'}</div>
        <div class="level-card-name" style="${isCurrent ? `color:${l.color}` : ''}">${l.name}</div>
        <div class="level-card-uyghur">${l.uyghur}</div>
        <div class="level-card-xp">${unlocked ? (isCurrent ? 'Current level' : 'Unlocked ✓') : `Unlock at ${l.xpRequired} XP`}</div>
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
  if (id === 'vocab') renderVocabTable(currentVocabCategory);
  if (id === 'alphabet') renderAlphabet();
  if (id === 'phrases') renderPhrases();
}

// ── Alphabet ──
function renderAlphabet() {
  const grid = document.getElementById('alphabet-grid');
  grid.innerHTML = UYGHUR_DATA.alphabet.map((l, i) => `
    <div class="letter-card" onclick="showLetterDetail(${i})">
      <div class="letter-main">${l.letter}</div>
      <div class="letter-name">${l.name}</div>
      <div class="letter-latin">"${l.latin}"</div>
      <div class="letter-example">${l.example} = ${l.exampleEn}</div>
    </div>`).join('');
}

function showLetterDetail(idx) {
  const l = UYGHUR_DATA.alphabet[idx];
  showToast(`${l.letter} · ${l.name} · "${l.latin}" · ${l.example} (${l.exampleLatin}) = ${l.exampleEn}`);
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
  masteredWords[key] = !masteredWords[key];
  localStorage.setItem('uyghur_mastered', JSON.stringify(masteredWords));
  btn.textContent = masteredWords[key] ? '⭐' : '☆';
  btn.closest('tr').classList.toggle('mastered', masteredWords[key]);
  if (masteredWords[key]) addXP(5);
  updateMasteryBadge();
  showToast(masteredWords[key] ? 'Mastered! +5 XP ⭐' : 'Unmarked');
}

function updateMasteryBadge() {
  const total = Object.values(masteredWords).filter(Boolean).length;
  document.querySelectorAll('.mastery-count').forEach(el => el.textContent = total);
}

// ── Level Selector Helper ──
function buildLevelSelect(id, defaultVal) {
  const xp = getXP();
  return UYGHUR_DATA.levels.map(l => {
    const unlocked = xp >= l.xpRequired;
    return `<option value="${l.level}" ${l.level == defaultVal ? 'selected' : ''} ${!unlocked ? 'disabled' : ''}>
      ${l.emoji} Level ${l.level} — ${l.name} ${!unlocked ? `(${l.xpRequired} XP)` : ''}
    </option>`;
  }).join('');
}

function refreshLevelSelects() {
  document.querySelectorAll('.game-level-select').forEach(sel => {
    const val = sel.value;
    sel.innerHTML = buildLevelSelect(sel.id, val);
  });
}

// ── Flashcard Game ──
function startFlashcards(catOrLevel) {
  const levelSel = document.getElementById('fc-level-select');
  fcSelectedLevel = levelSel ? parseInt(levelSel.value) : 1;
  fcCategory = document.getElementById('fc-cat-select')?.value || 'all';

  if (fcCategory === 'all') {
    fcWords = shuffle(getWordsForLevel(fcSelectedLevel));
  } else {
    fcWords = shuffle(getCategoryWordsForLevel(fcCategory, fcSelectedLevel));
  }

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
    addXP(2);
    showToast('+2 XP');
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
    addXP(15);
    showToast('Correct! +15 XP ✅');
  } else {
    btn.classList.add('wrong');
    showToast('Not quite — answer: ' + correct);
  }
  setTimeout(() => { quizIdx++; renderQuizQuestion(); }, 1400);
}

function showQuizResult() {
  const pct = Math.round((quizScore / quizTotal) * 100);
  const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '👍' : '📚';
  document.getElementById('quiz-area').innerHTML = `
    <div style="text-align:center;background:white;border-radius:20px;padding:3rem 2rem;box-shadow:0 4px 20px rgba(0,0,0,.1)">
      <div style="font-size:4rem">${emoji}</div>
      <h2 style="font-size:2rem;margin:.5rem 0">Quiz Complete!</h2>
      <p style="font-size:1.3rem;color:#64748B;margin-bottom:1.5rem">
        <strong style="color:#2563EB">${quizScore} / ${quizTotal}</strong> correct (${pct}%)
      </p>
      <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap">
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
    addXP(10); showToast('Match! +10 XP ✅');
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
  document.getElementById('phrases-list').innerHTML = UYGHUR_DATA.phrases.map(p => `
    <div class="phrase-card">
      <div class="phrase-uyghur">${p.uyghur}</div>
      <div class="phrase-info">
        <div class="phrase-latin">${p.latin}</div>
        <div class="phrase-english">${p.english}</div>
      </div>
    </div>`).join('');
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
});
