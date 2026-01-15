// 전역 변수
let watches = [];
let filteredWatches = [];
let displayedCount = 50;
let selectedLine = '';
let selectedCategory = ''; // 선택된 카테고리 (professional/classic)
let dataLoaded = false; // 데이터 로딩 완료 플래그

// 테스트 관련 변수
let testMode = false;
let testType = 'purchase'; // 'purchase' | 'spec'
let testQuestions = [];
let currentQuestion = 0;
let testAnswers = [];
let testLine = '';

// 스펙 테스트 관련 변수
let specQuestionPhase = 0; // 0: 소재, 1: 베젤, 2: 브레이슬릿
let specCurrentAnswer = {}; // 현재 시계의 3개 답변 저장

// 스펙 테스트 선택지 데이터
const SPEC_OPTIONS = {
  material: [
    { value: 'alt-steel', label: '오이스터스틸' },
    { value: 'alt-18-ct-yellow-gold', label: '옐로 골드' },
    { value: 'alt-18-ct-pink-gold', label: '에버로즈 골드' },
    { value: 'alt-18-ct-white-gold', label: '화이트 골드' },
    { value: 'alt-platinum', label: '플래티넘' },
    { value: 'alt-rolesor-everose', label: '에버로즈 롤레조' },
    { value: 'alt-rolesor-yellow', label: '옐로 롤레조' },
    { value: 'alt-rolesium', label: '롤레슘' }
  ],
  bezel: [], // 동적으로 시계 데이터에서 추출
  bracelet: [] // 동적으로 시계 데이터에서 추출
};

const SPEC_PHASE_LABELS = ['소재를 맞춰보세요', '베젤을 맞춰보세요', '브레이슬릿을 맞춰보세요'];
const SPEC_PHASE_KEYS = ['material', 'bezel', 'bracelet'];

// 인증 관련 변수
let currentUser = null;
let userRole = 'member';  // 사용자 등급: owner, manager, dealer, member
let userProfile = null;
let isApproved = false;
let currentManagerId = null;  // 소속 매니저 ID
let myInviteCode = null;      // 내 초대코드 (매니저 이상)

// ==========================================
// 권한 체크 유틸리티 함수
// ==========================================

// 등급 레벨 반환
function getRoleLevel(role) {
  return ROLE_LEVELS[role] || 1;
}

// 현재 사용자가 특정 등급 이상인지 확인
function hasRole(requiredRole) {
  if (!currentUser || !isApproved) return false;
  return getRoleLevel(userRole) >= getRoleLevel(requiredRole);
}

// 특정 기능에 대한 접근 권한 확인
function canAccess(feature) {
  if (!currentUser || !isApproved) return false;

  const permissions = {
    // 탭 접근 권한
    'tab:main': ['member', 'dealer', 'sub_manager', 'manager', 'owner'],
    'tab:test': ['member', 'dealer', 'sub_manager', 'manager', 'owner'],
    'tab:stats': ['member', 'dealer', 'sub_manager', 'manager', 'owner'],
    'tab:calc': ['dealer', 'sub_manager', 'manager', 'owner'],
    'tab:admin': ['owner'],

    // 기능 권한
    'watch:edit_status': ['sub_manager', 'manager', 'owner'],  // 소속매니저도 수정 가능
    'user:approve': ['owner'],
    'user:reject': ['owner'],
    'user:change_role': ['owner']
  };

  const allowedRoles = permissions[feature];
  if (!allowedRoles) return false;
  return allowedRoles.includes(userRole);
}

// 하위 호환성을 위한 isAdmin getter (기존 코드 호환)
function isAdmin() {
  return userRole === 'owner';
}

// ==========================================
// 닉네임 관련 유틸리티 함수
// ==========================================

// 닉네임 중복 검사
async function checkNicknameDuplicate(nickname, excludeUserId = null) {
  const snapshot = await db.collection('users')
    .where('nickname', '==', nickname)
    .get();

  // 자기 자신 제외 (수정 시)
  const duplicates = snapshot.docs.filter(doc => doc.id !== excludeUserId);
  return duplicates.length > 0;
}

// 사용자 표시 이름 반환 (닉네임 우선)
function getDisplayName(user) {
  if (!user) return '사용자';
  return user.nickname || user.name || user.email?.split('@')[0] || '사용자';
}

// 고유 초대코드 생성 (중복 체크)
async function createUniqueInviteCode() {
  let code;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 10;

  while (exists && attempts < maxAttempts) {
    code = generateInviteCode();
    const existingDoc = await db.collection('inviteCodes').doc(code).get();
    exists = existingDoc.exists;
    attempts++;
  }

  if (exists) {
    throw new Error('고유한 초대코드 생성 실패');
  }

  return code;
}

// 클립보드에 초대코드 복사
function copyInviteCode() {
  if (!myInviteCode) return;

  navigator.clipboard.writeText(myInviteCode).then(() => {
    const btn = document.querySelector('.copy-code-btn');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = '복사됨!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 2000);
    }
  }).catch(err => {
    console.error('클립보드 복사 실패:', err);
    alert('복사에 실패했습니다. 직접 코드를 복사해주세요.');
  });
}

// DOM 요소
const productGrid = document.getElementById('product-grid');
const loading = document.getElementById('loading');
const noResults = document.getElementById('no-results');
const totalCount = document.getElementById('total-count');
const filteredCount = document.getElementById('filtered-count');
const searchInput = document.getElementById('search-input');
const materialFilter = document.getElementById('material-filter');
const bezelFilter = document.getElementById('bezel-filter');
const braceletFilter = document.getElementById('bracelet-filter');
const priceFilter = document.getElementById('price-filter');
const sortSelect = document.getElementById('sort-select');
const resetBtn = document.getElementById('reset-filters');
// lineTabs는 더 이상 사용되지 않음 (두 줄 레이아웃으로 변경)
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

// 프로페셔널 라인
const professionalLines = [
  'cosmograph-daytona', 'submariner', 'gmt-master-ii', 'explorer',
  'sea-dweller', 'deepsea', 'air-king', 'yacht-master'
];

// 클래식 라인
const classicLines = [
  'datejust', 'day-date', 'oyster-perpetual', 'lady-datejust',
  'sky-dweller', '1908', 'land-dweller'
];

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
// 대상 매니저 ID 반환 (매입 상태 조회/저장용)
function getWatchStatusesManagerId() {
  // 매니저/소유자는 자신의 watchStatuses 사용
  if (['manager', 'owner'].includes(userRole)) {
    return currentUser.uid;
  }
  // 소속매니저/딜러/일반회원은 소속 매니저의 watchStatuses 사용
  // sub_manager도 소속 매니저의 데이터를 공유 (읽기/쓰기 모두)
  if (currentManagerId) {
    return currentManagerId;
  }
  // 매니저가 없는 경우 (레거시 데이터) null 반환
  return null;
}

async function init() {
  try {
    // 로컬 JSON 파일에서 시계 데이터 로드 (Firebase 읽기 한도 절약)
    const response = await fetch('rolex_watches.json');
    watches = await response.json();

    // 매니저별 watchStatuses 로드
    const managerId = getWatchStatusesManagerId();
    try {
      let statusDoc;
      if (managerId) {
        // 매니저별 watchStatuses 컬렉션에서 로드
        statusDoc = await db.collection('watchStatuses').doc(managerId).get();

        // 매니저/소유자인데 watchStatuses 문서가 없으면 자동 생성
        if (!statusDoc.exists && ['manager', 'owner'].includes(userRole)) {
          console.log(`매니저(${managerId}) watchStatuses 문서 자동 생성 중...`);
          const initialStatuses = {};
          watches.forEach(watch => {
            initialStatuses[watch.model_number] = 'no';
          });
          initialStatuses.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
          initialStatuses.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          initialStatuses.autoCreated = true;
          await db.collection('watchStatuses').doc(managerId).set(initialStatuses);

          // 생성된 문서 다시 로드
          statusDoc = await db.collection('watchStatuses').doc(managerId).get();
          console.log(`매니저(${managerId}) watchStatuses 문서 자동 생성 완료`);
        }
      } else {
        // 레거시: 기존 settings/watchStatuses에서 로드 (하위 호환성)
        statusDoc = await db.collection('settings').doc('watchStatuses').get();
      }

      if (statusDoc.exists) {
        const statuses = statusDoc.data();
        watches.forEach(watch => {
          if (statuses[watch.model_number]) {
            watch.buy_status = statuses[watch.model_number];
          } else {
            // 상태가 없는 시계는 기본값 'no'로 설정
            watch.buy_status = 'no';
          }
        });
        console.log(`매니저(${managerId || 'legacy'}) watchStatuses 동기화 완료`);
      } else {
        // watchStatuses 문서가 없는 경우 모든 시계를 기본값 'no'로 설정
        watches.forEach(watch => {
          watch.buy_status = 'no';
        });
        console.log('watchStatuses 문서 없음, 기본값(no) 적용');
      }
    } catch (e) {
      console.log('상태 동기화 실패, 기본값 사용:', e);
      // 오류 발생 시에도 기본값 설정
      watches.forEach(watch => {
        if (!watch.buy_status) {
          watch.buy_status = 'no';
        }
      });
    }

    console.log(`로컬 JSON에서 ${watches.length}개 시계 로드 완료`);

    totalCount.textContent = watches.length.toLocaleString();

    createLineTabs();
    populateFilters();

    // 모바일 필터 초기화
    createMobileLineGrid();
    syncMobileFilterOptions();

    updateStatusCounts();
    applyFilters();
    renderCharts();

    loading.style.display = 'none';
    dataLoaded = true;
  } catch (error) {
    console.error('데이터 로딩 실패:', error);
    loading.innerHTML = '<span>데이터를 불러오는데 실패했습니다.</span>';
  }
}

// 탭 버튼 생성 헬퍼 함수
function createTabButton(line, count) {
  const tab = document.createElement('button');
  tab.className = 'line-tab';
  tab.dataset.line = line;
  tab.innerHTML = `
    <span class="tab-name">${lineNames[line] || line}</span>
    <span class="tab-count">${count.toLocaleString()}</span>
  `;
  tab.addEventListener('click', () => selectLine(line));
  return tab;
}

// 라인 탭 생성
function createLineTabs() {
  const lineCounts = {};
  watches.forEach(w => {
    lineCounts[w.line] = (lineCounts[w.line] || 0) + 1;
  });

  // 전체 탭 카운트 업데이트
  document.getElementById('tab-count-all').textContent = watches.length.toLocaleString();

  // 전체 탭 클릭 이벤트 추가
  const allTab = document.getElementById('line-tab-all');
  allTab.addEventListener('click', () => {
    selectedCategory = '';
    selectLine('');
  });

  // 카테고리 버튼 클릭 이벤트 추가
  const categoryProfessional = document.getElementById('category-professional');
  const categoryClassic = document.getElementById('category-classic');

  categoryProfessional.addEventListener('click', () => selectCategory('professional'));
  categoryClassic.addEventListener('click', () => selectCategory('classic'));

  const professionalContainer = document.getElementById('line-tabs-professional');
  const classicContainer = document.getElementById('line-tabs-classic');

  // 프로페셔널 라인 탭 생성
  professionalLines.forEach(line => {
    if (lineCounts[line]) {
      const tab = createTabButton(line, lineCounts[line]);
      professionalContainer.appendChild(tab);
    }
  });

  // 클래식 라인 탭 생성
  classicLines.forEach(line => {
    if (lineCounts[line]) {
      const tab = createTabButton(line, lineCounts[line]);
      classicContainer.appendChild(tab);
    }
  });
}

