const motionFields = [
  { key: 'a1', label: '昇降加速度', symbol: 'A1', unit: 'mm/s²', down: 3000, up: 2000 },
  { key: 'a2', label: '昇降減速度', symbol: 'A2', unit: 'mm/s²', down: 3000, up: 2500 },
  { key: 'v1', label: '上端クリープ速度', symbol: 'V1', unit: 'mm/s', down: 20, up: 40 },
  { key: 'v2', label: '昇降速度', symbol: 'V2', unit: 'mm/s', down: 1900, up: 1500 },
  { key: 'v3', label: '下端クリープ速度', symbol: 'V3', unit: 'mm/s', down: 40, up: 40 },
  { key: 's1', label: '上端クリープ距離', symbol: 'S1', unit: 'mm', down: 0, up: 19 },
  { key: 's5', label: '下端クリープ距離', symbol: 'S5', unit: 'mm', down: 21, up: 12 },
  { key: 'sh', label: '昇降ストローク', symbol: 'SH', unit: 'mm', down: 2500, up: 2500 },
  { key: 'tr', label: '制御遅れ', symbol: 'TR', unit: 's', down: 0.21, up: 0.55 }
];
const extras = { tg: 0.27, servo: 0.6 };
const segmentNames = ['上端クリープ', '加速', '定速', '減速', '下端クリープ'];

const inputContainer = document.getElementById('motionInputs');
motionFields.forEach((field) => {
  inputContainer.insertAdjacentHTML('beforeend', `
    <div class="motion-row">
      <label for="down-${field.key}"><span>${field.label} <b>${field.symbol}</b></span><em>${field.unit}</em></label>
      <span class="field"><input id="down-${field.key}" type="number" min="0" step="any" value="${field.down}" aria-label="荷つかみ下降 ${field.label}" /><em>${field.unit}</em></span>
      <span class="field"><input id="up-${field.key}" type="number" min="0" step="any" value="${field.up}" aria-label="荷つかみ上昇 ${field.label}" /><em>${field.unit}</em></span>
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
function renderEmpty() {
  ['totalTime', 'transferTime', 'servoResult', 'downMotion', 'downDelay', 'upMotion', 'upDelay', 'downDistanceTotal', 'downTimeTotal', 'upDistanceTotal', 'upTimeTotal'].forEach((id) => setText(id, '—'));
  setText('totalMilliseconds', '— ms');
  ['down', 'up'].forEach((direction) => { for (let i = 1; i <= 5; i += 1) { setText(`${direction}-distance-${i}`, '—'); setText(`${direction}-time-${i}`, '—'); } });
}

function calculate() {
  const down = readDirection('down');
  const up = readDirection('up');
  const tg = Number(document.getElementById('tg').value);
  const servo = Number(document.getElementById('servo').value);
  const warning = document.getElementById('warning');
  const values = [...Object.values(down), ...Object.values(up), tg, servo];
  const positiveKeys = ['a1', 'a2', 'v1', 'v2', 'v3'];
  const invalid = values.some((value) => !Number.isFinite(value) || value < 0)
    || positiveKeys.some((key) => down[key] === 0 || up[key] === 0);

  if (invalid) {
    warning.textContent = '速度・加速度には0より大きい値、その他の項目には0以上の値を入力してください。';
    warning.hidden = false;
    renderEmpty();
    return;
  }
  const downResult = calculateMotion(down);
  const upResult = calculateMotion(up);
  if (downResult.distances[2] < 0 || upResult.distances[2] < 0) {
    warning.textContent = '昇降ストロークが不足しています。加減速・クリープ距離の合計がストロークを超えないようにしてください。';
    warning.hidden = false;
    renderEmpty();
    return;
  }
  warning.hidden = true;

  const actualTransfer = downResult.tt + down.tr + tg + upResult.tt + up.tr;
  const total = actualTransfer + servo;
  setText('totalTime', format(total));
  setText('totalMilliseconds', `${format(total * 1000, 0)} ms`);
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
}

allInputs.forEach((input) => input.addEventListener('input', calculate));
document.getElementById('resetButton').addEventListener('click', () => {
  motionFields.forEach((field) => { document.getElementById(`down-${field.key}`).value = field.down; document.getElementById(`up-${field.key}`).value = field.up; });
  Object.entries(extras).forEach(([id, value]) => { document.getElementById(id).value = value; });
  calculate();
});
calculate();
