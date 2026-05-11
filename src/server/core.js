"use strict";

const { randomUUID } = require("node:crypto");
const { parseJsonMessage } = require("../shared/json");
const {
  BROKER_URL,
  createMqttClient,
  publishJson,
  subscribe,
  waitForConnect,
} = require("../shared/mqttClient");
const { parseTopic, topics } = require("../shared/topics");
const { inspectReading } = require("./logic/anomaly");
const { registerBatch } = require("./logic/inventory");
const { createStore } = require("./stateStore");

const clientId = `medicold-core-${randomUUID()}`;
const client = createMqttClient(clientId);
const store = createStore();

function withEnvelope(type, payload) {
  return {
    schema: "medicold.mqtt.v1",
    type,
    emitted_at: new Date().toISOString(),
    payload,
  };
}

async function publishResponse(replyTo, correlationId, response) {
  if (!replyTo) {
    return;
  }

  await publishJson(
    client,
    replyTo,
    {
      correlation_id: correlationId,
      ...response,
    },
    { qos: 1, retain: false },
  );
}

async function publishAlertState(fridgeId) {
  const latestAlert = store.latestUnresolvedAlert(fridgeId);

  await publishJson(
    client,
    topics.alertLatest(fridgeId),
    withEnvelope("alert.latest", {
      has_alert: Boolean(latestAlert),
      alert: latestAlert,
    }),
    { qos: 1, retain: true },
  );
}

async function handleTelemetry(topic, message) {
  const reading = {
    ...message,
    fridge_id: message.fridge_id || parseTopic(topic).fridgeId,
    timestamp: message.timestamp || Date.now(),
  };

  const inspection = inspectReading(reading);
  store.updateTelemetry(reading, inspection.status);

  await publishJson(
    client,
    topics.telemetryLatest(reading.fridge_id),
    withEnvelope("telemetry.latest", reading),
    { qos: 1, retain: true },
  );

  await publishJson(
    client,
    topics.status(reading.fridge_id),
    withEnvelope("fridge.status", {
      fridge_id: reading.fridge_id,
      status: inspection.status,
      last_seen: new Date(reading.timestamp).toISOString(),
    }),
    { qos: 1, retain: true },
  );

  for (const alert of inspection.alerts) {
    store.addAlert(alert);

    await publishJson(
      client,
      topics.alertStream(reading.fridge_id),
      withEnvelope("alert.new", alert),
      { qos: 1, retain: false },
    );
  }

  await publishAlertState(reading.fridge_id);
}

async function handleInventoryRegister(message) {
  try {
    const result = registerBatch(store, message);

    await publishJson(
      client,
      topics.inventorySnapshot(result.batch.fridge_id),
      withEnvelope("inventory.snapshot", result.inventory),
      { qos: 1, retain: true },
    );

    await publishResponse(message.reply_to, message.correlation_id, {
      ok: true,
      result,
    });
  } catch (error) {
    await publishResponse(message.reply_to, message.correlation_id, {
      ok: false,
      error: {
        code: error.code || "INVALID_ARGUMENT",
        message: error.message,
      },
    });
  }
}

async function handleResolveAlert(message) {
  try {
    const alert = store.resolveAlert(message.alert_id, message.resolved_by, message.notes);

    await publishJson(
      client,
      topics.alertStream(alert.fridge_id),
      withEnvelope("alert.resolved", alert),
      { qos: 1, retain: false },
    );

    await publishAlertState(alert.fridge_id);

    await publishResponse(message.reply_to, message.correlation_id, {
      ok: true,
      result: alert,
    });
  } catch (error) {
    await publishResponse(message.reply_to, message.correlation_id, {
      ok: false,
      error: {
        code: error.code || "INVALID_ARGUMENT",
        message: error.message,
      },
    });
  }
}

async function handleMessage(topic, payload) {
  let message;

  try {
    message = parseJsonMessage(topic, payload);
  } catch (error) {
    console.error(error.message);
    return;
  }

  const parsed = parseTopic(topic);
  if (!parsed) {
    return;
  }

  try {
    if (parsed.domain === "telemetry" && parsed.kind === "stream") {
      await handleTelemetry(topic, message);
      return;
    }

    if (parsed.domain === "inventory" && parsed.kind === "commands" && parsed.action === "register") {
      await handleInventoryRegister(message);
      return;
    }

    if (parsed.scope === "system" && parsed.domain === "alerts" && parsed.kind === "commands") {
      await handleResolveAlert(message);
    }
  } catch (error) {
    console.error(`Gagal memproses topic ${topic}: ${error.message}`);
  }
}

async function main() {
  console.log(`Connecting core service to ${BROKER_URL} as ${clientId}`);
  await waitForConnect(client);

  await publishJson(
    client,
    topics.systemStatus(),
    withEnvelope("system.status", {
      service: "medicold-core",
      status: "ONLINE",
    }),
    { qos: 1, retain: true },
  );

  await subscribe(client, topics.patterns.telemetryStream);
  await subscribe(client, topics.patterns.inventoryRegister);
  await subscribe(client, topics.patterns.resolveAlert);

  console.log("Medicold MQTT core is ready");
  console.log(`Subscribed: ${topics.patterns.telemetryStream}`);
  console.log(`Subscribed: ${topics.patterns.inventoryRegister}`);
  console.log(`Subscribed: ${topics.patterns.resolveAlert}`);
}

client.on("message", handleMessage);
client.on("error", (error) => {
  console.error(`MQTT error: ${error.message}`);
});

process.on("SIGINT", async () => {
  try {
    await publishJson(
      client,
      topics.systemStatus(),
      withEnvelope("system.status", {
        service: "medicold-core",
        status: "OFFLINE",
      }),
      { qos: 1, retain: true },
    );
  } finally {
    client.end(false, () => process.exit(0));
  }
});

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
