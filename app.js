const motionFields = [
  { key: 's1', group: 'distance', label: '上端クリープ距離', symbol: 'S1', unit: 'mm', down: 0, up: 19, unloadDown: 0, unloadUp: 0 },
  { key: 's5', group: 'distance', label: '下端クリープ距離', symbol: 'S5', unit: 'mm', down: 21, up: 12, unloadDown: 22, unloadUp: 0 },
  { key: 'v1', group: 'speed', label: '上端クリープ速度', symbol: 'V1', unit: 'mm/s', down: 20, up: 40, unloadDown: 20, unloadUp: 40 },
  { key: 'v2', group: 'speed', label: '昇降速度', symbol: 'V2', unit: 'mm/s', down: 1900, up: 1500, unloadDown: 1000, unloadUp: 1900 },
  { key: 'v3', group: 'speed', label: '下端クリープ速度', symbol: 'V3', unit: 'mm/s', down: 40, up: 40, unloadDown: 20, unloadUp: 40 },
  { key: 'a1', group: 'acceleration', label: '昇降加速度', symbol: 'A1', unit: 'mm/s²', down: 3000, up: 2000, unloadDown: 2500, unloadUp: 3000 },
  { key: 'a2', group: 'acceleration', label: '昇降減速度', symbol: 'A2', unit: 'mm/s²', down: 3000, up: 2500, unloadDown: 2500, unloadUp: 3000 },
  { key: 'tr', group: 'delay', label: '制御遅れ', symbol: 'TR', unit: 's', down: 0.21, up: 0.55, unloadDown: 0.26, unloadUp: 0.13 }
];
const extras = { tg: 0.27, 'unload-tg': 0.21, servo: 0.6, 'unload-servo': 0.6, 'pickup-spec': 7.7, 'unload-spec': 7.6 };
const sharedDefaults = { sh: 2500 };
const chartSeriesNames = ['荷つかみ・下降時', '荷つかみ・上昇時', '荷おろし・下降時', '荷おろし・上昇時'];
const segmentNames = ['上端クリープ', '加速', '定速', '減速', '下端クリープ'];
// Stage geometry (px). The hand unit travels TRACK_LENGTH px, and its vertical
// centre is used as the position marker so the creep bands line up with it.
const TRACK_LENGTH = 345;
const HAND_CENTER_TOP = 130.5;
// Creep sections are only a few mm of a stroke of some 1,000 mm, so on a 345 px
// track they would be 1–2 px and look like a dead stop. When emphasis is on,
// each creep section is guaranteed this share of the track instead.
const CREEP_MIN_SHARE = 0.14;
// The magnification is cancelled out by playing the section back that many times
// slower, so capping it also caps how long the whole playback takes.
const MAX_CREEP_MAGNIFICATION = 5;

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
const creepEmphasis = document.getElementById('creepEmphasis');
let simulationResults = null;
let simulationState = null;
const format = (value, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—';

function readDirection(direction) {
  return { ...Object.fromEntries(motionFields.map(({ key }) => [key, Number(document.getElementById(`${direction}-${key}`).value)])), sh: Number(document.getElementById('shared-sh').value) };
}

function calculateMotion(values) {
  const t1 = values.s1 / values.v1;
  const availableDistance = values.sh - values.s1 - values.s5;
  // Acceleration starts from the upper creep speed V1 and deceleration ends at
  // the lower creep speed V3 — the axis never drops to 0 mm/s between segments.
  const requestedAccelerationDistance = (values.v2 ** 2 - values.v1 ** 2) / (2 * values.a1) + (values.v2 ** 2 - values.v3 ** 2) / (2 * values.a2);
  const creepFloor = Math.max(values.v1, values.v3);
  const reachableSpeed = Math.sqrt(Math.max((availableDistance + values.v1 ** 2 / (2 * values.a1) + values.v3 ** 2 / (2 * values.a2)) / (1 / (2 * values.a1) + 1 / (2 * values.a2)), 0));
  const peakSpeed = availableDistance >= requestedAccelerationDistance
    ? values.v2
    : Math.max(Math.min(reachableSpeed, values.v2), creepFloor);
  const t2 = Math.max(peakSpeed - values.v1, 0) / values.a1;
  const s2 = (values.v1 + peakSpeed) * t2 / 2;
  const t4 = Math.max(peakSpeed - values.v3, 0) / values.a2;
  const s4 = (peakSpeed + values.v3) * t4 / 2;
  const s3 = values.sh - (values.s1 + s2 + s4 + values.s5);
  const t3 = peakSpeed > 0 ? Math.max(s3, 0) / peakSpeed : 0;
  const t5 = values.s5 / values.v3;
  const times = [t1, t2, t3, t4, t5];
  return { distances: [values.s1, s2, Math.max(s3, 0), s4, values.s5], times, peakSpeed, valid: availableDistance >= 0, tt: times.reduce((sum, time) => sum + time, 0) };
}

function setText(id, value) { document.getElementById(id).textContent = value; }
function setJudgement(id, total, specification) {
  const element = document.getElementById(id);
  const passed = Number.isFinite(total) && total <= specification;
  element.textContent = passed ? '合格' : '不合格';
  element.className = `judgement ${passed ? 'passed' : 'failed'}`;
}
function cancelSimulation() {
  stopRecording(true);
  if (simulationState?.frame) cancelAnimationFrame(simulationState.frame);
  simulationState = null;
  const handUnit = document.getElementById('handUnit');
  handUnit.style.transform = 'translate(-50%, 0)';
  handUnit.classList.remove('creeping');
  document.getElementById('simulationCargo').style.transform = 'translate(-50%, 0)';
  renderCreepZones(null);
  setPhaseBadge('待機中');
  const pauseButton = document.getElementById('simulationPause');
  pauseButton.disabled = true;
  pauseButton.textContent = 'スタート';
  document.getElementById('simulationRecord').disabled = true;
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
  const lastSegment = result.times.reduce((last, time, index) => (time > 0 ? index : last), 0);
  let time = elapsed;
  if (time < t1 && t1 > 0) return { position: values.s1 * time / t1, velocity: values.v1, acceleration: 0, segment: 0 };
  time -= t1;
  if (time < t2) return { position: values.s1 + values.v1 * time + values.a1 * time ** 2 / 2, velocity: values.v1 + values.a1 * time, acceleration: values.a1, segment: 1 };
  time -= t2;
  if (time < t3) return { position: values.s1 + result.distances[1] + result.peakSpeed * time, velocity: result.peakSpeed, acceleration: 0, segment: 2 };
  time -= t3;
  const decelerationStart = values.s1 + result.distances[1] + result.distances[2];
  if (time < t4) return { position: decelerationStart + result.peakSpeed * time - values.a2 * time ** 2 / 2, velocity: Math.max(result.peakSpeed - values.a2 * time, values.v3), acceleration: -values.a2, segment: 3 };
  time -= t4;
  const creepStart = decelerationStart + result.distances[3];
  if (time < t5) return { position: creepStart + values.v3 * time, velocity: values.v3, acceleration: 0, segment: 4 };
  return { position: values.sh, velocity: 0, acceleration: 0, segment: lastSegment };
}
// Maps a travel position (mm) onto the stage track (px). With emphasis on, the
// mapping is piecewise linear so each creep section keeps a visible share of the
// track; the telemetry values stay in real mm either way.
function buildPositionScale(values, result, emphasise) {
  const distances = result.distances;
  const stroke = distances.reduce((sum, distance) => sum + distance, 0);
  const raw = distances.map((distance) => (stroke > 0 ? distance / stroke : 0));
  let shares = raw;
  const creepIndexes = [0, 4].filter((index) => distances[index] > 0);
  const creepTarget = (index) => Math.min(Math.max(raw[index], CREEP_MIN_SHARE), raw[index] * MAX_CREEP_MAGNIFICATION);
  if (emphasise && creepIndexes.length) {
    const creepShare = creepIndexes.reduce((sum, index) => sum + creepTarget(index), 0);
    const otherShare = raw.reduce((sum, share, index) => sum + (creepIndexes.includes(index) ? 0 : share), 0);
    if (otherShare > 0 && creepShare < 1) {
      shares = raw.map((share, index) => (creepIndexes.includes(index) ? creepTarget(index) : share * (1 - creepShare) / otherShare));
    }
  }
  const shareTotal = shares.reduce((sum, share) => sum + share, 0);
  const segments = [];
  let position = 0;
  let offset = 0;
  distances.forEach((distance, index) => {
    const share = shareTotal > 0 ? shares[index] / shareTotal : 0;
    const length = share * TRACK_LENGTH;
    // A magnified section would sweep more pixels in the same wall-clock time and
    // therefore look faster. Playing it back at raw/share of real time cancels the
    // magnification out, so the apparent speed matches the true-scale diagram.
    const rate = raw[index] > 0 && share > 0 ? Math.max(raw[index] / share, 1 / MAX_CREEP_MAGNIFICATION) : 1;
    segments.push({ index, start: position, end: position + distance, offsetStart: offset, offsetEnd: offset + length, rate });
    position += distance;
    offset += length;
  });
  const toOffset = (value) => {
    const clamped = Math.min(Math.max(value, 0), stroke);
    const segment = segments.find((item) => clamped <= item.end + 1e-9) ?? segments[segments.length - 1];
    const span = segment.end - segment.start;
    const ratio = span > 0 ? (clamped - segment.start) / span : 1;
    return segment.offsetStart + ratio * (segment.offsetEnd - segment.offsetStart);
  };
  return { segments, toOffset, stroke };
}
function toStageOffset(state, position) {
  const offset = state.scale.toOffset(position);
  return state.isUp ? TRACK_LENGTH - offset : offset;
}
function renderCreepZones(state) {
  [0, 4].forEach((index, slot) => {
    const zone = document.getElementById(slot === 0 ? 'creepZoneStart' : 'creepZoneEnd');
    const segment = state?.scale.segments[index];
    if (!state || !segment || segment.end - segment.start <= 0) {
      zone.hidden = true;
      return;
    }
    const edges = [toStageOffset(state, segment.start), toStageOffset(state, segment.end)];
    const top = Math.min(...edges);
    zone.hidden = false;
    zone.style.top = `${HAND_CENTER_TOP + top}px`;
    zone.style.height = `${Math.max(Math.abs(edges[1] - edges[0]), 3)}px`;
    zone.firstElementChild.textContent = `${segmentNames[index]}（T${index + 1}）${format(segment.end - segment.start, 1)} mm`;
  });
}
function setPhaseBadge(label, rateLabel = '') {
  const phase = document.getElementById('simulationPhase');
  phase.firstElementChild.textContent = label;
  phase.lastElementChild.textContent = rateLabel;
  phase.classList.remove('creep');
}
function playbackRateLabel(rate) {
  if (rate < 0.995) return `再生 1/${format(1 / rate, 1)} 速`;
  if (rate > 1.005) return `再生 ${format(rate, 2)} 倍速`;
  return '再生 等倍';
}
function renderSimulationFrame(state, kinematics) {
  const offset = toStageOffset(state, kinematics.position);
  state.handUnit.style.transform = `translate(-50%, ${offset}px)`;
  state.cargo.style.transform = `translate(-50%, ${state.carriesLoad ? offset - TRACK_LENGTH : 0}px)`;
  setSimulationTelemetry(state.elapsed, kinematics.position, kinematics.velocity, kinematics.acceleration);
  const creeping = kinematics.segment === 0 || kinematics.segment === 4;
  state.handUnit.classList.toggle('creeping', creeping);
  const phase = document.getElementById('simulationPhase');
  phase.firstElementChild.textContent = `区間 T${kinematics.segment + 1}：${segmentNames[kinematics.segment]}`;
  phase.lastElementChild.textContent = playbackRateLabel(state.scale.segments[kinematics.segment]?.rate ?? 1);
  phase.classList.toggle('creep', creeping);
  document.getElementById('creepZoneStart').classList.toggle('active', kinematics.segment === 0);
  document.getElementById('creepZoneEnd').classList.toggle('active', kinematics.segment === 4);
}
// ---- 動画出力 -------------------------------------------------------------
// The stage is plain DOM, which MediaRecorder cannot capture, so the same
// drawing is mirrored onto an off-screen canvas and that canvas is recorded.
const VIDEO_WIDTH = 820;
const VIDEO_HEADER = 138;
const VIDEO_HEIGHT = VIDEO_HEADER + 560;
const VIDEO_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", Meiryo, sans-serif';
const STAGE_LEFT = 24;
const STAGE_RIGHT = VIDEO_WIDTH - 24;
const STAGE_CENTER = VIDEO_WIDTH / 2;
// Browsers drop non-ASCII names on blob downloads, so the file is named in romaji.
const VIDEO_FILE_NAMES = { down: 'pickup-down', up: 'pickup-up', unloadDown: 'unload-down', unloadUp: 'unload-up' };
let recorderState = null;

function roundRectPath(context, x, y, width, height, radius) {
  const r = Math.max(Math.min(radius, width / 2, height / 2), 0);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}
function drawBox(context, x, y, width, height, radius, fill, stroke, lineWidth = 1) {
  roundRectPath(context, x, y, width, height, radius);
  if (fill) { context.fillStyle = fill; context.fill(); }
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke(); }
}
function drawHatch(context, x, y, width, height, color, gap = 18, lineWidth = 9) {
  context.save();
  roundRectPath(context, x, y, width, height, 3);
  context.clip();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();
  for (let i = -height; i < width + height; i += gap) { context.moveTo(x + i, y + height); context.lineTo(x + i + height, y); }
  context.stroke();
  context.restore();
}
function drawLabelledBox(context, x, y, width, height, radius, fill, stroke, lineWidth, text, color, fontSize) {
  drawBox(context, x, y, width, height, radius, fill, stroke, lineWidth);
  context.fillStyle = color;
  context.font = `800 ${fontSize}px ${VIDEO_FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, x + width / 2, y + height / 2);
}
function drawSimulationVideoFrame(context, state, kinematics) {
  const offset = toStageOffset(state, kinematics.position);
  const creeping = kinematics.segment === 0 || kinematics.segment === 4;
  context.fillStyle = 'white';
  context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#183a5f';
  context.font = `800 21px ${VIDEO_FONT}`;
  context.fillText(state.label, STAGE_LEFT, 36);
  context.fillStyle = '#7b8b9d';
  context.font = `600 12px ${VIDEO_FONT}`;
  context.fillText('TransferTime-Z ／ 昇降ユニットを基準にしたハンドユニットの昇降動作', STAGE_LEFT, 56);
  const ttText = `動作時間 TT：${format(state.result.tt)} 秒`;
  context.font = `800 13px ${VIDEO_FONT}`;
  const ttWidth = context.measureText(ttText).width + 20;
  drawBox(context, STAGE_RIGHT - ttWidth, 20, ttWidth, 28, 4, '#e8f2fb', '#c3ddf3');
  context.fillStyle = '#166dbd';
  context.fillText(ttText, STAGE_RIGHT - ttWidth + 10, 39);

  const cells = [
    ['経過時間', `${format(state.elapsed)} s`],
    ['移動位置', `${format(kinematics.position)} mm`],
    ['速度', `${format(kinematics.velocity)} mm/s`],
    ['加速度', `${format(kinematics.acceleration)} mm/s²`]
  ];
  const cellWidth = (STAGE_RIGHT - STAGE_LEFT - 30) / 4;
  cells.forEach(([name, value], index) => {
    const x = STAGE_LEFT + index * (cellWidth + 10);
    drawBox(context, x, 70, cellWidth, 52, 4, '#f7f9fb', '#e2e8ef');
    context.fillStyle = '#7b8b9d';
    context.font = `600 11px ${VIDEO_FONT}`;
    context.fillText(name, x + 11, 89);
    context.fillStyle = '#183a5f';
    context.font = `800 16px ${VIDEO_FONT}`;
    context.fillText(value, x + 11, 111);
  });

  const stageWidth = STAGE_RIGHT - STAGE_LEFT;
  context.save();
  roundRectPath(context, STAGE_LEFT, VIDEO_HEADER, stageWidth, 560, 6);
  context.clip();
  const gradient = context.createLinearGradient(STAGE_LEFT, 0, STAGE_RIGHT, 0);
  gradient.addColorStop(0, '#f7f9fb');
  gradient.addColorStop(1, '#edf3f8');
  context.fillStyle = gradient;
  context.fillRect(STAGE_LEFT, VIDEO_HEADER, stageWidth, 560);

  [0, 4].forEach((index) => {
    const segment = state.scale.segments[index];
    if (!segment || segment.end - segment.start <= 0) return;
    const edges = [toStageOffset(state, segment.start), toStageOffset(state, segment.end)];
    const top = VIDEO_HEADER + HAND_CENTER_TOP + Math.min(...edges);
    const height = Math.max(Math.abs(edges[1] - edges[0]), 3);
    const active = kinematics.segment === index;
    drawHatch(context, STAGE_LEFT, top, stageWidth, height, active ? 'rgba(217,131,22,.3)' : 'rgba(217,131,22,.13)');
    context.strokeStyle = active ? '#c8760d' : '#dda45f';
    context.lineWidth = 1;
    context.setLineDash([5, 4]);
    context.beginPath();
    context.moveTo(STAGE_LEFT, top); context.lineTo(STAGE_RIGHT, top);
    context.moveTo(STAGE_LEFT, top + height); context.lineTo(STAGE_RIGHT, top + height);
    context.stroke();
    context.setLineDash([]);
    const zoneLabel = `${segmentNames[index]}（T${index + 1}）${format(segment.end - segment.start, 1)} mm`;
    context.font = `800 11px ${VIDEO_FONT}`;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    drawBox(context, STAGE_LEFT + 8, top + height / 2 - 9, context.measureText(zoneLabel).width + 10, 18, 3, 'rgba(255,255,255,.8)');
    context.fillStyle = '#9c5c0b';
    context.fillText(zoneLabel, STAGE_LEFT + 13, top + height / 2);
  });

  context.fillStyle = '#8da0b4';
  context.fillRect(STAGE_CENTER - 4, VIDEO_HEADER + 66, 8, 440);
  drawLabelledBox(context, STAGE_CENTER - 75, VIDEO_HEADER + 31, 150, 70, 5, '#405b78', '#2b4057', 4, '昇降ユニット', 'white', 13);

  const cargoTop = VIDEO_HEADER + 510 + (state.carriesLoad ? offset - TRACK_LENGTH : 0);
  drawBox(context, STAGE_CENTER - 65, cargoTop, 130, 42, 3, '#e8bb6b', '#a96d1c', 3);
  drawHatch(context, STAGE_CENTER - 65, cargoTop, 130, 42, '#dca850', 20, 10);
  drawBox(context, STAGE_CENTER - 65, cargoTop, 130, 42, 3, null, '#a96d1c', 3);
  context.fillStyle = '#4f330f';
  context.font = `800 14px ${VIDEO_FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('荷物', STAGE_CENTER, cargoTop + 21);

  drawLabelledBox(context, STAGE_CENTER - 46, VIDEO_HEADER + 103 + offset, 92, 55, 5, creeping ? '#ffe3b4' : '#ffc36b', creeping ? '#b8650a' : '#d98316', 3, 'ハンドユニット', '#713c05', 12);

  context.strokeStyle = '#b8c6d5';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(STAGE_RIGHT - 45, VIDEO_HEADER + 63);
  context.lineTo(STAGE_RIGHT - 45, VIDEO_HEADER + 503);
  context.stroke();
  context.fillStyle = '#718196';
  context.font = `700 11px ${VIDEO_FONT}`;
  context.textAlign = 'center';
  context.fillText('上端', STAGE_RIGHT - 45, VIDEO_HEADER + 49);
  context.fillText('下端', STAGE_RIGHT - 45, VIDEO_HEADER + 517);

  const phaseText = `区間 T${kinematics.segment + 1}：${segmentNames[kinematics.segment]}`;
  const rateText = playbackRateLabel(state.scale.segments[kinematics.segment]?.rate ?? 1);
  context.font = `800 12px ${VIDEO_FONT}`;
  const phaseWidth = context.measureText(phaseText).width;
  context.font = `700 11px ${VIDEO_FONT}`;
  const badgeWidth = phaseWidth + context.measureText(rateText).width + 32;
  drawBox(context, STAGE_LEFT + 13, VIDEO_HEADER + 11, badgeWidth, 28, 4, creeping ? '#fff2e0' : 'rgba(255,255,255,.92)', creeping ? '#e3ac6c' : '#e2e8ef');
  context.textAlign = 'left';
  context.fillStyle = creeping ? '#8a4b06' : '#183a5f';
  context.font = `800 12px ${VIDEO_FONT}`;
  context.fillText(phaseText, STAGE_LEFT + 24, VIDEO_HEADER + 25);
  context.fillStyle = creeping ? '#b07231' : '#7b8b9d';
  context.font = `700 11px ${VIDEO_FONT}`;
  context.fillText(rateText, STAGE_LEFT + 24 + phaseWidth + 9, VIDEO_HEADER + 25);
  context.restore();
  drawBox(context, STAGE_LEFT, VIDEO_HEADER, stageWidth, 560, 6, null, '#e2e8ef');
}
function videoSupport() {
  const canvas = document.createElement('canvas');
  if (typeof window.MediaRecorder !== 'function' || typeof canvas.captureStream !== 'function') return null;
  // H.264 MP4 first where it is really available (easiest to paste into reports),
  // otherwise WebM. Bare 'video/mp4' is not trusted: builds without proprietary
  // codecs report it as supported and then fail to produce a usable file.
  return ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}
const VIDEO_MIME_TYPE = videoSupport();
function stopRecording(discard = false) {
  if (!recorderState) return;
  const { recorder, frame } = recorderState;
  recorderState.discard = recorderState.discard || discard;
  if (frame) cancelAnimationFrame(frame);
  recorderState.frame = null;
  if (recorder.state !== 'inactive') recorder.stop();
}
function startRecording() {
  const mimeType = VIDEO_MIME_TYPE;
  const state = simulationState;
  if (!state || recorderState || !mimeType) return;
  if (state.frame) cancelAnimationFrame(state.frame);
  state.paused = true;
  state.started = false;
  state.finished = false;
  state.elapsed = 0;
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  // Opaque context: a VP9 alpha plane is redundant here and trips up some players.
  const context = canvas.getContext('2d', { alpha: false });
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
  const chunks = [];
  recorderState = { recorder, chunks, frame: null, discard: false };
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    const discarded = recorderState.discard;
    recorderState = null;
    setRecordingUi(false);
    if (discarded || !chunks.length) {
      setText('simulationStatus', '動画の書き出しを中止しました。');
      return;
    }
    const blob = new Blob(chunks, { type: mimeType });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    const stamp = new Date().toLocaleString('sv-SE').replace(/[-: ]/g, '').slice(2, 12);
    anchor.download = `TransferTime-Z_${VIDEO_FILE_NAMES[state.key] ?? 'motion'}_${stamp}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 2000);
    setText('simulationStatus', `動画を保存しました（${anchor.download}／${format(blob.size / 1048576, 1)} MB）。`);
  };
  setRecordingUi(true);
  recorder.start(100);
  let lastTime = performance.now();
  let tail = 0;
  const step = (now) => {
    if (!recorderState) return;
    const rate = state.scale.segments[getKinematics(state.values, state.result, state.elapsed).segment]?.rate ?? 1;
    state.elapsed = Math.min(state.elapsed + rate * (now - lastTime) / 1000, state.result.tt);
    if (state.elapsed >= state.result.tt) tail += now - lastTime;
    lastTime = now;
    const current = getKinematics(state.values, state.result, state.elapsed);
    renderSimulationFrame(state, current);
    drawSimulationVideoFrame(context, state, current);
    setText('simulationStatus', `録画中… ${format(state.elapsed)} / ${format(state.result.tt)} 秒`);
    if (tail >= 700) {
      state.finished = true;
      stopRecording();
      return;
    }
    recorderState.frame = requestAnimationFrame(step);
  };
  recorderState.frame = requestAnimationFrame(step);
}
function setRecordingUi(active) {
  document.getElementById('simulationRecord').textContent = active ? '録画を中止' : '動画を保存';
  document.getElementById('simulationPause').disabled = active;
  document.getElementById('creepEmphasis').disabled = active;
  document.getElementById('simulationPauseCriterion').disabled = active;
  document.getElementById('simulationPauseTarget').disabled = active || document.getElementById('simulationPauseCriterion').value === 'none';
  document.querySelectorAll('[data-simulation]').forEach((button) => { button.disabled = active; });
  allInputs.forEach((input) => { input.disabled = active; });
  document.getElementById('resetButton').disabled = active;
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
  const maxSpeedRaw = Math.max(...series.map(({ result }) => result.peakSpeed), 1);
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
    const points = [[0, values.v1], [t1, values.v1], [t1 + t2, result.peakSpeed], [t1 + t2 + t3, result.peakSpeed], [t1 + t2 + t3 + t4, values.v3], [result.tt, values.v3]];
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
  const pickupSpecification = Number(document.getElementById('pickup-spec').value);
  const unloadSpecification = Number(document.getElementById('unload-spec').value);
  const warning = document.getElementById('warning');
  const directions = [down, up, unloadDown, unloadUp];
  const values = [...directions.flatMap(Object.values), tg, servo, unloadTg, unloadServo, pickupSpecification, unloadSpecification];
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
  if ([downResult, upResult, unloadDownResult, unloadUpResult].some((result) => !result.valid)) {
    warning.textContent = '昇降ストロークが不足しています。上下端クリープ距離の合計がストロークを超えないようにしてください。';
    warning.hidden = false;
    renderEmpty();
    return;
  }
  warning.hidden = true;
  cancelSimulation();
  setSimulationTelemetry();
  document.querySelectorAll('[data-simulation]').forEach((button) => {
    button.classList.remove('active');
    button.setAttribute('aria-pressed', 'false');
  });
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
  setText('pickupSpecificationDisplay', `仕様値 ${format(pickupSpecification, 1)}秒以下`);
  setText('unloadSpecificationDisplay', `仕様値 ${format(unloadSpecification, 1)}秒以下`);
  setJudgement('pickupJudgement', total, pickupSpecification);
  setJudgement('unloadJudgement', unloadTotal, unloadSpecification);
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
    document.querySelectorAll('[data-simulation]').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    cancelSimulation();
    const isUp = direction === 'up' || direction === 'unloadUp';
    const carriesLoad = direction === 'up' || direction === 'unloadDown';
    const handUnit = document.getElementById('handUnit');
    const cargo = document.getElementById('simulationCargo');
    const label = button.textContent;
    setText('simulationTime', `動作時間 TT：${format(result.tt)} 秒`);
    setText('simulationStatus', `${label}を選択しました。「スタート」で再生します。`);
    setSimulationTelemetry();
    const startOffset = isUp ? TRACK_LENGTH : 0;
    handUnit.style.transform = `translate(-50%, ${startOffset}px)`;
    cargo.style.transform = `translate(-50%, ${carriesLoad ? startOffset - TRACK_LENGTH : 0}px)`;
    const toggleButton = document.getElementById('simulationPause');
    toggleButton.disabled = false;
    toggleButton.textContent = 'スタート';
    simulationState = { elapsed: 0, lastTime: 0, paused: true, started: false, finished: false, autoPaused: false, pauseCriterion: 'none', targetValue: null, maxPosition: values.sh, maxTime: result.tt, maxVelocity: result.peakSpeed, frame: null, handUnit, cargo, carriesLoad, startOffset, values, result, isUp, label, key: direction, scale: buildPositionScale(values, result, creepEmphasis.checked) };
    const recordButton = document.getElementById('simulationRecord');
    recordButton.disabled = !VIDEO_MIME_TYPE;
    recordButton.title = VIDEO_MIME_TYPE ? `選択中の動作を${VIDEO_MIME_TYPE.includes('mp4') ? 'MP4' : 'WebM'}動画として保存します。` : 'このブラウザは動画の書き出しに対応していません。Chrome または Edge の最新版をお使いください。';
    renderCreepZones(simulationState);
    updateAutoPauseControl();
    const renderFrame = (now) => {
      if (!simulationState || simulationState.paused) return;
      // The playback rate slows down inside magnified sections, so the elapsed
      // time shown stays the real one while the diagram keeps its true tempo.
      const rate = simulationState.scale.segments[getKinematics(values, result, simulationState.elapsed).segment]?.rate ?? 1;
      simulationState.elapsed = Math.min(simulationState.elapsed + rate * (now - simulationState.lastTime) / 1000, result.tt);
      simulationState.lastTime = now;
      const current = getKinematics(values, result, simulationState.elapsed);
      // Convert the calculated travel distance—not elapsed-time progress—to the
      // diagram offset. This keeps each creep section visibly slow and makes the
      // acceleration, constant-speed and deceleration sections match the inputs.
      renderSimulationFrame(simulationState, current);
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
        handUnit.classList.remove('creeping');
        document.querySelectorAll('.creep-zone').forEach((zone) => zone.classList.remove('active'));
        setPhaseBadge('動作完了');
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
    simulationState.cargo.style.transform = `translate(-50%, ${simulationState.carriesLoad ? simulationState.startOffset - TRACK_LENGTH : 0}px)`;
    simulationState.handUnit.classList.remove('creeping');
    document.querySelectorAll('.creep-zone').forEach((zone) => zone.classList.remove('active'));
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
document.getElementById('simulationRecord').addEventListener('click', () => {
  if (recorderState) stopRecording(true);
  else startRecording();
});
document.getElementById('simulationPauseCriterion').addEventListener('change', updateAutoPauseControl);
creepEmphasis.addEventListener('change', () => {
  if (!simulationState) return;
  simulationState.scale = buildPositionScale(simulationState.values, simulationState.result, creepEmphasis.checked);
  renderCreepZones(simulationState);
  renderSimulationFrame(simulationState, getKinematics(simulationState.values, simulationState.result, simulationState.elapsed));
});
document.getElementById('resetButton').addEventListener('click', () => {
  motionFields.forEach((field) => {
    ['down', 'up', 'unloadDown', 'unloadUp'].forEach((direction) => { document.getElementById(`${direction}-${field.key}`).value = field[direction]; });
  });
  Object.entries(extras).forEach(([id, value]) => { document.getElementById(id).value = value; });
  document.getElementById('shared-sh').value = sharedDefaults.sh;
  calculate();
  document.querySelector('[data-simulation="down"]').click();
});
calculate();
document.querySelector('[data-simulation="down"]').click();
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(calculate, 120);
});
