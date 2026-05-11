import mqtt from "mqtt";
import { animate, stagger } from "animejs";
import "./styles.css";

const state = {
  client: null,
  clientId: "",
  connected: false,
  boxes: [],
  boxEditingId: "",
  root: "medicold",
  selectedFridges: [],
  retainedCount: 0,
  liveCount: 0,
  fridges: new Map(),
  alerts: new Map(),
  inventory: new Map(),
  events: [],
  sensorLogs: [],
  coreStatus: "OFFLINE",
};

const ambientMotion = {
  phase: 0,
};

let settingsAnimation = null;

const elements = {
  form: document.querySelector("#connection-form"),
  settingsButton: document.querySelector("#settings-button"),
  closeSettingsButton: document.querySelector("#close-settings-button"),
  settingsDrawer: document.querySelector("#settings-drawer"),
  settingsBackdrop: document.querySelector("#settings-backdrop"),
  brokerUrl: document.querySelector("#broker-url"),
  topicRoot: document.querySelector("#topic-root"),
  fridgeFilter: document.querySelector("#fridge-filter"),
  connectButton: document.querySelector("#connect-button"),
  disconnectButton: document.querySelector("#disconnect-button"),
  connectionStatus: document.querySelector("#connection-status"),
  retainedCount: document.querySelector("#retained-count"),
  liveCount: document.querySelector("#live-count"),
  sceneTitle: document.querySelector("#scene-title"),
  sceneSubtitle: document.querySelector("#scene-subtitle"),
  coldStage: document.querySelector("#cold-stage"),
  scannerBeam: document.querySelector("#scanner-beam"),
  tempGlow: document.querySelector("#temp-glow"),
  storageStatusModule: document.querySelector("#storage-status-module"),
  storageStatusLabel: document.querySelector("#storage-status-label"),
  fridgeCount: document.querySelector("#fridge-count"),
  avgTemp: document.querySelector("#avg-temp"),
  openAlertCount: document.querySelector("#open-alert-count"),
  coreStatus: document.querySelector("#core-status"),
  fridgeGrid: document.querySelector("#fridge-grid"),
  alertList: document.querySelector("#alert-list"),
  inventoryList: document.querySelector("#inventory-list"),
  eventLog: document.querySelector("#event-log"),
  sensorLog: document.querySelector("#sensor-log"),
  boxList: document.querySelector("#box-list"),
  boxForm: document.querySelector("#box-form"),
  addBoxButton: document.querySelector("#add-box-button"),
  cancelBoxButton: document.querySelector("#cancel-box-button"),
  boxIdInput: document.querySelector("#box-id-input"),
  boxLocationInput: document.querySelector("#box-location-input"),
  boxContentInput: document.querySelector("#box-content-input"),
  boxTempInput: document.querySelector("#box-temp-input"),
  clearEventsButton: document.querySelector("#clear-events-button"),
};

const defaultBrokerUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname || "localhost"}:9001`;
elements.brokerUrl.value = defaultBrokerUrl;

function parseTopic(topicName) {
  const parts = topicName.split("/");
  if (parts[0] !== state.root) {
    return null;
  }

  if (parts[1] === "system") {
    return {
      scope: "system",
      domain: parts[2],
      kind: parts[3],
      action: parts[4],
    };
  }

  return {
    scope: "fridge",
    fridgeId: parts[1],
    domain: parts[2],
    kind: parts[3],
    action: parts[4],
  };
}

function parsePayload(payload) {
  try {
    if (typeof payload === "string") {
      return JSON.parse(payload);
    }

    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
}

function topic(path) {
  return `${state.root}/${path}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function matchesFilter(fridgeId) {
  return state.selectedFridges.length === 0 || state.selectedFridges.includes(fridgeId);
}

function statusFromLevel(level) {
  if (!level) {
    return "STATUS_NORMAL";
  }

  return level.startsWith("STATUS_") ? level : `STATUS_${level}`;
}

function severityClass(status) {
  const normalized = statusFromLevel(status);

  if (normalized.includes("EMERGENCY")) {
    return "emergency";
  }

  if (normalized.includes("CRITICAL")) {
    return "critical";
  }

  if (normalized.includes("WARNING")) {
    return "warning";
  }

  return "normal";
}

