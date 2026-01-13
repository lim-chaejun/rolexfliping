// 전역 변수
let watches = [];
let filteredWatches = [];
let displayedCount = 50;
let selectedLine = '';

// 테스트 관련 변수
let testMode = false;
let testQuestions = [];
let currentQuestion = 0;
let testAnswers = [];
let testLine = '';

// 인증 관련 변수
let currentUser = null;
let isAdmin = false;

// 상태 오버라이드 (Firestore에서 로드)
let statusOverrides = {};

// DOM 요소
const productGrid = document.getElementById('product-grid');
const loading = document.getElementById('loading');
const noResults = document.getElementById('no-results');
const totalCount = document.getElementById('total-count');
const filteredCount = document.getElementById('filtered-count');
const searchInput = document.getElementById('search-input');
const materialFilter = document.getElementById('material-filter');
const priceFilter = document.getElementById('price-filter');
const sortSelect = document.getElementById('sort-select');
const resetBtn = document.getElementById('reset-filters');
const lineTabs = document.getElementById('line-tabs');
const currentLineName = document.getElementById('current-line-name');
const loadMoreContainer = document.getElementById('load-more-container');
const loadMoreBtn = document.getElementById('load-more-btn');
const remainingCount = document.getElementById('remaining-count');
const vizSection = document.getElementById('visualization-section');
const vizToggle = document.getElementById('viz-toggle');
const vizToggleText = document.getElementById('viz-toggle-text');

// 상태 필터 체크박스
const statusCheckboxes = document.querySelectorAll('.status-chips input[type="checkbox"]');

// 상태 텍스트 매핑
const statusText = {
  buy: '매입',
  pending: '검토',
  no: '불가'
};

// 라인 이름 매핑
const lineNames = {
  '1908': '1908',
  'air-king': '에어킹',
  'cosmograph-daytona': '데이토나',
  'datejust': '데이트저스트',
  'day-date': '데이데이트',
  'deepsea': '딥씨',
  'explorer': '익스플로러',
  'gmt-master-ii': 'GMT-마스터 II',
  'lady-datejust': '레이디 데이트저스트',
  'land-dweller': '랜드-드웰러',
  'oyster-perpetual': '오이스터 퍼페추얼',
  'sea-dweller': '씨-드웰러',
  'sky-dweller': '스카이-드웰러',
  'submariner': '서브마리너',
  'yacht-master': '요트-마스터'
};

// 소재 이름 매핑
const materialNames = {
  'alt-steel': '오이스터스틸',
  'alt-18-ct-yellow-gold': '옐로 골드',
  'alt-18-ct-pink-gold': '에버로즈 골드',
  'alt-18-ct-white-gold': '화이트 골드',
  'alt-platinum': '플래티넘',
  'alt-rolesor-everose': '에버로즈 롤레조',
  'alt-rolesor-yellow': '옐로 롤레조',
  'alt-rolesium': '롤레슘'
};

// 초기화
async function init() {
  try {
    const response = await fetch('rolex_watches.json');
    watches = await response.json();

    totalCount.textContent = watches.length.toLocaleString();

    createLineTabs();
    populateFilters();

    // Firestore에서 상태 오버라이드 로드 (모든 사용자)
    await loadStatusOverrides();

    updateStatusCountsWithOverrides();
    applyFilters();
    renderCharts();

    loading.style.display = 'none';
  } catch (error) {
    console.error('데이터 로딩 실패:', error);
    loading.innerHTML = '<span>데이터를 불러오는데 실패했습니다.</span>';
  }
}

// 라인 탭 생성
function createLineTabs() {
  const lineCounts = {};
  watches.forEach(w => {
    lineCounts[w.line] = (lineCounts[w.line] || 0) + 1;
  });

  // 전체 탭 카운트 업데이트
  document.getElementById('tab-count-all').textContent = watches.length.toLocaleString();

  // 라인별 탭 생성
  const lines = Object.keys(lineCounts).sort();
  lines.forEach(line => {
    const tab = document.createElement('button');
    tab.className = 'line-tab';
    tab.dataset.line = line;
    tab.innerHTML = `
      <span class="tab-name">${lineNames[line] || line}</span>
      <span class="tab-count">${lineCounts[line].toLocaleString()}</span>
    `;
    tab.addEventListener('click', () => selectLine(line));
    lineTabs.appendChild(tab);
  });
}

