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
  colors2:      { name: 'Colors II',      emoji: '🌈',  color: '#BE185D' },
  professions:  { name: 'Professions',    emoji: '👔',  color: '#1D4ED8' },
  technology:   { name: 'Technology',     emoji: '💻',  color: '#0891B2' },
  health:       { name: 'Health',         emoji: '🏥',  color: '#DC2626' },
  shopping:     { name: 'Shopping',       emoji: '🛒',  color: '#EA580C' },
  money:        { name: 'Money',          emoji: '💰',  color: '#CA8A04' },
  travel:       { name: 'Travel',         emoji: '✈️',  color: '#7C3AED' },
  directions:   { name: 'Directions',     emoji: '🧭',  color: '#0369A1' },
  fruits:       { name: 'Fruits',         emoji: '🍎',  color: '#16A34A' },
  vegetables:   { name: 'Vegetables',     emoji: '🥦',  color: '#15803D' },
  beverages:    { name: 'Beverages',      emoji: '🥤',  color: '#0284C7' },
  birds:        { name: 'Birds',          emoji: '🐦',  color: '#059669' },
  furniture:    { name: 'Furniture',      emoji: '🛋️',  color: '#92400E' },
  insects:      { name: 'Insects',        emoji: '🐛',  color: '#65A30D' },
  buildings:    { name: 'Buildings',      emoji: '🏛️',  color: '#475569' },
  vehicles:     { name: 'Vehicles',       emoji: '🚗',  color: '#1E40AF' },
  geography:    { name: 'Geography',      emoji: '🌍',  color: '#0F766E' },
  religion:     { name: 'Religion',       emoji: '🕌',  color: '#7C2D12' },
  science:      { name: 'Science',        emoji: '🔬',  color: '#6D28D9' },
  space:        { name: 'Space',          emoji: '🚀',  color: '#1E1B4B' },
  verbs2:       { name: 'More Verbs',     emoji: '⚡',  color: '#B91C1C' },
  adjectives2:  { name: 'More Adjectives',emoji: '✨',  color: '#6D28D9' },
  family2:      { name: 'Family II',      emoji: '👨‍👩‍👧‍👦', color: '#B45309' },
  hobbies:      { name: 'Hobbies',        emoji: '🎨',  color: '#DB2777' },
  culture:      { name: 'Uyghur Culture', emoji: '🏮',  color: '#B91C1C' },
  tools:        { name: 'Tools',          emoji: '🔧',  color: '#374151' },
  environment:  { name: 'Environment',    emoji: '🌱',  color: '#166534' },
  instruments:  { name: 'Instruments',    emoji: '🎼',  color: '#7C3AED' },
  kitchen:      { name: 'Kitchen',        emoji: '🍳',  color: '#B45309' },
  cooking:      { name: 'Cooking',        emoji: '👨‍🍳', color: '#92400E' },
  clothing2:    { name: 'Clothing II',    emoji: '👗',  color: '#7C3AED' },
  accessories:  { name: 'Accessories',   emoji: '💍',  color: '#BE185D' },
  animals2:     { name: 'Animals II',    emoji: '🐾',  color: '#15803D' },
  food3:        { name: 'Food III',       emoji: '🥘',  color: '#DC2626' },
  emotions2:    { name: 'Emotions II',   emoji: '💙',  color: '#7C3AED' },
  adjectives3:  { name: 'Adjectives III',emoji: '✨',  color: '#0369A1' },
  verbs3:       { name: 'Verbs III',     emoji: '⚡',  color: '#B91C1C' },
  body3:        { name: 'Body III',      emoji: '🫀',  color: '#DC2626' },
  nature3:      { name: 'Nature III',    emoji: '🌿',  color: '#15803D' },
  adverbs:      { name: 'Adverbs',       emoji: '🔡',  color: '#0891B2' },
  pronouns:     { name: 'Pronouns',      emoji: '👤',  color: '#6D28D9' },
  prepositions: { name: 'Prepositions',  emoji: '📍',  color: '#0F766E' },
  flowers:      { name: 'Flowers',       emoji: '🌸',  color: '#DB2777' },
  trees:        { name: 'Trees',         emoji: '🌳',  color: '#166534' },
  farm:         { name: 'Farm & Animals',emoji: '🐄',  color: '#92400E' },
  materials:    { name: 'Materials',     emoji: '🪨',  color: '#374151' },
  business:     { name: 'Business',      emoji: '💼',  color: '#1D4ED8' },
  law:          { name: 'Law & Justice', emoji: '⚖️',  color: '#4B5563' },
  sports2:      { name: 'Sports II',     emoji: '🏆',  color: '#16A34A' },
  office:       { name: 'Office',        emoji: '🏢',  color: '#475569' },
  hygiene:      { name: 'Hygiene',       emoji: '🧼',  color: '#0284C7' },
  symptoms:     { name: 'Symptoms',      emoji: '🤒',  color: '#DC2626' },
  countries:    { name: 'Countries',     emoji: '🌍',  color: '#0369A1' },
  shapes:       { name: 'Shapes',        emoji: '🔷',  color: '#7C3AED' },
  time2:        { name: 'Time II',       emoji: '⏰',  color: '#0891B2' },
  media:        { name: 'Media',         emoji: '📺',  color: '#374151' },
  numbers2:     { name: 'Numbers II',    emoji: '🔢',  color: '#2563EB' },
  school3:      { name: 'School III',    emoji: '🎓',  color: '#4F46E5' },
  weather2:     { name: 'Weather II',    emoji: '⛅',  color: '#0369A1' },
  military:     { name: 'Military',      emoji: '🪖',  color: '#374151' },
  languages:    { name: 'Languages',     emoji: '🗣️',  color: '#7C3AED' },
  arts:         { name: 'Arts',          emoji: '🎨',  color: '#DB2777' },
  seafood:      { name: 'Sea Life',      emoji: '🐟',  color: '#0891B2' },
  politics:     { name: 'Politics',      emoji: '🏛️',  color: '#1D4ED8' },
  verbs4:       { name: 'Verbs IV',      emoji: '⚡',  color: '#991B1B' },
  adjectives4:  { name: 'Adjectives IV', emoji: '✨',  color: '#5B21B6' },
  social:       { name: 'Social Life',   emoji: '🤝',  color: '#0D9488' },
  health2:      { name: 'Health II',     emoji: '💊',  color: '#B91C1C' },
  food4:        { name: 'Food IV',       emoji: '🍢',  color: '#92400E' },
  sports3:      { name: 'Sports III',    emoji: '🏋️',  color: '#15803D' },
  home3:        { name: 'Home III',      emoji: '🏠',  color: '#B45309' },
  questions:    { name: 'Questions',     emoji: '❓',  color: '#0369A1' },
  city2:        { name: 'City II',       emoji: '🏙️',  color: '#475569' },
  opposites:    { name: 'Opposites',     emoji: '↔️',  color: '#0F766E' },
  greetings3:   { name: 'Expressions',   emoji: '💬',  color: '#16A34A' },
  nature2:        { name: 'Nature II',       emoji: '🌿',  color: '#15803D' },
  medicine2:      { name: 'Medicine',        emoji: '🩺',  color: '#DC2626' },
  transportation2:{ name: 'Transport II',    emoji: '🚌',  color: '#1D4ED8' },
  science2:       { name: 'Science',         emoji: '🔬',  color: '#7C3AED' },
  economy:        { name: 'Economy',         emoji: '💹',  color: '#0369A1' },
  agriculture:    { name: 'Agriculture',     emoji: '🌾',  color: '#92400E' },
  verbs5:         { name: 'Verbs V',         emoji: '🏃',  color: '#0F766E' },
  verbs6:         { name: 'Verbs VI',        emoji: '✍️',  color: '#0369A1' },
  adjectives5:    { name: 'Adjectives V',    emoji: '📐',  color: '#7C3AED' },
  adjectives6:    { name: 'Adjectives VI',   emoji: '🌟',  color: '#BE185D' },
  adverbs2:       { name: 'Connectors',      emoji: '🔗',  color: '#374151' },
  personality:    { name: 'Personality',     emoji: '🧠',  color: '#B45309' },
  family2:        { name: 'Family II',       emoji: '👨‍👩‍👧', color: '#DB2777' },
  emotions2:      { name: 'Emotions II',     emoji: '💭',  color: '#7C3AED' },
  geography2:     { name: 'Geography',       emoji: '🌍',  color: '#0369A1' },
  birds2:         { name: 'Birds',           emoji: '🦅',  color: '#92400E' },
  insects:        { name: 'Insects',         emoji: '🦋',  color: '#15803D' },
  animals2:       { name: 'Animals II',      emoji: '🦁',  color: '#B45309' },
  plants2:        { name: 'Plants',          emoji: '🌿',  color: '#15803D' },
  professions2:   { name: 'Professions II',  emoji: '👷',  color: '#374151' },
  tools2:         { name: 'Tools II',        emoji: '🔨',  color: '#92400E' },
  technology2:    { name: 'Technology II',   emoji: '💻',  color: '#0369A1' },
  internet:       { name: 'Internet',        emoji: '🌐',  color: '#7C3AED' },
  finance:        { name: 'Finance',         emoji: '💰',  color: '#15803D' },
  travel2:        { name: 'Travel II',       emoji: '✈️',  color: '#0891B2' },
  emergency:      { name: 'Emergency',       emoji: '🚨',  color: '#DC2626' },
  music2:         { name: 'Music',           emoji: '🎵',  color: '#7C3AED' },
  literature:     { name: 'Literature',      emoji: '📚',  color: '#1D4ED8' },
  construction:   { name: 'Construction',    emoji: '🏗️',  color: '#374151' },
  education2:     { name: 'Education II',    emoji: '🎓',  color: '#0369A1' },
  clothing2:      { name: 'Clothing II',     emoji: '👘',  color: '#DB2777' },
  verbs7:         { name: 'Verbs VII',       emoji: '🎯',  color: '#0F766E' },
  verbs8:         { name: 'Verbs VIII',      emoji: '💪',  color: '#1D4ED8' },
  food5:          { name: 'Food V',          emoji: '🥘',  color: '#B45309' },
  food6:          { name: 'Kitchen II',      emoji: '🍲',  color: '#92400E' },
  religion2:      { name: 'Religion',        emoji: '🕌',  color: '#374151' },
  space:          { name: 'Space',           emoji: '🚀',  color: '#1E3A5F' },
  environment:    { name: 'Environment',     emoji: '🌱',  color: '#15803D' },
  law2:           { name: 'Law II',          emoji: '⚖️',  color: '#4B5563' },
  politics2:      { name: 'Politics II',     emoji: '🗳️',  color: '#1D4ED8' },
  numbers3:       { name: 'Numbers III',     emoji: '🔢',  color: '#374151' },
  measurements:   { name: 'Measurements',    emoji: '📏',  color: '#0891B2' },
  sports4:        { name: 'Sports IV',       emoji: '⚽',  color: '#15803D' },
  daily_life:     { name: 'Daily Life',      emoji: '🏠',  color: '#0369A1' },
  weather3:       { name: 'Weather III',     emoji: '🌦️',  color: '#0891B2' },
  body2:          { name: 'Body II',         emoji: '💀',  color: '#DC2626' },
  adjectives7:    { name: 'Colors & More',   emoji: '🎨',  color: '#7C3AED' },
  relationships:  { name: 'Relationships',   emoji: '🤝',  color: '#DB2777' },
  traditions:     { name: 'Culture',         emoji: '🏺',  color: '#92400E' },
  shopping2:      { name: 'Shopping',        emoji: '🛍️',  color: '#7C3AED' },
  office2:        { name: 'Office II',       emoji: '🗂️',  color: '#475569' },
  verbs9:         { name: 'Verbs IX',        emoji: '🌀',  color: '#0F766E' },
  home4:          { name: 'Home IV',         emoji: '🏡',  color: '#B45309' },
  abstract:       { name: 'Abstract',        emoji: '💡',  color: '#374151' },
  colors3:        { name: 'Colors III',      emoji: '🌈',  color: '#7C3AED' },
  time3:          { name: 'Time & Seasons',  emoji: '🗓️',  color: '#0891B2' },
  arts2:          { name: 'Arts II',         emoji: '🎭',  color: '#DB2777' },
  food7:          { name: 'Food (Tastes)',   emoji: '😋',  color: '#B45309' },
  phrases2:       { name: 'Key Phrases',     emoji: '💬',  color: '#0369A1' },
  geography3:     { name: 'Countries II',    emoji: '🗺️',  color: '#0369A1' },
  school4:        { name: 'School IV',       emoji: '📐',  color: '#4F46E5' },
  furniture2:     { name: 'Furniture',       emoji: '🛋️',  color: '#92400E' },
  adjectives8:    { name: 'Adjectives VIII', emoji: '🎯',  color: '#374151' },
  work2:          { name: 'Work & Business', emoji: '💼',  color: '#1D4ED8' },
  house_items:    { name: 'Household Items', emoji: '🏺',  color: '#92400E' },
  social2:        { name: 'Society',         emoji: '🌐',  color: '#0D9488' },
  nature3:        { name: 'Nature III',      emoji: '🏔️',  color: '#15803D' },
  verbs10:        { name: 'Verbs X',         emoji: '⚙️',  color: '#7C3AED' },
  health3:        { name: 'Health III',      emoji: '🩻',  color: '#DC2626' },
  materials2:     { name: 'Materials',       emoji: '🪨',  color: '#374151' },
  occasions:      { name: 'Occasions',       emoji: '🎉',  color: '#B45309' },
  verbs11:        { name: 'Verbs XI',        emoji: '🔄',  color: '#0369A1' },
  adjectives9:    { name: 'How We Feel',     emoji: '😊',  color: '#DB2777' },
  communication:  { name: 'Communication',   emoji: '📡',  color: '#0891B2' },
  prepositions:   { name: 'Prepositions',    emoji: '🔀',  color: '#374151' },
  verbs12:        { name: 'Verbs XII',       emoji: '🌊',  color: '#0369A1' },
  animals3:       { name: 'Animals III',     emoji: '🐼',  color: '#15803D' },
  adjectives10:   { name: 'Character',       emoji: '🎭',  color: '#7C3AED' },
  math_terms:     { name: 'Math Terms',      emoji: '🔢',  color: '#1D4ED8' },
  vehicles:       { name: 'Vehicles',        emoji: '🚗',  color: '#374151' },
  professions3:   { name: 'Jobs III',        emoji: '👨‍💼',  color: '#0369A1' },
  expressions:    { name: 'Expressions II',  emoji: '🙌',  color: '#15803D' },
  science3:       { name: 'Science II',      emoji: '⚗️',  color: '#7C3AED' },
  history:        { name: 'History',         emoji: '🏛️',  color: '#92400E' },
  technology3:    { name: 'Tech & AI',       emoji: '🤖',  color: '#1D4ED8' },
  idioms:         { name: 'Idioms',          emoji: '🗣️',  color: '#7C3AED' },
  adjectives11:   { name: 'Frequency',       emoji: '⏱️',  color: '#374151' },
  verbs13:        { name: 'Verbs XIII',      emoji: '🌀',  color: '#0F766E' },
  body3:          { name: 'Body III',        emoji: '🫀',  color: '#DC2626' },
  home5:          { name: 'Home V',          emoji: '🧺',  color: '#B45309' },
  city3:          { name: 'City III',        emoji: '🏘️',  color: '#475569' },
  food8:          { name: 'Food & Drinks',   emoji: '🍎',  color: '#15803D' },
  grammar:        { name: 'Grammar',         emoji: '📝',  color: '#4F46E5' },
  sports5:        { name: 'Sports V',        emoji: '🥋',  color: '#15803D' },
  verbs14:        { name: 'Verbs XIV',       emoji: '🔁',  color: '#0369A1' },
  adjectives12:   { name: 'Describing',      emoji: '💫',  color: '#7C3AED' },
  nature4:        { name: 'Uyghur Lands',    emoji: '🏔️',  color: '#92400E' },
  school5:        { name: 'School V',        emoji: '📖',  color: '#4F46E5' },
  travel3:        { name: 'Travel III',      emoji: '🗺️',  color: '#0891B2' },
  money2:         { name: 'Money',           emoji: '💵',  color: '#15803D' },
  expressions2:   { name: 'Phrases III',     emoji: '🗨️',  color: '#374151' },
  verbs15:        { name: 'Verbs XV',        emoji: '🔃',  color: '#0F766E' },
  body4:          { name: 'Body IV',         emoji: '🧬',  color: '#DC2626' },
  adjectives13:   { name: 'Adjectives XIII', emoji: '🌟',  color: '#7C3AED' },
  food9:          { name: 'Uyghur Cuisine',  emoji: '🍖',  color: '#B45309' },
  verbs16:        { name: 'Verbs XVI',       emoji: '🔁',  color: '#0E7490' },
  adjectives14:   { name: 'Adjectives XIV',  emoji: '💡',  color: '#9333EA' },
  nature5:        { name: 'Nature V',        emoji: '🌊',  color: '#0369A1' },
  daily_life2:    { name: 'Daily Life II',   emoji: '🌅',  color: '#D97706' },
  weather4:       { name: 'Weather IV',      emoji: '🌤️',  color: '#0891B2' },
  verbs17:        { name: 'Verbs XVII',      emoji: '⚙️',  color: '#059669' },
  phrases3:       { name: 'Phrases IV',      emoji: '💭',  color: '#7C3AED' },
  home6:          { name: 'Home VI',         emoji: '🏡',  color: '#92400E' },
  verbs18:        { name: 'Verbs XVIII',     emoji: '🧩',  color: '#065F46' },
  adjectives15:   { name: 'Adjectives XV',   emoji: '🔮',  color: '#6D28D9' },
  professions4:   { name: 'Professions IV',  emoji: '👷',  color: '#1E40AF' },
  body5:          { name: 'Body V',          emoji: '🫀',  color: '#BE123C' },
  verbs19:        { name: 'Verbs XIX',       emoji: '🌀',  color: '#0E7490' },
  adjectives16:   { name: 'Adjectives XVI',  emoji: '🎯',  color: '#7C2D12' },
  science4:       { name: 'Science IV',      emoji: '⚗️',  color: '#1E3A5F' },
  geography4:     { name: 'Geography IV',    emoji: '🌍',  color: '#065F46' },
  history2:       { name: 'History II',      emoji: '📜',  color: '#78350F' },
  social3:        { name: 'Social III',      emoji: '🤲',  color: '#1D4ED8' },
  verbs20:        { name: 'Verbs XX',        emoji: '🌱',  color: '#15803D' },
  emotions3:      { name: 'Emotions III',    emoji: '💞',  color: '#BE185D' },
  time4:          { name: 'Time IV',         emoji: '⏳',  color: '#0F172A' },
  abstract2:      { name: 'Concepts II',     emoji: '🔷',  color: '#2563EB' },
  food10:         { name: 'Uyghur Dishes',   emoji: '🥘',  color: '#92400E' },
  verbs21:        { name: 'Verbs XXI',       emoji: '🔄',  color: '#047857' },
  nature6:        { name: 'Nature VI',       emoji: '🌾',  color: '#065F46' },
  clothing3:      { name: 'Clothing III',    emoji: '👘',  color: '#7E22CE' },
  verbs22:        { name: 'Verbs XXII',      emoji: '💫',  color: '#0E7490' },
  adjectives17:   { name: 'Adjectives XVII', emoji: '🎨',  color: '#9F1239' },
  phrases4:       { name: 'Phrases V',       emoji: '🗣️',  color: '#374151' },
  misc:           { name: 'Essentials',      emoji: '📍',  color: '#1E3A5F' },
};

