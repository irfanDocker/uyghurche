// ── State ──
let currentPage = 'home';
let currentVocabCategory = 'greetings';
let masteredWords = JSON.parse(localStorage.getItem('uyghur_mastered') || '{}');
let fcIndex = 0;
let fcCategory = 'greetings';
let fcShowAnswer = false;
let quizScore = 0;
let quizTotal = 0;
let quizWords = [];
let quizIdx = 0;
let quizAnswered = false;
let matchSelected = null;
let matchedPairs = 0;
let matchWords = [];

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
    </div>
  `).join('');
}

function showLetterDetail(idx) {
  const l = UYGHUR_DATA.alphabet[idx];
  showToast(`${l.letter} · ${l.name} · "${l.latin}" · Example: ${l.example} (${l.exampleLatin}) = ${l.exampleEn}`);
}

// ── Vocabulary Table (Excel-style) ──
function renderVocabTable(category) {
  currentVocabCategory = category;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === category);
  });

  const words = UYGHUR_DATA.vocabulary[category];
  const tbody = document.getElementById('vocab-tbody');
  tbody.innerHTML = words.map((w, i) => {
    const key = category + '_' + i;
    const isMastered = masteredWords[key];
    return `
      <tr class="${isMastered ? 'mastered' : ''}" onclick="highlightRow(this)">
        <td class="row-num">${i + 1}</td>
        <td class="uyghur-cell">${w.uyghur}</td>
        <td class="latin-cell">${w.latin}</td>
        <td class="english-cell">${w.english}</td>
        <td class="tip-cell">${w.tip}</td>
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
  updateMasteryBadge();
  showToast(masteredWords[key] ? 'Marked as mastered! ⭐' : 'Unmarked');
}

function updateMasteryBadge() {
  const total = Object.keys(masteredWords).filter(k => masteredWords[k]).length;
  const el = document.getElementById('mastery-count');
  if (el) el.textContent = total;
}

// ── Flashcard Game ──
function startFlashcards(category) {
  fcCategory = category || currentVocabCategory;
  fcIndex = 0;
  fcShowAnswer = false;
  document.getElementById('game-select').classList.add('hidden');
  document.getElementById('flashcard-area').style.display = 'block';
  renderFlashcard();
}

function renderFlashcard() {
  const words = UYGHUR_DATA.vocabulary[fcCategory];
  const w = words[fcIndex];
  fcShowAnswer = false;

  document.getElementById('fc-counter').textContent = `Card ${fcIndex + 1} of ${words.length} · ${capitalize(fcCategory)}`;
  document.getElementById('fc-uyghur').textContent = w.uyghur;
  document.getElementById('fc-latin').textContent = w.latin;
  document.getElementById('fc-answer').classList.add('hidden');
  document.getElementById('fc-tip').classList.add('hidden');
  document.getElementById('fc-hint').textContent = 'Tap card to reveal answer';

  const fill = ((fcIndex + 1) / words.length) * 100;
  document.getElementById('fc-progress').style.width = fill + '%';
}

function flipCard() {
  const words = UYGHUR_DATA.vocabulary[fcCategory];
  const w = words[fcIndex];
  if (!fcShowAnswer) {
    document.getElementById('fc-answer').textContent = w.english;
    document.getElementById('fc-answer').classList.remove('hidden');
    document.getElementById('fc-tip').textContent = 'Pronunciation: ' + w.tip;
    document.getElementById('fc-tip').classList.remove('hidden');
    document.getElementById('fc-hint').textContent = 'Use arrow buttons to navigate';
    fcShowAnswer = true;
  }
}

function fcNext() {
  const words = UYGHUR_DATA.vocabulary[fcCategory];
  fcIndex = (fcIndex + 1) % words.length;
  renderFlashcard();
}

function fcPrev() {
  const words = UYGHUR_DATA.vocabulary[fcCategory];
  fcIndex = (fcIndex - 1 + words.length) % words.length;
  renderFlashcard();
}

function fcShuffle() {
  const words = UYGHUR_DATA.vocabulary[fcCategory];
  fcIndex = Math.floor(Math.random() * words.length);
  renderFlashcard();
  showToast('Shuffled!');
}

function stopGame() {
  document.getElementById('game-select').classList.remove('hidden');
  document.getElementById('flashcard-area').style.display = 'none';
  document.getElementById('quiz-area').style.display = 'none';
  document.getElementById('match-area').style.display = 'none';
}

// ── Quiz Game ──
function startQuiz() {
  const allWords = [];
  Object.entries(UYGHUR_DATA.vocabulary).forEach(([cat, words]) => {
    words.forEach(w => allWords.push({ ...w, cat }));
  });
  quizWords = shuffle(allWords).slice(0, 15);
  quizIdx = 0;
  quizScore = 0;
  quizTotal = quizWords.length;

  document.getElementById('game-select').classList.add('hidden');
  document.getElementById('quiz-area').style.display = 'block';
  renderQuizQuestion();
}