// 라인 선택
function selectLine(line) {
  selectedLine = line;
  displayedCount = 50;

  // 탭 활성화
  document.querySelectorAll('.line-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.line === line);
  });

  // 현재 라인명 표시
  currentLineName.textContent = line ? (lineNames[line] || line) : '전체 라인';

  applyFilters();
}

// 필터 옵션 채우기
function populateFilters() {
  // 소재 필터
  const materials = [...new Set(watches.map(w => w.material))].sort();
  materials.forEach(material => {
    const option = document.createElement('option');
    option.value = material;
    option.textContent = materialNames[material] || material;
    materialFilter.appendChild(option);
  });
}

// 상태 카운트 업데이트
function updateStatusCounts() {
  const counts = { buy: 0, pending: 0, no: 0 };
  watches.forEach(w => {
    if (counts.hasOwnProperty(w.buy_status)) {
      counts[w.buy_status]++;
    }
  });

  document.getElementById('count-buy').textContent = counts.buy.toLocaleString();
  document.getElementById('count-pending').textContent = counts.pending.toLocaleString();
  document.getElementById('count-no').textContent = counts.no.toLocaleString();
}

// 필터 적용
function applyFilters() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const selectedMaterial = materialFilter.value;
  const selectedPrice = priceFilter.value;

  // 선택된 상태들
  const selectedStatuses = Array.from(statusCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  filteredWatches = watches.filter(watch => {
    // 라인 필터
    if (selectedLine && watch.line !== selectedLine) return false;

    // 상태 필터 (오버라이드 적용)
    const currentStatus = statusOverrides[watch.model_number] || watch.buy_status;
    if (!selectedStatuses.includes(currentStatus)) return false;

    // 검색 필터
    if (searchTerm) {
      const searchFields = [
        watch.title,
        watch.model_number,
        watch.family,
        watch.case_description
      ].join(' ').toLowerCase();

      if (!searchFields.includes(searchTerm)) return false;
    }

    // 소재 필터
    if (selectedMaterial && watch.material !== selectedMaterial) return false;

    // 가격 필터
    if (selectedPrice) {
      const [min, max] = selectedPrice.split('-').map(Number);
      if (watch.price < min || watch.price > max) return false;
    }

    return true;
  });

  // 정렬
  sortWatches();

  // 렌더링
  renderProducts();
}

// 정렬
function sortWatches() {
  const sortValue = sortSelect.value;

  filteredWatches.sort((a, b) => {
    switch (sortValue) {
      case 'price-asc':
        return a.price - b.price;
      case 'price-desc':
        return b.price - a.price;
      case 'name-asc':
        return a.title.localeCompare(b.title, 'ko');
      default:
        return 0;
    }
  });
}

// 제품 렌더링
function renderProducts() {
  filteredCount.textContent = filteredWatches.length.toLocaleString();

  if (filteredWatches.length === 0) {
    productGrid.innerHTML = '';
    noResults.style.display = 'flex';
    loadMoreContainer.style.display = 'none';
    return;
  }

  noResults.style.display = 'none';

  const displayWatches = filteredWatches.slice(0, displayedCount);

  productGrid.innerHTML = displayWatches.map(watch => {
    const imagePath = `images/${watch.line}/${watch.model_number}.jpg`;
    // 상태 오버라이드 적용
    const currentStatus = statusOverrides[watch.model_number] || watch.buy_status;

    // 관리자용 상태 변경 드롭다운
    const adminControls = isAdmin ? `
      <div class="admin-status-control">
        <select class="status-select" data-model="${watch.model_number}" onchange="updateWatchStatus(this)">
          <option value="buy" ${currentStatus === 'buy' ? 'selected' : ''}>무조건 매입</option>
          <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>검토 필요</option>
          <option value="no" ${currentStatus === 'no' ? 'selected' : ''}>매입 불가</option>
        </select>
      </div>
    ` : '';

    return `
      <div class="product-card">
        <div class="product-image-wrapper">
          <span class="product-badge ${currentStatus}">${statusText[currentStatus]}</span>
          <img
            class="product-image"
            src="${imagePath}"
            alt="${watch.title}"
            onerror="this.src='${watch.image_url}'"
            loading="lazy"
          >
        </div>
        <div class="product-info">
          <div class="product-line">${lineNames[watch.line] || watch.line}</div>
          <div class="product-title">${watch.title}</div>
          <div class="product-model">${watch.model_number}</div>
          <div class="product-price">${watch.formatted_price}</div>
          <div class="product-material">${materialNames[watch.material] || watch.material}</div>
          ${adminControls}
        </div>
      </div>
    `;
  }).join('');

  // 더보기 버튼
  if (filteredWatches.length > displayedCount) {
    const remaining = filteredWatches.length - displayedCount;
    remainingCount.textContent = remaining.toLocaleString();
    loadMoreContainer.style.display = 'block';
  } else {
    loadMoreContainer.style.display = 'none';
  }
}

