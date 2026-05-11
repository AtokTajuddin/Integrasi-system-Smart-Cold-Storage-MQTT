"use strict";

const { randomUUID } = require("node:crypto");
const { parseJsonMessage } = require("../shared/json");
const { csvArg, numberArg, parseArgs } = require("../shared/cli");
const {
  BROKER_URL,
  createMqttClient,
  publishJson,
  subscribe,
  waitForConnect,
} = require("../shared/mqttClient");
const { isAtLeast } = require("../server/logic/severity");
const { topics } = require("../shared/topics");

function waitForReply(client, replyTopic, correlationId, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off("message", handler);
      reject(new Error("Timeout menunggu response resolve alert"));
    }, timeoutMs);

    function handler(topic, payload) {
      if (topic !== replyTopic) {
        return;
      }

      const message = parseJsonMessage(topic, payload);
      if (message.correlation_id !== correlationId) {
        return;
      }

      clearTimeout(timer);
      client.off("message", handler);
      resolve(message);
    }

    client.on("message", handler);
  });
}

function shouldShow(envelope, selectedFridges, minLevel) {
  const payload = envelope.payload || envelope;
  const fridgeId = payload.fridge_id || payload.alert?.fridge_id;

  if (selectedFridges.length > 0 && fridgeId && !selectedFridges.includes(fridgeId)) {
    return false;
  }

  const level = payload.level || payload.alert?.level;
  if (level && !isAtLeast(level, minLevel)) {
    return false;
  }

  return true;
}

async function watchDashboard(args, client) {
  const selectedFridges = csvArg(args, "fridgeIds");
  const minLevel = String(args.minLevel || "INFO").toUpperCase();

  client.on("message", (topic, payload, packet) => {
    const envelope = parseJsonMessage(topic, payload);
    if (!shouldShow(envelope, selectedFridges, minLevel)) {
      return;
    }

    const marker = packet.retain ? "[RETAINED]" : "[LIVE]";
    const type = envelope.type || "message";
    console.log(`${marker} ${type} ${topic}`);
    console.log(JSON.stringify(envelope.payload || envelope, null, 2));
  });

  await subscribe(client, `${topics.root}/+/telemetry/latest`);
  await subscribe(client, `${topics.root}/+/status`);
  await subscribe(client, `${topics.root}/+/alerts/latest`);
  await subscribe(client, `${topics.root}/+/alerts/stream`);
  await subscribe(client, topics.systemStatus());

  console.log("Dashboard subscribed to live streams and retained snapshots");
  console.log("Retained messages will be marked as [RETAINED]");

  if (!args.watch) {
    const durationMs = numberArg(args, "durationMs", 3000);
    setTimeout(() => client.end(), durationMs);
  }
}

async function resolveAlert(args, client, replyTopic) {
  const alertId = String(args.resolve || args.alertId || "");
  if (!alertId) {
    throw new Error("--resolve <alert_id> wajib diisi");
  }

  const correlationId = randomUUID();
  const command = {
    correlation_id: correlationId,
    reply_to: replyTopic,
    alert_id: alertId,
    resolved_by: String(args.by || "operator"),
    notes: String(args.notes || ""),
  };

  const responsePromise = waitForReply(client, replyTopic, correlationId);
  await publishJson(client, topics.resolveAlertCommand(), command, { qos: 1, retain: false });
  const response = await responsePromise;

  if (!response.ok) {
    throw new Error(`${response.error.code}: ${response.error.message}`);
  }

  console.log(`Alert ${response.result.alert_id} resolved by ${response.result.resolved_by}`);
}

async function main() {
  const args = parseArgs();
  const clientId = `dashboard-${randomUUID()}`;
  const replyTopic = topics.replies(clientId);
  const client = createMqttClient(clientId);

  console.log(`Connecting dashboard to ${BROKER_URL}`);
  await waitForConnect(client);
  await subscribe(client, replyTopic);

  if (args.resolve || args.alertId) {
    await resolveAlert(args, client, replyTopic);
    client.end();
    return;
  }

  await watchDashboard(args, client);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
