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

// Request-Response tracker untuk correlation_id (MQTT request-response pattern)
class RequestResponseTracker {
  constructor(timeoutMs = 30000) {
    this.pending = new Map(); // correlation_id -> { resolve, reject, timeout }
    this.timeoutMs = timeoutMs;
  }

  createRequest() {
    const correlationId = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(correlationId);
        reject(new Error(`Request ${correlationId} timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pending.set(correlationId, { resolve, reject, timeout });
    }).then(
      (response) => {
        this.pending.delete(correlationId);
        return response;
      },
      (error) => {
        this.pending.delete(correlationId);
        throw error;
      }
    ).catch(() => ({
      correlationId,
      ok: false,
      error: { message: "Request timeout" },
    }));

    return { correlationId, promise: Promise.resolve() };
  }

  resolveRequest(correlationId, response) {
    const pending = this.pending.get(correlationId);
    if (!pending) {
      console.warn(`Received response for unknown correlation_id: ${correlationId}`);
      return;
    }

    clearTimeout(pending.timeout);
    pending.resolve(response);
  }

  rejectRequest(correlationId, error) {
    const pending = this.pending.get(correlationId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    pending.reject(error);
  }
}

const rrcTracker = new RequestResponseTracker(30000); // 30 second timeout

function withEnvelope(type, payload) {
  return {
    schema: "medicold.mqtt.v1",
    type,
    emitted_at: new Date().toISOString(),
    payload,
  };
}

/**
 * Publish response dengan MQTT 5.0 user properties untuk tracking
 * - correlation_id: untuk match request-response
 * - source: dari core service
 * - priority: untuk alert response vs normal response
 */
async function publishResponse(replyTo, correlationId, response, options = {}) {
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
    {
      qos: 1,
      retain: false,
      correlationId, // untuk user properties
      source: "medicold-core",
      priority: options.priority || (response.ok ? "normal" : "high"),
      messageExpiryInterval: 5 * 60, // response expires dalam 5 menit
    }
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
    {
      qos: 1,
      retain: true,
      source: "medicold-core",
      priority: latestAlert ? "high" : "normal",
      // Retained message: expire dalam 1 jam
      messageExpiryInterval: 3600,
    }
  );
}

async function publishBoxesSnapshot() {
  await publishJson(
    client,
    topics.boxesSnapshot(),
    withEnvelope("boxes.snapshot", {
      boxes: store.getBoxes(),
      total_count: store.getBoxes().length,
    }),
    {
      qos: 1,
      retain: true,
      source: "medicold-core",
      priority: "normal",
      // Retained message: expire dalam 24 jam
      messageExpiryInterval: 24 * 3600,
    }
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

  // Publish telemetry latest (retained snapshot)
  await publishJson(
    client,
    topics.telemetryLatest(reading.fridge_id),
    withEnvelope("telemetry.latest", reading),
    {
      qos: 1,
      retain: true,
      source: "medicold-core",
      priority: inspection.status === "CRITICAL" ? "high" : "normal",
      messageExpiryInterval: 24 * 3600, // 24 hours
    }
  );

  // Publish status update (retained)
  await publishJson(
    client,
    topics.status(reading.fridge_id),
    withEnvelope("fridge.status", {
      fridge_id: reading.fridge_id,
      status: inspection.status,
      last_seen: new Date(reading.timestamp).toISOString(),
    }),
    {
      qos: 1,
      retain: true,
      source: "medicold-core",
      priority: inspection.status === "CRITICAL" ? "high" : "normal",
      messageExpiryInterval: 3600, // 1 hour
    }
  );

  // Publish alert events (streaming, not retained)
  for (const alert of inspection.alerts) {
    store.addAlert(alert);

    await publishJson(
      client,
      topics.alertStream(reading.fridge_id),
      withEnvelope("alert.new", alert),
      {
        qos: 1,
        retain: false,
        source: "medicold-core",
        priority: "high",
        messageExpiryInterval: 5 * 60, // 5 minutes
      }
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
      {
        qos: 1,
        retain: true,
        source: "medicold-core",
        priority: "normal",
        messageExpiryInterval: 24 * 3600,
      }
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
    }, { priority: "high" });
  }
}

async function handleResolveAlert(message) {
  try {
    const alert = store.resolveAlert(message.alert_id, message.resolved_by, message.notes);

    await publishJson(
      client,
      topics.alertStream(alert.fridge_id),
      withEnvelope("alert.resolved", alert),
      {
        qos: 1,
        retain: false,
        source: "medicold-core",
        priority: "normal",
        messageExpiryInterval: 5 * 60,
      }
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
    }, { priority: "high" });
  }
}

function normalizeBox(payload) {
  const input = payload.box || payload;
  const fridgeId = String(input.fridge_id || input.fridgeId || "").trim().toUpperCase();

  if (!fridgeId) {
    throw new Error("fridge_id box wajib diisi");
  }

  return {
    fridge_id: fridgeId.replaceAll("/", "-").replaceAll(" ", "-"),
    location: String(input.location || "Medical Storage").trim(),
    medical_content: String(input.medical_content || input.medicalContent || "OTHER")
      .trim()
      .toUpperCase()
      .replaceAll("-", "_")
      .replaceAll(" ", "_"),
    base_temperature: Number(input.base_temperature ?? input.baseTemperature ?? 4.5),
  };
}

async function handleBoxUpsert(message) {
  try {
    const box = store.upsertBox(normalizeBox(message));

    await publishJson(
      client,
      topics.boxSnapshot(box.fridge_id),
      withEnvelope("box.snapshot", box),
      {
        qos: 1,
        retain: true,
        source: "medicold-core",
        priority: "normal",
        messageExpiryInterval: 24 * 3600,
      }
    );

    await publishBoxesSnapshot();

    await publishResponse(message.reply_to, message.correlation_id, {
      ok: true,
      result: box,
    });
  } catch (error) {
    await publishResponse(message.reply_to, message.correlation_id, {
      ok: false,
      error: {
        code: "INVALID_ARGUMENT",
        message: error.message,
      },
    }, { priority: "high" });
  }
}

async function handleBoxDelete(message) {
  const fridgeId = String(message.fridge_id || message.fridgeId || "")
    .trim()
    .toUpperCase()
    .replaceAll("/", "-")
    .replaceAll(" ", "-");

  if (!fridgeId) {
    await publishResponse(message.reply_to, message.correlation_id, {
      ok: false,
      error: {
        code: "INVALID_ARGUMENT",
        message: "fridge_id box wajib diisi",
      },
    }, { priority: "high" });
    return;
  }

  const result = store.deleteBox(fridgeId);

  await publishJson(
    client,
    topics.boxSnapshot(fridgeId),
    withEnvelope("box.deleted", result),
    {
      qos: 1,
      retain: true,
      source: "medicold-core",
      priority: "normal",
      messageExpiryInterval: 24 * 3600,
    }
  );

  await publishBoxesSnapshot();

  await publishResponse(message.reply_to, message.correlation_id, {
    ok: true,
    result,
  });
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
      return;
    }

    if (parsed.scope === "system" && parsed.domain === "boxes" && parsed.kind === "commands") {
      if (parsed.action === "upsert") {
        await handleBoxUpsert(message);
        return;
      }

      if (parsed.action === "delete") {
        await handleBoxDelete(message);
      }
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
  await subscribe(client, topics.patterns.boxUpsert);
  await subscribe(client, topics.patterns.boxDelete);

  console.log("Medicold MQTT core is ready");
  console.log(`Subscribed: ${topics.patterns.telemetryStream}`);
  console.log(`Subscribed: ${topics.patterns.inventoryRegister}`);
  console.log(`Subscribed: ${topics.patterns.resolveAlert}`);
  console.log(`Subscribed: ${topics.patterns.boxUpsert}`);
  console.log(`Subscribed: ${topics.patterns.boxDelete}`);
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