// 더보기
function loadMore() {
  displayedCount += 50;
  renderProducts();
}

// 필터 초기화
function resetFilters() {
  searchInput.value = '';
  materialFilter.value = '';
  priceFilter.value = '';
  sortSelect.value = 'price-asc';
  selectedLine = '';
  displayedCount = 50;

  statusCheckboxes.forEach(cb => cb.checked = true);

  // 탭 초기화
  document.querySelectorAll('.line-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.line === '');
  });
  currentLineName.textContent = '전체 라인';

  applyFilters();
}

// 시각화 토글
function toggleVisualization() {
  vizSection.classList.toggle('collapsed');
  vizToggleText.textContent = vizSection.classList.contains('collapsed') ? '차트 보기' : '차트 숨기기';
}

// 차트 렌더링
function renderCharts() {
  renderLineChart();
  renderStatusChart();
  renderPriceChart();
}

// 라인별 차트
function renderLineChart() {
  const lineChart = document.getElementById('line-chart');
  const lineCounts = {};

  watches.forEach(w => {
    lineCounts[w.line] = (lineCounts[w.line] || 0) + 1;
  });

  const sortedLines = Object.entries(lineCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const maxCount = Math.max(...sortedLines.map(l => l[1]));

  lineChart.innerHTML = `
    <div class="bar-chart">
      ${sortedLines.map(([line, count]) => `
        <div class="bar-item">
          <span class="bar-label">${lineNames[line] || line}</span>
          <div class="bar-track">
            <div class="bar-fill default" style="width: ${(count / maxCount) * 100}%"></div>
          </div>
          <span class="bar-value">${count}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// 상태별 차트 (도넛)
function renderStatusChart() {
  const statusChart = document.getElementById('status-chart');
  const counts = { buy: 0, pending: 0, no: 0 };

  watches.forEach(w => {
    if (counts.hasOwnProperty(w.buy_status)) {
      counts[w.buy_status]++;
    }
  });

  const total = counts.buy + counts.pending + counts.no;
  const buyPercent = (counts.buy / total) * 100;
  const pendingPercent = (counts.pending / total) * 100;

  // SVG 도넛 차트
  const size = 120;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const buyOffset = 0;
  const pendingOffset = (buyPercent / 100) * circumference;
  const noOffset = ((buyPercent + pendingPercent) / 100) * circumference;

  statusChart.innerHTML = `
    <div class="donut-chart">
      <svg class="donut-svg" viewBox="0 0 ${size} ${size}">
        <circle
          cx="${size/2}" cy="${size/2}" r="${radius}"
          fill="none"
          stroke="#22c55e"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${(buyPercent / 100) * circumference} ${circumference}"
          stroke-dashoffset="0"
          transform="rotate(-90 ${size/2} ${size/2})"
        />
        <circle
          cx="${size/2}" cy="${size/2}" r="${radius}"
          fill="none"
          stroke="#f59e0b"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${(pendingPercent / 100) * circumference} ${circumference}"
          stroke-dashoffset="${-pendingOffset}"
          transform="rotate(-90 ${size/2} ${size/2})"
        />
        <circle
          cx="${size/2}" cy="${size/2}" r="${radius}"
          fill="none"
          stroke="#ef4444"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${((100 - buyPercent - pendingPercent) / 100) * circumference} ${circumference}"
          stroke-dashoffset="${-noOffset}"
          transform="rotate(-90 ${size/2} ${size/2})"
        />
      </svg>
      <div class="donut-legend">
        <div class="legend-item">
          <span class="legend-dot buy"></span>
          <span>매입 ${counts.buy.toLocaleString()}</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot pending"></span>
          <span>검토 ${counts.pending.toLocaleString()}</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot no"></span>
          <span>불가 ${counts.no.toLocaleString()}</span>
        </div>
      </div>
    </div>
  `;
}

// 가격대별 차트
function renderPriceChart() {
  const priceChart = document.getElementById('price-chart');
  const priceRanges = [
    { label: '2천 이하', min: 0, max: 20000000 },
    { label: '2천~5천', min: 20000000, max: 50000000 },
    { label: '5천~1억', min: 50000000, max: 100000000 },
    { label: '1억 이상', min: 100000000, max: Infinity }
  ];

  const counts = priceRanges.map(range => ({
    label: range.label,
    count: watches.filter(w => w.price >= range.min && w.price < range.max).length
  }));

  const maxCount = Math.max(...counts.map(c => c.count));

  priceChart.innerHTML = `
    <div class="bar-chart">
      ${counts.map(({ label, count }) => `
        <div class="bar-item">
          <span class="bar-label">${label}</span>
          <div class="bar-track">
            <div class="bar-fill default" style="width: ${(count / maxCount) * 100}%"></div>
          </div>
          <span class="bar-value">${count}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// 이벤트 리스너
searchInput.addEventListener('input', debounce(() => {
  displayedCount = 50;
  applyFilters();
}, 300));

materialFilter.addEventListener('change', () => {
  displayedCount = 50;
  applyFilters();
});

priceFilter.addEventListener('change', () => {
  displayedCount = 50;
  applyFilters();
});

sortSelect.addEventListener('change', applyFilters);
resetBtn.addEventListener('click', resetFilters);
loadMoreBtn.addEventListener('click', loadMore);
vizToggle.addEventListener('click', toggleVisualization);

statusCheckboxes.forEach(cb => {
  cb.addEventListener('change', () => {
    displayedCount = 50;
    applyFilters();
  });
});

// 첫 번째 탭 (전체) 클릭 이벤트
document.querySelector('.line-tab[data-line=""]').addEventListener('click', () => selectLine(''));

// 디바운스 함수
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 시작
init();

// ==========================================
// 인증 관련 기능
// ==========================================

// 인증 DOM 요소
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginBtnContainer = document.getElementById('login-btn-container');
const userInfoContainer = document.getElementById('user-info-container');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const loginModal = document.getElementById('login-modal');
const loginModalClose = document.getElementById('login-modal-close');
const googleLoginBtn = document.getElementById('google-login-btn');

// 인증 상태 감시
auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  isAdmin = user ? ADMIN_EMAILS.includes(user.email) : false;
  updateAuthUI();

  // 관리자 로그인/로그아웃 시 UI 다시 렌더링 (관리자 컨트롤 표시/숨김)
  if (watches.length > 0) {
    applyFilters();
  }
});

// 인증 UI 업데이트
function updateAuthUI() {
  if (currentUser) {
    loginBtnContainer.style.display = 'none';
    userInfoContainer.style.display = 'flex';
    userAvatar.src = currentUser.photoURL || 'https://via.placeholder.com/32';
    userName.textContent = currentUser.displayName || currentUser.email?.split('@')[0] || '사용자';
  } else {
    loginBtnContainer.style.display = 'block';
    userInfoContainer.style.display = 'none';
  }
}

// 로그인 모달 표시/숨기기
function showLoginModal() {
  loginModal.classList.add('active');
}

function hideLoginModal() {
  loginModal.classList.remove('active');
}

// Google 로그인
async function loginWithGoogle() {
  try {
    await auth.signInWithPopup(googleProvider);
    hideLoginModal();
  } catch (error) {
    console.error('로그인 실패:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      alert('로그인에 실패했습니다: ' + error.message);
    }
  }
}

// 로그아웃
async function logout() {
  try {
    await auth.signOut();
  } catch (error) {
    console.error('로그아웃 실패:', error);
  }
}

// 인증 이벤트 리스너
loginBtn.addEventListener('click', showLoginModal);
logoutBtn.addEventListener('click', logout);
loginModalClose.addEventListener('click', hideLoginModal);
googleLoginBtn.addEventListener('click', loginWithGoogle);
loginModal.addEventListener('click', (e) => {
  if (e.target === loginModal) hideLoginModal();
});

// ==========================================
// 메인 네비게이션 탭 기능
// ==========================================

// 네비게이션 DOM 요소
const navMain = document.getElementById('nav-main');
const navTest = document.getElementById('nav-test');
const navStats = document.getElementById('nav-stats');
const lineTabsWrapper = document.getElementById('line-tabs-wrapper');
const testSection = document.getElementById('test-section');
const mainContainer = document.getElementById('main-container');
const statsSection = document.getElementById('stats-section');

// 테스트 DOM 요소
const testStart = document.getElementById('test-start');
const testProgress = document.getElementById('test-progress');
const testResult = document.getElementById('test-result');
const testOptions = document.getElementById('test-options');
const startTestBtn = document.getElementById('start-test-btn');
const retryBtn = document.getElementById('retry-btn');
const viewStatsBtn = document.getElementById('view-stats-btn');

// 현재 활성 탭
let currentTab = 'main';

// 탭 전환
function switchTab(tab) {
  currentTab = tab;

  // 네비게이션 탭 활성화
  document.querySelectorAll('.main-nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  // 컨텐츠 전환
  if (tab === 'main') {
    mainContainer.style.display = 'block';
    vizSection.style.display = 'block';
    lineTabsWrapper.style.display = 'block';
    testSection.style.display = 'none';
    if (statsSection) statsSection.style.display = 'none';
  } else if (tab === 'test') {
    mainContainer.style.display = 'none';
    vizSection.style.display = 'none';
    lineTabsWrapper.style.display = 'none';
    testSection.style.display = 'block';
    if (statsSection) statsSection.style.display = 'none';
    showTestStart();
  } else if (tab === 'stats') {
    mainContainer.style.display = 'none';
    vizSection.style.display = 'none';
    lineTabsWrapper.style.display = 'none';
    testSection.style.display = 'none';
    if (statsSection) statsSection.style.display = 'block';
    loadStatsPage();
  }
}

// 네비게이션 이벤트 리스너
navMain.addEventListener('click', () => switchTab('main'));
navTest.addEventListener('click', () => switchTab('test'));
navStats.addEventListener('click', () => switchTab('stats'));

// 테스트 시작 화면 표시
function showTestStart() {
  testStart.style.display = 'block';
  testProgress.style.display = 'none';
  testResult.style.display = 'none';

  // 라인 옵션 생성
  const lines = [...new Set(watches.map(w => w.line))].sort();

  testOptions.innerHTML = `
    <label class="test-option">
      <input type="radio" name="test-line" value="" checked>
      <span>전체 라인</span>
    </label>
    ${lines.map(line => `
      <label class="test-option">
        <input type="radio" name="test-line" value="${line}">
        <span>${lineNames[line] || line}</span>
      </label>
    `).join('')}
  `;
}

// 테스트 시작
function startTest() {
  const selectedTestLine = document.querySelector('input[name="test-line"]:checked').value;
  testLine = selectedTestLine;

  // 문제 생성 (무작위 10개)
  let pool = selectedTestLine
    ? watches.filter(w => w.line === selectedTestLine)
    : watches;

  // 셔플 후 10개 선택
  testQuestions = shuffleArray([...pool]).slice(0, 10);
  currentQuestion = 0;
  testAnswers = [];

  testStart.style.display = 'none';
  testProgress.style.display = 'block';

  showQuestion();
}

// 배열 셔플
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// 문제 표시
function showQuestion() {
  const question = testQuestions[currentQuestion];
  const imagePath = `images/${question.line}/${question.model_number}.jpg`;

  document.getElementById('current-q').textContent = currentQuestion + 1;
  document.getElementById('progress-fill').style.width = `${(currentQuestion / 10) * 100}%`;

  const testImage = document.getElementById('test-image');
  testImage.src = imagePath;
  testImage.onerror = function() {
    this.src = question.image_url;
  };

  document.getElementById('test-line-name').textContent = lineNames[question.line] || question.line;
  document.getElementById('test-title').textContent = question.title;
  document.getElementById('test-model').textContent = question.model_number;
  document.getElementById('test-price').textContent = question.formatted_price;
  document.getElementById('test-material').textContent = materialNames[question.material] || question.material;

  // 버튼 초기화
  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.classList.remove('selected', 'correct', 'wrong');
    btn.disabled = false;
  });
}