let vocabProgress = JSON.parse(localStorage.getItem('uyghur_vocab_progress') || '{}');

// Maps English color names → CSS color + whether it needs dark text
const COLOR_BG_MAP = {
  'red':            { bg: '#EF4444', dark: false },
  'green':          { bg: '#16A34A', dark: false },
  'blue':           { bg: '#3B82F6', dark: false },
  'blue / green':   { bg: '#0D9488', dark: false },
  'yellow':         { bg: '#EAB308', dark: true  },
  'white':          { bg: '#F8FAFC', dark: true  },
  'black':          { bg: '#1E293B', dark: false },
  'orange':         { bg: '#F97316', dark: false },
  'purple':         { bg: '#8B5CF6', dark: false },
  'light blue':     { bg: '#38BDF8', dark: true  },
  'brown':          { bg: '#92400E', dark: false },
  'silver':         { bg: '#94A3B8', dark: true  },
  'silver color':   { bg: '#94A3B8', dark: true  },
  'gold':           { bg: '#D97706', dark: false },
  'gold / golden':  { bg: '#D97706', dark: false },
  'gold color':     { bg: '#D97706', dark: false },
  'pink color':     { bg: '#EC4899', dark: false },
};

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
    pool = [...learning, ...fresh];
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
  const asrFb = document.getElementById('study-asr-feedback');
  if (asrFb) asrFb.innerHTML = '';
  asrStopIfRecording();

  // Update Prev / Next button states
  const prevBtn = document.getElementById('study-prev-btn');
  const nextBtn = document.getElementById('study-next-btn');
  if (prevBtn) prevBtn.disabled = (studyIdx === 0);
  if (nextBtn) nextBtn.disabled = (studyIdx >= studyWords.length - 1);

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

  // Color the card faces — use real color when studying colors category
  const isColorCat = (cat === 'colors' || cat === 'colors2');
  const colorEntry = isColorCat && COLOR_BG_MAP[word.english.toLowerCase()];

  const front = document.getElementById('study-front');
  const back  = document.getElementById('study-back');

  if (colorEntry) {
    const { bg, dark } = colorEntry;
    front.style.background = bg;
    back.style.background  = bg;
    const solid   = dark ? '#1E293B' : '#ffffff';
    const muted   = dark ? 'rgba(0,0,0,0.55)'  : 'rgba(255,255,255,0.85)';
    const faint   = dark ? 'rgba(0,0,0,0.4)'   : 'rgba(255,255,255,0.7)';
    document.getElementById('study-word-uyghur').style.color  = solid;
    document.getElementById('study-word-english').style.color = solid;
    document.getElementById('study-word-latin').style.color   = muted;
    document.getElementById('study-word-tip').style.color     = faint;
    document.querySelector('.study-tap-hint').style.color     = muted;
  } else {
    front.style.background = `linear-gradient(135deg, ${meta.color}dd, ${meta.color}99)`;
    back.style.background  = `linear-gradient(135deg, ${meta.color}bb, ${meta.color}77)`;
    document.getElementById('study-word-uyghur').style.color  = '';
    document.getElementById('study-word-english').style.color = '';
    document.getElementById('study-word-latin').style.color   = '';
    document.getElementById('study-word-tip').style.color     = '';
    document.querySelector('.study-tap-hint').style.color     = '';
  }
}

