const API_BASE = document.querySelector('meta[name="iot-api-base"]')?.content || 'http://localhost:8080';
const POLL_MS = 2000;
let refreshTimer;
let pageClosed = false;
const sensorLabels = { temperature: 'Nhiệt độ', humidity: 'Độ ẩm', light: 'Ánh sáng' };
let sensorData = [];
let pageSize = 10;
let currentPage = 1;
let headerSort = { key: null, dir: 'asc' };
let appliedFilters = { q: '', criterion: 'all' };
let loading = false;
let hasLoaded = false;
let loadError = '';
const searchInput = document.getElementById('searchInput');
const searchCriterion = document.getElementById('searchCriterion');
const tableBody = document.getElementById('sensorBody');
const tableWrap = document.getElementById('sensorTableWrap');
const refreshButton = document.getElementById('refreshSensors');
const loadStatus = document.getElementById('sensorLoadStatus');

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const part = value => String(value).padStart(2, '0');
  return `${part(d.getDate())}/${part(d.getMonth() + 1)}/${d.getFullYear()} ${part(d.getHours())}:${part(d.getMinutes())}:${part(d.getSeconds())}`;
}
function normalizeRecord(row) {
  const type = typeof row.sensorType === 'string' ? row.sensorType : '';
  return {
    id: row.id,
    type,
    typeLabel: sensorLabels[type] || type || 'Không rõ',
    value: typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : null,
    unit: row.unit === 'C' ? '°C' : typeof row.unit === 'string' ? row.unit : '',
    time: typeof row.createdAt === 'string' && Number.isFinite(new Date(row.createdAt).getTime()) ? row.createdAt : null
  };
}
async function loadSensorData() {
  if (loading) return;
  clearTimeout(refreshTimer);
  loading = true;
  refreshButton.disabled = true;
  tableWrap.setAttribute('aria-busy', 'true');
  if (!hasLoaded) {
    loadStatus.classList.remove('is-error');
    loadStatus.textContent = 'Đang tải dữ liệu...';
    renderTable();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(API_BASE + '/api/sensors', { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid sensor response');
    const valid = rows.filter(row => row && typeof row === 'object' && Number.isSafeInteger(row.id) && row.id > 0);
    sensorData = valid.map(normalizeRecord).sort((a, b) =>
      (new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime()) || b.id - a.id);
    hasLoaded = true;
    loadError = '';
    loadStatus.classList.remove('is-error');
    loadStatus.textContent = `${sensorData.length} bản ghi từ database · tự cập nhật mỗi 2 giây · lần cuối ${new Date().toLocaleTimeString('vi-VN')}.`
      + (valid.length !== rows.length ? ' Một số bản ghi không đọc được.' : '');
  } catch {
    loadError = 'Không tải được dữ liệu. Kiểm tra backend rồi bấm Tải lại.';
    loadStatus.textContent = hasLoaded ? 'Không tải được dữ liệu mới; đang giữ kết quả trước đó và sẽ tự thử lại.' : loadError;
    loadStatus.classList.add('is-error');
  } finally {
    clearTimeout(timer);
    loading = false;
    refreshButton.disabled = false;
    tableWrap.setAttribute('aria-busy', 'false');
    const scrollTop = tableWrap.scrollTop;
    renderTable();
    tableWrap.scrollTop = scrollTop;
    // Schedule after completion so slow requests and manual reloads cannot overlap.
    if (!pageClosed && location.protocol !== 'file:') refreshTimer = setTimeout(loadSensorData, POLL_MS);
  }
}
function getFilteredData() {
  const { q, criterion } = appliedFilters;
  const numericQuery = q.replace(',', '.');
  const data = sensorData.filter(row => {
    const timeValues = row.time ? [row.time, row.time.replace('T', ' '), formatDateTime(row.time)] : [];
    const matchesTime = timeValues.some(value => value.toLowerCase().includes(q));
    if (criterion === 'time') return !q || matchesTime;
    const measuredValue = row.value === null ? '' : `${row.value} ${row.unit}`.toLowerCase();
    if (criterion !== 'all') return row.type === criterion && (!q || measuredValue.includes(numericQuery));
    return !q || matchesTime || [String(row.id), row.type, row.typeLabel, measuredValue]
      .some(value => value.toLowerCase().includes(q)) || measuredValue.includes(numericQuery);
  });
  if (headerSort.key) {
    const { key, dir } = headerSort;
    data.sort((a, b) => {
      let av = a[key], bv = b[key];
      // Missing values always stay after actual readings, including descending order.
      if (av === null || bv === null) return av === bv ? b.id - a.id : av === null ? 1 : -1;
      if (key === 'time') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      const order = key === 'typeLabel' ? av.localeCompare(bv, 'vi') : av < bv ? -1 : av > bv ? 1 : 0;
      return order * (dir === 'asc' ? 1 : -1) || b.id - a.id;
    });
  }
  return data;
}
function renderTable() {
  const data = getFilteredData();
  const pages = Math.max(1, Math.ceil(data.length / pageSize));
  currentPage = Math.min(Math.max(1, currentPage), pages);
  const start = (currentPage - 1) * pageSize;
  const slice = data.slice(start, start + pageSize);
  tableBody.replaceChildren();
  if (slice.length) {
    slice.forEach(row => {
      const tr = document.createElement('tr');
      const value = row.value === null ? '—' : `${row.value} ${row.unit}`.trim();
      [row.id, row.typeLabel, value, formatDateTime(row.time)].forEach(text => {
        const td = document.createElement('td');
        td.textContent = String(text);
        tr.appendChild(td);
      });
      tableBody.appendChild(tr);
    });
  } else {
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'muted';
    td.textContent = !hasLoaded && loading ? 'Đang tải dữ liệu...'
      : !hasLoaded && loadError ? loadError
      : sensorData.length ? 'Không tìm thấy dữ liệu phù hợp' : 'Chưa có dữ liệu cảm biến trong database';
    const tr = document.createElement('tr');
    tr.appendChild(td);
    tableBody.appendChild(tr);
  }
  document.getElementById('sensorSummary').textContent = data.length
    ? `Hiển thị ${start + 1}–${start + slice.length} / ${data.length} bản ghi` : '0 bản ghi';
  document.querySelectorAll('th.sortable').forEach(th => {
    const active = headerSort.key === th.dataset.sort;
    th.setAttribute('aria-sort', active ? headerSort.dir === 'asc' ? 'ascending' : 'descending' : 'none');
    th.querySelector('.sort-mark').textContent = active ? headerSort.dir === 'asc' ? '↑' : '↓' : '↕';
  });
  renderPagination(pages);
}
function renderPagination(pages) {
  const wrap = document.getElementById('sensorPagination');
  wrap.replaceChildren();
  const button = (label, page, disabled = false, active = false) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn' + (active ? ' active' : '');
    btn.textContent = label;
    btn.disabled = disabled;
    btn.setAttribute('aria-label', label === '‹' ? 'Trang trước' : label === '›' ? 'Trang sau' : 'Trang ' + page);
    if (active) btn.setAttribute('aria-current', 'page');
    btn.addEventListener('click', () => { currentPage = page; tableWrap.scrollTop = 0; renderTable(); });
    wrap.appendChild(btn);
  };
  button('‹', currentPage - 1, currentPage === 1);
  const visible = [...new Set([1, pages, currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2])]
    .filter(page => page >= 1 && page <= pages).sort((a, b) => a - b);
  visible.forEach((page, index) => {
    if (index && page > visible[index - 1] + 1) {
      const gap = document.createElement('span'); gap.textContent = '…'; wrap.appendChild(gap);
    }
    button(String(page), page, false, page === currentPage);
  });
  button('›', currentPage + 1, currentPage === pages);
}
function applySearch() {
  appliedFilters = { q: searchInput.value.trim().toLowerCase(), criterion: searchCriterion.value };
  currentPage = 1;
  renderTable();
}
function updateSearchPlaceholder() {
  const placeholders = {
    all: 'Nhập nội dung cần tìm...', time: 'Ví dụ: 01/11/2026 hoặc 21:52',
    light: 'Nhập giá trị ánh sáng, ví dụ: 420', temperature: 'Nhập nhiệt độ, ví dụ: 28.5', humidity: 'Nhập độ ẩm, ví dụ: 65'
  };
  searchInput.placeholder = placeholders[searchCriterion.value] || placeholders.all;
}
document.getElementById('searchBtn').addEventListener('click', applySearch);
searchInput.addEventListener('keydown', event => { if (event.key === 'Enter') applySearch(); });
searchCriterion.addEventListener('change', updateSearchPlaceholder);
document.getElementById('resetBtn').addEventListener('click', () => {
  searchInput.value = '';
  searchCriterion.value = 'all';
  appliedFilters = { q: '', criterion: 'all' };
  headerSort = { key: null, dir: 'asc' };
  currentPage = 1;
  updateSearchPlaceholder();
  renderTable();
});
document.getElementById('sensorPageSize').addEventListener('change', event => {
  pageSize = Number(event.target.value);
  currentPage = 1;
  renderTable();
});
document.querySelectorAll('th.sortable').forEach(th => {
  th.tabIndex = 0;
  const sort = () => {
    const key = th.dataset.sort;
    headerSort = { key, dir: headerSort.key === key && headerSort.dir === 'asc' ? 'desc' : 'asc' };
    currentPage = 1;
    renderTable();
  };
  th.addEventListener('click', sort);
  th.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sort(); } });
});
refreshButton.addEventListener('click', loadSensorData);
updateSearchPlaceholder();
if (location.protocol === 'file:') {
  loadError = 'Mở trang bằng Live Server trên localhost để kết nối backend.';
  loadStatus.textContent = loadError;
  loadStatus.classList.add('is-error');
  tableWrap.setAttribute('aria-busy', 'false');
  renderTable();
} else {
  loadSensorData();
}
window.addEventListener('pagehide', () => { pageClosed = true; clearTimeout(refreshTimer); });
window.addEventListener('pageshow', event => {
  if (event.persisted) { pageClosed = false; loadSensorData(); }
});
