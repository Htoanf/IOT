// Backend local; allow a different address through a meta tag when needed.
const API_BASE = document.querySelector('meta[name="iot-api-base"]')?.content || 'http://localhost:8080';
const POLL_MS = 2000;
const ACK_TIMEOUT_MS = 12000;
const sensorDefinitions = [
  { key: 'temperature', label: 'Nhiệt độ', unit: '°C', color: '#2563eb' },
  { key: 'humidity', label: 'Độ ẩm', unit: '%', color: '#16a34a' },
  { key: 'light', label: 'Ánh sáng', unit: 'lux', color: '#f59e0b' }
];
let series = { temperature: [], humidity: [], light: [] };
let plot = null;
let hoverPosition = null;
let deviceConnection = false;
let stopped = false;
let pollTimer;
const canvas = document.getElementById('envChart');
const tooltip = document.createElement('div');
tooltip.className = 'chart-tooltip';
tooltip.hidden = true;
tooltip.setAttribute('role', 'tooltip');
canvas.parentElement.appendChild(tooltip);
const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const shortTime = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fullTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });
const datedTick = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function validReading(reading) {
  return reading && typeof reading.value === 'number' && Number.isFinite(reading.value)
    && typeof reading.createdAt === 'string'
    && Number.isFinite(new Date(reading.createdAt).getTime());
}
function statusText(id, message, error = false) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.classList.toggle('is-error', error);
}
async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(API_BASE + path, { ...options, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadLatest() {
  try {
    const data = await api('/api/dashboard/latest');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid sensor response');
    let count = 0;
    sensorDefinitions.forEach(({ key, unit }) => {
      const reading = data[key];
      const valid = validReading(reading);
      if (valid) count++;
      document.getElementById(key + 'Value').textContent = (valid ? numberFormat.format(reading.value) : '—') + ' ' + unit;
      document.getElementById(key + 'Time').textContent = valid
        ? 'Ghi nhận: ' + fullTime.format(new Date(reading.createdAt)) : 'Chưa có dữ liệu';
    });
    statusText('sensorStatus', count ? 'Dữ liệu đã lưu · tự cập nhật mỗi 2 giây' : 'Chưa có dữ liệu cảm biến trong database');
  } catch {
    statusText('sensorStatus', 'Không tải được số đo. Đang giữ dữ liệu đã hiển thị; kiểm tra backend.', true);
  }
}
async function loadRecent() {
  try {
    const data = await api('/api/sensors/recent?limit=15');
    if (!sensorDefinitions.every(({ key }) => Array.isArray(data?.[key]))) throw new Error('Invalid chart response');
    series = Object.fromEntries(sensorDefinitions.map(({ key }) => [key, data[key]
      .filter(validReading).map(record => ({ ...record, time: new Date(record.createdAt).getTime() }))
      .sort((a, b) => a.time - b.time)]));
    statusText('chartStatus', 'Tối đa 15 điểm gần nhất mỗi cảm biến');
    drawChart();
  } catch {
    statusText('chartStatus', 'Không tải được biểu đồ; dữ liệu hiển thị có thể đã cũ.', true);
  }
}

function drawChart() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const points = Object.values(series).flat();
  plot = null;
  ctx.fillStyle = '#6b7280';
  ctx.font = '11px Arial';
  if (!points.length || w < 130 || h < 80) {
    ctx.textAlign = 'center';
    ctx.fillText('Chưa có dữ liệu biểu đồ', w / 2, h / 2);
    updateTooltip();
    return;
  }
  const pad = { l: 54, r: 54, t: 22, b: 40 };
  const lightValues = series.light.map(p => p.value);
  const leftMin = 0;
  const leftMax = 100;
  const rightMin = Math.min(0, Math.floor(Math.min(0, ...lightValues) / 100) * 100);
  const rightMax = Math.max(700, Math.ceil(Math.max(0, ...lightValues) / 100) * 100);
  let minTime = Math.min(...points.map(p => p.time));
  let maxTime = Math.max(...points.map(p => p.time));
  if (minTime === maxTime) { minTime -= 1000; maxTime += 1000; }
  plot = { pad, w, h, minTime, maxTime };
  const mapX = time => pad.l + (time - minTime) / (maxTime - minTime) * (w - pad.l - pad.r);
  const mapY = (value, min, max) => pad.t + (1 - (value - min) / (max - min)) * (h - pad.t - pad.b);
  plot.paths = sensorDefinitions.map(({ key }) => series[key].map(point => ({
    x: mapX(point.time),
    y: mapY(point.value, key === 'light' ? rightMin : leftMin, key === 'light' ? rightMax : leftMax)
  })));
  for (let i = 0; i <= 10; i++) {
    const y = pad.t + (h - pad.t - pad.b) * i / 10;
    ctx.strokeStyle = '#e5e7eb';
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.fillText(numberFormat.format(leftMax - (leftMax - leftMin) * i / 10), pad.l - 8, y);
  }
  ctx.textAlign = 'left';
  for (let i = 0; i <= 7; i++) {
    const y = pad.t + (h - pad.t - pad.b) * i / 7;
    ctx.fillText(numberFormat.format(rightMax - (rightMax - rightMin) * i / 7), w - pad.r + 8, y);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left'; ctx.fillText('°C / %', 8, 14);
  ctx.textAlign = 'right'; ctx.fillText('lux', w - 8, 14);
  const ticks = Math.max(1, Math.min(4, Math.floor((w - pad.l - pad.r) / 110)));
  for (let i = 0; i <= ticks; i++) {
    const time = minTime + (maxTime - minTime) * i / ticks;
    ctx.textAlign = i === 0 ? 'left' : i === ticks ? 'right' : 'center';
    const tickFormat = maxTime - minTime >= 86400000 ? datedTick : shortTime;
    ctx.fillText(tickFormat.format(new Date(time)), mapX(time), h - 14);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
  ctx.clip();
  sensorDefinitions.forEach(({ key, color }) => {
    const min = key === 'light' ? rightMin : leftMin;
    const max = key === 'light' ? rightMax : leftMax;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8;
    ctx.beginPath();
    series[key].forEach((point, index) => {
      const x = mapX(point.time), y = mapY(point.value, min, max);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    series[key].forEach(point => {
      ctx.beginPath(); ctx.arc(mapX(point.time), mapY(point.value, min, max), 3, 0, Math.PI * 2); ctx.fill();
    });
  });
  ctx.restore();
  updateTooltip();
}
function hideTooltip() {
  tooltip.hidden = true;
  hoverPosition = null;
}
function isNearDataLine(x, y) {
  const toleranceSquared = 7 * 7;
  return plot.paths.some(points => points.some((point, index) => {
    const previous = points[index - 1] || point;
    const dx = point.x - previous.x, dy = point.y - previous.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((x - previous.x) * dx + (y - previous.y) * dy) / lengthSquared));
    const nearestX = previous.x + t * dx, nearestY = previous.y + t * dy;
    return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= toleranceSquared;
  }));
}
function updateTooltip() {
  if (!plot || !hoverPosition) { tooltip.hidden = true; return; }
  const rect = canvas.getBoundingClientRect();
  const x = hoverPosition.clientX - rect.left, y = hoverPosition.clientY - rect.top;
  const { pad, w, h, minTime, maxTime } = plot;
  if (x < pad.l || x > w - pad.r || y < pad.t || y > h - pad.b) { tooltip.hidden = true; return; }
  if (!isNearDataLine(x, y)) { tooltip.hidden = true; return; }
  const targetTime = minTime + (x - pad.l) / (w - pad.l - pad.r) * (maxTime - minTime);
  tooltip.replaceChildren();
  sensorDefinitions.forEach(({ key, label, unit }) => {
    const nearest = series[key].reduce((best, point) => !best || Math.abs(point.time - targetTime) < Math.abs(best.time - targetTime) ? point : best, null);
    const line = document.createElement('div');
    line.textContent = label + ': ' + (nearest
      ? numberFormat.format(nearest.value) + ' ' + unit + ' · ' + fullTime.format(new Date(nearest.time)) : 'Chưa có dữ liệu');
    tooltip.appendChild(line);
  });
  tooltip.hidden = false;
  tooltip.style.left = Math.max(0, Math.min(x + 12, canvas.parentElement.clientWidth - tooltip.offsetWidth)) + 'px';
  tooltip.style.top = Math.max(0, Math.min(y + 12, canvas.parentElement.clientHeight - tooltip.offsetHeight)) + 'px';
}
canvas.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') { hideTooltip(); return; }
  hoverPosition = { clientX: event.clientX, clientY: event.clientY };
  updateTooltip();
});
canvas.addEventListener('pointerleave', hideTooltip);
canvas.addEventListener('pointercancel', hideTooltip);
document.addEventListener('pointermove', event => {
  if (event.target !== canvas) hideTooltip();
});
document.addEventListener('scroll', hideTooltip, true);
document.addEventListener('visibilitychange', hideTooltip);
window.addEventListener('blur', hideTooltip);
window.addEventListener('resize', () => { tooltip.hidden = true; drawChart(); });

const devices = [
  { id: 1, button: document.getElementById('fanSwitch'), label: document.getElementById('fanState') },
  { id: 2, button: document.getElementById('lightSwitch'), label: document.getElementById('lightState') },
  { id: 3, button: document.getElementById('acSwitch'), label: document.getElementById('acState') }
].map(device => ({ ...device, state: 'UNKNOWN', lastConfirmedAt: null, pending: null, notice: '' }));
function renderDevice(device) {
  const known = device.state === 'ON' || device.state === 'OFF';
  device.button.classList.toggle('on', device.state === 'ON');
  const name = device.button.closest('.device-row').querySelector('.device-name');
  name.classList.toggle('is-on', device.state === 'ON');
  name.classList.toggle('is-unknown', !known);
  device.button.setAttribute('role', 'switch');
  device.button.setAttribute('aria-checked', String(device.state === 'ON'));
  device.button.disabled = !deviceConnection || !!device.pending;
  device.button.setAttribute('aria-busy', String(!!device.pending));
  device.label.classList.toggle('processing', !!device.pending);
  const stateText = known ? device.state : 'Chưa rõ';
  device.label.textContent = device.pending ? (device.pending.phase === 'sending' ? 'Đang gửi...' : 'Chờ xác nhận...')
    : !deviceConnection ? 'Mất kết nối' : device.notice || stateText;
  device.label.title = 'Trạng thái xác nhận cuối: ' + stateText + (device.lastConfirmedAt ? ' · ' + fullTime.format(new Date(device.lastConfirmedAt)) : '');
}
async function loadDevices() {
  try {
    const data = await api('/api/devices');
    if (!Array.isArray(data)) throw new Error('Invalid device response');
    // Validate the whole response before enabling the switches.
    if (!devices.every(device => data.some(row => row.id === device.id && ['ON', 'OFF', 'UNKNOWN'].includes(row.state)
      && (row.lastConfirmedAt === null || Number.isFinite(new Date(row.lastConfirmedAt).getTime()))))) throw new Error('Missing device');
    deviceConnection = true;
    devices.forEach(device => {
      const row = data.find(item => item.id === device.id);
      const hasNewConfirmation = row.lastConfirmedAt && (!device.lastConfirmedAt || row.lastConfirmedAt > device.lastConfirmedAt);
      if (hasNewConfirmation && !device.pending) device.notice = '';
      device.state = row.state;
      device.lastConfirmedAt = row.lastConfirmedAt;
      const pending = device.pending;
      if (pending?.phase === 'waiting' && row.state === pending.target
          && row.lastConfirmedAt && (!pending.baseline || row.lastConfirmedAt > pending.baseline)) {
        device.pending = null;
        device.notice = '';
      } else if (pending?.phase === 'waiting' && Date.now() - pending.sentAt >= ACK_TIMEOUT_MS) {
        device.pending = null;
        device.notice = 'Chưa nhận xác nhận · ' + (device.state === 'UNKNOWN' ? 'Chưa rõ' : device.state);
      }
      renderDevice(device);
    });
    statusText('deviceStatus', 'Trạng thái xác nhận cuối; không biểu thị thiết bị đang online.');
  } catch {
    deviceConnection = false;
    devices.forEach(device => {
      if (device.pending?.phase === 'waiting' && Date.now() - device.pending.sentAt >= ACK_TIMEOUT_MS) device.pending = null;
      renderDevice(device);
    });
    statusText('deviceStatus', 'Không tải được trạng thái thiết bị. Kiểm tra backend.', true);
  }
}
async function controlDevice(device) {
  if (device.button.disabled || device.pending) return;
  const pending = { target: device.state === 'ON' ? 'OFF' : 'ON', baseline: device.lastConfirmedAt, phase: 'sending' };
  device.pending = pending;
  device.notice = '';
  renderDevice(device);
  try {
    await api('/api/devices/' + device.id + '/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: pending.target })
    });
    // HTTP 202 only means the broker accepted the command. Wait for a new acknowledgement.
    pending.phase = 'waiting';
    pending.sentAt = Date.now();
  } catch (error) {
    device.pending = null;
    device.notice = error.message === '503' ? 'MQTT chưa sẵn sàng' : 'Gửi lỗi · kiểm tra lại trạng thái';
  }
  renderDevice(device);
}
devices.forEach(device => {
  device.button.addEventListener('click', () => controlDevice(device));
  renderDevice(device);
});
drawChart();
async function refreshDashboard() {
  if (stopped) return;
  await Promise.allSettled([loadLatest(), loadRecent(), loadDevices()]);
  if (!stopped) pollTimer = setTimeout(refreshDashboard, POLL_MS);
}
if (location.protocol === 'file:') {
  statusText('sensorStatus', 'Mở dashboard bằng Live Server (localhost), không mở trực tiếp file HTML.', true);
  statusText('deviceStatus', 'Cần mở trang qua HTTP để kết nối backend.', true);
} else {
  refreshDashboard();
}
window.addEventListener('pagehide', () => { stopped = true; clearTimeout(pollTimer); });
window.addEventListener('pageshow', event => { if (event.persisted) { stopped = false; refreshDashboard(); } });