function flipStudyCard() {
  studyFlipped = !studyFlipped;
  document.getElementById('study-card-inner').classList.toggle('flipped', studyFlipped);

  if (studyFlipped) {
    // First flip to English side — reveal actions and speak
    const actions = document.getElementById('study-actions');
    if (actions.classList.contains('hidden')) {
      setTimeout(() => actions.classList.remove('hidden'), 350);
    }
    speakStudyWord();
  }
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

/* Navigate without marking progress — just move the card pointer */
function navigateStudyCard(dir) {
  const next = studyIdx + dir;
  if (next < 0 || next >= studyWords.length) return;
  studyIdx = next;
  showStudyCard();
}

function repeatStudySession() { if (currentStudyCat) startStudySession(currentStudyCat); }

function backToStudyHome() {
  asrStopIfRecording();
  document.getElementById('study-session').classList.add('hidden');
  document.getElementById('study-complete').classList.add('hidden');
  document.getElementById('study-home').classList.remove('hidden');
  window.speechSynthesis && window.speechSynthesis.cancel();
  renderStudyHome();
}

// ── ASR — Pronunciation Practice (Groq API / whisper-large-v3-turbo) ──
const ASR_GROQ_URL    = 'https://api.groq.com/openai/v1/audio/transcriptions';
const ASR_GROQ_MODEL  = 'whisper-large-v3-turbo';
const ASR_LANG        = 'ug';    // Uyghur
const ASR_MAX_SEC     = 4;       // auto-stop after 4 s
const ASR_KEY_STORE   = 'uyghur_groq_key';

let _asrRecorder  = null;
let _asrChunks    = [];
let _asrRecording = false;

/* ── helpers ── */
function asrMicBtn()   { return document.getElementById('study-mic-btn'); }
function asrFeedback() { return document.getElementById('study-asr-feedback'); }

function asrSetFeedback(html, bg) {
  const el = asrFeedback();
  if (!el) return;
  el.innerHTML = html;
  el.style.background = bg || '';
}

function asrSetMic(label, disabled, recording) {
  const btn = asrMicBtn();
  if (!btn) return;
  btn.textContent = label;
  btn.disabled = !!disabled;
  btn.classList.toggle('recording', !!recording);
}

function asrGetKey()       { return localStorage.getItem(ASR_KEY_STORE) || ''; }
function asrSaveKey(k)     { localStorage.setItem(ASR_KEY_STORE, k.trim()); }
function asrClearKey()     { localStorage.removeItem(ASR_KEY_STORE); }

/* ── Key-setup inline form ── */
function asrShowKeyPrompt() {
  asrSetFeedback(`
    <div class="asr-key-form">
      <p class="asr-key-title">🔑 Enter your free <strong>Groq API key</strong> to enable pronunciation checking</p>
      <div class="asr-key-row">
        <input id="asr-key-input" type="password" placeholder="gsk_…" autocomplete="off"
               class="asr-key-input" onkeydown="if(event.key==='Enter')asrSubmitKey()"/>
        <button class="asr-key-save" onclick="asrSubmitKey()">Save</button>
      </div>
      <a href="https://console.groq.com/keys" target="_blank" class="asr-key-link">
        Get a free key at console.groq.com →
      </a>
    </div>`, '#F8FAFC');
  setTimeout(() => { const i = document.getElementById('asr-key-input'); if (i) i.focus(); }, 50);
}

function asrSubmitKey() {
  const inp = document.getElementById('asr-key-input');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val.startsWith('gsk_') || val.length < 20) {
    inp.style.borderColor = '#EF4444';
    inp.placeholder = 'Key must start with gsk_…';
    return;
  }
  asrSaveKey(val);
  asrSetFeedback('✅ Key saved! Click <strong>🎤 Speak</strong> to try it.', '#D1FAE5');
}

