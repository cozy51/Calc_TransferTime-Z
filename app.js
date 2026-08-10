const motionFields = [
  { key: 'sh', group: 'distance', label: '昇降ストローク', symbol: 'SH', unit: 'mm', down: 2500, up: 2500, unloadDown: 2500, unloadUp: 2500 },
  { key: 's1', group: 'distance', label: '上端クリープ距離', symbol: 'S1', unit: 'mm', down: 0, up: 19, unloadDown: 0, unloadUp: 0 },
  { key: 's5', group: 'distance', label: '下端クリープ距離', symbol: 'S5', unit: 'mm', down: 21, up: 12, unloadDown: 22, unloadUp: 0 },
  { key: 'v1', group: 'speed', label: '上端クリープ速度', symbol: 'V1', unit: 'mm/s', down: 20, up: 40, unloadDown: 20, unloadUp: 40 },
  { key: 'v2', group: 'speed', label: '昇降速度', symbol: 'V2', unit: 'mm/s', down: 1900, up: 1500, unloadDown: 1000, unloadUp: 1900 },
  { key: 'v3', group: 'speed', label: '下端クリープ速度', symbol: 'V3', unit: 'mm/s', down: 40, up: 40, unloadDown: 20, unloadUp: 40 },
  { key: 'a1', group: 'acceleration', label: '昇降加速度', symbol: 'A1', unit: 'mm/s²', down: 3000, up: 2000, unloadDown: 2500, unloadUp: 3000 },
  { key: 'a2', group: 'acceleration', label: '昇降減速度', symbol: 'A2', unit: 'mm/s²', down: 3000, up: 2500, unloadDown: 2500, unloadUp: 3000 },
  { key: 'tr', group: 'delay', label: '制御遅れ', symbol: 'TR', unit: 's', down: 0.21, up: 0.55, unloadDown: 0.26, unloadUp: 0.13 }
];
const extras = { tg: 0.27, 'unload-tg': 0.21, servo: 0.6, 'unload-servo': 0.6 };
const cycleSpecifications = { pickup: 7.7, unload: 7.6 };
const chartSeriesNames = ['荷つかみ・下降時', '荷つかみ・上昇時', '荷おろし・下降時', '荷おろし・上昇時'];
const segmentNames = ['上端クリープ', '加速', '定速', '減速', '下端クリープ'];

const inputContainer = document.getElementById('motionInputs');
const motionGroups = motionFields.reduce((groups, field) => {
  if (!groups.has(field.group)) groups.set(field.group, []);
  groups.get(field.group).push(field);
  return groups;
}, new Map());
motionGroups.forEach((fields) => {
  const rows = fields.map((field, index) => `
    <div class="motion-row">
      <label for="down-${field.key}"><span>${field.label}</span><b>${field.symbol}</b></label>
      ${index === 0 ? `<em class="unit" style="grid-row:span ${fields.length}"><span>${field.unit}</span>${fields.length > 1 ? '<small>共通</small>' : ''}</em>` : ''}
      <span class="field"><input id="down-${field.key}" type="number" min="0" step="any" value="${field.down}" aria-label="荷つかみ動作・下降時 ${field.label}" /></span>
      <span class="field"><input id="up-${field.key}" type="number" min="0" step="any" value="${field.up}" aria-label="荷つかみ動作・上昇時 ${field.label}" /></span>
      <span class="field"><input id="unloadDown-${field.key}" type="number" min="0" step="any" value="${field.unloadDown}" aria-label="荷おろし動作・下降時 ${field.label}" /></span>
      <span class="field"><input id="unloadUp-${field.key}" type="number" min="0" step="any" value="${field.unloadUp}" aria-label="荷おろし動作・上昇時 ${field.label}" /></span>
    </div>`).join('');
  inputContainer.insertAdjacentHTML('beforeend', `<div class="motion-group">${rows}</div>`);
});

