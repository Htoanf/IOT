const API_BASE = document.querySelector('meta[name="iot-api-base"]')?.content || 'http://localhost:8080';
let historyData = [];
let pageSize = 10;
let currentPage = 1;
let historySort = { key: 'time', dir: 'desc' };
let loading = false;
let hasLoaded = false;
let loadError = '';
const search = document.getElementById('historySearch');
const deviceFilter = document.getElementById('deviceFilter');
const actionFilter = document.getElementById('actionFilter');
const statusFilter = document.getElementById('statusFilter');
const tableBody = document.getElementById('historyBody');
const tableWrap = document.getElementById('historyTableWrap');
const refreshButton = document.getElementById('refreshHistory');
const loadStatus = document.getElementById('historyLoadStatus');

function closeSelect(root) {
  root.classList.remove('open');
  root.querySelector('.select-trigger').setAttribute('aria-expanded', 'false');
}
function setupCustomSelect(root) {
  const trigger = root.querySelector('.select-trigger');
  const label = root.closest('.field').querySelector('label').textContent;
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', event => {
    event.stopPropagation();
    const open = root.classList.contains('open');
    document.querySelectorAll('.custom-select').forEach(closeSelect);
    if (!open) { root.classList.add('open'); trigger.setAttribute('aria-expanded', 'true'); }
  });
  root.querySelectorAll('.select-option').forEach(option => {
    option.addEventListener('click', event => {
      event.stopPropagation();
      root.querySelectorAll('.select-option').forEach(item => item.classList.toggle('selected', item === option));
      root.dataset.value = option.dataset.value;
      root.querySelector('.select-value').textContent = option.textContent.trim().replace(/\s+/g, ' ');
      closeSelect(root);
      trigger.focus();
      root.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeSelect(root); trigger.focus(); }
  });
}
document.querySelectorAll('.custom-select').forEach(setupCustomSelect);
document.addEventListener('click', () => document.querySelectorAll('.custom-select').forEach(closeSelect));

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const part = value => String(value).padStart(2, '0');
  return `${part(d.getDate())}/${part(d.getMonth() + 1)}/${d.getFullYear()} ${part(d.getHours())}:${part(d.getMinutes())}:${part(d.getSeconds())}`;
}
function normalizeRecord(row) {
  return {
    id: row.id,
    deviceId: row.deviceId,
    device: Number.isInteger(row.deviceId) ? 'LED ' + row.deviceId : 'Chưa rõ',
    // Current acknowledgements contain no actor identity. Never invent an admin user.
    controller: typeof row.controller === 'string' && row.controller.trim() ? row.controller : null,
    action: typeof row.state === 'string' ? row.state : 'UNKNOWN',
    status: typeof row.status === 'string' ? row.status : 'UNKNOWN',
    time: typeof row.createdAt === 'string' && Number.isFinite(new Date(row.createdAt).getTime()) ? row.createdAt : null
  };
}
async function loadHistoryData() {
  if (loading) return;
  loading = true;
  refreshButton.disabled = true;
  tableWrap.setAttribute('aria-busy', 'true');
  loadStatus.classList.remove('is-error');
  loadStatus.textContent = 'Đang tải lịch sử...';
  renderTable();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(API_BASE + '/api/history', { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid history response');
    const valid = rows.filter(row => row && typeof row === 'object' && Number.isSafeInteger(row.id) && row.id > 0);
    historyData = valid.map(normalizeRecord);
    hasLoaded = true;
    loadError = '';
    loadStatus.textContent = `${historyData.length} phản hồi từ database · tải lúc ${new Date().toLocaleTimeString('vi-VN')}. Bấm Tải lại để cập nhật.`
      + (valid.length !== rows.length ? ' Một số bản ghi không đọc được.' : '');
  } catch {
    loadError = 'Không tải được lịch sử. Kiểm tra backend rồi bấm Tải lại.';
    loadStatus.textContent = hasLoaded ? 'Không tải được lịch sử mới; đang giữ kết quả đã tải trước đó.' : loadError;
    loadStatus.classList.add('is-error');
  } finally {
    clearTimeout(timer);
    loading = false;
    refreshButton.disabled = false;
    tableWrap.setAttribute('aria-busy', 'false');
    renderTable();
  }
}
function badge(text, className) {
  const node = document.createElement('span');
  node.className = 'badge ' + className;
  node.textContent = text;
  return node;
}
function badgeStatus(status) {
  if (status === 'SUCCESS') return badge('Thành công', 'success');
  if (status === 'FAILED') return badge('Thất bại', 'error');
  return badge('Chưa rõ', 'unknown');
}
function badgeAction(state) {
  if (state === 'ON') return badge('Bật', 'on');
  if (state === 'OFF') return badge('Tắt', 'off');
  return badge('Chưa rõ', 'unknown');
}
function getFilteredData() {
  const q = search.value.trim().replace(/\s+/g, ' ').toLowerCase();
  const device = deviceFilter.dataset.value;
  const action = actionFilter.dataset.value;
  const status = statusFilter.dataset.value;
  const data = historyData.filter(row => {
    const times = row.time ? [row.time, row.time.replace('T', ' '), formatDateTime(row.time)] : [];
    return (device === 'all' || String(row.deviceId) === device)
      && (action === 'all' || row.action === action)
      && (status === 'all' || row.status === status)
      && (!q || times.some(time => time.toLowerCase().includes(q)));
  });
  const { key, dir } = historySort;
  data.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (av === null || bv === null) return av === bv ? b.id - a.id : av === null ? 1 : -1;
    if (key === 'time') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
    const order = key === 'time' ? (av < bv ? -1 : av > bv ? 1 : 0) : String(av).localeCompare(String(bv), 'vi');
    return order * (dir === 'asc' ? 1 : -1) || b.id - a.id;
  });
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
      const cells = [row.id, row.device, row.controller || '—', badgeAction(row.action), badgeStatus(row.status), formatDateTime(row.time)];
      cells.forEach(value => {
        const td = document.createElement('td');
        if (value instanceof Node) td.appendChild(value); else td.textContent = String(value);
        tr.appendChild(td);
      });
      tableBody.appendChild(tr);
    });
  } else {
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'muted';
    td.textContent = !hasLoaded && loading ? 'Đang tải lịch sử...'
      : !hasLoaded && loadError ? loadError
      : historyData.length ? 'Không tìm thấy lịch sử phù hợp' : 'Chưa có phản hồi thiết bị trong database';
    const tr = document.createElement('tr'); tr.appendChild(td); tableBody.appendChild(tr);
  }
  document.getElementById('historySummary').textContent = data.length
    ? `Hiển thị ${start + 1}–${start + slice.length} / ${data.length} bản ghi` : '0 bản ghi';
  document.querySelectorAll('th.sortable').forEach(th => {
    const active = th.dataset.sort === historySort.key;
    th.setAttribute('aria-sort', active ? historySort.dir === 'asc' ? 'ascending' : 'descending' : 'none');
    th.querySelector('.sort-mark').textContent = active ? historySort.dir === 'asc' ? '↑' : '↓' : '↕';
  });
  renderPagination(pages);
}
function renderPagination(pages) {
  const wrap = document.getElementById('historyPagination');
  wrap.replaceChildren();
  const button = (label, page, disabled = false, active = false) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'page-btn' + (active ? ' active' : '');
    btn.textContent = label; btn.disabled = disabled;
    btn.setAttribute('aria-label', label === '‹' ? 'Trang trước' : label === '›' ? 'Trang sau' : 'Trang ' + page);
    if (active) btn.setAttribute('aria-current', 'page');
    btn.addEventListener('click', () => { currentPage = page; tableWrap.scrollTop = 0; renderTable(); });
    wrap.appendChild(btn);
  };
  button('‹', currentPage - 1, currentPage === 1);
  const visible = [...new Set([1, pages, currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2])]
    .filter(page => page >= 1 && page <= pages).sort((a, b) => a - b);
  visible.forEach((page, index) => {
    if (index && page > visible[index - 1] + 1) { const gap = document.createElement('span'); gap.textContent = '…'; wrap.appendChild(gap); }
    button(String(page), page, false, page === currentPage);
  });
  button('›', currentPage + 1, currentPage === pages);
}
function applyFilters() { currentPage = 1; renderTable(); }
search.addEventListener('input', applyFilters);
[deviceFilter, actionFilter, statusFilter].forEach(root => root.addEventListener('change', applyFilters));
document.getElementById('historyPageSize').addEventListener('change', event => {
  pageSize = Number(event.target.value); currentPage = 1; renderTable();
});
document.getElementById('resetHistory').addEventListener('click', () => {
  search.value = '';
  [deviceFilter, actionFilter, statusFilter].forEach(root => root.querySelector('[data-value="all"]').click());
  historySort = { key: 'time', dir: 'desc' };
  currentPage = 1;
  renderTable();
});
document.querySelectorAll('th.sortable').forEach(th => {
  th.tabIndex = 0;
  const sort = () => {
    const key = th.dataset.sort;
    historySort = { key, dir: historySort.key === key && historySort.dir === 'asc' ? 'desc' : 'asc' };
    currentPage = 1; renderTable();
  };
  th.addEventListener('click', sort);
  th.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sort(); } });
});
refreshButton.addEventListener('click', loadHistoryData);
if (location.protocol === 'file:') {
  loadError = 'Mở trang bằng Live Server trên localhost để kết nối backend.';
  loadStatus.textContent = loadError;
  loadStatus.classList.add('is-error');
  tableWrap.setAttribute('aria-busy', 'false');
  renderTable();
} else {
  loadHistoryData();
}