/* ── Entry point ── */
async function toggleASRRecording() {
  if (_asrRecording) { asrStopRecording(); return; }

  // Ensure we have a Groq key
  if (!asrGetKey()) { asrShowKeyPrompt(); return; }

  // Check browser mic support
  if (!navigator.mediaDevices?.getUserMedia) {
    asrSetFeedback('❌ Your browser does not support microphone access.', '#FEE2E2');
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    asrSetFeedback('❌ Microphone access was denied — allow it in your browser settings.', '#FEE2E2');
    return;
  }

  _asrChunks    = [];
  _asrRecording = true;
  asrSetMic('⏹ Stop', false, true);
  asrSetFeedback('🔴 Recording… say the word clearly', '');

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus' : 'audio/webm';
  _asrRecorder = new MediaRecorder(stream, { mimeType: mime });
  _asrRecorder.ondataavailable = e => { if (e.data.size) _asrChunks.push(e.data); };
  _asrRecorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); asrProcess(); };
  _asrRecorder.start(100);

  setTimeout(() => { if (_asrRecording) asrStopRecording(); }, ASR_MAX_SEC * 1000);
}

function asrStopRecording() {
  if (!_asrRecording || !_asrRecorder) return;
  _asrRecording = false;
  _asrRecorder.stop();
  asrSetMic('⏳ Recognising…', true, false);
}

