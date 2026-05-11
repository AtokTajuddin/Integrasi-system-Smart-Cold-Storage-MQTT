"use strict";

const { randomUUID } = require("node:crypto");
const { parseJsonMessage } = require("../shared/json");
const { numberArg, parseArgs } = require("../shared/cli");
const {
  BROKER_URL,
  createMqttClient,
  publishJson,
  subscribe,
  waitForConnect,
} = require("../shared/mqttClient");
const { topics } = require("../shared/topics");

function waitForReply(client, replyTopic, correlationId, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off("message", handler);
      reject(new Error("Timeout menunggu response dari core service"));
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

async function register(args, client, replyTopic) {
  const fridgeId = String(args.fridgeId || "FRIDGE-A");
  const correlationId = randomUUID();
  const command = {
    correlation_id: correlationId,
    reply_to: replyTopic,
    fridge_id: fridgeId,
    batch_id: String(args.batchId || `BATCH-${Date.now()}`),
    content_type: String(args.content || "VACCINE").toUpperCase(),
    quantity: numberArg(args, "qty", 100),
    expiry_date: String(args.expiryDate || "2026-12-31"),
    notes: String(args.notes || ""),
  };

  const responsePromise = waitForReply(client, replyTopic, correlationId);
  await publishJson(client, topics.inventoryRegister(fridgeId), command, { qos: 1, retain: false });
  const response = await responsePromise;

  if (!response.ok) {
    throw new Error(`${response.error.code}: ${response.error.message}`);
  }

  console.log(response.result.message);
  console.log(JSON.stringify(response.result.inventory, null, 2));
}

async function listInventory(args, client) {
  const fridgeId = args.fridgeId ? String(args.fridgeId) : "+";
  const topic = fridgeId === "+"
    ? `${topics.root}/+/inventory/snapshot`
    : topics.inventorySnapshot(fridgeId);

  const timeoutMs = numberArg(args, "timeoutMs", 2500);
  const timer = setTimeout(() => {
    client.end();
  }, timeoutMs);

  client.on("message", (receivedTopic, payload, packet) => {
    if (!receivedTopic.endsWith("/inventory/snapshot")) {
      return;
    }

    clearTimeout(timer);
    const marker = packet.retain ? "[RETAINED]" : "[LIVE]";
    console.log(`${marker} ${receivedTopic}`);
    console.log(JSON.stringify(parseJsonMessage(receivedTopic, payload), null, 2));
    client.end();
  });

  await subscribe(client, topic);
  console.log(`Listening retained inventory snapshot from ${topic}`);
}

async function main() {
  const args = parseArgs();
  const action = String(args.action || "register");
  const clientId = `admin-${randomUUID()}`;
  const replyTopic = topics.replies(clientId);
  const client = createMqttClient(clientId);

  console.log(`Connecting admin client to ${BROKER_URL}`);
  await waitForConnect(client);
  await subscribe(client, replyTopic);

  if (action === "list") {
    await listInventory(args, client);
    return;
  }

  await register(args, client, replyTopic);
  client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
admin