function updateConnectionStatus(label, connected) {
  state.connected = connected;
  elements.connectionStatus.classList.toggle("connected", connected);
  elements.connectionStatus.classList.toggle("disconnected", !connected);
  elements.connectionStatus.lastChild.textContent = ` ${label}`;
  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;
}

function ensureFridge(fridgeId) {
  if (!state.fridges.has(fridgeId)) {
    state.fridges.set(fridgeId, {
      fridge_id: fridgeId,
      status: "STATUS_NORMAL",
      telemetry: null,
      last_seen: "",
    });
  }

  return state.fridges.get(fridgeId);
}

function pushEvent(event) {
  state.events.unshift({
    time: new Date().toLocaleTimeString(),
    ...event,
  });
  state.events = state.events.slice(0, 18);
}

function pushSensorLog(reading, source) {
  state.sensorLogs.unshift({
    id: `${reading.fridge_id}-${reading.timestamp}-${source}`,
    source,
    time: new Date(reading.timestamp || Date.now()).toLocaleTimeString(),
    fridge_id: reading.fridge_id,
    temperature_celsius: reading.temperature_celsius,
    humidity_percent: reading.humidity_percent,
    pressure_hpa: reading.pressure_hpa,
    power_stable: reading.power_stable,
    door_open: reading.door_open,
  });
  state.sensorLogs = state.sensorLogs.slice(0, 18);
}

function renderSummary() {
  const fridges = Array.from(state.fridges.values()).filter((fridge) => matchesFilter(fridge.fridge_id));
  const temps = fridges
    .map((fridge) => Number(fridge.telemetry?.temperature_celsius))
    .filter(Number.isFinite);
  const openAlerts = Array.from(state.alerts.values()).filter((alert) => !alert.resolved && matchesFilter(alert.fridge_id));
  const avg = temps.length ? temps.reduce((sum, temp) => sum + temp, 0) / temps.length : null;
  const hottest = fridges
    .filter((fridge) => Number.isFinite(Number(fridge.telemetry?.temperature_celsius)))
    .sort((a, b) => Number(b.telemetry.temperature_celsius) - Number(a.telemetry.temperature_celsius))[0];

  elements.fridgeCount.textContent = String(fridges.length);
  elements.avgTemp.textContent = avg === null ? "--" : `${avg.toFixed(1)}C`;
  elements.openAlertCount.textContent = String(openAlerts.length);
  elements.coreStatus.textContent = state.coreStatus;
  elements.retainedCount.textContent = String(state.retainedCount);
  elements.liveCount.textContent = String(state.liveCount);

  if (hottest) {
    const storageStatus = hottest.status.replace("STATUS_", "");
    elements.sceneTitle.textContent = `${hottest.fridge_id} at ${Number(hottest.telemetry.temperature_celsius).toFixed(1)}C`;
    elements.sceneSubtitle.textContent = `${storageStatus} | ${hottest.telemetry.medical_content || "MEDICAL_CONTENT"}`;
    elements.tempGlow.className = `temp-glow ${severityClass(hottest.status)}`;
    elements.storageStatusModule.className = `status-module ${severityClass(hottest.status)}`;
    elements.storageStatusLabel.textContent = storageStatus;
  }
}