// 답 선택
function selectAnswer(choice) {
  const question = testQuestions[currentQuestion];
  const isCorrect = choice === question.buy_status;

  testAnswers.push({
    question,
    userChoice: choice,
    correctAnswer: question.buy_status,
    isCorrect
  });

  // 피드백 표시
  const buttons = document.querySelectorAll('.choice-btn');
  buttons.forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.choice === choice) {
      btn.classList.add(isCorrect ? 'correct' : 'wrong');
    }
    if (btn.dataset.choice === question.buy_status) {
      btn.classList.add('correct');
    }
  });

  // 다음 문제로 (1초 후)
  setTimeout(() => {
    currentQuestion++;
    if (currentQuestion < 10) {
      showQuestion();
    } else {
      showResult();
    }
  }, 1000);
}

// 결과 표시
function showResult() {
  testProgress.style.display = 'none';
  testResult.style.display = 'block';

  const correctCount = testAnswers.filter(a => a.isCorrect).length;
  document.getElementById('score-value').textContent = correctCount;

  // 등급 계산
  let grade = '';
  if (correctCount >= 9) grade = '우수';
  else if (correctCount >= 7) grade = '양호';
  else if (correctCount >= 5) grade = '보통';
  else grade = '노력필요';

  document.getElementById('result-grade').textContent = grade;

  // 상세 결과
  const detailsHtml = testAnswers.map((answer) => {
    const imagePath = `images/${answer.question.line}/${answer.question.model_number}.jpg`;
    return `
      <div class="result-item ${answer.isCorrect ? 'correct' : 'wrong'}">
        <img class="result-item-image" src="${imagePath}"
             onerror="this.src='${answer.question.image_url}'" alt="">
        <div class="result-item-info">
          <div class="result-item-title">${answer.question.title}</div>
          <div class="result-item-answer">
            선택: ${statusText[answer.userChoice]} / 정답: ${statusText[answer.correctAnswer]}
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('result-details').innerHTML = detailsHtml;

  // 로그인된 경우 점수 저장
  if (currentUser) {
    saveTestScore(correctCount);
  }
}

// 점수 저장 (Firebase)
async function saveTestScore(score) {
  if (!currentUser) return;

  try {
    const scoreData = {
      score,
      totalQuestions: 10,
      line: testLine || 'all',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      answers: testAnswers.map(a => ({
        model: a.question.model_number,
        line: a.question.line,
        userChoice: a.userChoice,
        correctAnswer: a.correctAnswer,
        isCorrect: a.isCorrect
      }))
    };

    await db.collection('users').doc(currentUser.uid)
      .collection('scores').add(scoreData);

    // 통계 업데이트
    await updateUserStats(score);
  } catch (error) {
    console.error('점수 저장 실패:', error);
  }
}

// 사용자 통계 업데이트
async function updateUserStats(score) {
  const statsRef = db.collection('users').doc(currentUser.uid);

  try {
    const statsDoc = await statsRef.get();

    if (!statsDoc.exists) {
      // 초기 통계 생성
      const initialStats = {
        totalTests: 1,
        totalCorrect: score,
        totalQuestions: 10,
        lineStats: {},
        wrongModels: {}
      };

      // 라인별 통계
      const line = testLine || 'all';
      initialStats.lineStats[line] = { correct: score, total: 10 };

      // 틀린 모델 추적
      testAnswers.forEach(a => {
        if (!a.isCorrect) {
          initialStats.wrongModels[a.question.model_number] = 1;
        }
      });

      await statsRef.set(initialStats);
    } else {
      const stats = statsDoc.data();

      // 전체 통계 업데이트
      stats.totalTests = (stats.totalTests || 0) + 1;
      stats.totalCorrect = (stats.totalCorrect || 0) + score;
      stats.totalQuestions = (stats.totalQuestions || 0) + 10;

      // 라인별 통계
      const line = testLine || 'all';
      if (!stats.lineStats) stats.lineStats = {};
      if (!stats.lineStats[line]) {
        stats.lineStats[line] = { correct: 0, total: 0 };
      }
      stats.lineStats[line].correct += score;
      stats.lineStats[line].total += 10;

      // 틀린 모델 추적
      if (!stats.wrongModels) stats.wrongModels = {};
      testAnswers.forEach(a => {
        if (!a.isCorrect) {
          const modelKey = a.question.model_number;
          stats.wrongModels[modelKey] = (stats.wrongModels[modelKey] || 0) + 1;
        }
      });

      await statsRef.update(stats);
    }
  } catch (error) {
    console.error('통계 업데이트 실패:', error);
  }
}

// 테스트 이벤트 리스너
// 테스트 이벤트 리스너
startTestBtn.addEventListener('click', startTest);
retryBtn.addEventListener('click', showTestStart);

document.querySelectorAll('.choice-btn').forEach(btn => {
  btn.addEventListener('click', () => selectAnswer(btn.dataset.choice));
});

// ==========================================
// 통계 페이지 기능
// ==========================================

// 통계 페이지 로드
async function loadStatsPage() {
  if (!currentUser) {
    document.getElementById('stats-page-summary').innerHTML = `
      <div class="login-required">
        <p>통계를 보려면 로그인이 필요합니다.</p>
        <button class="login-required-btn" onclick="showLoginModal();">
          로그인하기
        </button>
      </div>
    `;
    document.getElementById('page-line-stats').innerHTML = '';
    document.getElementById('page-wrong-models').innerHTML = '';
    document.getElementById('page-recent-tests').innerHTML = '';
    return;
  }

  await loadUserStatsForPage();
}

// 사용자 통계 로드 (페이지용)
async function loadUserStatsForPage() {
  try {
    // 통계 문서 가져오기
    const statsDoc = await db.collection('users').doc(currentUser.uid).get();

    // 최근 테스트 기록 가져오기
    const scoresSnapshot = await db.collection('users').doc(currentUser.uid)
      .collection('scores')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    if (statsDoc.exists) {
      const stats = statsDoc.data();
      renderStatsPage(stats, scoresSnapshot.docs);
    } else {
      renderEmptyStatsPage();
    }
  } catch (error) {
    console.error('통계 로드 실패:', error);
    renderEmptyStatsPage();
  }
}

// 통계 페이지 렌더링
function renderStatsPage(stats, recentScores) {
  // 요약 통계
  const accuracy = stats.totalQuestions > 0
    ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100)
    : 0;
  const avgScore = stats.totalTests > 0
    ? (stats.totalCorrect / stats.totalTests).toFixed(1)
    : 0;

  document.getElementById('stats-page-summary').innerHTML = `
    <div class="stats-card">
      <span class="stats-value">${stats.totalTests || 0}</span>
      <span class="stats-label">총 시도 횟수</span>
    </div>
    <div class="stats-card">
      <span class="stats-value">${accuracy}%</span>
      <span class="stats-label">전체 정답률</span>
    </div>
    <div class="stats-card">
      <span class="stats-value">${avgScore}</span>
      <span class="stats-label">평균 점수</span>
    </div>
  `;

  // 라인별 정답률
  const lineStatsHtml = Object.entries(stats.lineStats || {})
    .map(([line, data]) => {
      const lineAccuracy = data.total > 0
        ? Math.round((data.correct / data.total) * 100)
        : 0;
      const lineName = line === 'all' ? '전체' : (lineNames[line] || line);
      return `
        <div class="line-stat-item">
          <span class="line-stat-name">${lineName}</span>
          <div class="line-stat-bar">
            <div class="line-stat-fill" style="width: ${lineAccuracy}%"></div>
          </div>
          <span class="line-stat-value">${lineAccuracy}%</span>
        </div>
      `;
    }).join('');

  document.getElementById('page-line-stats').innerHTML = lineStatsHtml || '<p class="empty-message">데이터 없음</p>';

  // 자주 틀리는 모델 (상위 5개)
  const wrongModels = Object.entries(stats.wrongModels || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const wrongModelsHtml = wrongModels.map(([modelNumber, count]) => {
    const watch = watches.find(w => w.model_number === modelNumber);
    if (!watch) return '';

    const imagePath = `images/${watch.line}/${watch.model_number}.jpg`;
    return `
      <div class="wrong-model-item">
        <img class="wrong-model-image" src="${imagePath}"
             onerror="this.src='${watch.image_url}'" alt="">
        <div class="wrong-model-info">
          <div class="wrong-model-name">${watch.title}</div>
          <div class="wrong-model-line">${lineNames[watch.line] || watch.line}</div>
        </div>
        <span class="wrong-model-count">${count}회 오답</span>
      </div>
    `;
  }).join('');

  document.getElementById('page-wrong-models').innerHTML = wrongModelsHtml || '<p class="empty-message">데이터 없음</p>';

  // 최근 테스트 기록
  const recentTestsHtml = recentScores.map(doc => {
    const data = doc.data();
    const date = data.timestamp?.toDate();
    const dateStr = date ? `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '-';
    const lineName = data.line === 'all' ? '전체' : (lineNames[data.line] || data.line);

    return `
      <div class="recent-test-item">
        <span class="recent-test-date">${dateStr}</span>
        <span class="recent-test-line">${lineName}</span>
        <span class="recent-test-score">${data.score}/10</span>
      </div>
    `;
  }).join('');

  document.getElementById('page-recent-tests').innerHTML = recentTestsHtml || '<p class="empty-message">테스트 기록 없음</p>';
}