function asrStopIfRecording() { if (_asrRecording) asrStopRecording(); }

/* ── Send audio to Groq and compare result ── */
async function asrProcess() {
  if (!_asrChunks.length) {
    asrSetFeedback('⚠️ No audio captured — try again.', '');
    asrSetMic('🎤 Speak', false, false);
    return;
  }

  const blob = new Blob(_asrChunks, { type: 'audio/webm' });
  const form = new FormData();
  form.append('file',            blob,           'audio.webm');
  form.append('model',           ASR_GROQ_MODEL);
  form.append('language',        ASR_LANG);
  form.append('response_format', 'json');

  // Prompt injection: pass the current word + nearby vocabulary in Uyghur script.
  // Whisper uses this as a prior — it strongly biases transcription toward these tokens
  // and ensures Arabic-script Uyghur output (not Latin or Chinese transliteration).
  if (studyIdx < studyWords.length) {
    const currentWord = studyWords[studyIdx].word;
    // Build a short context string: current word + up to 4 neighbours from the same session
    const neighbours = studyWords
      .slice(Math.max(0, studyIdx - 2), studyIdx + 3)
      .map(s => s.word.uyghur)
      .join('، ');
    const prompt = `ئۇيغۇرچە: ${neighbours}. ${currentWord.uyghur}`;
    form.append('prompt', prompt);
  }

  let transcribed = '';
  try {
    const resp = await fetch(ASR_GROQ_URL, {
      method:  'POST',
      headers: { Authorization: `Bearer ${asrGetKey()}` },
      body:    form,
    });

    if (resp.status === 401) {
      asrClearKey();
      asrSetFeedback('❌ Invalid Groq API key — please re-enter it.', '#FEE2E2');
      asrSetMic('🎤 Speak', false, false);
      return;
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    transcribed = (data.text || '').trim();
  } catch (err) {
    console.error('[ASR] Groq error:', err);
    asrSetFeedback(`❌ ${err.message || 'Request failed — check your internet connection.'}`, '#FEE2E2');
    asrSetMic('🎤 Speak', false, false);
    return;
  }

  if (!transcribed) {
    asrSetFeedback('🤔 Couldn\'t make out the word — try speaking more clearly.', '');
    asrSetMic('🎤 Speak', false, false);
    return;
  }

  if (studyIdx < studyWords.length) {
    const { word } = studyWords[studyIdx];
    const match    = asrCompare(transcribed, word.uyghur);

    if (match) {
      asrSetFeedback(
        `✅ <strong>Correct!</strong>&nbsp; <span style="opacity:.7;font-size:.82rem">"${transcribed}"</span>`,
        '#D1FAE5'
      );
    } else {
      asrSetFeedback(
        `🎯 You said: <strong>${transcribed}</strong><br>` +
        `<span style="color:#64748B;font-size:.82rem">Expected: ${word.uyghur}</span>`,
        '#FEF3C7'
      );
    }
  }

  asrSetMic('🎤 Speak', false, false);
}

/* ── Fuzzy comparison: strip diacritics, allow ≤25 % edit distance ── */
function asrCompare(a, b) {
  const norm = s => s.replace(/[ً-ْٰؐ-ؚۖ-ۜ]/g, '').replace(/\s+/g, '').trim();
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb)  return true;
  const dist = asrLevenshtein(na, nb);
  return dist / Math.max(na.length, nb.length) <= 0.25;
}

function asrLevenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
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
