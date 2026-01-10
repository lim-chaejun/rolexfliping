// 전역 변수
let watches = [];
let filteredWatches = [];

// DOM 요소
const productGrid = document.getElementById('product-grid');
const loading = document.getElementById('loading');
const noResults = document.getElementById('no-results');
const totalCount = document.getElementById('total-count');
const filteredCount = document.getElementById('filtered-count');
const searchInput = document.getElementById('search-input');
const lineFilter = document.getElementById('line-filter');
const materialFilter = document.getElementById('material-filter');
const priceFilter = document.getElementById('price-filter');
const sortSelect = document.getElementById('sort-select');
const resetBtn = document.getElementById('reset-filters');

// 상태 필터 체크박스
const statusCheckboxes = document.querySelectorAll('.status-filters input[type="checkbox"]');

// 상태 텍스트 매핑
const statusText = {
  buy: '무조건 매입',
  pending: '검토 필요',
  no: '매입 불가'
};

// 라인 이름 매핑
const lineNames = {
  '1908': '1908',
  'air-king': '에어킹',
  'cosmograph-daytona': '코스모그래프 데이토나',
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
  'alt-18-ct-yellow-gold': '18캐럿 옐로 골드',
  'alt-18-ct-pink-gold': '18캐럿 에버로즈 골드',
  'alt-18-ct-white-gold': '18캐럿 화이트 골드',
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

    populateFilters();
    updateStatusCounts();
    applyFilters();

    loading.style.display = 'none';
  } catch (error) {
    console.error('데이터 로딩 실패:', error);
    loading.textContent = '데이터를 불러오는데 실패했습니다.';
  }
}

// 필터 옵션 채우기
function populateFilters() {
  // 라인 필터
  const lines = [...new Set(watches.map(w => w.line))].sort();
  lines.forEach(line => {
    const option = document.createElement('option');
    option.value = line;
    option.textContent = lineNames[line] || line;
    lineFilter.appendChild(option);
  });

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
  const selectedLine = lineFilter.value;
  const selectedMaterial = materialFilter.value;
  const selectedPrice = priceFilter.value;

  // 선택된 상태들
  const selectedStatuses = Array.from(statusCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  filteredWatches = watches.filter(watch => {
    // 상태 필터
    if (!selectedStatuses.includes(watch.buy_status)) return false;

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

    // 라인 필터
    if (selectedLine && watch.line !== selectedLine) return false;

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
    noResults.style.display = 'block';
    return;
  }

  noResults.style.display = 'none';

  // 성능을 위해 처음 100개만 렌더링
  const displayWatches = filteredWatches.slice(0, 100);

  productGrid.innerHTML = displayWatches.map(watch => {
    const imagePath = `images/${watch.line}/${watch.model_number}.jpg`;

    return `
      <div class="product-card status-${watch.buy_status}">
        <img
          class="product-image"
          src="${imagePath}"
          alt="${watch.title}"
          onerror="this.src='${watch.image_url}'"
          loading="lazy"
        >
        <div class="product-info">
          <div class="product-line">${lineNames[watch.line] || watch.line}</div>
          <div class="product-title">${watch.title}</div>
          <div class="product-model">${watch.model_number}</div>
          <div class="product-case">${watch.case_description}</div>
          <div class="product-price">${watch.formatted_price}</div>
          <span class="product-status ${watch.buy_status}">
            <span class="status-dot ${watch.buy_status}"></span>
            ${statusText[watch.buy_status]}
          </span>
        </div>
      </div>
    `;
  }).join('');

  // 무한 스크롤을 위한 추가 제품 표시
  if (filteredWatches.length > 100) {
    const moreCount = filteredWatches.length - 100;
    productGrid.insertAdjacentHTML('beforeend', `
      <div class="product-card" style="display:flex;align-items:center;justify-content:center;min-height:200px;color:#666;">
        +${moreCount.toLocaleString()}개 더 있음<br>
        <small>필터로 범위를 좁혀주세요</small>
      </div>
    `);
  }
}

// 필터 초기화
function resetFilters() {
  searchInput.value = '';
  lineFilter.value = '';
  materialFilter.value = '';
  priceFilter.value = '';
  sortSelect.value = 'price-asc';

  statusCheckboxes.forEach(cb => cb.checked = true);

  applyFilters();
}

// 이벤트 리스너
searchInput.addEventListener('input', debounce(applyFilters, 300));
lineFilter.addEventListener('change', applyFilters);
materialFilter.addEventListener('change', applyFilters);
priceFilter.addEventListener('change', applyFilters);
sortSelect.addEventListener('change', applyFilters);
resetBtn.addEventListener('click', resetFilters);

statusCheckboxes.forEach(cb => {
  cb.addEventListener('change', applyFilters);
});

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