const detailRows = document.getElementById('detailRows');
segmentNames.forEach((name, index) => {
  const number = index + 1;
  detailRows.insertAdjacentHTML('beforeend', `<tr><td><span class="tag">T${number}</span></td><td>${name}</td>${['down', 'up', 'unloadDown', 'unloadUp'].map((direction) => `<td id="${direction}-distance-${number}">—</td><td id="${direction}-time-${number}">—</td>`).join('')}</tr>`);
});

const allInputs = [...document.querySelectorAll('.input-panel input')];
let simulationResults = null;
let simulationState = null;
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
function setJudgement(id, total, specification) {
  const element = document.getElementById(id);
  const passed = Number.isFinite(total) && total <= specification;
  element.textContent = passed ? '合格' : '不合格';
  element.className = `judgement ${passed ? 'passed' : 'failed'}`;
}
function cancelSimulation() {
  if (simulationState?.frame) cancelAnimationFrame(simulationState.frame);
  simulationState = null;
  document.getElementById('handUnit').style.transform = 'translate(-50%, 0)';
  document.getElementById('simulationCargo').style.transform = 'translate(-50%, 0)';
  const pauseButton = document.getElementById('simulationPause');
  pauseButton.disabled = true;
  pauseButton.textContent = 'スタート';
}
function setSimulationTelemetry(elapsed = 0, position = 0, velocity = 0, acceleration = 0) {
  setText('simulationElapsed', `${format(elapsed)} s`);
  setText('simulationPosition', `${format(position)} mm`);
  setText('simulationVelocity', `${format(velocity)} mm/s`);
  setText('simulationAcceleration', `${format(acceleration)} mm/s²`);
}
function updateAutoPauseControl() {
  const criterion = document.getElementById('simulationPauseCriterion').value;
  const input = document.getElementById('simulationPauseTarget');
  const units = { position: 'mm', time: 's', velocity: 'mm/s', none: '—' };
  const limits = simulationState ? { position: simulationState.maxPosition, time: simulationState.maxTime, velocity: simulationState.maxVelocity } : {};
  setText('simulationPauseUnit', units[criterion]);
  input.disabled = criterion === 'none';
  input.max = limits[criterion] ?? '';
  if (criterion === 'none') input.value = '';
}
function getKinematics(values, result, elapsed) {
  const [t1, t2, t3, t4, t5] = result.times;
  let time = elapsed;
  if (time < t1 && t1 > 0) return { position: values.s1 * time / t1, velocity: values.v1, acceleration: 0 };
  time -= t1;
  if (time < t2) return { position: values.s1 + values.a1 * time ** 2 / 2, velocity: values.a1 * time, acceleration: values.a1 };
  time -= t2;
  if (time < t3) return { position: values.s1 + result.distances[1] + values.v2 * time, velocity: values.v2, acceleration: 0 };
  time -= t3;
  const decelerationStart = values.s1 + result.distances[1] + result.distances[2];
  if (time < t4) return { position: decelerationStart + values.v2 * time - values.a2 * time ** 2 / 2, velocity: Math.max(values.v2 - values.a2 * time, 0), acceleration: -values.a2 };
  time -= t4;
  const creepStart = decelerationStart + result.distances[3];
  if (time < t5) return { position: creepStart + values.v3 * time, velocity: values.v3, acceleration: 0 };
  return { position: values.sh, velocity: 0, acceleration: 0 };
}
function setTotalFormula(id, downDelay, downMotion, grip, upDelay, upMotion, transfer, servo, total) {
  document.getElementById(id).innerHTML = `TM = ${format(downDelay)} + ${format(downMotion)} + <mark>${format(grip)}</mark> + ${format(upDelay)} + ${format(upMotion)} = ${format(transfer)} 秒<br>TC = ${format(transfer)} + <mark>${format(servo)}</mark> = ${format(total)} 秒`;
}
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

  if (series.length) {
    const boxWidth = width < 500 ? 145 : 170;
    const rowHeight = 23;
    const boxX = width - margin.right - boxWidth;
    const boxY = margin.top + 9;
    context.fillStyle = 'rgba(255,255,255,.92)';
    context.strokeStyle = '#d5e1ec';
    context.lineWidth = 1;
    const headerHeight = 25;
    context.fillRect(boxX, boxY, boxWidth, headerHeight + rowHeight * series.length + 8);
    context.strokeRect(boxX, boxY, boxWidth, headerHeight + rowHeight * series.length + 8);
    context.textBaseline = 'middle';
    context.font = `700 ${width < 500 ? 10 : 11}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.fillStyle = '#263c55';
    context.textAlign = 'left';
    context.fillText('動作時間 TT', boxX + 9, boxY + 14);
    context.strokeStyle = '#e2e8ef';
    context.beginPath(); context.moveTo(boxX, boxY + headerHeight); context.lineTo(boxX + boxWidth, boxY + headerHeight); context.stroke();
    series.forEach(({ result, color }, index) => {
      const rowY = boxY + headerHeight + 14 + index * rowHeight;
      context.fillStyle = color;
      context.fillRect(boxX + 9, rowY - 2, 17, 4);
      context.textAlign = 'left';
      context.fillText(chartSeriesNames[index], boxX + 32, rowY);
      context.textAlign = 'right';
      context.fillText(`${format(result.tt)} s`, boxX + boxWidth - 9, rowY);
    });
  }
}
function renderEmpty() {
  simulationResults = null;
  cancelSimulation();
  setSimulationTelemetry();
  setText('simulationTime', '動作時間 TT：— 秒');
  setText('simulationStatus', '入力値を確認してください。');
  ['totalTime', 'unloadTotalTime', 'transferTime', 'servoResult', 'downMotion', 'downDelay', 'upMotion', 'upDelay', 'unloadTransferTime', 'unloadServoResult', 'unloadDownMotion', 'unloadDownDelay', 'unloadUpMotion', 'unloadUpDelay', 'downDistanceTotal', 'downTimeTotal', 'upDistanceTotal', 'upTimeTotal', 'unloadDownDistanceTotal', 'unloadDownTimeTotal', 'unloadUpDistanceTotal', 'unloadUpTimeTotal'].forEach((id) => setText(id, '—'));
  setText('totalMilliseconds', '— ms');
  setText('unloadTotalMilliseconds', '— ms');
  ['pickupJudgement', 'unloadJudgement'].forEach((id) => {
    const element = document.getElementById(id);
    element.textContent = '判定不可';
    element.className = 'judgement pending';
  });
  setText('pickupTotalFormula', '—');
  setText('unloadTotalFormula', '—');
  drawSpeedChart();
  ['down', 'up', 'unloadDown', 'unloadUp'].forEach((direction) => { for (let i = 1; i <= 5; i += 1) { setText(`${direction}-distance-${i}`, '—'); setText(`${direction}-time-${i}`, '—'); } });
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
  cancelSimulation();
  setSimulationTelemetry();
  document.querySelectorAll('[data-simulation]').forEach((button) => button.classList.remove('active'));
  setText('simulationTime', '動作時間 TT：— 秒');
  setText('simulationStatus', '動作を選択すると、実際の動作時間 TT に合わせて再生します。');
  simulationResults = {
    down: { result: downResult, values: down },
    up: { result: upResult, values: up },
    unloadDown: { result: unloadDownResult, values: unloadDown },
    unloadUp: { result: unloadUpResult, values: unloadUp }
  };

  const actualTransfer = downResult.tt + down.tr + tg + upResult.tt + up.tr;
  const total = actualTransfer + servo;
  const unloadActualTransfer = unloadDownResult.tt + unloadDown.tr + unloadTg + unloadUpResult.tt + unloadUp.tr;
  const unloadTotal = unloadActualTransfer + unloadServo;
  setText('totalTime', format(total));
  setText('totalMilliseconds', `${format(total * 1000, 0)} ms`);
  setText('unloadTotalTime', format(unloadTotal));
  setText('unloadTotalMilliseconds', `${format(unloadTotal * 1000, 0)} ms`);
  setJudgement('pickupJudgement', total, cycleSpecifications.pickup);
  setJudgement('unloadJudgement', unloadTotal, cycleSpecifications.unload);
  setTotalFormula('pickupTotalFormula', down.tr, downResult.tt, tg, up.tr, upResult.tt, actualTransfer, servo, total);
  setTotalFormula('unloadTotalFormula', unloadDown.tr, unloadDownResult.tt, unloadTg, unloadUp.tr, unloadUpResult.tt, unloadActualTransfer, unloadServo, unloadTotal);
  setText('transferTime', `${format(actualTransfer)} 秒`);
  setText('servoResult', `${format(servo)} 秒`);
  setText('downMotion', `${format(downResult.tt)} 秒`);
  setText('downDelay', `${format(down.tr)} 秒`);
  setText('upMotion', `${format(upResult.tt)} 秒`);
  setText('upDelay', `${format(up.tr)} 秒`);
  setText('unloadTransferTime', `${format(unloadActualTransfer)} 秒`);
  setText('unloadServoResult', `${format(unloadServo)} 秒`);
  setText('unloadDownMotion', `${format(unloadDownResult.tt)} 秒`);
  setText('unloadDownDelay', `${format(unloadDown.tr)} 秒`);
  setText('unloadUpMotion', `${format(unloadUpResult.tt)} 秒`);
  setText('unloadUpDelay', `${format(unloadUp.tr)} 秒`);

  [['down', down, downResult], ['up', up, upResult], ['unloadDown', unloadDown, unloadDownResult], ['unloadUp', unloadUp, unloadUpResult]].forEach(([direction, input, result]) => {
    result.distances.forEach((distance, index) => setText(`${direction}-distance-${index + 1}`, `${format(distance)} mm`));
    result.times.forEach((time, index) => setText(`${direction}-time-${index + 1}`, `${format(time)} s`));
    setText(`${direction}DistanceTotal`, `${format(input.sh)} mm`);
    setText(`${direction}TimeTotal`, `${format(result.tt)} s`);
  });
  drawSpeedChart([
    { values: down, result: downResult, color: '#1776d2' },
    { values: up, result: upResult, color: '#148572' },
    { values: unloadDown, result: unloadDownResult, color: '#e07a16' },
    { values: unloadUp, result: unloadUpResult, color: '#8c5ac7' }
  ]);
}

allInputs.forEach((input) => input.addEventListener('input', calculate));
document.querySelectorAll('[data-simulation]').forEach((button) => {
  button.addEventListener('click', () => {
    const direction = button.dataset.simulation;
    const simulation = simulationResults?.[direction];
    if (!simulation) return;
    const { result, values } = simulation;
    document.querySelectorAll('[data-simulation]').forEach((item) => item.classList.toggle('active', item === button));
    cancelSimulation();
    const isUp = direction === 'up' || direction === 'unloadUp';
    const carriesLoad = direction === 'up' || direction === 'unloadDown';
    const handUnit = document.getElementById('handUnit');
    const cargo = document.getElementById('simulationCargo');
    const label = button.textContent;
    setText('simulationTime', `動作時間 TT：${format(result.tt)} 秒`);
    setText('simulationStatus', `${label}を選択しました。「スタート」で再生します。`);
    setSimulationTelemetry();
    const startOffset = isUp ? 345 : 0;
    handUnit.style.transform = `translate(-50%, ${startOffset}px)`;
    cargo.style.transform = `translate(-50%, ${carriesLoad ? startOffset - 345 : 0}px)`;
    const toggleButton = document.getElementById('simulationPause');
    toggleButton.disabled = false;
    toggleButton.textContent = 'スタート';
    simulationState = { elapsed: 0, lastTime: 0, paused: true, started: false, finished: false, autoPaused: false, pauseCriterion: 'none', targetValue: null, maxPosition: values.sh, maxTime: result.tt, maxVelocity: values.v2, frame: null, handUnit, cargo, carriesLoad, startOffset };
    updateAutoPauseControl();
    const renderFrame = (now) => {
      if (!simulationState || simulationState.paused) return;
      simulationState.elapsed = Math.min(simulationState.elapsed + (now - simulationState.lastTime) / 1000, result.tt);
      simulationState.lastTime = now;
      const progress = result.tt > 0 ? simulationState.elapsed / result.tt : 1;
      const offset = (isUp ? 1 - progress : progress) * 345;
      handUnit.style.transform = `translate(-50%, ${offset}px)`;
      cargo.style.transform = `translate(-50%, ${carriesLoad ? offset - 345 : 0}px)`;
      const current = getKinematics(values, result, simulationState.elapsed);
      setSimulationTelemetry(simulationState.elapsed, current.position, current.velocity, current.acceleration);
      const measurements = { position: current.position, time: simulationState.elapsed, velocity: current.velocity };
      if (simulationState.targetValue !== null && !simulationState.autoPaused && measurements[simulationState.pauseCriterion] >= simulationState.targetValue) {
        simulationState.paused = true;
        simulationState.autoPaused = true;
        toggleButton.textContent = '再開';
        const labels = { position: ['位置', 'mm'], time: ['時間', 's'], velocity: ['速度', 'mm/s'] };
        const [criterionLabel, unit] = labels[simulationState.pauseCriterion];
        setText('simulationStatus', `指定${criterionLabel} ${format(simulationState.targetValue)} ${unit} に到達したため、自動で一時停止しました。`);
        return;
      }
      if (simulationState.elapsed >= result.tt) {
        setText('simulationStatus', `${label}が完了しました。`);
        simulationState.paused = true;
        simulationState.started = false;
        simulationState.finished = true;
        toggleButton.textContent = 'スタート';
        return;
      }
      simulationState.frame = requestAnimationFrame(renderFrame);
    };
    simulationState.renderFrame = renderFrame;
  });
});
document.getElementById('simulationPause').addEventListener('click', (event) => {
  if (!simulationState) return;
  if (simulationState.finished) {
    simulationState.elapsed = 0;
    simulationState.finished = false;
    simulationState.handUnit.style.transform = `translate(-50%, ${simulationState.startOffset}px)`;
    simulationState.cargo.style.transform = `translate(-50%, ${simulationState.carriesLoad ? simulationState.startOffset - 345 : 0}px)`;
    setSimulationTelemetry();
  }
  if (!simulationState.started) {
    const criterion = document.getElementById('simulationPauseCriterion').value;
    const rawTarget = document.getElementById('simulationPauseTarget').value.trim();
    const targetValue = criterion === 'none' || rawTarget === '' ? null : Number(rawTarget);
    const limits = { position: simulationState.maxPosition, time: simulationState.maxTime, velocity: simulationState.maxVelocity };
    const labels = { position: ['位置', 'mm'], time: ['時間', 's'], velocity: ['速度', 'mm/s'] };
    if (targetValue !== null && (!Number.isFinite(targetValue) || targetValue < 0 || targetValue > limits[criterion])) {
      const [criterionLabel, unit] = labels[criterion];
      setText('simulationStatus', `自動一時停止${criterionLabel}は0～${format(limits[criterion])} ${unit}で指定してください。`);
      return;
    }
    simulationState.pauseCriterion = criterion;
    simulationState.targetValue = targetValue;
    simulationState.autoPaused = false;
    simulationState.started = true;
    simulationState.paused = false;
  } else {
    simulationState.paused = !simulationState.paused;
  }
  event.currentTarget.textContent = simulationState.paused ? '再開' : '一時停止';
  if (simulationState.paused) {
    if (simulationState.frame) cancelAnimationFrame(simulationState.frame);
    setText('simulationStatus', '一時停止中です。');
  } else {
    simulationState.lastTime = performance.now();
    setText('simulationStatus', simulationState.elapsed === 0 ? 'シミュレーションを開始しました。' : 'シミュレーションを再開しました。');
    simulationState.frame = requestAnimationFrame(simulationState.renderFrame);
  }
});
document.getElementById('simulationPauseCriterion').addEventListener('change', updateAutoPauseControl);
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
