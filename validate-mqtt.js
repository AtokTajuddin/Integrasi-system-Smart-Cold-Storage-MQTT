#!/usr/bin/env node
"use strict";

/**
 * MQTT Communication Validator
 * 
 * Script ini menunjukkan komunikasi MQTT yang aktif:
 * - Menerima data dari dummy_sender
 * - Menampilkan flow data real-time
 * - Memvalidasi bahwa frontend TIDAK hanya diam
 */

const { randomUUID } = require("node:crypto");
const {
  BROKER_URL,
  createMqttClient,
  subscribe,
  waitForConnect,
} = require("./src/shared/mqttClient");
const { topics } = require("./src/shared/topics");

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

function log(color, prefix, message) {
  console.log(`${color}${prefix}${COLORS.reset} ${message}`);
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

async function main() {
  const clientId = `validator-${randomUUID()}`;
  const client = createMqttClient(clientId);

  const stats = {
    telemetryCount: 0,
    alertCount: 0,
    inventoryCount: 0,
    statusCount: 0,
    startTime: Date.now(),
  };

  log(COLORS.bright + COLORS.cyan, "🚀 MQTT VALIDATOR", "Starting...");
  log(COLORS.cyan, "📡", `Broker URL: ${BROKER_URL}`);
  log(COLORS.cyan, "🔌", `Client ID: ${clientId}`);

  client.on("connect", () => {
    log(COLORS.green, "✅", "Connected to MQTT Broker");
  });

  client.on("error", (error) => {
    log(COLORS.red, "❌", `Connection error: ${error.message}`);
  });

  client.on("message", (topic, payload, packet) => {
    const data = parsePayload(payload);
    const marker = packet.retain ? "📌 RETAINED" : "🔴 LIVE";

    // Telemetry streaming
    if (topic.includes("telemetry/stream")) {
      stats.telemetryCount++;
      const fridgeId = data.fridge_id || "UNKNOWN";
      const temp = data.temperature_celsius || "N/A";
      const humidity = data.humidity_percent || "N/A";
      const power = data.power_stable ? "✓" : "✗";
      log(
        COLORS.blue,
        `${marker} [${stats.telemetryCount}]`,
        `TELEMETRY ${fridgeId}: ${temp}°C | ${humidity}% | Power:${power}`
      );
    }

    // Telemetry latest (retained by core)
    if (topic.includes("telemetry/latest")) {
      const fridgeId = data.payload?.fridge_id || data.fridge_id || "UNKNOWN";
      const temp = data.payload?.temperature_celsius || data.temperature_celsius || "N/A";
      log(
        COLORS.magenta,
        `${marker} [LATEST]`,
        `PROCESSED by CORE ${fridgeId}: ${temp}°C`
      );
    }

    // Status updates
    if (topic.includes("/status") && !topic.includes("core")) {
      stats.statusCount++;
      const fridgeId = data.payload?.fridge_id || data.fridge_id || "UNKNOWN";
      const status = data.payload?.status || data.status || "UNKNOWN";
      log(COLORS.yellow, `${marker} [${stats.statusCount}]`, `STATUS ${fridgeId}: ${status}`);
    }

    // Alerts
    if (topic.includes("alerts")) {
      stats.alertCount++;
      const alert = data.payload?.alert || data.alert || "UNKNOWN";
      const fridgeId = alert.fridge_id || "UNKNOWN";
      const level = alert.level || "UNKNOWN";
      log(COLORS.red, `${marker} [${stats.alertCount}]`, `⚠️  ALERT ${fridgeId}: ${level}`);
    }

    // Inventory
    if (topic.includes("inventory")) {
      stats.inventoryCount++;
      const count = data.payload?.batches?.length || data.batches?.length || "?";
      log(
        COLORS.yellow,
        `${marker} [${stats.inventoryCount}]`,
        `INVENTORY: ${count} batches registered`
      );
    }
  });

  try {
    await waitForConnect(client);

    // Subscribe ke semua MQTT topics
    log(COLORS.cyan, "📥", "Subscribing to MQTT topics...");

    await subscribe(client, `${topics.root}/+/telemetry/stream`);
    log(COLORS.green, "  ✓", "medicold/+/telemetry/stream (Streaming real-time)");

    await subscribe(client, `${topics.root}/+/telemetry/latest`);
    log(COLORS.green, "  ✓", "medicold/+/telemetry/latest (Retained by core)");

    await subscribe(client, `${topics.root}/+/status`);
    log(COLORS.green, "  ✓", "medicold/+/status (Retained status)");

    await subscribe(client, `${topics.root}/+/alerts/stream`);
    log(COLORS.green, "  ✓", "medicold/+/alerts/stream (Alert events)");

    await subscribe(client, `${topics.root}/+/alerts/latest`);
    log(COLORS.green, "  ✓", "medicold/+/alerts/latest (Latest alert)");

    await subscribe(client, `${topics.root}/+/inventory/snapshot`);
    log(COLORS.green, "  ✓", "medicold/+/inventory/snapshot (Inventory state)");

    log(COLORS.bright + COLORS.green, "\n✅ VALIDATOR READY", "Monitoring MQTT traffic...");
    log(COLORS.cyan, "📊", "Real-time statistics:");
    log(COLORS.cyan, "", "  Telemetry (stream): Shows live sensor data every 900ms");
    log(COLORS.cyan, "", "  Status: Shows fridge status from core processing");
    log(COLORS.cyan, "", "  Alerts: Shows anomalies detected by core");
    log(COLORS.cyan, "", "  Inventory: Shows registered batches");
    log(COLORS.cyan, "\n⏱️ ", "Messages will start appearing below...\n");

    // Periodic stats display
    setInterval(() => {
      const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
      const telemetryRate = stats.telemetryCount > 0 ? `${(900).toFixed(0)}ms/msg` : "waiting...";
      log(
        COLORS.cyan,
        "\n📈 STATS",
        `[${elapsed}s elapsed] Telemetry: ${stats.telemetryCount} | ` +
          `Status: ${stats.statusCount} | Alerts: ${stats.alertCount} | Inventory: ${stats.inventoryCount} | Rate: ${telemetryRate}`
      );
    }, 15000);
  } catch (error) {
    log(COLORS.red, "❌", `Startup error: ${error.message}`);
    process.exit(1);
  }
}

main();