// 카테고리 선택 (프로페셔널/클래식)
function selectCategory(category) {
  selectedCategory = category;
  selectedLine = ''; // 개별 라인 선택 초기화
  displayedCount = 50;

  // 탭 활성화 업데이트
  document.querySelectorAll('.line-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`[data-category="${category}"]`).classList.add('active');

  // 현재 라인명 표시
  const categoryName = category === 'professional' ? '프로페셔널' : '클래식';
  if (currentLineName) currentLineName.textContent = categoryName;

  applyFilters();
}

// 라인 선택
function selectLine(line) {
  selectedLine = line;
  selectedCategory = ''; // 카테고리 선택 초기화
  displayedCount = 50;

  // 탭 활성화
  document.querySelectorAll('.line-tab').forEach(tab => {
    const isActive = tab.dataset.line === line ||
                     (line === '' && tab.id === 'line-tab-all');
    tab.classList.toggle('active', isActive);
  });

  // 현재 라인명 표시
  currentLineName.textContent = line ? (lineNames[line] || line) : '전체 라인';

  applyFilters();
}

// 필터 옵션 채우기 (초기화용)
function populateFilters() {
  updateFilterOptions();
}

// 필터 옵션 동적 업데이트 (현재 필터링된 제품 기준)
function updateFilterOptions() {
  // 현재 선택된 값 저장
  const currentMaterial = materialFilter.value;
  const currentBezel = bezelFilter.value;
  const currentBracelet = braceletFilter.value;

  // 기본 필터 조건으로 필터링된 제품 가져오기 (소재/베젤/브레이슬릿 제외)
  const baseFiltered = getBaseFilteredWatches();

  // 소재 필터 옵션 업데이트 (material_detail 사용)
  const materials = [...new Set(baseFiltered.map(w => w.material_detail).filter(m => m))].sort();
  materialFilter.innerHTML = '<option value="">전체 소재</option>';
  materials.forEach(material => {
    const option = document.createElement('option');
    option.value = material;
    option.textContent = material;
    materialFilter.appendChild(option);
  });
  materialFilter.value = materials.includes(currentMaterial) ? currentMaterial : '';

  // 베젤 필터 옵션 업데이트 (소재 필터 적용 후)
  const bezelFiltered = currentMaterial
    ? baseFiltered.filter(w => w.material_detail === currentMaterial)
    : baseFiltered;
  const bezels = [...new Set(bezelFiltered.map(w => w.bezel).filter(b => b))].sort();
  bezelFilter.innerHTML = '<option value="">전체 베젤</option>';
  bezels.forEach(bezel => {
    const option = document.createElement('option');
    option.value = bezel;
    option.textContent = bezel;
    bezelFilter.appendChild(option);
  });
  bezelFilter.value = bezels.includes(currentBezel) ? currentBezel : '';

  // 브레이슬릿 필터 옵션 업데이트 (소재 + 베젤 필터 적용 후)
  let braceletFiltered = bezelFiltered;
  if (currentBezel) {
    braceletFiltered = braceletFiltered.filter(w => w.bezel === currentBezel);
  }
  const bracelets = [...new Set(braceletFiltered.map(w => w.bracelet).filter(b => b))].sort();
  braceletFilter.innerHTML = '<option value="">전체 브레이슬릿</option>';
  bracelets.forEach(bracelet => {
    const option = document.createElement('option');
    option.value = bracelet;
    option.textContent = bracelet;
    braceletFilter.appendChild(option);
  });
  braceletFilter.value = bracelets.includes(currentBracelet) ? currentBracelet : '';

  // 모바일 필터 옵션도 동기화
  if (typeof syncMobileFilterOptions === 'function') {
    syncMobileFilterOptions();
  }
}

// 기본 필터 조건 (라인, 카테고리, 상태, 검색, 가격)으로 필터링
function getBaseFilteredWatches() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const selectedPrice = priceFilter.value;
  const selectedStatuses = Array.from(statusCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  return watches.filter(watch => {
    // 카테고리 필터
    if (selectedCategory === 'professional' && !professionalLines.includes(watch.line)) return false;
    if (selectedCategory === 'classic' && !classicLines.includes(watch.line)) return false;

    // 라인 필터
    if (selectedLine && watch.line !== selectedLine) return false;

    // 상태 필터
    if (!selectedStatuses.includes(watch.buy_status)) return false;

    // 검색 필터
    if (searchTerm) {
      const searchFields = [
        watch.title,
        watch.model_number,
        watch.family,
        watch.case_description,
        String(watch.price)
      ].join(' ').toLowerCase();
      if (!searchFields.includes(searchTerm)) return false;
    }

    // 가격 필터
    if (selectedPrice) {
      const [min, max] = selectedPrice.split('-').map(Number);
      if (watch.price < min || watch.price > max) return false;
    }

    return true;
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
  // 보안: 비로그인/미승인 시 필터 차단
  if (!currentUser || !isApproved) {
    filteredWatches = [];
    return;
  }

  // 필터 옵션 동적 업데이트
  updateFilterOptions();

  const searchTerm = searchInput.value.toLowerCase().trim();
  const selectedMaterial = materialFilter.value;
  const selectedBezel = bezelFilter.value;
  const selectedBracelet = braceletFilter.value;
  const selectedPrice = priceFilter.value;

  // 선택된 상태들
  const selectedStatuses = Array.from(statusCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  filteredWatches = watches.filter(watch => {
    // 카테고리 필터 (프로페셔널/클래식)
    if (selectedCategory === 'professional' && !professionalLines.includes(watch.line)) return false;
    if (selectedCategory === 'classic' && !classicLines.includes(watch.line)) return false;

    // 라인 필터
    if (selectedLine && watch.line !== selectedLine) return false;

    // 상태 필터
    if (!selectedStatuses.includes(watch.buy_status)) return false;

    // 검색 필터 (모델명, 모델번호, 가격)
    if (searchTerm) {
      const searchFields = [
        watch.title,
        watch.model_number,
        watch.family,
        watch.case_description,
        String(watch.price)
      ].join(' ').toLowerCase();

      if (!searchFields.includes(searchTerm)) return false;
    }

    // 소재 필터 (material_detail 사용)
    if (selectedMaterial && watch.material_detail !== selectedMaterial) return false;

    // 베젤 필터
    if (selectedBezel && watch.bezel !== selectedBezel) return false;

    // 브레이슬릿 필터
    if (selectedBracelet && watch.bracelet !== selectedBracelet) return false;

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

  // 차트 업데이트 (필터링된 데이터 기준)
  renderCharts();
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
  // 보안: 비로그인/미승인 시 렌더링 차단
  if (!currentUser || !isApproved) {
    productGrid.innerHTML = '';
    return;
  }

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

    // 매니저 이상용 상태 변경 버튼 (CSS 도형)
    const adminControls = canAccess('watch:edit_status') ? `
      <div class="admin-status-control">
        <button class="status-btn buy ${watch.buy_status === 'buy' ? 'active' : ''}"
                data-model="${watch.model_number}" data-status="buy"
                onclick="updateWatchStatusBtn(event, this)"><span></span></button>
        <button class="status-btn pending ${watch.buy_status === 'pending' ? 'active' : ''}"
                data-model="${watch.model_number}" data-status="pending"
                onclick="updateWatchStatusBtn(event, this)"><span></span></button>
        <button class="status-btn no ${watch.buy_status === 'no' ? 'active' : ''}"
                data-model="${watch.model_number}" data-status="no"
                onclick="updateWatchStatusBtn(event, this)"><span></span></button>
      </div>
    ` : '';

    // 타이틀에서 사이즈 추출 (예: "오이스터 퍼페츄얼 28" -> "28")
    const sizeMatch = watch.title.match(/(\d+)$/);
    const sizeClass = sizeMatch ? `size-${sizeMatch[1]}` : '';

    return `
      <div class="product-card line-${watch.line} ${sizeClass}" data-model="${watch.model_number}" onclick="showWatchDetail('${watch.model_number}')">
        <div class="product-image-wrapper">
          <span class="product-badge ${watch.buy_status}">${statusText[watch.buy_status]}</span>
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
          <div class="product-title">${watch.case_description || watch.title}</div>
          <div class="product-model">${watch.model_number}</div>
          <div class="product-price">${watch.formatted_price}</div>
          <div class="product-dial">${watch.dial || '-'}</div>
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

// ==========================================
// 시계 상세 모달
// ==========================================

const watchDetailModal = document.getElementById('watch-detail-modal');
const watchDetailClose = document.getElementById('watch-detail-close');

function showWatchDetail(modelNumber) {
  // 관리자 버튼 클릭 시 모달 열리지 않도록
  if (event && event.target.closest('.admin-status-control')) {
    return;
  }

  const watch = watches.find(w => w.model_number === modelNumber);
  if (!watch) return;

  const imagePath = `images/${watch.line}/${watch.model_number}.jpg`;

  // 모달 내용 채우기
  document.getElementById('watch-detail-image').src = imagePath;
  document.getElementById('watch-detail-image').onerror = function() {
    this.src = watch.image_url;
  };
  document.getElementById('watch-detail-badge').textContent = statusText[watch.buy_status];
  document.getElementById('watch-detail-badge').className = `watch-detail-badge ${watch.buy_status}`;
  document.getElementById('watch-detail-line').textContent = lineNames[watch.line] || watch.line;
  document.getElementById('watch-detail-title').textContent = watch.title;
  document.getElementById('watch-detail-model').textContent = watch.model_number;
  document.getElementById('watch-detail-price').textContent = watch.formatted_price;

  // 스펙 항목 설정 (데이터 없으면 숨김)
  const setSpecValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) {
      const row = el.closest('.watch-detail-spec');
      if (value && value !== '-') {
        el.textContent = value;
        if (row) row.style.display = '';
      } else {
        el.textContent = '';
        if (row) row.style.display = 'none';
      }
    }
  };

  setSpecValue('watch-detail-material', materialNames[watch.material] || watch.material);
  setSpecValue('watch-detail-case', watch.case_description);
  setSpecValue('watch-detail-diameter', watch.diameter);
  setSpecValue('watch-detail-dial', watch.dial);
  setSpecValue('watch-detail-bezel', watch.bezel);
  setSpecValue('watch-detail-bracelet', watch.bracelet);
  setSpecValue('watch-detail-material-detail', watch.material_detail);
  setSpecValue('watch-detail-movement', watch.movement);
  setSpecValue('watch-detail-cyclops', watch.cyclops);

  watchDetailModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function hideWatchDetail() {
  watchDetailModal.classList.remove('active');
  document.body.style.overflow = '';
}

// 모달 닫기 이벤트
watchDetailClose.addEventListener('click', hideWatchDetail);
watchDetailModal.addEventListener('click', (e) => {
  if (e.target === watchDetailModal) hideWatchDetail();
});

// 필터 초기화
function resetFilters() {
  searchInput.value = '';
  materialFilter.value = '';
  bezelFilter.value = '';
  braceletFilter.value = '';
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
  // 보안: 비로그인/미승인 시 차트 렌더링 차단
  if (!currentUser || !isApproved) return;

  renderAttributeRatesChart();
  renderStatusChart();
  renderPriceChart();
}

// 속성별 매입률 계산
function calculateBuyRates(watchList, field) {
  const groups = {};
  watchList.forEach(w => {
    const key = w[field] || '미지정';
    if (!groups[key]) groups[key] = { total: 0, buy: 0 };
    groups[key].total++;
    if (w.buy_status === 'buy') groups[key].buy++;
  });
  return Object.entries(groups)
    .map(([name, data]) => ({
      name: name,
      total: data.total,
      buy: data.buy,
      rate: data.total > 0 ? Math.round((data.buy / data.total) * 100) : 0
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);
}

// 현재 선택된 속성 탭
let selectedRateTab = 'material_detail';

// 속성별 매입률 차트 - 필터링된 데이터 기준 (탭 방식)
function renderAttributeRatesChart() {
  const lineChart = document.getElementById('line-chart');
  const targetWatches = filteredWatches.length > 0 ? filteredWatches : watches;

  if (targetWatches.length === 0) {
    lineChart.innerHTML = '<div class="no-data">데이터 없음</div>';
    return;
  }

  const tabData = {
    material_detail: { label: '소재별', rates: calculateBuyRates(targetWatches, 'material_detail') },
    bezel: { label: '베젤별', rates: calculateBuyRates(targetWatches, 'bezel') },
    bracelet: { label: '브레이슬릿별', rates: calculateBuyRates(targetWatches, 'bracelet') }
  };

  const currentRates = tabData[selectedRateTab].rates;
  const maxRate = Math.max(...currentRates.map(r => r.rate), 1);

  lineChart.innerHTML = `
    <div class="rate-tabs">
      ${Object.entries(tabData).map(([key, data]) => `
        <button class="rate-tab ${selectedRateTab === key ? 'active' : ''}" data-tab="${key}">
          ${data.label}
        </button>
      `).join('')}
    </div>
    <div class="rate-content">
      ${currentRates.length === 0 ? '<div class="no-data">데이터 없음</div>' : currentRates.map(r => `
        <div class="rate-bar-item">
          <div class="rate-bar-header">
            <span class="rate-bar-label">${r.name}</span>
            <span class="rate-bar-value">${r.rate}% <em>(${r.buy}/${r.total})</em></span>
          </div>
          <div class="rate-bar-track-lg">
            <div class="rate-bar-fill-lg" style="width: ${(r.rate / maxRate) * 100}%"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // 탭 클릭 이벤트
  lineChart.querySelectorAll('.rate-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      selectedRateTab = tab.dataset.tab;
      renderAttributeRatesChart();
    });
  });
}

// 상태별 차트 (도넛) - 필터링된 데이터 기준
function renderStatusChart() {
  const statusChart = document.getElementById('status-chart');
  const targetWatches = filteredWatches.length > 0 ? filteredWatches : watches;
  const counts = { buy: 0, pending: 0, no: 0 };

  targetWatches.forEach(w => {
    if (counts.hasOwnProperty(w.buy_status)) {
      counts[w.buy_status]++;
    }
  });

  const total = counts.buy + counts.pending + counts.no;
  if (total === 0) {
    statusChart.innerHTML = '<div class="no-data">데이터 없음</div>';
    return;
  }
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

// 가격대별 차트 (스택 바) - 필터링된 데이터 기준
function renderPriceChart() {
  const priceChart = document.getElementById('price-chart');
  const targetWatches = filteredWatches.length > 0 ? filteredWatches : watches;

  const priceRanges = [
    { label: '2천 이하', min: 0, max: 20000000 },
    { label: '2~3천', min: 20000000, max: 30000000 },
    { label: '3~5천', min: 30000000, max: 50000000 },
    { label: '5~7천', min: 50000000, max: 70000000 },
    { label: '7천~1억', min: 70000000, max: 100000000 },
    { label: '1억 이상', min: 100000000, max: Infinity }
  ];

  const counts = priceRanges.map(range => {
    const rangeWatches = targetWatches.filter(w => w.price >= range.min && w.price < range.max);
    return {
      label: range.label,
      total: rangeWatches.length,
      buy: rangeWatches.filter(w => w.buy_status === 'buy').length,
      pending: rangeWatches.filter(w => w.buy_status === 'pending').length,
      no: rangeWatches.filter(w => w.buy_status === 'no').length
    };
  });

  const maxCount = Math.max(...counts.map(c => c.total), 1);

  priceChart.innerHTML = `
    <div class="bar-chart stacked">
      ${counts.map(({ label, total, buy, pending, no }) => {
        const buyWidth = (buy / maxCount) * 100;
        const pendingWidth = (pending / maxCount) * 100;
        const noWidth = (no / maxCount) * 100;
        return `
          <div class="bar-item">
            <span class="bar-label">${label}</span>
            <div class="bar-track stacked-track">
              <div class="bar-fill buy" style="width: ${buyWidth}%"></div>
              <div class="bar-fill pending" style="width: ${pendingWidth}%"></div>
              <div class="bar-fill no" style="width: ${noWidth}%"></div>
            </div>
            <span class="bar-value">${total}</span>
          </div>
        `;
      }).join('')}
    </div>
    <div class="stacked-legend">
      <span class="legend-item"><span class="legend-dot buy"></span>매입 </span>
      <span class="legend-item"><span class="legend-dot pending"></span>컨펌 </span>
      <span class="legend-item"><span class="legend-dot no"></span>불가</span>
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

bezelFilter.addEventListener('change', () => {
  displayedCount = 50;
  applyFilters();
});

braceletFilter.addEventListener('change', () => {
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

// ==========================================
// 모바일 필터 모달
// ==========================================
const filterModal = document.getElementById('filter-modal');
const mobileFilterBtn = document.getElementById('mobile-filter-btn');
const filterModalClose = document.getElementById('filter-modal-close');
const mobileApplyBtn = document.getElementById('mobile-apply-btn');
const mobileResetBtn = document.getElementById('mobile-reset-btn');
const mobileLineGrid = document.getElementById('mobile-line-grid');
const mobileSearchInput = document.getElementById('mobile-search-input');
const mobileMainSearch = document.getElementById('mobile-main-search');
const mobileMaterialFilter = document.getElementById('mobile-material-filter');
const mobileBezelFilter = document.getElementById('mobile-bezel-filter');
const mobileBraceletFilter = document.getElementById('mobile-bracelet-filter');
const mobilePriceFilter = document.getElementById('mobile-price-filter');
const mobileSortSelect = document.getElementById('mobile-sort-select');
const mobileStatusChips = document.querySelectorAll('.filter-status-chip');

// 모달 열기
function openFilterModal() {
  // 현재 필터 상태를 모바일 필터에 동기화
  syncDesktopToMobile();
  filterModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// 모달 닫기
function closeFilterModal() {
  filterModal.classList.remove('active');
  document.body.style.overflow = '';
}

// 데스크톱 필터 → 모바일 동기화
function syncDesktopToMobile() {
  mobileSearchInput.value = searchInput.value;
  if (mobileMainSearch) mobileMainSearch.value = searchInput.value;
  mobileMaterialFilter.value = materialFilter.value;
  mobileBezelFilter.value = bezelFilter.value;
  mobileBraceletFilter.value = braceletFilter.value;
  mobilePriceFilter.value = priceFilter.value;
  mobileSortSelect.value = sortSelect.value;

  // 상태 칩 동기화
  statusCheckboxes.forEach(cb => {
    const mobileChip = document.querySelector(`.filter-status-chip[data-status="${cb.value}"]`);
    if (mobileChip) {
      const mobileInput = mobileChip.querySelector('input');
      mobileInput.checked = cb.checked;
      mobileChip.classList.toggle('active', cb.checked);
    }
  });

  // 라인 버튼 활성화 상태 동기화
  const lineButtons = mobileLineGrid.querySelectorAll('.filter-line-btn');
  lineButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.line === selectedLine);
  });
}

// 모바일 필터 → 데스크톱 동기화 및 적용
function applyMobileFilters() {
  searchInput.value = mobileSearchInput.value;
  materialFilter.value = mobileMaterialFilter.value;
  bezelFilter.value = mobileBezelFilter.value;
  braceletFilter.value = mobileBraceletFilter.value;
  priceFilter.value = mobilePriceFilter.value;
  sortSelect.value = mobileSortSelect.value;

  // 상태 칩 동기화
  mobileStatusChips.forEach(chip => {
    const mobileInput = chip.querySelector('input');
    const desktopCb = document.querySelector(`.status-chip input[value="${mobileInput.value}"]`);
    if (desktopCb) {
      desktopCb.checked = mobileInput.checked;
    }
  });

  // 라인 선택 동기화
  const activeLineBtn = mobileLineGrid.querySelector('.filter-line-btn.active');
  if (activeLineBtn) {
    const lineName = activeLineBtn.dataset.line;
    selectLine(lineName);
  }

  displayedCount = 50;
  applyFilters();
  closeFilterModal();
}

// 모바일 필터 초기화
function resetMobileFilters() {
  mobileSearchInput.value = '';
  mobileMaterialFilter.value = '';
  mobileBezelFilter.value = '';
  mobileBraceletFilter.value = '';
  mobilePriceFilter.value = '';
  mobileSortSelect.value = 'price-asc';

  // 상태 칩 모두 활성화
  mobileStatusChips.forEach(chip => {
    const input = chip.querySelector('input');
    input.checked = true;
    chip.classList.add('active');
  });

  // 라인 전체 선택
  const lineButtons = mobileLineGrid.querySelectorAll('.filter-line-btn');
  lineButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.line === '');
  });
}

// 모바일 라인 그리드 생성
function createMobileLineGrid() {
  const lines = [...new Set(watches.map(w => w.line))].sort();

  // 전체 버튼
  let html = `<button class="filter-line-btn active" data-line="">
    전체
    <span class="line-count">${watches.length}</span>
  </button>`;

  // 각 라인 버튼
  lines.forEach(line => {
    const count = watches.filter(w => w.line === line).length;
    html += `<button class="filter-line-btn" data-line="${line}">
      ${line}
      <span class="line-count">${count}</span>
    </button>`;
  });

  mobileLineGrid.innerHTML = html;

  // 클릭 이벤트 추가
  mobileLineGrid.querySelectorAll('.filter-line-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mobileLineGrid.querySelectorAll('.filter-line-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// 모바일 필터 드롭다운 옵션 동기화
function syncMobileFilterOptions() {
  // 소재 옵션 복사
  mobileMaterialFilter.innerHTML = materialFilter.innerHTML;
  // 베젤 옵션 복사
  mobileBezelFilter.innerHTML = bezelFilter.innerHTML;
  // 브레이슬릿 옵션 복사
  mobileBraceletFilter.innerHTML = braceletFilter.innerHTML;
}

// 이벤트 리스너
if (mobileFilterBtn) {
  mobileFilterBtn.addEventListener('click', openFilterModal);
}

if (filterModalClose) {
  filterModalClose.addEventListener('click', closeFilterModal);
}

if (mobileApplyBtn) {
  mobileApplyBtn.addEventListener('click', applyMobileFilters);
}

if (mobileResetBtn) {
  mobileResetBtn.addEventListener('click', resetMobileFilters);
}

// 상태 칩 토글
mobileStatusChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const input = chip.querySelector('input');
    input.checked = !input.checked;
    chip.classList.toggle('active', input.checked);
  });
});

// 모달 배경 클릭 시 닫기
if (filterModal) {
  filterModal.addEventListener('click', (e) => {
    if (e.target === filterModal) {
      closeFilterModal();
    }
  });
}

// 모바일 메인 검색창 이벤트 (데스크톱 검색과 동기화)
if (mobileMainSearch) {
  mobileMainSearch.addEventListener('input', debounce(() => {
    searchInput.value = mobileMainSearch.value;
    displayedCount = 50;
    applyFilters();
  }, 300));
}

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

// 시작 - init()은 인증 확인 후 호출됨 (handleAuthStateChange에서)
// init();

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

// 드롭다운 관련 요소
const userProfileBtn = document.getElementById('user-profile-btn');
const userDropdown = document.getElementById('user-dropdown');
const dropdownAvatar = document.getElementById('dropdown-avatar');
const dropdownName = document.getElementById('dropdown-name');
const dropdownEmail = document.getElementById('dropdown-email');

// 인증 상태 감시는 아래 handleAuthStateChange 함수에서 처리

// 인증 UI 업데이트
function updateAuthUI() {
  if (currentUser) {
    loginBtnContainer.style.display = 'none';
    userInfoContainer.style.display = 'flex';

    const photoURL = currentUser.photoURL || 'https://via.placeholder.com/32';
    const displayName = currentUser.displayName || currentUser.email?.split('@')[0] || '사용자';

    // 헤더 프로필
    userAvatar.src = photoURL;
    userName.textContent = displayName;

    // 드롭다운 정보
    if (dropdownAvatar) dropdownAvatar.src = photoURL;
    if (dropdownName) dropdownName.textContent = displayName;
    if (dropdownEmail) dropdownEmail.textContent = currentUser.email || '';
  } else {
    loginBtnContainer.style.display = 'block';
    userInfoContainer.style.display = 'none';
    closeUserDropdown();
  }
}

// 드롭다운 토글
function toggleUserDropdown() {
  if (userDropdown) {
    userDropdown.classList.toggle('active');
  }
}

// 드롭다운 닫기
function closeUserDropdown() {
  if (userDropdown) {
    userDropdown.classList.remove('active');
  }
}

// 드롭다운 이벤트 리스너
if (userProfileBtn) {
  userProfileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleUserDropdown();
  });
}

// 외부 클릭 시 드롭다운 닫기
document.addEventListener('click', (e) => {
  if (userDropdown && !userDropdown.contains(e.target) && !userProfileBtn?.contains(e.target)) {
    closeUserDropdown();
  }
});

// 내 정보 버튼
// 내 정보 모달 요소
const myInfoModal = document.getElementById('my-info-modal');
const myInfoModalClose = document.getElementById('my-info-modal-close');

// 내 정보 모달 표시
async function showMyInfoModal() {
  if (!currentUser || !userProfile) return;

  // 기본 정보 채우기
  document.getElementById('my-info-avatar').src = currentUser.photoURL || 'https://via.placeholder.com/80';
  document.getElementById('my-info-name').textContent = getDisplayName(userProfile);
  document.getElementById('my-info-email').textContent = currentUser.email || '';
  document.getElementById('my-info-realname').textContent = userProfile.name || '-';
  document.getElementById('my-info-nickname').textContent = userProfile.nickname || '-';
  document.getElementById('my-info-phone').textContent = userProfile.phone || '-';

  // 등급 표시
  const roleEl = document.getElementById('my-info-role');
  if (roleEl) {
    roleEl.textContent = ROLE_LABELS[userRole] || '일반회원';
  }

  // 수정 모드 초기화 (보기 모드로)
  const viewMode = document.getElementById('my-info-view-mode');
  const editMode = document.getElementById('my-info-edit-mode');
  if (viewMode) viewMode.style.display = 'block';
  if (editMode) editMode.style.display = 'none';

  // 가입일 표시
  const joinDateEl = document.getElementById('my-info-joindate');
  if (joinDateEl) {
    if (userProfile.createdAt) {
      const joinDate = userProfile.createdAt.toDate ? userProfile.createdAt.toDate() : new Date(userProfile.createdAt);
      joinDateEl.textContent = joinDate.toLocaleDateString('ko-KR');

      // 활동 기간 계산
      const activeDaysEl = document.getElementById('my-info-activedays');
      if (activeDaysEl) {
        const today = new Date();
        const diffTime = today - joinDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        activeDaysEl.textContent = `${diffDays}일째`;
      }
    } else {
      joinDateEl.textContent = '-';
      const activeDaysEl = document.getElementById('my-info-activedays');
      if (activeDaysEl) activeDaysEl.textContent = '-';
    }
  }

  // 소속 매니저 / 초대코드 입력 섹션
  const managerSection = document.getElementById('my-info-manager-section');
  const joinManagerSection = document.getElementById('my-info-join-manager-section');

  if (['manager', 'owner'].includes(userRole)) {
    // 매니저 이상: 소속 매니저 섹션 숨김
    if (managerSection) managerSection.style.display = 'none';
    if (joinManagerSection) joinManagerSection.style.display = 'none';
  } else if (currentManagerId) {
    // 일반 회원/딜러: 소속 매니저 표시
    if (joinManagerSection) joinManagerSection.style.display = 'none';
    if (managerSection) {
      managerSection.style.display = 'block';
      // 매니저 이름 가져오기 (닉네임 우선)
      try {
        const managerDoc = await db.collection('users').doc(currentManagerId).get();
        if (managerDoc.exists) {
          const managerData = managerDoc.data();
          const managerName = getDisplayName(managerData);
          document.getElementById('my-info-manager-name').textContent = managerName;
        } else {
          document.getElementById('my-info-manager-name').textContent = '-';
        }
      } catch (error) {
        console.error('매니저 정보 로드 실패:', error);
        document.getElementById('my-info-manager-name').textContent = '-';
      }
    }
  } else {
    // 소속 매니저 없음: 초대코드 입력 섹션 표시
    if (managerSection) managerSection.style.display = 'none';
    if (joinManagerSection) joinManagerSection.style.display = 'block';
  }

  // 최근 테스트 3개 불러오기
  const testsListEl = document.getElementById('my-info-tests-list');
  if (testsListEl) {
    try {
      const scoresSnapshot = await db.collection('users').doc(currentUser.uid)
        .collection('scores')
        .orderBy('timestamp', 'desc')
        .limit(3)
        .get();

      if (scoresSnapshot.empty) {
        testsListEl.innerHTML = '<div class="my-info-no-tests">기록 없음</div>';
      } else {
        testsListEl.innerHTML = scoresSnapshot.docs.map(doc => {
          const data = doc.data();
          const lineName = data.line === 'all' ? '전체' : (lineNames[data.line] || data.line || '전체');
          const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
          const daysAgo = Math.floor((new Date() - timestamp) / (1000 * 60 * 60 * 24));
          const timeText = daysAgo === 0 ? '오늘' : `${daysAgo}일 전`;
          return `
            <div class="my-info-test-item">
              <span class="test-line-name">${lineName}</span>
              <span class="test-score">${data.score}/10</span>
              <span class="test-date">${timeText}</span>
            </div>
          `;
        }).join('');
      }
    } catch (error) {
      console.error('테스트 기록 로드 실패:', error);
      testsListEl.innerHTML = '<div class="my-info-no-tests">기록 없음</div>';
    }
  }

  myInfoModal.classList.add('active');
}

// 내 정보 모달 숨기기
function hideMyInfoModal() {
  myInfoModal.classList.remove('active');
}

// 내 정보 수정 모드 전환
function showMyInfoEditMode() {
  const viewMode = document.getElementById('my-info-view-mode');
  const editMode = document.getElementById('my-info-edit-mode');

  // 현재 값으로 입력 필드 초기화
  document.getElementById('my-info-edit-name').value = userProfile.name || '';
  document.getElementById('my-info-edit-nickname').value = userProfile.nickname || '';
  document.getElementById('my-info-edit-phone').value = userProfile.phone || '';

  if (viewMode) viewMode.style.display = 'none';
  if (editMode) editMode.style.display = 'block';
}

// 내 정보 수정 취소
function cancelMyInfoEdit() {
  const viewMode = document.getElementById('my-info-view-mode');
  const editMode = document.getElementById('my-info-edit-mode');

  if (viewMode) viewMode.style.display = 'block';
  if (editMode) editMode.style.display = 'none';
}

// 내 정보 저장
async function saveMyInfoEdit() {
  const name = document.getElementById('my-info-edit-name').value.trim();
  const nickname = document.getElementById('my-info-edit-nickname').value.trim();
  const phone = document.getElementById('my-info-edit-phone').value.trim();

  if (!name || !nickname || !phone) {
    alert('이름, 닉네임, 연락처는 필수입니다.');
    return;
  }

  // 닉네임이 변경된 경우 중복 검사
  if (nickname !== userProfile.nickname) {
    const isDuplicate = await checkNicknameDuplicate(nickname, currentUser.uid);
    if (isDuplicate) {
      alert('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.');
      return;
    }
  }

  const saveBtn = document.getElementById('my-info-save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';
  }

  try {
    // Firestore 업데이트
    await db.collection('users').doc(currentUser.uid).update({
      name,
      nickname,
      phone,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 로컬 데이터 업데이트
    userProfile.name = name;
    userProfile.nickname = nickname;
    userProfile.phone = phone;

    // UI 업데이트
    document.getElementById('my-info-realname').textContent = name;
    document.getElementById('my-info-nickname').textContent = nickname;
    document.getElementById('my-info-phone').textContent = phone;
    document.getElementById('my-info-name').textContent = getDisplayName(userProfile);

    // 보기 모드로 전환
    cancelMyInfoEdit();

    alert('정보가 수정되었습니다.');

  } catch (error) {
    console.error('정보 수정 실패:', error);
    alert('정보 수정에 실패했습니다. 다시 시도해주세요.');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '저장';
    }
  }
}

// 내 정보 수정 이벤트 리스너
const myInfoEditBtn = document.getElementById('my-info-edit-btn');
const myInfoCancelBtn = document.getElementById('my-info-cancel-btn');
const myInfoSaveBtn = document.getElementById('my-info-save-btn');

if (myInfoEditBtn) {
  myInfoEditBtn.addEventListener('click', showMyInfoEditMode);
}
if (myInfoCancelBtn) {
  myInfoCancelBtn.addEventListener('click', cancelMyInfoEdit);
}
if (myInfoSaveBtn) {
  myInfoSaveBtn.addEventListener('click', saveMyInfoEdit);
}

// 내 정보 모달 이벤트 리스너
if (myInfoModalClose) {
  myInfoModalClose.addEventListener('click', hideMyInfoModal);
}
if (myInfoModal) {
  myInfoModal.addEventListener('click', (e) => {
    if (e.target === myInfoModal) hideMyInfoModal();
  });
}

// 매니저 연결 (초대코드 입력) 기능
const joinCodeInput = document.getElementById('my-info-join-code-input');
const joinCodeBtn = document.getElementById('my-info-join-code-btn');

async function joinManagerByCode() {
  if (!currentUser) return;

  const code = joinCodeInput.value.trim().toUpperCase();
  if (code.length !== 6) {
    alert('초대코드는 6자리입니다.');
    return;
  }

  joinCodeBtn.disabled = true;
  joinCodeBtn.textContent = '확인 중...';

  try {
    // 초대코드 확인
    const codeDoc = await db.collection('inviteCodes').doc(code).get();
    if (!codeDoc.exists) {
      alert('존재하지 않는 초대코드입니다.');
      return;
    }

    const codeData = codeDoc.data();
    if (!codeData.active) {
      alert('비활성화된 초대코드입니다.');
      return;
    }

    const managerId = codeData.managerId;
    const managerName = codeData.managerName || '매니저';

    // 확인 메시지
    if (!confirm(`${managerName} 매니저에게 연결하시겠습니까?`)) {
      return;
    }

    // 사용자 정보 업데이트
    await db.collection('users').doc(currentUser.uid).update({
      managerId: managerId,
      linkedByCode: code,
      linkedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 로컬 변수 업데이트
    currentManagerId = managerId;
    if (userProfile) {
      userProfile.managerId = managerId;
      userProfile.linkedByCode = code;
    }

    alert(`${managerName} 매니저에게 연결되었습니다. 이제 해당 매니저의 매입 리스트를 볼 수 있습니다.`);

    // 모달 닫고 데이터 새로고침
    hideMyInfoModal();

    // 시계 상태 데이터 새로고침
    if (dataLoaded) {
      dataLoaded = false;
      await init();
    }

  } catch (error) {
    console.error('매니저 연결 실패:', error);
    alert('매니저 연결에 실패했습니다. 다시 시도해주세요.');
  } finally {
    joinCodeBtn.disabled = false;
    joinCodeBtn.textContent = '연결';
  }
}

if (joinCodeBtn) {
  joinCodeBtn.addEventListener('click', joinManagerByCode);
}

if (joinCodeInput) {
  // 대문자 변환 및 엔터키 처리
  joinCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
  joinCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinManagerByCode();
    }
  });
}

// 내 정보 버튼
const dropdownMyInfo = document.getElementById('dropdown-my-info');
if (dropdownMyInfo) {
  dropdownMyInfo.addEventListener('click', () => {
    closeUserDropdown();
    showMyInfoModal();
  });
}

// ==========================================
// 초대코드 모달 (매니저 이상)
// ==========================================
const inviteCodeModal = document.getElementById('invite-code-modal');
const inviteCodeModalClose = document.getElementById('invite-code-modal-close');
const dropdownInviteCode = document.getElementById('dropdown-invite-code');
const modalCopyInviteCode = document.getElementById('modal-copy-invite-code');

// 초대코드 모달 표시
async function showInviteCodeModal() {
  if (!inviteCodeModal) return;

  // 초대코드 표시
  const codeDisplay = document.getElementById('modal-invite-code');
  if (codeDisplay) {
    codeDisplay.textContent = myInviteCode || '------';
  }

  // 초대된 회원 수 조회
  try {
    const linkedUsersSnapshot = await db.collection('users')
      .where('managerId', '==', currentUser.uid)
      .get();

    const invitedCount = document.getElementById('invited-members-count');
    if (invitedCount) {
      invitedCount.textContent = linkedUsersSnapshot.size;
    }
  } catch (e) {
    console.log('초대된 회원 수 조회 실패:', e);
  }

  inviteCodeModal.classList.add('active');
}

// 초대코드 모달 숨기기
function hideInviteCodeModal() {
  if (inviteCodeModal) {
    inviteCodeModal.classList.remove('active');
  }
}

// 초대코드 복사 (모달용)
async function copyInviteCodeFromModal() {
  if (!myInviteCode) return;

  try {
    await navigator.clipboard.writeText(myInviteCode);

    // 복사 완료 피드백
    const copyBtn = document.getElementById('modal-copy-invite-code');
    if (copyBtn) {
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        복사됨!
      `;
      copyBtn.classList.add('copied');

      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        copyBtn.classList.remove('copied');
      }, 2000);
    }
  } catch (e) {
    // 클립보드 API 실패 시 fallback
    const textarea = document.createElement('textarea');
    textarea.value = myInviteCode;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('초대코드가 복사되었습니다: ' + myInviteCode);
  }
}

// 초대코드 버튼 클릭 이벤트
if (dropdownInviteCode) {
  dropdownInviteCode.addEventListener('click', () => {
    closeUserDropdown();
    showInviteCodeModal();
  });
}

// 초대코드 모달 닫기 버튼
if (inviteCodeModalClose) {
  inviteCodeModalClose.addEventListener('click', hideInviteCodeModal);
}

// 초대코드 모달 배경 클릭 시 닫기
if (inviteCodeModal) {
  inviteCodeModal.addEventListener('click', (e) => {
    if (e.target === inviteCodeModal) hideInviteCodeModal();
  });
}

// 초대코드 복사 버튼
if (modalCopyInviteCode) {
  modalCopyInviteCode.addEventListener('click', copyInviteCodeFromModal);
}

// 테스트 통계 상세보기 버튼 (내 정보 모달 내)
const myInfoStatsBtn = document.getElementById('my-info-stats-btn');
if (myInfoStatsBtn) {
  myInfoStatsBtn.addEventListener('click', () => {
    hideMyInfoModal();
    switchTab('stats');
  });
}

// 로그인 모달 표시/숨기기
function showLoginModal() {
  loginModal.classList.add('active');
}

function hideLoginModal() {
  loginModal.classList.remove('active');
  // 모달 닫을 때 선택 화면으로 초기화
  if (typeof showLoginStepSelect === 'function') {
    showLoginStepSelect();
  }
}

// 회원가입용 초대코드 저장 변수 (sessionStorage에서 복원)
let signupInviteCode = sessionStorage.getItem('signupInviteCode') || null;
let signupInviteData = JSON.parse(sessionStorage.getItem('signupInviteData') || 'null');

// 초대코드 정보 저장 (sessionStorage 포함)
function setSignupInviteInfo(code, data) {
  console.log('[DEBUG] setSignupInviteInfo 호출:', code, data);
  signupInviteCode = code;
  signupInviteData = data;
  if (code && data) {
    sessionStorage.setItem('signupInviteCode', code);
    sessionStorage.setItem('signupInviteData', JSON.stringify(data));
    console.log('[DEBUG] sessionStorage 저장 완료');
  } else {
    sessionStorage.removeItem('signupInviteCode');
    sessionStorage.removeItem('signupInviteData');
  }
}

// 초대코드 정보 초기화
function clearSignupInviteInfo() {
  signupInviteCode = null;
  signupInviteData = null;
  sessionStorage.removeItem('signupInviteCode');
  sessionStorage.removeItem('signupInviteData');
}

// 로그인 모달 단계 전환
const loginStepSelect = document.getElementById('login-step-select');
const loginStepInvite = document.getElementById('login-step-invite');
const signupInviteInput = document.getElementById('signup-invite-code');
const inviteBackBtn = document.getElementById('invite-back-btn');
const inviteNextBtn = document.getElementById('invite-next-btn');

function showLoginStepSelect() {
  if (loginStepSelect) loginStepSelect.style.display = 'block';
  if (loginStepInvite) loginStepInvite.style.display = 'none';
  if (signupInviteInput) signupInviteInput.value = '';
  // 초대코드 정보는 여기서 지우지 않음 (회원가입 완료 시점에 지움)
}

function showLoginStepInvite() {
  if (loginStepSelect) loginStepSelect.style.display = 'none';
  if (loginStepInvite) loginStepInvite.style.display = 'block';
  if (signupInviteInput) signupInviteInput.focus();
}

// Google 로그인 (기존 회원만)
async function loginWithGoogle() {
  try {
    const result = await auth.signInWithPopup(googleProvider);
    const user = result.user;

    // Firestore에서 기존 회원인지 확인
    const userDoc = await db.collection('users').doc(user.uid).get();

    if (!userDoc.exists || !userDoc.data().name) {
      // 등록되지 않은 회원이면 로그아웃 후 안내
      await auth.signOut();
      alert('등록되지 않은 계정입니다.\n회원가입을 먼저 진행해주세요.');
      return;
    }

    hideLoginModal();
    // 로그인 성공 후 페이지 새로고침
    window.location.reload();
  } catch (error) {
    console.error('로그인 실패:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      alert('로그인에 실패했습니다: ' + error.message);
    }
  }
}

// 초대코드 검증 후 Google 회원가입
async function validateAndSignup() {
  const code = signupInviteInput.value.trim().toUpperCase();

  if (!code || code.length !== 6) {
    alert('6자리 초대코드를 입력해주세요.');
    return;
  }

  // 초대코드 유효성 검증
  const inviteData = await validateInviteCode(code);
  if (!inviteData) {
    alert('유효하지 않은 초대코드입니다.\n매니저에게 올바른 코드를 확인해주세요.');
    return;
  }

  // 초대코드 저장 (sessionStorage 포함)
  setSignupInviteInfo(code, inviteData);

  // Google 회원가입 진행
  try {
    const result = await auth.signInWithPopup(googleProvider);
    const user = result.user;

    // 이미 등록된 회원인지 확인
    const userDoc = await db.collection('users').doc(user.uid).get();

    if (userDoc.exists && userDoc.data().name) {
      alert('이미 가입된 계정입니다.\n로그인으로 진행합니다.');
      clearSignupInviteInfo();
      hideLoginModal();
      window.location.reload();
      return;
    }

    // currentUser 설정
    currentUser = user;

    // 페이지 새로고침 없이 직접 프로필 모달 표시
    hideLoginModal();
    showProfileModal();
  } catch (error) {
    console.error('회원가입 실패:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      alert('회원가입에 실패했습니다: ' + error.message);
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
const googleSignupBtn = document.getElementById('google-signup-btn');
loginBtn.addEventListener('click', showLoginModal);
logoutBtn.addEventListener('click', logout);
loginModalClose.addEventListener('click', () => {
  hideLoginModal();
  showLoginStepSelect();
});
googleLoginBtn.addEventListener('click', loginWithGoogle);
if (googleSignupBtn) googleSignupBtn.addEventListener('click', showLoginStepInvite);
if (inviteBackBtn) inviteBackBtn.addEventListener('click', showLoginStepSelect);
if (inviteNextBtn) inviteNextBtn.addEventListener('click', validateAndSignup);
if (signupInviteInput) {
  signupInviteInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') validateAndSignup();
  });
}
loginModal.addEventListener('click', (e) => {
  if (e.target === loginModal) {
    hideLoginModal();
    showLoginStepSelect();
  }
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
const mainNav = document.querySelector('.main-nav');
const statsSection = document.getElementById('stats-section');
const navCalc = document.getElementById('nav-calc');
const calcSection = document.getElementById('calc-section');

// 테스트 DOM 요소
const testTypeSelect = document.getElementById('test-type-select');
const testStart = document.getElementById('test-start');
const testProgress = document.getElementById('test-progress');
const testResult = document.getElementById('test-result');
const testOptions = document.getElementById('test-options');
const startTestBtn = document.getElementById('start-test-btn');
const retryBtn = document.getElementById('retry-btn');
const viewStatsBtn = document.getElementById('view-stats-btn');
const purchaseChoices = document.getElementById('purchase-choices');
const specTestArea = document.getElementById('spec-test-area');
const specChoicesEl = document.getElementById('spec-choices');

// 현재 활성 탭
let currentTab = 'main';

// 탭 전환
function switchTab(tab) {
  currentTab = tab;

  // 네비게이션 탭 활성화
  document.querySelectorAll('.main-nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  // 컨텐츠 전환 - 직접 DOM 조회로 통일
  const calcEl = document.getElementById('calc-section');

  if (tab === 'main') {
    mainContainer.style.display = 'block';
    vizSection.style.display = 'block';
    lineTabsWrapper.style.display = 'block';
    testSection.style.display = 'none';
    if (statsSection) statsSection.style.display = 'none';
    if (calcEl) calcEl.style.display = 'none';
  } else if (tab === 'test') {
    mainContainer.style.display = 'none';
    vizSection.style.display = 'none';
    lineTabsWrapper.style.display = 'none';
    testSection.style.display = 'block';
    if (statsSection) statsSection.style.display = 'none';
    if (calcEl) calcEl.style.display = 'none';
    showTestTypeSelect();
  } else if (tab === 'stats') {
    mainContainer.style.display = 'none';
    vizSection.style.display = 'none';
    lineTabsWrapper.style.display = 'none';
    testSection.style.display = 'none';
    if (statsSection) statsSection.style.display = 'block';
    if (calcEl) calcEl.style.display = 'none';
    loadStatsPage();
  } else if (tab === 'calc') {
    mainContainer.style.display = 'none';
    vizSection.style.display = 'none';
    lineTabsWrapper.style.display = 'none';
    testSection.style.display = 'none';
    if (statsSection) statsSection.style.display = 'none';
    if (calcEl) calcEl.style.display = 'block';
  }
}

// 네비게이션 이벤트 리스너
navMain.addEventListener('click', () => switchTab('main'));
navTest.addEventListener('click', () => switchTab('test'));
if (navStats) navStats.addEventListener('click', () => switchTab('stats'));
if (navCalc) navCalc.addEventListener('click', () => switchTab('calc'));

// 마진 계산기
function calculateMargin() {
  // 입력값 파싱 (콤마 제거 후 숫자 변환)
  const parseNumber = (str) => parseFloat(str.replace(/,/g, '')) || 0;

  const retailPrice = parseNumber(document.getElementById('calc-retail').value);
  const giftCardRate = parseFloat(document.getElementById('calc-gift-rate').value) || 0;
  const performanceRate = parseFloat(document.getElementById('calc-point-rate').value) || 0;
  const sellingPrice = parseNumber(document.getElementById('calc-sell').value);

  // 입력값 검증
  if (!retailPrice || !sellingPrice) {
    alert('리테일가와 판매가를 입력해주세요.');
    return;
  }

  // 상품권 액면가 = 리테일가를 50만원 단위로 올림
  const giftCardFaceValue = Math.ceil(retailPrice / 500000) * 500000;

  // 거스름돈 (현금) = 상품권 액면가 - 리테일가
  const change = giftCardFaceValue - retailPrice;

  // 상품권 실구매가 = 상품권 액면가 × (1 - 상품권 요율)
  const giftCardActualCost = giftCardFaceValue * (1 - giftCardRate / 100);

  // 포인트 현금화 = 리테일가 × 실적 요율
  const pointsCashback = retailPrice * (performanceRate / 100);

  // 총이득 = (판매가 + 포인트 + 거스름) - 상품권 실구매가
  const totalProfit = (sellingPrice + pointsCashback + change) - giftCardActualCost;

  // 결과 표시
  document.getElementById('result-gift-face').textContent = formatNumber(giftCardFaceValue);
  document.getElementById('result-gift-real').textContent = formatNumber(giftCardActualCost);
  document.getElementById('result-change').textContent = formatNumber(change);
  document.getElementById('result-point').textContent = formatNumber(pointsCashback);
  document.getElementById('result-sell').textContent = formatNumber(sellingPrice);
  document.getElementById('result-total').textContent = formatNumber(totalProfit);

  // 결과 모달 열기
  const calcResultModal = document.getElementById('calc-result-modal');
  if (calcResultModal) {
    calcResultModal.classList.add('active');
  }
}

function formatNumber(num) {
  return Math.round(num).toLocaleString('ko-KR') + '원';
}

// 숫자 입력 필드 자동 포맷팅
function formatInputNumber(input) {
  let value = input.value.replace(/[^\d]/g, '');
  if (value) {
    input.value = parseInt(value).toLocaleString('ko-KR');
  }
}

// 계산기 입력 이벤트 리스너
if (calcSection) {
  const retailInput = document.getElementById('calc-retail');
  const sellInput = document.getElementById('calc-sell');

  if (retailInput) {
    retailInput.addEventListener('input', () => formatInputNumber(retailInput));
  }
  if (sellInput) {
    sellInput.addEventListener('input', () => formatInputNumber(sellInput));
  }
}

// 계산기 결과 모달
const calcResultModal = document.getElementById('calc-result-modal');
const calcResultClose = document.getElementById('calc-result-close');

function hideCalcResultModal() {
  if (calcResultModal) {
    calcResultModal.classList.remove('active');
  }
}

if (calcResultClose) {
  calcResultClose.addEventListener('click', hideCalcResultModal);
}
if (calcResultModal) {
  calcResultModal.addEventListener('click', (e) => {
    if (e.target === calcResultModal) hideCalcResultModal();
  });
}

// 테스트 유형 선택 화면 표시
function showTestTypeSelect() {
  testTypeSelect.style.display = 'block';
  testStart.style.display = 'none';
  testProgress.style.display = 'none';
  testResult.style.display = 'none';

  // 베젤/브레이슬릿 옵션 추출 (최초 1회)
  if (SPEC_OPTIONS.bezel.length === 0) {
    extractSpecOptions();
  }
}

// 시계 데이터에서 베젤/브레이슬릿 옵션 추출
function extractSpecOptions() {
  const bezels = new Set();
  const bracelets = new Set();

  watches.forEach(w => {
    if (w.bezel) bezels.add(w.bezel);
    if (w.bracelet) bracelets.add(w.bracelet);
  });

  SPEC_OPTIONS.bezel = [...bezels].map(b => ({ value: b, label: b }));
  SPEC_OPTIONS.bracelet = [...bracelets].map(b => ({ value: b, label: b }));
}

// 테스트 유형 선택
function selectTestType(type) {
  testType = type;
  showTestStart();
}

// 테스트 시작 화면 표시
function showTestStart() {
  testTypeSelect.style.display = 'none';
  testStart.style.display = 'block';
  testProgress.style.display = 'none';
  testResult.style.display = 'none';

  // 테스트 유형에 따른 제목/설명 변경
  const titleEl = document.getElementById('test-start-title');
  const descEl = document.getElementById('test-start-desc');

  if (testType === 'spec') {
    titleEl.textContent = '스펙 맞추기 테스트';
    descEl.textContent = '10개 시계의 소재, 베젤, 브레이슬릿을 맞춰보세요. (총 30문제)';
  } else {
    titleEl.textContent = '매입 판단 테스트';
    descEl.textContent = '10개의 시계에 대한 매입 판단을 테스트합니다.';
  }

  // 라인 옵션 생성 (체크박스로 다중 선택 가능)
  const lines = [...new Set(watches.map(w => w.line))].sort();

  testOptions.innerHTML = `
    <label class="test-option">
      <input type="checkbox" name="test-line" value="" id="test-line-all" checked>
      <span>전체 라인</span>
    </label>
    ${lines.map(line => `
      <label class="test-option">
        <input type="checkbox" name="test-line" value="${line}">
        <span>${lineNames[line] || line}</span>
      </label>
    `).join('')}
  `;

  // 전체 선택 시 다른 체크 해제, 개별 선택 시 전체 해제
  const allCheckbox = document.getElementById('test-line-all');
  const lineCheckboxes = document.querySelectorAll('input[name="test-line"]:not(#test-line-all)');

  allCheckbox.addEventListener('change', () => {
    if (allCheckbox.checked) {
      lineCheckboxes.forEach(cb => cb.checked = false);
    }
  });

  lineCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        allCheckbox.checked = false;
      }
      // 아무것도 선택 안 되면 전체 체크
      const anyChecked = [...lineCheckboxes].some(c => c.checked);
      if (!anyChecked) {
        allCheckbox.checked = true;
      }
    });
  });
}

// 테스트 시작
function startTest() {
  // 선택된 라인들 가져오기
  const allCheckbox = document.getElementById('test-line-all');
  const selectedLines = allCheckbox.checked
    ? []
    : [...document.querySelectorAll('input[name="test-line"]:checked:not(#test-line-all)')].map(cb => cb.value);

  testLine = selectedLines.length > 0 ? selectedLines.join(',') : 'all';

  // 문제 생성 (무작위 10개)
  let pool = selectedLines.length > 0
    ? watches.filter(w => selectedLines.includes(w.line))
    : watches;

  // 스펙 테스트의 경우 필수 속성이 있는 시계만 선택
  if (testType === 'spec') {
    pool = pool.filter(w => w.material && w.bezel && w.bracelet);
  }

  // 셔플 후 10개 선택
  testQuestions = shuffleArray([...pool]).slice(0, 10);
  currentQuestion = 0;
  testAnswers = [];
  specQuestionPhase = 0;
  specCurrentAnswer = {};

  testStart.style.display = 'none';
  testProgress.style.display = 'block';

  // 테스트 유형에 따른 UI 전환
  if (testType === 'spec') {
    purchaseChoices.style.display = 'none';
    specTestArea.style.display = 'block';
    showSpecQuestion();
  } else {
    purchaseChoices.style.display = 'flex';
    specTestArea.style.display = 'none';
    showQuestion();
  }
}

// 배열 셔플
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// 스펙 테스트 문제 표시
function showSpecQuestion() {
  const question = testQuestions[currentQuestion];
  const imagePath = `images/${question.line}/${question.model_number}.jpg`;
  const totalQuestions = testQuestions.length * 3; // 10문제 x 3질문
  const currentQNum = currentQuestion * 3 + specQuestionPhase + 1;

  document.getElementById('current-q').textContent = currentQNum;
  document.getElementById('progress-fill').style.width = `${(currentQNum / totalQuestions) * 100}%`;

  // 문제 수 업데이트 (30문제)
  const countEl = document.querySelector('.test-count');
  if (countEl) {
    countEl.innerHTML = `문제 <span id="current-q">${currentQNum}</span>/${totalQuestions}`;
  }

  const testImage = document.getElementById('test-image');
  testImage.src = imagePath;
  testImage.onerror = function() {
    this.src = question.image_url;
  };

  // 시계 정보 표시 (스펙 테스트에서는 정답 힌트가 될 수 있는 정보 숨김)
  document.getElementById('test-line-name').textContent = lineNames[question.line] || question.line;
  document.getElementById('test-title').textContent = question.title;
  document.getElementById('test-model').textContent = question.model_number;
  document.getElementById('test-price').textContent = question.formatted_price;
  document.getElementById('test-material').textContent = '???'; // 숨김

  // 질문 유형 표시
  document.getElementById('spec-question-type').textContent = SPEC_PHASE_LABELS[specQuestionPhase];

  // 4지선다 선택지 생성
  const phaseKey = SPEC_PHASE_KEYS[specQuestionPhase];
  const correctAnswer = question[phaseKey];
  const choices = generateSpecChoices(correctAnswer, phaseKey);

  specChoicesEl.innerHTML = choices.map(choice => `
    <button class="spec-choice-btn" data-choice="${choice.value}">
      ${choice.label}
    </button>
  `).join('');

  // 선택지 클릭 이벤트
  specChoicesEl.querySelectorAll('.spec-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => selectSpecAnswer(btn.dataset.choice));
  });
}

// 스펙 테스트 선택지 생성 (정답 1개 + 랜덤 오답 3개)
function generateSpecChoices(correctAnswer, phaseKey) {
  const allOptions = SPEC_OPTIONS[phaseKey];
  const correctOption = allOptions.find(o => o.value === correctAnswer);

  if (!correctOption) {
    // 정답이 옵션 목록에 없으면 추가
    const wrongOptions = shuffleArray([...allOptions]).slice(0, 3);
    return shuffleArray([{ value: correctAnswer, label: correctAnswer }, ...wrongOptions]);
  }

  const wrongOptions = allOptions.filter(o => o.value !== correctAnswer);
  const selectedWrong = shuffleArray([...wrongOptions]).slice(0, 3);
  return shuffleArray([correctOption, ...selectedWrong]);
}

// 스펙 테스트 답변 선택
function selectSpecAnswer(choice) {
  const question = testQuestions[currentQuestion];
  const phaseKey = SPEC_PHASE_KEYS[specQuestionPhase];
  const correctAnswer = question[phaseKey];
  const isCorrect = choice === correctAnswer;

  // 현재 답변 저장
  specCurrentAnswer[phaseKey] = {
    userChoice: choice,
    correctAnswer: correctAnswer,
    isCorrect: isCorrect
  };

  // 피드백 표시
  specChoicesEl.querySelectorAll('.spec-choice-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.choice === choice) {
      btn.classList.add(isCorrect ? 'correct' : 'wrong');
    }
    if (btn.dataset.choice === correctAnswer) {
      btn.classList.add('correct');
    }
  });

  // 0.8초 후 다음으로
  setTimeout(() => {
    specQuestionPhase++;

    if (specQuestionPhase < 3) {
      // 같은 시계의 다음 질문
      showSpecQuestion();
    } else {
      // 시계 하나 완료 - 답변 저장
      testAnswers.push({
        question: question,
        material: specCurrentAnswer.material,
        bezel: specCurrentAnswer.bezel,
        bracelet: specCurrentAnswer.bracelet
      });

      specQuestionPhase = 0;
      specCurrentAnswer = {};
      currentQuestion++;

      if (currentQuestion < testQuestions.length) {
        showSpecQuestion();
      } else {
        showSpecResult();
      }
    }
  }, 800);
}

// 스펙 테스트 결과 표시
function showSpecResult() {
  testProgress.style.display = 'none';
  testResult.style.display = 'block';

  // 정답 수 계산 (각 시계당 3문제)
  let correctCount = 0;
  testAnswers.forEach(a => {
    if (a.material?.isCorrect) correctCount++;
    if (a.bezel?.isCorrect) correctCount++;
    if (a.bracelet?.isCorrect) correctCount++;
  });

  const totalQuestions = testQuestions.length * 3;
  document.getElementById('score-value').textContent = correctCount;
  document.getElementById('score-total').textContent = `/${totalQuestions}`;
  document.getElementById('result-title').textContent = '스펙 테스트 결과';

  // 등급 계산 (30문제 기준)
  let grade = '';
  if (correctCount >= 27) grade = '우수';
  else if (correctCount >= 21) grade = '양호';
  else if (correctCount >= 15) grade = '보통';
  else grade = '노력필요';

  document.getElementById('result-grade').textContent = grade;

  // 상세 결과
  const detailsHtml = testAnswers.map((answer) => {
    const imagePath = `images/${answer.question.line}/${answer.question.model_number}.jpg`;
    const materialResult = answer.material?.isCorrect ? '✓' : '✗';
    const bezelResult = answer.bezel?.isCorrect ? '✓' : '✗';
    const braceletResult = answer.bracelet?.isCorrect ? '✓' : '✗';

    return `
      <div class="result-item spec-result">
        <img class="result-item-image" src="${imagePath}"
             onerror="this.src='${answer.question.image_url}'" alt="">
        <div class="result-item-info">
          <div class="result-item-title">${answer.question.title}</div>
          <div class="result-item-specs">
            <span class="${answer.material?.isCorrect ? 'correct' : 'wrong'}">${materialResult} 소재</span>
            <span class="${answer.bezel?.isCorrect ? 'correct' : 'wrong'}">${bezelResult} 베젤</span>
            <span class="${answer.bracelet?.isCorrect ? 'correct' : 'wrong'}">${braceletResult} 브레이슬릿</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('result-details').innerHTML = detailsHtml;

  // 로그인된 경우 점수 저장
  if (currentUser) {
    saveSpecTestScore(correctCount, totalQuestions);
  }
}

// 스펙 테스트 점수 저장
async function saveSpecTestScore(score, total) {
  if (!currentUser) return;

  try {
    const scoreData = {
      score,
      totalQuestions: total,
      testType: 'spec',
      line: testLine || 'all',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      answers: testAnswers.map(a => ({
        model: a.question.model_number,
        line: a.question.line,
        material: a.material,
        bezel: a.bezel,
        bracelet: a.bracelet
      }))
    };

    await db.collection('users').doc(currentUser.uid)
      .collection('scores').add(scoreData);

  } catch (error) {
    console.error('스펙 테스트 점수 저장 실패:', error);
  }
}

// 문제 표시 (매입 판단 테스트)
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

// 결과 표시 (매입 판단 테스트)
function showResult() {
  testProgress.style.display = 'none';
  testResult.style.display = 'block';

  const correctCount = testAnswers.filter(a => a.isCorrect).length;
  document.getElementById('score-value').textContent = correctCount;
  document.getElementById('score-total').textContent = '/10';
  document.getElementById('result-title').textContent = '테스트 결과';

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
startTestBtn.addEventListener('click', startTest);
retryBtn.addEventListener('click', showTestTypeSelect);

// 테스트 유형 선택 버튼
document.querySelectorAll('.test-type-btn').forEach(btn => {
  btn.addEventListener('click', () => selectTestType(btn.dataset.type));
});

// 매입 판단 테스트 선택 버튼
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

// 사용자 통계 로드 (페이지용) - statsResetAt 기준 필터링
async function loadUserStatsForPage() {
  try {
    // 사용자 문서에서 statsResetAt 확인
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const statsResetAt = userData.statsResetAt?.toDate() || null;

    // scores 쿼리 - statsResetAt 이후 기록만 조회
    let scoresQuery = db.collection('users').doc(currentUser.uid)
      .collection('scores')
      .orderBy('timestamp', 'desc');

    if (statsResetAt) {
      scoresQuery = db.collection('users').doc(currentUser.uid)
        .collection('scores')
        .where('timestamp', '>', statsResetAt)
        .orderBy('timestamp', 'desc');
    }

    const scoresSnapshot = await scoresQuery.get();

    if (scoresSnapshot.empty) {
      renderEmptyStatsPage();
      return;
    }

    // scores에서 통계 계산
    const calculatedStats = calculateStatsFromScores(scoresSnapshot.docs);
    renderStatsPage(calculatedStats, scoresSnapshot.docs.slice(0, 10));
  } catch (error) {
    console.error('통계 로드 실패:', error);
    renderEmptyStatsPage();
  }
}

// scores 기록에서 통계 계산
function calculateStatsFromScores(scoreDocs) {
  const stats = {
    totalTests: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    lineStats: {},
    wrongModels: {}
  };

  scoreDocs.forEach(doc => {
    const data = doc.data();

    // 전체 통계
    stats.totalTests += 1;
    stats.totalCorrect += data.score || 0;
    stats.totalQuestions += data.totalQuestions || 10;

    // 라인별 통계
    const line = data.line || 'all';
    if (!stats.lineStats[line]) {
      stats.lineStats[line] = { correct: 0, total: 0 };
    }
    stats.lineStats[line].correct += data.score || 0;
    stats.lineStats[line].total += data.totalQuestions || 10;

    // 틀린 모델 추적
    if (data.answers && Array.isArray(data.answers)) {
      data.answers.forEach(answer => {
        const modelKey = answer.question?.model_number || answer.model;
        if (!answer.isCorrect && modelKey) {
          stats.wrongModels[modelKey] = (stats.wrongModels[modelKey] || 0) + 1;
        }
      });
    }
  });

  return stats;
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
      <div class="wrong-model-item clickable" onclick="showWatchDetail('${modelNumber}')">
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

// 통계 리셋 함수
async function resetStats() {
  if (!currentUser) return;

  const confirmed = confirm('통계를 리셋하시겠습니까?\n(기존 테스트 기록은 삭제되지 않습니다)');
  if (!confirmed) return;

  try {
    await db.collection('users').doc(currentUser.uid).update({
      statsResetAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 통계 페이지 새로고침
    await loadStatsPage();
    alert('통계가 리셋되었습니다.');
  } catch (error) {
    console.error('통계 리셋 실패:', error);
    alert('통계 리셋에 실패했습니다.');
  }
}

// 통계 버튼 이벤트 리스너 (테스트 결과에서 통계 탭으로 이동)
viewStatsBtn.addEventListener('click', () => switchTab('stats'));

// 통계 리셋 버튼 이벤트 리스너
const statsResetBtn = document.getElementById('stats-reset-btn');
if (statsResetBtn) {
  statsResetBtn.addEventListener('click', resetStats);
}

// ==========================================
// 관리자 기능 - 상태 관리
// ==========================================

// 시계 상태 업데이트 - 버튼용 (매니저 이상)
async function updateWatchStatusBtn(event, btn) {
  event.stopPropagation();
  event.preventDefault();

  if (!canAccess('watch:edit_status')) return;

  const modelNumber = btn.dataset.model;
  const newStatus = btn.dataset.status;

  // 로컬 watches 배열에서 해당 시계 찾기
  const watchIndex = watches.findIndex(w => w.model_number === modelNumber);
  if (watchIndex === -1) return;

  // 이미 같은 상태면 무시
  if (watches[watchIndex].buy_status === newStatus) return;

  try {
    // 매니저별 watchStatuses에 저장
    const managerId = getWatchStatusesManagerId();
    if (managerId) {
      await db.collection('watchStatuses').doc(managerId).set({
        [modelNumber]: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      // 레거시: 기존 settings/watchStatuses에 저장 (하위 호환성)
      await db.collection('settings').doc('watchStatuses').set({
        [modelNumber]: newStatus
      }, { merge: true });
    }

    // 로컬 watches 배열 업데이트
    watches[watchIndex].buy_status = newStatus;

    // 상태 카운트 업데이트
    updateStatusCounts();

    // 현재 선택된 상태 필터 확인
    const selectedStatuses = Array.from(statusCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    const card = btn.closest('.product-card');

    // 새 상태가 현재 필터에 포함되지 않으면 카드 제거
    if (!selectedStatuses.includes(newStatus)) {
      if (card) {
        card.remove();
        // filteredWatches에서도 제거
        const filteredIndex = filteredWatches.findIndex(w => w.model_number === modelNumber);
        if (filteredIndex !== -1) {
          filteredWatches.splice(filteredIndex, 1);
        }
        // 필터된 개수 업데이트
        filteredCount.textContent = filteredWatches.length.toLocaleString();
      }
    } else {
      // 필터에 포함되면 카드 업데이트
      if (card) {
        const badge = card.querySelector('.product-badge');
        if (badge) {
          badge.className = `product-badge ${newStatus}`;
          badge.textContent = statusText[newStatus];
        }
        card.querySelectorAll('.status-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.status === newStatus);
        });
      }
    }

    console.log(`상태 변경: ${modelNumber} -> ${newStatus}`);
  } catch (error) {
    console.error('상태 변경 실패:', error);
    alert('상태 변경에 실패했습니다.');
  }
}


// ==========================================
// 사용자 프로필 및 승인 시스템
// ==========================================

// 프로필 관련 DOM 요소
const profileModal = document.getElementById('profile-modal');
const profileForm = document.getElementById('profile-form');
const pendingApproval = document.getElementById('pending-approval');
const adminSection = document.getElementById('admin-section');
const navAdmin = document.getElementById('nav-admin');

// 사용자 프로필 확인 및 로드
async function checkUserProfile() {
  if (!currentUser) return null;

  try {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();

      // role 필드가 없으면 기본값 설정 및 마이그레이션
      let role = data.role;
      if (!role) {
        role = 'member'; // 신규 사용자는 기본 member, 소유자는 Firestore에서 직접 설정
        // Firestore에 role 필드 마이그레이션
        await db.collection('users').doc(currentUser.uid).update({
          role: role,
          roleUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          roleUpdatedBy: 'system-migration'
        });
      }

      // 소속 매니저 ID 설정
      currentManagerId = data.managerId || null;

      // 내 초대코드 설정 (매니저 이상)
      myInviteCode = data.inviteCode || null;

      return {
        name: data.name,
        nickname: data.nickname,
        phone: data.phone,
        referrer: data.referrer,
        status: data.status || 'pending',
        role: role,
        createdAt: data.createdAt,
        managerId: data.managerId,
        inviteCode: data.inviteCode,
        linkedByCode: data.linkedByCode
      };
    }
    return null;
  } catch (error) {
    console.error('프로필 로드 실패:', error);
    return null;
  }
}

// 프로필 모달 표시
function showProfileModal() {
  profileModal.classList.add('active');
  // 네비게이션 숨기기 (프로필 미등록 상태)
  if (mainNav) mainNav.style.display = 'none';

  // 초대코드 정보 표시
  const inviteCodeDisplay = document.getElementById('profile-invite-code');
  const inviteManagerDisplay = document.getElementById('profile-invite-manager');
  if (inviteCodeDisplay && signupInviteCode) {
    inviteCodeDisplay.value = signupInviteCode;
  }
  if (inviteManagerDisplay && signupInviteData) {
    inviteManagerDisplay.textContent = signupInviteData.managerName ?
      `초대자: ${signupInviteData.managerName}` : '';
  }
}

// 프로필 모달 숨기기
function hideProfileModal() {
  profileModal.classList.remove('active');
}

// 승인 대기 화면 표시
function showPendingApproval() {
  pendingApproval.style.display = 'flex';
  mainContainer.style.display = 'none';
  vizSection.style.display = 'none';
  lineTabsWrapper.style.display = 'none';
  testSection.style.display = 'none';
  if (statsSection) statsSection.style.display = 'none';
  if (adminSection) adminSection.style.display = 'none';
  // 네비게이션 숨기기 (승인 대기 상태)
  if (mainNav) mainNav.style.display = 'none';
}

// 승인 대기 화면 숨기기
function hidePendingApproval() {
  pendingApproval.style.display = 'none';
}

// 로그인 필요 화면 표시
function showLoginRequired() {
  const loginRequired = document.getElementById('login-required');
  if (loginRequired) loginRequired.style.display = 'flex';
  mainContainer.style.display = 'none';
  vizSection.style.display = 'none';
  lineTabsWrapper.style.display = 'none';
  testSection.style.display = 'none';
  if (statsSection) statsSection.style.display = 'none';
  if (adminSection) adminSection.style.display = 'none';
  // 네비게이션 숨기기 (비로그인 상태)
  if (mainNav) mainNav.style.display = 'none';
}

// 로그인 필요 화면 숨기기
function hideLoginRequired() {
  const loginRequired = document.getElementById('login-required');
  if (loginRequired) loginRequired.style.display = 'none';
}

// 메인 컨텐츠 표시 (승인된 사용자용)
function showMainContent() {
  hideLoginRequired();
  hidePendingApproval();
  mainContainer.style.display = 'block';
  vizSection.style.display = 'block';
  lineTabsWrapper.style.display = 'block';
  // 네비게이션 표시 (승인된 사용자)
  if (mainNav) mainNav.style.display = 'flex';

  // 메인 컨텐츠 표시 시 필터 다시 적용
  if (watches.length > 0) {
    applyFilters();
  }
}

// 프로필 폼 제출 처리
async function submitProfile(e) {
  e.preventDefault();

  // Firebase 인증 상태 확인 (Firestore 권한을 위해 auth.currentUser 사용)
  const authUser = auth.currentUser;
  if (!authUser) {
    alert('인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  const name = document.getElementById('profile-name').value.trim();
  const nickname = document.getElementById('profile-nickname').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  const inviteCodeFromForm = document.getElementById('profile-invite-code')?.value?.trim();

  if (!name || !nickname || !phone) {
    alert('이름, 닉네임, 연락처는 필수입니다.');
    return;
  }

  // 초대코드 확인 (폼에서 읽어오기)
  const finalInviteCode = signupInviteCode || inviteCodeFromForm;
  console.log('[DEBUG] submitProfile - signupInviteCode:', signupInviteCode);
  console.log('[DEBUG] submitProfile - inviteCodeFromForm:', inviteCodeFromForm);
  console.log('[DEBUG] submitProfile - finalInviteCode:', finalInviteCode);
  console.log('[DEBUG] submitProfile - signupInviteData:', signupInviteData);

  if (!finalInviteCode) {
    alert('초대코드 정보가 없습니다. 다시 회원가입을 진행해주세요.');
    await auth.signOut();
    window.location.reload();
    return;
  }

  // signupInviteData가 없으면 다시 조회
  let inviteData = signupInviteData;
  if (!inviteData) {
    inviteData = await validateInviteCode(finalInviteCode);
    if (!inviteData) {
      alert('초대코드가 유효하지 않습니다. 다시 회원가입을 진행해주세요.');
      await auth.signOut();
      window.location.reload();
      return;
    }
  }

  try {
    // 닉네임 중복 검사
    const isDuplicate = await checkNicknameDuplicate(nickname, authUser.uid);
    if (isDuplicate) {
      alert('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.');
      return;
    }

    // 기존 데이터 유지하면서 프로필 정보 저장
    const userRef = db.collection('users').doc(authUser.uid);
    const existingDoc = await userRef.get();
    const existingData = existingDoc.exists ? existingDoc.data() : {};

    // 초대코드 가입
    const managerId = inviteData.managerId;
    const userData = {
      ...existingData,
      name,
      nickname,
      phone,
      email: authUser.email,
      photoURL: authUser.photoURL,
      status: 'approved',
      managerId: managerId,
      linkedByCode: finalInviteCode,
      createdAt: existingData.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await userRef.set(userData, { merge: true });

    // 초대코드 정보 초기화
    clearSignupInviteInfo();

    hideProfileModal();

    // 자동 승인 - 바로 메인 콘텐츠 표시
    userProfile = { ...userData };
    currentManagerId = userData.managerId || null;
    isApproved = true;
    if (!dataLoaded) {
      await init();
    }
    showMainContent();
    updateUIByRole();

  } catch (error) {
    console.error('프로필 저장 실패:', error);
    alert('프로필 저장에 실패했습니다. 다시 시도해주세요.');
  }
}

// 인증 상태 변경 시 프로필/승인 상태 확인
async function handleAuthStateChange(user) {
  currentUser = user;

  if (user) {
    // 프로필 확인
    userProfile = await checkUserProfile();

    // 역할 결정 (Firestore의 role 필드 사용)
    if (userProfile && userProfile.role) {
      userRole = userProfile.role;
    } else {
      userRole = 'member';
    }

    if (!userProfile || !userProfile.name) {
      // 프로필이 없으면 프로필 입력 모달 표시
      isApproved = false;
      hideLoginRequired();
      hidePendingApproval();
      showProfileModal();
    } else if (userRole === 'owner') {
      // 소유자는 항상 승인된 상태
      isApproved = true;
      hideProfileModal();

      // 소유자 초대코드/watchStatuses 초기화 (최초 1회)
      if (!myInviteCode) {
        try {
          const newCode = await createUniqueInviteCode();
          await db.collection('users').doc(user.uid).update({
            inviteCode: newCode,
            role: 'owner',
            status: 'approved'
          });
          await db.collection('inviteCodes').doc(newCode).set({
            managerId: user.uid,
            managerName: getDisplayName(userProfile) || user.email,
            active: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          myInviteCode = newCode;

          // 레거시 watchStatuses를 소유자 문서로 마이그레이션
          const legacyDoc = await db.collection('settings').doc('watchStatuses').get();
          if (legacyDoc.exists) {
            const legacyStatuses = legacyDoc.data();
            legacyStatuses.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            legacyStatuses.migratedFrom = 'settings/watchStatuses';
            await db.collection('watchStatuses').doc(user.uid).set(legacyStatuses);
            console.log('레거시 watchStatuses 마이그레이션 완료');
          }

          console.log('소유자 초대코드 생성:', newCode);
        } catch (e) {
          console.log('소유자 초대코드 생성 실패 (이미 존재할 수 있음):', e);
        }
      }

      // 승인된 사용자만 데이터 로드
      if (!dataLoaded) {
        await init();
      }
      showMainContent();
      updateUIByRole();
    } else if (userProfile.status === 'approved') {
      // 승인된 사용자
      isApproved = true;
      hideProfileModal();
      // 승인된 사용자만 데이터 로드
      if (!dataLoaded) {
        await init();
      }
      showMainContent();
      updateUIByRole();
    } else if (userProfile.status === 'rejected') {
      // 거절된 사용자
      isApproved = false;
      hideProfileModal();
      showRejectedScreen();
    } else {
      // 대기 중인 사용자
      isApproved = false;
      hideProfileModal();
      showPendingApproval();
    }
  } else {
    // 로그아웃 상태
    userProfile = null;
    userRole = 'member';
    isApproved = false;
    // 데이터 초기화 (보안)
    watches = [];
    filteredWatches = [];
    dataLoaded = false;
    hideProfileModal();
    hidePendingApproval();
    updateUIByRole();
    // 로그인 필요 화면 표시
    showLoginRequired();
  }

  updateAuthUI();

  // 역할 변경 시 UI 다시 렌더링
  if (watches.length > 0) {
    applyFilters();
  }
}

// 거절 화면 표시
function showRejectedScreen() {
  pendingApproval.style.display = 'flex';
  document.querySelector('.pending-icon').textContent = '❌';
  document.querySelector('.pending-title').textContent = '가입이 거절되었습니다';
  document.querySelector('.pending-message').textContent = '관리자에게 문의해주세요.';

  mainContainer.style.display = 'none';
  vizSection.style.display = 'none';
  lineTabsWrapper.style.display = 'none';
  testSection.style.display = 'none';
  if (statsSection) statsSection.style.display = 'none';
  if (adminSection) adminSection.style.display = 'none';
}

// 역할에 따른 UI 업데이트 (탭 표시/숨김)
function updateUIByRole() {
  const navCalc = document.getElementById('nav-calc');
  const navAdmin = document.getElementById('nav-admin');
  const dropdownInviteCode = document.getElementById('dropdown-invite-code');

  // 계산기 탭: dealer 이상만 표시
  if (navCalc) {
    navCalc.style.display = canAccess('tab:calc') ? 'flex' : 'none';
  }

  // 관리자 탭: owner만 표시
  if (navAdmin) {
    navAdmin.style.display = canAccess('tab:admin') ? 'flex' : 'none';
  }

  // 초대코드 버튼: manager/owner만 표시
  if (dropdownInviteCode) {
    dropdownInviteCode.style.display = ['manager', 'owner'].includes(userRole) ? 'flex' : 'none';
  }
}

// 관리자 네비게이션 표시 (하위 호환성)
function showAdminNav() {
  updateUIByRole();
}

// 관리자 네비게이션 숨기기 (하위 호환성)
function hideAdminNav() {
  updateUIByRole();
}

// 프로필 폼 이벤트 리스너
if (profileForm) {
  profileForm.addEventListener('submit', submitProfile);
}

// 전화번호 자동 포맷팅 (01026291808 → 010-2629-1808)
const phoneInput = document.getElementById('profile-phone');
if (phoneInput) {
  phoneInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/[^0-9]/g, ''); // 숫자만 추출

    if (value.length > 11) {
      value = value.slice(0, 11);
    }

    // 포맷팅 적용
    if (value.length > 7) {
      value = value.replace(/(\d{3})(\d{4})(\d{0,4})/, '$1-$2-$3');
    } else if (value.length > 3) {
      value = value.replace(/(\d{3})(\d{0,4})/, '$1-$2');
    }

    e.target.value = value;
  });
}

// 인증 상태 감시 업데이트 (기존 함수 교체)
auth.onAuthStateChanged(handleAuthStateChange);

// ==========================================
// 관리자 페이지 기능
// ==========================================

let currentAdminTab = 'pending';
let allUsers = [];

// 관리자 탭 전환
function switchAdminTab(tab) {
  currentAdminTab = tab;

  // 탭 활성화
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.adminTab === tab);
  });

  // 사용자 목록 렌더링
  renderAdminUserList();
}

// 관리자 페이지 로드
async function loadAdminPage() {
  if (!canAccess('tab:admin')) return;

  try {
    const snapshot = await db.collection('users')
      .where('name', '!=', '')
      .get();

    allUsers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      allUsers.push({
        id: doc.id,
        ...data
      });
    });

    // 대기 중인 사용자 수 업데이트
    const pendingCount = allUsers.filter(u => u.status === 'pending').length;
    const pendingCountEl = document.getElementById('pending-count');
    if (pendingCountEl) {
      pendingCountEl.textContent = pendingCount;
    }

    renderAdminUserList();
  } catch (error) {
    console.error('사용자 목록 로드 실패:', error);
  }
}

// 관리자 사용자 목록 렌더링
function renderAdminUserList() {
  const userList = document.getElementById('admin-user-list');
  if (!userList) return;

  const filteredUsers = allUsers.filter(user => {
    if (currentAdminTab === 'pending') return user.status === 'pending';
    if (currentAdminTab === 'approved') return user.status === 'approved';
    if (currentAdminTab === 'rejected') return user.status === 'rejected';
    return true;
  });

  if (filteredUsers.length === 0) {
    userList.innerHTML = '<div class="empty-user-list">해당하는 사용자가 없습니다.</div>';
    return;
  }

  // 매니저 목록 (매니저 선택 드롭다운용)
  const managers = allUsers.filter(u => ['manager', 'owner'].includes(u.role) && u.status === 'approved');

  userList.innerHTML = filteredUsers.map(user => {
    const createdAt = user.createdAt?.toDate?.();
    const dateStr = createdAt
      ? `${createdAt.getFullYear()}.${createdAt.getMonth()+1}.${createdAt.getDate()}`
      : '-';

    // 등급 선택 드롭다운 (승인 완료 탭에서만 표시)
    const roleSelector = (currentAdminTab === 'approved') ? `
      <div class="role-selector">
        <select class="role-select" data-user-id="${user.id}" onchange="changeUserRole(this)">
          <option value="member" ${user.role === 'member' || !user.role ? 'selected' : ''}>일반회원</option>
          <option value="dealer" ${user.role === 'dealer' ? 'selected' : ''}>딜러</option>
          <option value="sub_manager" ${user.role === 'sub_manager' ? 'selected' : ''}>소속매니저</option>
          <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>매니저</option>
          <option value="owner" ${user.role === 'owner' ? 'selected' : ''}>소유자</option>
        </select>
      </div>
    ` : '';

    // 매니저 선택 드롭다운 (승인 완료 탭 + 일반회원/딜러만 표시)
    const isNonManager = !['manager', 'owner'].includes(user.role);
    const managerSelector = (currentAdminTab === 'approved' && isNonManager && userRole === 'owner') ? `
      <div class="manager-selector">
        <select class="manager-select" data-user-id="${user.id}" onchange="changeUserManager(this)">
          <option value="">소속 매니저 선택</option>
          ${managers.map(m => `
            <option value="${m.id}" ${user.managerId === m.id ? 'selected' : ''}>
              ${getDisplayName(m)} ${m.role === 'owner' ? '(소유자)' : '(매니저)'}
            </option>
          `).join('')}
        </select>
      </div>
    ` : '';

    // 현재 등급 표시 (승인 완료 탭에서만)
    const roleDisplay = (currentAdminTab === 'approved') ? `
      <div class="user-role">등급: <strong>${ROLE_LABELS[user.role] || '일반회원'}</strong></div>
    ` : '';

    // 소속 매니저 표시 (매니저가 아닌 회원만)
    const currentManager = user.managerId ? managers.find(m => m.id === user.managerId) : null;
    const managerDisplay = (currentAdminTab === 'approved' && isNonManager && currentManager) ? `
      <div class="user-manager">소속: <strong>${getDisplayName(currentManager)}</strong></div>
    ` : (currentAdminTab === 'approved' && isNonManager && !currentManager) ? `
      <div class="user-manager no-manager">소속: <strong>미지정</strong></div>
    ` : '';

    return `
      <div class="admin-user-card" data-user-id="${user.id}">
        <div class="user-avatar">
          <img src="${user.photoURL || 'https://via.placeholder.com/48'}" alt="">
        </div>
        <div class="user-info">
          <div class="user-name">${getDisplayName(user)}</div>
          <div class="user-email">${user.email}</div>
          <div class="user-phone">${user.phone || '-'}</div>
          <div class="user-referrer">${user.referrer ? '추천인: ' + user.referrer : ''}</div>
          <div class="user-date">가입신청: ${dateStr}</div>
          ${roleDisplay}
          ${managerDisplay}
        </div>
        <div class="user-actions">
          ${roleSelector}
          ${managerSelector}
          ${user.status === 'pending' ? `
            <button class="approve-btn" onclick="approveUser('${user.id}')">승인</button>
            <button class="reject-btn" onclick="rejectUser('${user.id}')">거절</button>
          ` : ''}
          ${user.status === 'approved' ? `
            <button class="reject-btn" onclick="rejectUser('${user.id}')">승인 취소</button>
          ` : ''}
          ${user.status === 'rejected' ? `
            <button class="approve-btn" onclick="approveUser('${user.id}')">승인</button>
            <button class="delete-btn" onclick="deleteUser('${user.id}')">삭제</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// 사용자 승인
async function approveUser(userId) {
  if (!canAccess('user:approve')) return;

  try {
    // 수동 승인: 승인자(소유자)에게 매칭
    await db.collection('users').doc(userId).update({
      status: 'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUser.email,
      managerId: currentUser.uid  // 승인자(소유자)에게 매칭
    });

    // 로컬 데이터 업데이트
    const user = allUsers.find(u => u.id === userId);
    if (user) {
      user.status = 'approved';
      user.managerId = currentUser.uid;
    }

    // UI 업데이트
    const pendingCount = allUsers.filter(u => u.status === 'pending').length;
    const pendingCountEl = document.getElementById('pending-count');
    if (pendingCountEl) {
      pendingCountEl.textContent = pendingCount;
    }

    renderAdminUserList();

  } catch (error) {
    console.error('승인 실패:', error);
    alert('승인 처리에 실패했습니다.');
  }
}

// 사용자 거절
async function rejectUser(userId) {
  if (!canAccess('user:reject')) return;

  try {
    await db.collection('users').doc(userId).update({
      status: 'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: currentUser.email
    });

    // 로컬 데이터 업데이트
    const user = allUsers.find(u => u.id === userId);
    if (user) user.status = 'rejected';

    // UI 업데이트
    const pendingCount = allUsers.filter(u => u.status === 'pending').length;
    const pendingCountEl = document.getElementById('pending-count');
    if (pendingCountEl) {
      pendingCountEl.textContent = pendingCount;
    }

    renderAdminUserList();

  } catch (error) {
    console.error('거절 실패:', error);
    alert('거절 처리에 실패했습니다.');
  }
}

// 사용자 삭제 (소유자 전용 - 재가입 가능하도록)
async function deleteUser(userId) {
  if (userRole !== 'owner') {
    alert('삭제 권한이 없습니다.');
    return;
  }

  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  const userName = getDisplayName(user);

  if (!confirm(`"${userName}" 사용자를 삭제하시겠습니까?\n\n삭제 후 해당 사용자는 재가입이 가능합니다.`)) {
    return;
  }

  try {
    // Firestore에서 사용자 문서 삭제
    await db.collection('users').doc(userId).delete();

    // 해당 사용자의 scores 하위 컬렉션도 삭제 (있는 경우)
    try {
      const scoresSnapshot = await db.collection('users').doc(userId).collection('scores').get();
      const batch = db.batch();
      scoresSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (e) {
      console.log('scores 컬렉션 삭제 실패 (없을 수 있음):', e);
    }

    // 로컬 데이터에서 제거
    const index = allUsers.findIndex(u => u.id === userId);
    if (index !== -1) {
      allUsers.splice(index, 1);
    }

    // UI 업데이트
    renderAdminUserList();

    alert(`"${userName}" 사용자가 삭제되었습니다.`);

  } catch (error) {
    console.error('사용자 삭제 실패:', error);
    alert('사용자 삭제에 실패했습니다.');
  }
}

// 사용자 등급 변경
async function changeUserRole(selectEl) {
  if (!canAccess('user:change_role')) {
    alert('등급을 변경할 권한이 없습니다.');
    const user = allUsers.find(u => u.id === selectEl.dataset.userId);
    selectEl.value = user?.role || 'member';
    return;
  }

  const userId = selectEl.dataset.userId;
  const newRole = selectEl.value;
  const user = allUsers.find(u => u.id === userId);
  const oldRole = user?.role || 'member';

  // 자기 자신의 등급은 변경 불가
  if (userId === currentUser.uid) {
    alert('자신의 등급은 변경할 수 없습니다.');
    selectEl.value = userRole;
    return;
  }

  // 매니저 이상에서 딜러/일반회원으로 강등 시 경고
  const wasManager = ['manager', 'owner'].includes(oldRole);
  const isManager = ['manager', 'owner'].includes(newRole);

  if (wasManager && !isManager) {
    const linkedCount = allUsers.filter(u => u.managerId === userId).length;
    const message = linkedCount > 0
      ? `이 매니저에게 연결된 ${linkedCount}명의 회원이 모두 승인 취소됩니다. 계속하시겠습니까?`
      : '매니저 권한을 박탈하면 초대코드가 비활성화됩니다. 계속하시겠습니까?';
    if (!confirm(message)) {
      selectEl.value = oldRole;
      return;
    }
  }

  try {
    const updateData = {
      role: newRole,
      roleUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      roleUpdatedBy: currentUser.email
    };

    // 매니저 이상으로 승급 시 초대코드 생성 또는 재활성화
    if (!wasManager && isManager) {
      // 기존 초대코드가 있으면 재활성화, 없으면 새로 생성
      if (user.inviteCode) {
        // 기존 코드 재활성화
        await db.collection('inviteCodes').doc(user.inviteCode).update({
          active: true,
          reactivatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else {
        // 새 코드 생성
        const newCode = await createUniqueInviteCode();
        updateData.inviteCode = newCode;

        // inviteCodes 컬렉션에 등록
        await db.collection('inviteCodes').doc(newCode).set({
          managerId: userId,
          managerName: getDisplayName(user),
          active: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // watchStatuses 초기화 (모든 상품 불가 상태)
        const initialStatuses = {};
        watches.forEach(watch => {
          initialStatuses[watch.model_number] = 'no';
        });
        initialStatuses.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('watchStatuses').doc(userId).set(initialStatuses);
      }
    }

    // 매니저에서 강등 시 초대코드 비활성화 + 소속 회원 승인 취소
    if (wasManager && !isManager) {
      // 초대코드 비활성화
      if (user.inviteCode) {
        await db.collection('inviteCodes').doc(user.inviteCode).update({
          active: false,
          deactivatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      // 소속 회원 전원 승인 취소
      const linkedUsersSnapshot = await db.collection('users')
        .where('managerId', '==', userId)
        .get();

      const batch = db.batch();
      linkedUsersSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: 'rejected',
          rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
          rejectedReason: '소속 매니저 권한 박탈'
        });
      });
      await batch.commit();

      // 로컬 데이터 업데이트 (소속 회원)
      allUsers.forEach(u => {
        if (u.managerId === userId) {
          u.status = 'rejected';
        }
      });
    }

    // 사용자 정보 업데이트
    await db.collection('users').doc(userId).update(updateData);

    // 로컬 데이터 업데이트
    if (user) {
      user.role = newRole;
      if (updateData.inviteCode) user.inviteCode = updateData.inviteCode;
    }

    // UI 업데이트
    renderAdminUserList();

    // 성공 메시지
    if (!wasManager && isManager) {
      alert(`${user.name || user.email}님이 ${ROLE_LABELS[newRole]}로 승급되었습니다. 초대코드가 생성되었습니다.`);
    }

  } catch (error) {
    console.error('등급 변경 실패:', error);
    alert('등급 변경에 실패했습니다.');
    // 원래 값으로 복원
    selectEl.value = oldRole;
  }
}

// 사용자 소속 매니저 변경 (소유자 전용)
async function changeUserManager(selectEl) {
  if (userRole !== 'owner') {
    alert('매니저 변경 권한이 없습니다.');
    return;
  }

  const userId = selectEl.dataset.userId;
  const newManagerId = selectEl.value;
  const user = allUsers.find(u => u.id === userId);
  const oldManagerId = user?.managerId || '';

  // 같은 매니저면 무시
  if (newManagerId === oldManagerId) return;

  // 매니저 정보 가져오기
  const newManager = newManagerId ? allUsers.find(u => u.id === newManagerId) : null;
  const newManagerName = newManager ? (newManager.name || newManager.email?.split('@')[0]) : '없음';

  try {
    const updateData = {
      managerId: newManagerId || null,
      managerChangedAt: firebase.firestore.FieldValue.serverTimestamp(),
      managerChangedBy: currentUser.email
    };

    // 매니저 해제 시 linkedByCode도 제거
    if (!newManagerId) {
      updateData.linkedByCode = null;
    }

    await db.collection('users').doc(userId).update(updateData);

    // 로컬 데이터 업데이트
    if (user) {
      user.managerId = newManagerId || null;
      if (!newManagerId) user.linkedByCode = null;
    }

    // UI 업데이트
    renderAdminUserList();

    // 알림
    if (newManagerId) {
      console.log(`${user.name || user.email}의 소속 매니저가 ${newManagerName}(으)로 변경되었습니다.`);
    } else {
      console.log(`${user.name || user.email}의 소속 매니저가 해제되었습니다.`);
    }

  } catch (error) {
    console.error('매니저 변경 실패:', error);
    alert('매니저 변경에 실패했습니다.');
    // 원래 값으로 복원
    selectEl.value = oldManagerId;
  }
}

// 관리자 탭 네비게이션 이벤트 리스너
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => switchAdminTab(tab.dataset.adminTab));
});

// 네비게이션에 관리자 탭 추가
if (navAdmin) {
  navAdmin.addEventListener('click', () => {
    if (!canAccess('tab:admin')) return;
    switchTab('admin');
  });
}

// switchTab 함수 업데이트 - 권한 체크 및 관리자 탭 추가
const originalSwitchTab = switchTab;
switchTab = function(tab) {
  // 권한 체크
  if (tab === 'calc' && !canAccess('tab:calc')) {
    alert('계산기 탭에 접근할 권한이 없습니다. (딜러 등급 이상 필요)');
    return;
  }
  if (tab === 'admin' && !canAccess('tab:admin')) {
    alert('관리자 페이지에 접근할 권한이 없습니다.');
    return;
  }

  currentTab = tab;

  // 네비게이션 탭 활성화
  document.querySelectorAll('.main-nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  // calc-section 직접 DOM 조회
  const calcEl = document.getElementById('calc-section');

  // 컨텐츠 전환
  if (tab === 'main') {
    mainContainer.style.display = 'block';
    vizSection.style.display = 'block';
    lineTabsWrapper.style.display = 'block';
    testSection.style.display = 'none';
    if (statsSection) statsSection.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
    if (calcEl) calcEl.style.display = 'none';
  } else if (tab === 'test') {
    mainContainer.style.display = 'none';
    vizSection.style.display = 'none';
    lineTabsWrapper.style.display = 'none';
    testSection.style.display = 'block';
    if (statsSection) statsSection.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
    if (calcEl) calcEl.style.display = 'none';
    showTestTypeSelect();
  } else if (tab === 'stats') {
    mainContainer.style.display = 'none';
    vizSection.style.display = 'none';
    lineTabsWrapper.style.display = 'none';
    testSection.style.display = 'none';
    if (statsSection) statsSection.style.display = 'block';
    if (adminSection) adminSection.style.display = 'none';
    if (calcEl) calcEl.style.display = 'none';
    loadStatsPage();
  } else if (tab === 'calc') {
    mainContainer.style.display = 'none';
    vizSection.style.display = 'none';
    lineTabsWrapper.style.display = 'none';
    testSection.style.display = 'none';
    if (statsSection) statsSection.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
    if (calcEl) calcEl.style.display = 'block';
  } else if (tab === 'admin') {
    mainContainer.style.display = 'none';
    vizSection.style.display = 'none';
    lineTabsWrapper.style.display = 'none';
    testSection.style.display = 'none';
    if (statsSection) statsSection.style.display = 'none';
    if (adminSection) adminSection.style.display = 'block';
    if (calcEl) calcEl.style.display = 'none';
    loadAdminPage();
  }
}

// 승인 대기 화면 로그아웃 버튼 이벤트
const logoutPendingBtn = document.getElementById('logout-pending-btn');
if (logoutPendingBtn) {
  logoutPendingBtn.addEventListener('click', logout);
}

// 로그인 필요 화면 로그인 버튼 이벤트
const loginRequiredBtn = document.getElementById('login-required-btn');
if (loginRequiredBtn) {
  loginRequiredBtn.addEventListener('click', showLoginModal);
}