// 빈 통계 페이지 렌더링
function renderEmptyStatsPage() {
  document.getElementById('stats-page-summary').innerHTML = `
    <div class="stats-card">
      <span class="stats-value">0</span>
      <span class="stats-label">총 시도 횟수</span>
    </div>
    <div class="stats-card">
      <span class="stats-value">0%</span>
      <span class="stats-label">전체 정답률</span>
    </div>
    <div class="stats-card">
      <span class="stats-value">0</span>
      <span class="stats-label">평균 점수</span>
    </div>
  `;

  document.getElementById('page-line-stats').innerHTML = '<p class="empty-message">테스트를 진행해주세요</p>';
  document.getElementById('page-wrong-models').innerHTML = '<p class="empty-message">데이터 없음</p>';
  document.getElementById('page-recent-tests').innerHTML = '<p class="empty-message">테스트 기록 없음</p>';
}

// 통계 버튼 이벤트 리스너 (테스트 결과에서 통계 탭으로 이동)
viewStatsBtn.addEventListener('click', () => switchTab('stats'));

// ==========================================
// 관리자 기능 - 상태 관리
// ==========================================

// Firestore에서 상태 오버라이드 로드
async function loadStatusOverrides() {
  try {
    const snapshot = await db.collection('watchStatus').get();
    statusOverrides = {};
    snapshot.forEach(doc => {
      statusOverrides[doc.id] = doc.data().status;
    });
    console.log('상태 오버라이드 로드됨:', Object.keys(statusOverrides).length);
  } catch (error) {
    console.error('상태 로드 실패:', error);
  }
}

