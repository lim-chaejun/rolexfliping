// 전역 변수
let watches = [];
let filteredWatches = [];
let displayedCount = 50;
let selectedLine = '';

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
    updateStatusCounts();
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

    return `
      <div class="product-card">
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
          <div class="product-title">${watch.title}</div>
          <div class="product-model">${watch.model_number}</div>
          <div class="product-price">${watch.formatted_price}</div>
          <div class="product-material">${materialNames[watch.material] || watch.material}</div>
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