function renderQuizQuestion() {
  if (quizIdx >= quizWords.length) {
    showQuizResult();
    return;
  }
  const w = quizWords[quizIdx];
  quizAnswered = false;

  document.getElementById('quiz-score').textContent = `Score: ${quizScore} / ${quizTotal} · Question ${quizIdx + 1} of ${quizTotal}`;
  document.getElementById('quiz-word').textContent = w.uyghur;
  document.getElementById('quiz-latin').textContent = w.latin;

  const fill = (quizIdx / quizTotal) * 100;
  document.getElementById('quiz-progress').style.width = fill + '%';

  // Build wrong options
  const allWords = Object.values(UYGHUR_DATA.vocabulary).flat();
  const wrongs = shuffle(allWords.filter(x => x.english !== w.english)).slice(0, 3);
  const options = shuffle([w, ...wrongs]);

  document.getElementById('quiz-options').innerHTML = options.map(opt => `
    <button class="quiz-opt" onclick="checkAnswer(this, '${escStr(opt.english)}', '${escStr(w.english)}')">
      ${opt.english}
    </button>
  `).join('');
}

function checkAnswer(btn, chosen, correct) {
  if (quizAnswered) return;
  quizAnswered = true;

  const allOpts = document.querySelectorAll('.quiz-opt');
  allOpts.forEach(b => {
    const txt = b.textContent.trim();
    if (txt === correct) b.classList.add('correct');
  });

  if (chosen === correct) {
    btn.classList.add('correct');
    quizScore++;
    showToast('Correct! ✅');
  } else {
    btn.classList.add('wrong');
    showToast('Not quite — the answer is: ' + correct);
  }

  setTimeout(() => {
    quizIdx++;
    renderQuizQuestion();
  }, 1400);
}

function showQuizResult() {
  const pct = Math.round((quizScore / quizTotal) * 100);
  const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '👍' : '📚';
  document.getElementById('quiz-area').innerHTML = `
    <div style="text-align:center; background:white; border-radius:20px; padding:3rem 2rem; box-shadow:0 4px 20px rgba(0,0,0,.1)">
      <div style="font-size:4rem">${emoji}</div>
      <h2 style="font-size:2rem; margin:.5rem 0;">Quiz Complete!</h2>
      <p style="font-size:1.3rem; color:#64748B; margin-bottom:1.5rem;">
        You got <strong style="color:#2563EB">${quizScore} out of ${quizTotal}</strong> correct (${pct}%)
      </p>
      <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="startQuiz()">Try Again</button>
        <button class="btn btn-outline" style="border-color:#2563EB;color:#2563EB" onclick="stopGame()">Back to Games</button>
      </div>
    </div>`;
}

// ── Matching Game ──
function startMatching() {
  const allWords = Object.values(UYGHUR_DATA.vocabulary).flat();
  matchWords = shuffle(allWords).slice(0, 6);
  matchedPairs = 0;
  matchSelected = null;

  document.getElementById('game-select').classList.add('hidden');
  document.getElementById('match-area').style.display = 'block';

  const uyghurTiles = shuffle([...matchWords]);
  const englishTiles = shuffle([...matchWords]);

  document.getElementById('match-score').textContent = `Matched: 0 / ${matchWords.length}`;

  document.getElementById('match-uyghur-col').innerHTML = uyghurTiles.map((w, i) => `
    <div class="match-tile uyghur-tile" data-word="${escStr(w.english)}" data-side="uyghur" onclick="selectMatchTile(this)">
      ${w.uyghur}
    </div>
  `).join('');

  document.getElementById('match-english-col').innerHTML = englishTiles.map((w, i) => `
    <div class="match-tile" data-word="${escStr(w.english)}" data-side="english" onclick="selectMatchTile(this)">
      ${w.english}
    </div>
  `).join('');
}

function selectMatchTile(tile) {
  if (tile.classList.contains('matched')) return;

  if (!matchSelected) {
    tile.classList.add('selected');
    matchSelected = tile;
    return;
  }

  if (matchSelected === tile) {
    tile.classList.remove('selected');
    matchSelected = null;
    return;
  }

  if (matchSelected.dataset.side === tile.dataset.side) {
    matchSelected.classList.remove('selected');
    matchSelected = tile;
    tile.classList.add('selected');
    return;
  }

  const a = matchSelected;
  const b = tile;
  matchSelected = null;

  if (a.dataset.word === b.dataset.word) {
    a.classList.remove('selected');
    a.classList.add('matched');
    b.classList.add('matched');
    matchedPairs++;
    document.getElementById('match-score').textContent = `Matched: ${matchedPairs} / ${matchWords.length}`;
    showToast('Match found! ✅');

    if (matchedPairs === matchWords.length) {
      setTimeout(() => {
        showToast('You matched them all! 🎉 Starting new round…');
        setTimeout(startMatching, 1500);
      }, 500);
    }
  } else {
    a.classList.add('wrong');
    b.classList.add('wrong');
    setTimeout(() => {
      a.classList.remove('wrong', 'selected');
      b.classList.remove('wrong');
    }, 700);
    showToast('Keep trying! 💪');
  }
}

// ── Phrases ──
function renderPhrases() {
  const list = document.getElementById('phrases-list');
  list.innerHTML = UYGHUR_DATA.phrases.map(p => `
    <div class="phrase-card">
      <div class="phrase-uyghur">${p.uyghur}</div>
      <div class="phrase-info">
        <div class="phrase-latin">${p.latin}</div>
        <div class="phrase-english">${p.english}</div>
      </div>
    </div>
  `).join('');
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
  updateMasteryBadge();
});