// 시계 상태 업데이트 (관리자 전용)
async function updateWatchStatus(selectElement) {
  if (!isAdmin) return;

  const modelNumber = selectElement.dataset.model;
  const newStatus = selectElement.value;

  try {
    // Firestore에 저장
    await db.collection('watchStatus').doc(modelNumber).set({
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.email
    });

    // 로컬 오버라이드 업데이트
    statusOverrides[modelNumber] = newStatus;

    // 해당 카드의 뱃지 업데이트
    const card = selectElement.closest('.product-card');
    const badge = card.querySelector('.product-badge');
    badge.className = `product-badge ${newStatus}`;
    badge.textContent = statusText[newStatus];

    // 상태 카운트 업데이트
    updateStatusCountsWithOverrides();

    console.log(`상태 변경: ${modelNumber} -> ${newStatus}`);
  } catch (error) {
    console.error('상태 변경 실패:', error);
    alert('상태 변경에 실패했습니다.');
    // 원래 값으로 되돌리기
    const originalStatus = statusOverrides[modelNumber] ||
      watches.find(w => w.model_number === modelNumber)?.buy_status;
    if (originalStatus) {
      selectElement.value = originalStatus;
    }
  }
}

// 상태 카운트 업데이트 (오버라이드 포함)
function updateStatusCountsWithOverrides() {
  const counts = { buy: 0, pending: 0, no: 0 };
  watches.forEach(w => {
    const status = statusOverrides[w.model_number] || w.buy_status;
    if (counts.hasOwnProperty(status)) {
      counts[status]++;
    }
  });

  document.getElementById('count-buy').textContent = counts.buy.toLocaleString();
  document.getElementById('count-pending').textContent = counts.pending.toLocaleString();
  document.getElementById('count-no').textContent = counts.no.toLocaleString();
}
