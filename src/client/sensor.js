"use strict";

const { randomUUID } = require("node:crypto");
const { numberArg, parseArgs } = require("../shared/cli");
const {
  BROKER_URL,
  createMqttClient,
  publishJson,
  waitForConnect,
} = require("../shared/mqttClient");
const { topics } = require("../shared/topics");

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function wave(index, amplitude = 1) {
  return Math.sin(index / 4) * amplitude;
}

function buildReading(options) {
  const progress = options.total <= 1 ? 1 : options.index / (options.total - 1);
  const base = {
    fridge_id: options.fridgeId,
    session_id: options.sessionId,
    timestamp: Date.now(),
    temperature_celsius: 4.5 + wave(options.index, 0.4),
    humidity_percent: 43 + wave(options.index, 2),
    pressure_hpa: 1002 + wave(options.index, 3),
    door_open: false,
    door_open_duration_seconds: 0,
    power_stable: true,
    location: options.location,
    medical_content: options.medicalContent,
  };

  if (options.scenario === "temp_rise") {
    base.temperature_celsius = 4 + progress * 12;
  }

  if (options.scenario === "door_open") {
    base.door_open = progress > 0.35 && progress < 0.9;
    base.door_open_duration_seconds = base.door_open
      ? Math.round((progress - 0.35) * options.total)
      : 0;
  }

  if (options.scenario === "power_fail") {
    base.power_stable = !(progress > 0.4 && progress < 0.75);
    base.temperature_celsius = base.power_stable ? base.temperature_celsius : 9.5 + wave(options.index, 1);
  }

  if (options.scenario === "chaos") {
    base.temperature_celsius = options.index % 7 === 0 ? 11.5 : base.temperature_celsius + progress * 5;
    base.humidity_percent = options.index % 5 === 0 ? 66 : base.humidity_percent;
    base.pressure_hpa = options.index % 9 === 0 ? 1030 : base.pressure_hpa;
    base.power_stable = options.index % 11 !== 0;
    base.door_open = options.index % 6 === 0;
    base.door_open_duration_seconds = base.door_open ? 42 : 0;
  }

  return {
    ...base,
    temperature_celsius: Number(base.temperature_celsius.toFixed(2)),
    humidity_percent: Number(base.humidity_percent.toFixed(2)),
    pressure_hpa: Number(base.pressure_hpa.toFixed(2)),
  };
}

async function main() {
  const args = parseArgs();
  const fridgeId = String(args.fridgeId || "FRIDGE-A");
  const scenario = String(args.scenario || "normal");
  const total = numberArg(args, "readings", 30);
  const intervalMs = numberArg(args, "intervalMs", 1000);
  const location = String(args.location || "Ruang Farmasi Lt. 2");
  const medicalContent = String(args.content || "VACCINE");
  const sessionId = randomUUID();
  const clientId = `sensor-${fridgeId}-${randomUUID()}`;
  const client = createMqttClient(clientId);

  console.log(`Connecting sensor to ${BROKER_URL}`);
  await waitForConnect(client);

  const topic = topics.telemetryStream(fridgeId);
  console.log(`Streaming telemetry to ${topic} with retain=false`);

  for (let index = 0; index < total; index += 1) {
    const reading = buildReading({
      fridgeId,
      index,
      location,
      medicalContent,
      scenario,
      sessionId,
      total,
    });

    await publishJson(client, topic, reading, { qos: 1, retain: false });
    console.log(
      `[${index + 1}/${total}] ${fridgeId} temp=${reading.temperature_celsius}C `
      + `hum=${reading.humidity_percent}% power=${reading.power_stable ? "ok" : "fail"}`,
    );

    if (index < total - 1) {
      await sleep(intervalMs);
    }
  }

  client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

module.exports = {
  buildReading,
};
