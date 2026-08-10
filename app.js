const motionFields = [
  { key: 'a1', label: '昇降加速度', symbol: 'A1', unit: 'mm/s²', down: 3000, up: 2000, unloadDown: 2500, unloadUp: 3000 },
  { key: 'a2', label: '昇降減速度', symbol: 'A2', unit: 'mm/s²', down: 3000, up: 2500, unloadDown: 2500, unloadUp: 3000 },
  { key: 'v1', label: '上端クリープ速度', symbol: 'V1', unit: 'mm/s', down: 20, up: 40, unloadDown: 20, unloadUp: 40 },
  { key: 'v2', label: '昇降速度', symbol: 'V2', unit: 'mm/s', down: 1900, up: 1500, unloadDown: 1000, unloadUp: 1900 },
  { key: 'v3', label: '下端クリープ速度', symbol: 'V3', unit: 'mm/s', down: 40, up: 40, unloadDown: 20, unloadUp: 40 },
  { key: 's1', label: '上端クリープ距離', symbol: 'S1', unit: 'mm', down: 0, up: 19, unloadDown: 0, unloadUp: 0 },
  { key: 's5', label: '下端クリープ距離', symbol: 'S5', unit: 'mm', down: 21, up: 12, unloadDown: 22, unloadUp: 0 },
  { key: 'sh', label: '昇降ストローク', symbol: 'SH', unit: 'mm', down: 2500, up: 2500, unloadDown: 2500, unloadUp: 2500 },
  { key: 'tr', label: '制御遅れ', symbol: 'TR', unit: 's', down: 0.21, up: 0.55, unloadDown: 0.26, unloadUp: 0.13 }
];
const extras = { tg: 0.27, 'unload-tg': 0.21, servo: 0.6, 'unload-servo': 0.6 };
const segmentNames = ['上端クリープ', '加速', '定速', '減速', '下端クリープ'];

const inputContainer = document.getElementById('motionInputs');
motionFields.forEach((field) => {
  inputContainer.insertAdjacentHTML('beforeend', `
    <div class="motion-row">
      <label for="down-${field.key}"><span>${field.label}</span><b>${field.symbol}</b></label><em class="unit">${field.unit}</em>
      <span class="field"><input id="down-${field.key}" type="number" min="0" step="any" value="${field.down}" aria-label="荷つかみ下降 ${field.label}" /></span>
      <span class="field"><input id="up-${field.key}" type="number" min="0" step="any" value="${field.up}" aria-label="荷つかみ上昇 ${field.label}" /></span>
      <span class="field"><input id="unloadDown-${field.key}" type="number" min="0" step="any" value="${field.unloadDown}" aria-label="荷おろし下降 ${field.label}" /></span>
      <span class="field"><input id="unloadUp-${field.key}" type="number" min="0" step="any" value="${field.unloadUp}" aria-label="荷おろし上昇 ${field.label}" /></span>
    </div>`);
});

const detailRows = document.getElementById('detailRows');
segmentNames.forEach((name, index) => {
  const number = index + 1;
  detailRows.insertAdjacentHTML('beforeend', `<tr><td><span class="tag">T${number}</span></td><td>${name}</td><td id="down-distance-${number}">—</td><td id="down-time-${number}">—</td><td id="up-distance-${number}">—</td><td id="up-time-${number}">—</td></tr>`);
});