function renderFridges() {
  const fridges = Array.from(state.fridges.values()).filter((fridge) => matchesFilter(fridge.fridge_id));
  elements.fridgeGrid.classList.toggle("empty-state", fridges.length === 0);

  if (fridges.length === 0) {
    elements.fridgeGrid.textContent = "No fridge data";
    return;
  }

  elements.fridgeGrid.innerHTML = fridges
    .map((fridge) => {
      const telemetry = fridge.telemetry || {};
      const className = severityClass(fridge.status);
      return `
        <article class="fridge-card ${className}">
          <div class="fridge-card-header">
            <div>
              <span class="mini-label">Fridge</span>
              <strong>${escapeHtml(fridge.fridge_id)}</strong>
            </div>
            <span class="status-chip">${escapeHtml(fridge.status.replace("STATUS_", ""))}</span>
          </div>
          <div class="sensor-readout">
            <div><span>Temp</span><strong>${formatNumber(telemetry.temperature_celsius, "C")}</strong></div>
            <div><span>Humidity</span><strong>${formatNumber(telemetry.humidity_percent, "%")}</strong></div>
            <div><span>Pressure</span><strong>${formatNumber(telemetry.pressure_hpa, " hPa")}</strong></div>
          </div>
          <div class="thermal-line">
            ${Array.from({ length: 14 }, (_, index) => {
              const temp = Number(telemetry.temperature_celsius) || 4;
              const height = Math.max(18, Math.min(92, 26 + temp * 4 + Math.sin(index + temp) * 18));
              return `<span style="height:${height}%"></span>`;
            }).join("")}
          </div>
          <div class="fridge-meta">
            <span>${escapeHtml(telemetry.medical_content || "No content")}</span>
            <span>${telemetry.power_stable === false ? "Power unstable" : "Power stable"}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAlerts() {
  const alerts = Array.from(state.alerts.values())
    .filter((alert) => matchesFilter(alert.fridge_id))
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, 12);

  elements.alertList.classList.toggle("empty-state", alerts.length === 0);

  if (alerts.length === 0) {
    elements.alertList.textContent = "No alerts";
    return;
  }

  elements.alertList.innerHTML = alerts
    .map((alert) => `
      <article class="alert-item ${severityClass(alert.level)} ${alert.resolved ? "resolved" : ""}">
        <div>
          <span class="mini-label">${escapeHtml(alert.fridge_id)} | ${escapeHtml(alert.level)}</span>
          <strong>${escapeHtml(alert.type.replaceAll("_", " "))}</strong>
          <p>${escapeHtml(alert.description)}</p>
        </div>
        ${alert.resolved ? "<span class=\"resolved-chip\">Resolved</span>" : `<button class="small resolve-button" data-alert-id="${escapeHtml(alert.alert_id)}">Resolve</button>`}
      </article>
    `)
    .join("");
}

function renderInventory() {
  const inventories = Array.from(state.inventory.values()).filter((item) => matchesFilter(item.fridge_id));
  elements.inventoryList.classList.toggle("empty-state", inventories.length === 0);

  if (inventories.length === 0) {
    elements.inventoryList.textContent = "No inventory snapshot";
    return;
  }

  elements.inventoryList.innerHTML = inventories
    .map((inventory) => `
      <article class="inventory-item">
        <div>
          <span class="mini-label">${escapeHtml(inventory.fridge_id)}</span>
          <strong>${Number(inventory.total_batches || 0)} batches</strong>
        </div>
        <ul>
          ${(inventory.batches || []).slice(0, 5).map((batch) => `
            <li>
              <span>${escapeHtml(batch.batch_id)}</span>
              <strong>${Number(batch.quantity || 0)} ${escapeHtml(batch.content_type)}</strong>
            </li>
          `).join("")}
        </ul>
      </article>
    `)
    .join("");
}

function renderBoxes() {
  const boxes = state.boxes.filter((box) => matchesFilter(box.fridge_id));
  elements.boxList.classList.toggle("empty-state", boxes.length === 0);

  if (boxes.length === 0) {
    elements.boxList.textContent = "No medicold boxes";
    return;
  }

  elements.boxList.innerHTML = boxes
    .map((box) => {
      const fridge = state.fridges.get(box.fridge_id);
      const status = fridge?.status || "STATUS_NORMAL";
      return `
        <article class="box-item ${severityClass(status)}">
          <div>
            <span class="mini-label">${escapeHtml(box.medical_content)}</span>
            <strong>${escapeHtml(box.fridge_id)}</strong>
            <p>${escapeHtml(box.location)}</p>
          </div>
          <div class="box-actions">
            <span class="status-chip">${escapeHtml(status.replace("STATUS_", ""))}</span>
            <button class="small secondary box-edit-button" data-box-id="${escapeHtml(box.fridge_id)}" type="button">Edit</button>
            <button class="small secondary box-delete-button" data-box-id="${escapeHtml(box.fridge_id)}" type="button">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderEvents() {
  elements.eventLog.classList.toggle("empty-state", state.events.length === 0);

  if (state.events.length === 0) {
    elements.eventLog.textContent = "No messages received";
    return;
  }

  elements.eventLog.innerHTML = state.events
    .map((event) => `
      <div class="event-row">
        <span>${escapeHtml(event.time)}</span>
        <strong>${escapeHtml(event.type)}</strong>
        <small>${escapeHtml(event.topic)}</small>
      </div>
    `)
    .join("");
}

function renderSensorLogs() {
  elements.sensorLog.classList.toggle("empty-state", state.sensorLogs.length === 0);

  if (state.sensorLogs.length === 0) {
    elements.sensorLog.textContent = "No sensor logs";
    return;
  }

  elements.sensorLog.innerHTML = state.sensorLogs
    .map((log) => `
      <article class="sensor-log-row ${log.power_stable === false || log.door_open ? "attention" : ""}">
        <div>
          <span class="mini-label">${escapeHtml(log.source)}</span>
          <strong>${escapeHtml(log.fridge_id)}</strong>
        </div>
        <div class="sensor-log-values">
          <span>${formatNumber(log.temperature_celsius, "C")}</span>
          <span>${formatNumber(log.humidity_percent, "%")}</span>
          <span>${formatNumber(log.pressure_hpa, " hPa")}</span>
        </div>
        <small>${escapeHtml(log.time)}</small>
      </article>
    `)
    .join("");
}

function render() {
  renderSummary();
  renderFridges();
  renderAlerts();
  renderInventory();
  renderBoxes();
  renderEvents();
  renderSensorLogs();
}

function formatNumber(value, suffix) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }

  return `${number.toFixed(suffix === " hPa" ? 0 : 1)}${suffix}`;
}

function hasTarget(selector) {
  return document.querySelector(selector) !== null;
}

function animateIncoming(topicName) {
  if (hasTarget(".fridge-card")) {
    animate(".fridge-card", {
      translateY: [8, 0],
      opacity: [0.72, 1],
      delay: stagger(24),
      duration: 420,
      ease: "outCubic",
    });
  }

  if (topicName.includes("/alerts/")) {
    animate(".cold-chamber", {
      rotateZ: ["-2deg", "2deg", "0deg"],
      scale: [1, 1.06, 1],
      duration: 920,
      ease: "outElastic(1, .65)",
    });

    if (hasTarget(".alert-item:first-child")) {
      animate(".alert-item:first-child", {
        translateX: [-12, 0],
        scale: [0.96, 1],
        duration: 520,
        ease: "outBack(1.8)",
      });
    }
  } else {
    animate(".cold-chamber", {
      scale: [1, 1.025, 1],
      duration: 520,
      ease: "outCubic",
    });
  }
}

function startAmbientAnimation() {
  const orbitConfigs = [
    { x: 66, z: 20, speed: 1 },
    { x: 66, z: -44, speed: -1 },
    { x: 66, z: 78, speed: 2 },
  ];
  const packets = Array.from(document.querySelectorAll(".data-packet"));
  const orbits = Array.from(document.querySelectorAll(".cold-orbit"));
  const fullTurn = Math.PI * 2;

  animate(ambientMotion, {
    phase: fullTurn,
    duration: 9000,
    loop: true,
    ease: "linear",
    onUpdate: () => {
      const phase = ambientMotion.phase;
      const floatY = Math.sin(phase) * 7;
      const rotateX = 3 + Math.sin(phase * 0.8) * 6;
      const rotateY = Math.cos(phase) * 15;

      elements.coldStage.style.transform = `translateY(${floatY}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

      orbits.forEach((orbit, index) => {
        const config = orbitConfigs[index];
        const z = config.z + (phase * 180 / Math.PI * config.speed);
        orbit.style.transform = `rotateX(${config.x}deg) rotateZ(${z}deg)`;
      });

      packets.forEach((packet, index) => {
        const angle = phase + index * (fullTurn / packets.length);
        const x = Math.cos(angle) * 150;
        const y = Math.sin(angle) * 54;
        const scale = 0.68 + (Math.sin(angle) + 1) * 0.28;
        const opacity = 0.24 + (Math.cos(angle) + 1) * 0.34;
        packet.style.transform = `translate3d(${x}px, ${y}px, ${index * 14}px) scale(${scale})`;
        packet.style.opacity = String(opacity);
      });

      const scannerProgress = phase / fullTurn;
      const scannerOpacity = Math.sin(scannerProgress * Math.PI);
      elements.scannerBeam.style.transform = `translateY(${scannerProgress * 230 - 25}%)`;
      elements.scannerBeam.style.opacity = String(Math.max(0, scannerOpacity * 0.72));
    },
  });

  animate(".sensor-column span", {
    scaleY: [0.35, 1, 0.45],
    opacity: [0.35, 1, 0.55],
    delay: stagger(180),
    duration: 1400,
    loop: true,
    alternate: true,
    ease: "inOutSine",
  });

  animate(".frost-field span", {
    translateY: ["-2.6rem", "2.6rem"],
    translateX: (_, index) => [`${index % 2 === 0 ? "-" : ""}${18 + index * 8}px`, `${index % 2 === 0 ? "" : "-"}${24 + index * 6}px`],
    rotate: ["0turn", "1turn"],
    opacity: [0.18, 0.75, 0.18],
    delay: stagger(190),
    duration: 3600,
    loop: true,
    alternate: true,
    ease: "inOutSine",
  });

  animate(".summary-card", {
    translateY: [16, 0],
    opacity: [0, 1],
    delay: stagger(70),
    duration: 620,
    ease: "outCubic",
  });
}

function handleTelemetry(parsed, envelope, source) {
  const reading = envelope.payload || envelope;
  const fridge = ensureFridge(parsed.fridgeId || reading.fridge_id);
  fridge.telemetry = reading;
  fridge.status = fridge.status || "STATUS_NORMAL";
  fridge.last_seen = new Date().toISOString();
  pushSensorLog(reading, source);
}

function handleStatus(parsed, envelope) {
  const payload = envelope.payload || envelope;
  const fridge = ensureFridge(parsed.fridgeId);
  fridge.status = payload.status || fridge.status;
  fridge.last_seen = payload.last_seen || fridge.last_seen;
}

function handleAlert(parsed, envelope) {
  const payload = envelope.payload || envelope;
  const alert = payload.alert || payload;

  if (payload.has_alert === false) {
    return;
  }

  if (alert?.alert_id) {
    state.alerts.set(alert.alert_id, alert);
    const fridge = ensureFridge(alert.fridge_id || parsed.fridgeId);
    fridge.status = statusFromLevel(alert.level);
  }
}

function handleInventory(parsed, envelope) {
  const payload = envelope.payload || envelope;
  state.inventory.set(payload.fridge_id || parsed.fridgeId, payload);
}

function upsertBoxSnapshot(box) {
  const existingIndex = state.boxes.findIndex((item) => item.fridge_id === box.fridge_id);
  if (existingIndex >= 0) {
    state.boxes[existingIndex] = box;
  } else {
    state.boxes.push(box);
  }
}

function handleBoxSnapshot(parsed, envelope) {
  const payload = envelope.payload || envelope;
  const fridgeId = payload.fridge_id || parsed.fridgeId;

  if (!fridgeId) {
    return;
  }

  if (payload.deleted) {
    state.boxes = state.boxes.filter((box) => box.fridge_id !== fridgeId);
    removeBoxData(fridgeId);
    return;
  }

  upsertBoxSnapshot({
    fridge_id: fridgeId,
    location: payload.location || "Medical Storage",
    medical_content: payload.medical_content || "OTHER",
    base_temperature: payload.base_temperature ?? 4.5,
  });
}

function handleSystem(envelope) {
  const payload = envelope.payload || envelope;
  if (payload.service === "medicold-core") {
    state.coreStatus = payload.status || "UNKNOWN";
    return;
  }

  if (Array.isArray(payload.boxes)) {
    state.boxes = payload.boxes;
  }
}

function handleMessage(topicName, payload, packet = {}) {
  const parsed = parseTopic(topicName);
  const envelope = parsePayload(payload);
  if (!parsed || !envelope) {
    return;
  }

  const source = packet.retain ? "retained" : "mqtt";

  if (packet.retain) {
    state.retainedCount += 1;
  } else {
    state.liveCount += 1;
  }

  if (parsed.scope === "system") {
    handleSystem(envelope);
  } else if (!matchesFilter(parsed.fridgeId)) {
    return;
  } else if (parsed.domain === "telemetry" && parsed.kind === "latest") {
    handleTelemetry(parsed, envelope, source);
  } else if (parsed.domain === "status") {
    handleStatus(parsed, envelope);
  } else if (parsed.domain === "alerts") {
    handleAlert(parsed, envelope);
  } else if (parsed.domain === "inventory" && parsed.kind === "snapshot") {
    handleInventory(parsed, envelope);
  } else if (parsed.domain === "box" && parsed.kind === "snapshot") {
    handleBoxSnapshot(parsed, envelope);
  }

  pushEvent({
    topic: topicName,
    type: packet.retain ? "retained" : envelope.type || source,
  });
  render();
  animateIncoming(topicName);
}

function subscribeDashboardTopics(client) {
  const subscriptions = [
    topic("+/telemetry/latest"),
    topic("+/status"),
    topic("+/alerts/latest"),
    topic("+/alerts/stream"),
    topic("+/inventory/snapshot"),
    topic("+/box/snapshot"),
    topic("system/boxes/snapshot"),
    topic("system/status"),
    topic(`replies/${state.clientId}`),
  ];

  subscriptions.forEach((subscription) => {
    client.subscribe(subscription, { qos: 1 });
  });
}

function connectDashboard(event) {
  event?.preventDefault();

  if (state.client) {
    state.client.end(true);
  }

  state.root = elements.topicRoot.value.trim() || "medicold";
  state.selectedFridges = elements.fridgeFilter.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  state.clientId = `web-dashboard-${crypto.randomUUID()}`;

  const client = mqtt.connect(elements.brokerUrl.value.trim(), {
    clientId: state.clientId,
    clean: true,
    keepalive: 30,
    reconnectPeriod: 1200,
  });

  state.client = client;
  updateConnectionStatus("Connecting", false);

  client.on("connect", () => {
    updateConnectionStatus("Connected", true);
    subscribeDashboardTopics(client);
    closeSettings();
  });

  client.on("reconnect", () => updateConnectionStatus("Reconnecting", false));
  client.on("close", () => updateConnectionStatus("Disconnected", false));
  client.on("error", () => updateConnectionStatus("Connection error", false));
  client.on("message", handleMessage);
}

function disconnectDashboard() {
  if (state.client) {
    state.client.end(true);
    state.client = null;
  }

  updateConnectionStatus("Disconnected", false);
}

function resolveAlert(alertId) {
  const alert = state.alerts.get(alertId);
  if (alert) {
    alert.resolved = true;
    alert.resolved_by = "Dashboard";
    alert.resolved_at = new Date().toISOString();
  }

  if (state.client && state.connected) {
    state.client.publish(
      topic("system/alerts/commands/resolve"),
      JSON.stringify({
        correlation_id: crypto.randomUUID(),
        reply_to: topic(`replies/${state.clientId}`),
        alert_id: alertId,
        resolved_by: "Web Dashboard",
        notes: "Resolved from dashboard",
      }),
      { qos: 1, retain: false },
    );
  }

  pushEvent({
    topic: topic("system/alerts/commands/resolve"),
    type: "resolve-command",
  });
  render();
}

function normalizeBoxId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replaceAll(" ", "-")
    .replaceAll("/", "-");
}

function normalizeContentType(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_")
    .replaceAll("/", "_");
}

function openBoxForm(box = null) {
  state.boxEditingId = box?.fridge_id || "";
  elements.boxIdInput.value = box?.fridge_id || `FRIDGE-${String.fromCharCode(68 + state.boxes.length)}`;
  elements.boxLocationInput.value = box?.location || "";
  elements.boxContentInput.value = box?.medical_content || "VACCINE";
  elements.boxTempInput.value = box?.base_temperature ?? "4.5";
  elements.boxForm.hidden = false;
  elements.addBoxButton.disabled = true;
  elements.boxIdInput.focus();
}

function closeBoxForm() {
  state.boxEditingId = "";
  elements.boxForm.hidden = true;
  elements.boxForm.reset();
  elements.addBoxButton.disabled = false;
}

function removeBoxData(boxId) {
  state.fridges.delete(boxId);
  state.inventory.delete(boxId);
  state.sensorLogs = state.sensorLogs.filter((log) => log.fridge_id !== boxId);

  Array.from(state.alerts.entries()).forEach(([alertId, alert]) => {
    if (alert.fridge_id === boxId) {
      state.alerts.delete(alertId);
    }
  });
}

function saveBox(event) {
  event.preventDefault();

  const fridgeId = normalizeBoxId(elements.boxIdInput.value);
  if (!fridgeId) {
    elements.boxIdInput.focus();
    return;
  }

  const baseTemperature = Number(elements.boxTempInput.value);
  const box = {
    fridge_id: fridgeId,
    location: elements.boxLocationInput.value.trim() || "Medical Storage",
    medical_content: normalizeContentType(elements.boxContentInput.value) || "OTHER",
    base_temperature: Number.isFinite(baseTemperature) ? baseTemperature : 4.5,
    base_humidity: 44 + state.boxes.length,
    base_pressure: 1001 + state.boxes.length,
  };

  const previousId = state.boxEditingId;

  if (!state.client || !state.connected) {
    pushEvent({
      topic: topic("system/boxes/commands/upsert"),
      type: "box-command-offline",
    });
    render();
    return;
  }

  if (previousId && previousId !== fridgeId) {
    removeBoxData(previousId);
  }

  state.client.publish(
    topic("system/boxes/commands/upsert"),
    JSON.stringify({
      correlation_id: crypto.randomUUID(),
      reply_to: topic(`replies/${state.clientId}`),
      box,
    }),
    { qos: 1, retain: false },
  );

  upsertBoxSnapshot(box);
  ensureFridge(fridgeId);
  pushEvent({
    topic: topic("system/boxes/commands/upsert"),
    type: previousId ? "box-updated" : "box-created",
  });
  closeBoxForm();
  render();
}

function deleteBox(boxId) {
  if (state.client && state.connected) {
    state.client.publish(
      topic("system/boxes/commands/delete"),
      JSON.stringify({
        correlation_id: crypto.randomUUID(),
        reply_to: topic(`replies/${state.clientId}`),
        fridge_id: boxId,
      }),
      { qos: 1, retain: false },
    );
  }

  state.boxes = state.boxes.filter((box) => box.fridge_id !== boxId);
  removeBoxData(boxId);
  pushEvent({
    topic: topic("system/boxes/commands/delete"),
    type: "box-deleted",
  });
  if (state.boxEditingId === boxId) {
    closeBoxForm();
  }
  render();
}

function openSettings() {
  if (settingsAnimation) {
    settingsAnimation.revert();
  }

  elements.settingsBackdrop.hidden = false;
  elements.settingsDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("settings-open");
  settingsAnimation = animate(elements.settingsDrawer, {
    translateX: ["110%", "0%"],
    opacity: [0.3, 1],
    duration: 360,
    ease: "outCubic",
    onComplete: () => {
      settingsAnimation = null;
      elements.settingsDrawer.style.transform = "";
      elements.settingsDrawer.style.opacity = "";
    },
  });
}

function closeSettings() {
  if (elements.settingsDrawer.getAttribute("aria-hidden") === "true") {
    return;
  }

  if (settingsAnimation) {
    settingsAnimation.revert();
  }

  document.body.classList.remove("settings-open");
  settingsAnimation = animate(elements.settingsDrawer, {
    translateX: ["0%", "110%"],
    opacity: [1, 0],
    duration: 260,
    ease: "inCubic",
    onComplete: () => {
      settingsAnimation = null;
      elements.settingsDrawer.setAttribute("aria-hidden", "true");
      elements.settingsBackdrop.hidden = true;
      elements.settingsDrawer.style.transform = "";
      elements.settingsDrawer.style.opacity = "";
    },
  });
}

elements.form.addEventListener("submit", connectDashboard);
elements.disconnectButton.addEventListener("click", disconnectDashboard);
elements.settingsButton.addEventListener("click", openSettings);
elements.closeSettingsButton.addEventListener("click", closeSettings);
elements.settingsBackdrop.addEventListener("click", closeSettings);
elements.clearEventsButton.addEventListener("click", () => {
  state.events = [];
  state.sensorLogs = [];
  renderEvents();
  renderSensorLogs();
});
elements.addBoxButton.addEventListener("click", () => openBoxForm());
elements.cancelBoxButton.addEventListener("click", closeBoxForm);
elements.boxForm.addEventListener("submit", saveBox);
elements.boxList.addEventListener("click", (event) => {
  const editButton = event.target.closest(".box-edit-button");
  const deleteButton = event.target.closest(".box-delete-button");

  if (editButton) {
    const box = state.boxes.find((item) => item.fridge_id === editButton.dataset.boxId);
    if (box) {
      openBoxForm(box);
    }
    return;
  }

  if (deleteButton) {
    deleteBox(deleteButton.dataset.boxId);
  }
});
elements.alertList.addEventListener("click", (event) => {
  const button = event.target.closest(".resolve-button");
  if (!button) {
    return;
  }

  resolveAlert(button.dataset.alertId);
});

startAmbientAnimation();
render();
connectDashboard();
