const defaults = { a1: 1000, a2: 1000, v1: 50, v2: 400, v3: 50, s1: 20, s5: 20, sh: 500, tr: 0.2, tg: 0.5, servo: 0.3 };
const inputs = Object.fromEntries(Object.keys(defaults).map((id) => [id, document.getElementById(id)]));

const format = (value, digits = 3) => Number.isFinite(value)
  ? value.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—';

function setResult(id, value, unit, digits = 3) {
  document.getElementById(id).textContent = `${format(value, digits)} ${unit}`;
}

function calculate() {
  const values = Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, Number(input.value)]));
  const warning = document.getElementById('warning');
  const invalid = Object.entries(values).some(([id, value]) => !Number.isFinite(value) || value < 0 || (['a1', 'a2', 'v1', 'v2', 'v3'].includes(id) && value === 0));

  if (invalid) {
    warning.textContent = '速度・加速度には0より大きい値、その他の項目には0以上の値を入力してください。';
    warning.hidden = false;
    renderEmpty();
    return;
  }

  const t1 = values.s1 / values.v1;
  const t2 = values.v2 / values.a1;
  const s2 = values.v2 * t2 / 2;
  const t4 = values.v2 / values.a2;
  const s4 = values.v2 * t4 / 2;
  const s3 = values.sh - (values.s1 + s2 + s4 + values.s5);
  const t3 = s3 / values.v2;
  const t5 = values.s5 / values.v3;

  if (s3 < 0) {
    warning.textContent = '昇降ストロークが不足しています。加減速・クリープ距離の合計がストロークを超えないようにしてください。';
    warning.hidden = false;
    renderEmpty();
    return;
  }
  warning.hidden = true;

  const times = [t1, t2, t3, t4, t5];
  const distances = [values.s1, s2, s3, s4, values.s5];
  const tt = times.reduce((sum, time) => sum + time, 0);
  const actualTransfer = tt * 2 + values.tr * 2 + values.tg;
  const total = actualTransfer + values.servo;

  document.getElementById('totalTime').textContent = format(total);
  document.getElementById('totalMilliseconds').textContent = `${format(total * 1000, 0)} ms`;
  document.getElementById('motionTime').innerHTML = `${format(tt)} <small>s</small>`;
  document.getElementById('transferTime').innerHTML = `${format(actualTransfer)} <small>s</small>`;
  distances.forEach((distance, index) => setResult(`distance${index + 1}`, distance, 'mm'));
  times.forEach((time, index) => setResult(`time${index + 1}`, time, 's'));
  setResult('distanceTotal', values.sh, 'mm');
  setResult('timeTotal', tt, 's');
}

function renderEmpty() {
  ['totalTime', 'motionTime', 'transferTime'].forEach((id) => { document.getElementById(id).textContent = '—'; });
  document.getElementById('totalMilliseconds').textContent = '— ms';
  for (let i = 1; i <= 5; i += 1) {
    document.getElementById(`distance${i}`).textContent = '—';
    document.getElementById(`time${i}`).textContent = '—';
  }
  document.getElementById('distanceTotal').textContent = '—';
  document.getElementById('timeTotal').textContent = '—';
}

Object.values(inputs).forEach((input) => input.addEventListener('input', calculate));
document.getElementById('resetButton').addEventListener('click', () => {
  Object.entries(defaults).forEach(([id, value]) => { inputs[id].value = value; });
  calculate();
});
calculate();