const allInputs = [...document.querySelectorAll('input')];
const format = (value, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—';

function readDirection(direction) {
  return Object.fromEntries(motionFields.map(({ key }) => [key, Number(document.getElementById(`${direction}-${key}`).value)]));
}

function calculateMotion(values) {
  const t1 = values.s1 / values.v1;
  const t2 = values.v2 / values.a1;
  const s2 = values.v2 * t2 / 2;
  const t4 = values.v2 / values.a2;
  const s4 = values.v2 * t4 / 2;
  const s3 = values.sh - (values.s1 + s2 + s4 + values.s5);
  const t3 = s3 / values.v2;
  const t5 = values.s5 / values.v3;
  const times = [t1, t2, t3, t4, t5];
  return { distances: [values.s1, s2, s3, s4, values.s5], times, tt: times.reduce((sum, time) => sum + time, 0) };
}

function setText(id, value) { document.getElementById(id).textContent = value; }
function drawSpeedChart(series = []) {
  const canvas = document.getElementById('speedChart');
  const container = canvas.parentElement;
  const width = Math.max(container.clientWidth, 300);
  const height = Math.max(Math.min(width * 0.5, 390), 260);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);

  const margin = { top: 25, right: 24, bottom: 48, left: width < 500 ? 58 : 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxTime = Math.max(...series.map(({ result }) => result.tt), 1);
  const maxSpeedRaw = Math.max(...series.map(({ values }) => values.v2), 1);
  const speedStep = maxSpeedRaw <= 500 ? 100 : maxSpeedRaw <= 2000 ? 500 : 1000;
  const maxSpeed = Math.ceil(maxSpeedRaw / speedStep) * speedStep;
  const x = (time) => margin.left + (time / maxTime) * plotWidth;
  const y = (speed) => margin.top + plotHeight - (speed / maxSpeed) * plotHeight;

  context.font = `${width < 500 ? 11 : 12}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.lineWidth = 1;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (let i = 0; i <= 4; i += 1) {
    const speed = maxSpeed * i / 4;
    const position = y(speed);
    context.strokeStyle = '#dfe7ef';
    context.beginPath(); context.moveTo(margin.left, position); context.lineTo(width - margin.right, position); context.stroke();
    context.fillStyle = '#52667c';
    context.fillText(speed.toLocaleString('ja-JP'), margin.left - 9, position);
  }
  context.textAlign = 'center';
  for (let i = 0; i <= 4; i += 1) {
    const time = maxTime * i / 4;
    const position = x(time);
    context.strokeStyle = '#edf1f5';
    context.beginPath(); context.moveTo(position, margin.top); context.lineTo(position, margin.top + plotHeight); context.stroke();
    context.fillStyle = '#52667c';
    context.fillText(`${format(time)} s`, position, margin.top + plotHeight + 19);
  }
  context.fillStyle = '#263c55';
  context.font = `700 ${width < 500 ? 12 : 13}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.fillText('時間', margin.left + plotWidth / 2, height - 8);
  context.save(); context.translate(14, margin.top + plotHeight / 2); context.rotate(-Math.PI / 2); context.fillText('速度 (mm/s)', 0, 0); context.restore();

  series.forEach(({ values, result, color }) => {
    const [t1, t2, t3, t4, t5] = result.times;
    const points = [[0, values.v1], [t1, values.v1], [t1 + t2, values.v2], [t1 + t2 + t3, values.v2], [t1 + t2 + t3 + t4, values.v3], [result.tt, values.v3]];
    context.strokeStyle = color;
    context.lineWidth = width < 500 ? 2.5 : 3;
    context.lineJoin = 'round';
    context.beginPath();
    points.forEach(([time, speed], index) => { if (index === 0) context.moveTo(x(time), y(speed)); else context.lineTo(x(time), y(speed)); });
    context.stroke();
    context.setLineDash([5, 5]);
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(x(result.tt), y(values.v3)); context.lineTo(x(result.tt), y(0)); context.stroke();
    context.setLineDash([]);
  });
}
function renderEmpty() {
  ['totalTime', 'unloadTotalTime', 'transferTime', 'servoResult', 'downMotion', 'downDelay', 'upMotion', 'upDelay', 'downDistanceTotal', 'downTimeTotal', 'upDistanceTotal', 'upTimeTotal'].forEach((id) => setText(id, '—'));
  setText('totalMilliseconds', '— ms');
  setText('unloadTotalMilliseconds', '— ms');
  drawSpeedChart();
  ['down', 'up'].forEach((direction) => { for (let i = 1; i <= 5; i += 1) { setText(`${direction}-distance-${i}`, '—'); setText(`${direction}-time-${i}`, '—'); } });
}

function calculate() {
  const down = readDirection('down');
  const up = readDirection('up');
  const unloadDown = readDirection('unloadDown');
  const unloadUp = readDirection('unloadUp');
  const tg = Number(document.getElementById('tg').value);
  const servo = Number(document.getElementById('servo').value);
  const unloadTg = Number(document.getElementById('unload-tg').value);
  const unloadServo = Number(document.getElementById('unload-servo').value);
  const warning = document.getElementById('warning');
  const directions = [down, up, unloadDown, unloadUp];
  const values = [...directions.flatMap(Object.values), tg, servo, unloadTg, unloadServo];
  const positiveKeys = ['a1', 'a2', 'v1', 'v2', 'v3'];
  const invalid = values.some((value) => !Number.isFinite(value) || value < 0)
    || positiveKeys.some((key) => directions.some((direction) => direction[key] === 0));

  if (invalid) {
    warning.textContent = '速度・加速度には0より大きい値、その他の項目には0以上の値を入力してください。';
    warning.hidden = false;
    renderEmpty();
    return;
  }
  const downResult = calculateMotion(down);
  const upResult = calculateMotion(up);
  const unloadDownResult = calculateMotion(unloadDown);
  const unloadUpResult = calculateMotion(unloadUp);
  if ([downResult, upResult, unloadDownResult, unloadUpResult].some((result) => result.distances[2] < 0)) {
    warning.textContent = '昇降ストロークが不足しています。加減速・クリープ距離の合計がストロークを超えないようにしてください。';
    warning.hidden = false;
    renderEmpty();
    return;
  }
  warning.hidden = true;

  const actualTransfer = downResult.tt + down.tr + tg + upResult.tt + up.tr;
  const total = actualTransfer + servo;
  const unloadActualTransfer = unloadDownResult.tt + unloadDown.tr + unloadTg + unloadUpResult.tt + unloadUp.tr;
  const unloadTotal = unloadActualTransfer + unloadServo;
  setText('totalTime', format(total));
  setText('totalMilliseconds', `${format(total * 1000, 0)} ms`);
  setText('unloadTotalTime', format(unloadTotal));
  setText('unloadTotalMilliseconds', `${format(unloadTotal * 1000, 0)} ms`);
  setText('transferTime', `${format(actualTransfer)} 秒`);
  setText('servoResult', `${format(servo)} 秒`);
  setText('downMotion', `${format(downResult.tt)} 秒`);
  setText('downDelay', `${format(down.tr)} 秒`);
  setText('upMotion', `${format(upResult.tt)} 秒`);
  setText('upDelay', `${format(up.tr)} 秒`);

  [['down', down, downResult], ['up', up, upResult]].forEach(([direction, input, result]) => {
    result.distances.forEach((distance, index) => setText(`${direction}-distance-${index + 1}`, `${format(distance)} mm`));
    result.times.forEach((time, index) => setText(`${direction}-time-${index + 1}`, `${format(time)} s`));
    setText(`${direction}DistanceTotal`, `${format(input.sh)} mm`);
    setText(`${direction}TimeTotal`, `${format(result.tt)} s`);
  });
  drawSpeedChart([
    { values: down, result: downResult, color: '#1776d2' },
    { values: up, result: upResult, color: '#148572' }
  ]);
}

allInputs.forEach((input) => input.addEventListener('input', calculate));
document.getElementById('resetButton').addEventListener('click', () => {
  motionFields.forEach((field) => {
    ['down', 'up', 'unloadDown', 'unloadUp'].forEach((direction) => { document.getElementById(`${direction}-${field.key}`).value = field[direction]; });
  });
  Object.entries(extras).forEach(([id, value]) => { document.getElementById(id).value = value; });
  calculate();
});
calculate();
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(calculate, 120);
});
