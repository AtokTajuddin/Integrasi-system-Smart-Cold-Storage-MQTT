"use strict";

const { randomUUID } = require("node:crypto");
const {
  BROKER_URL,
  createMqttClient,
  publishJson,
  waitForConnect,
} = require("../shared/mqttClient");
const { topics } = require("../shared/topics");

const boxes = [
  {
    fridge_id: "FRIDGE-A",
    location: "Ruang Farmasi Lt. 2",
    medical_content: "VACCINE",
    base_temperature: 4.2,
    base_humidity: 43,
    base_pressure: 1002,
    scenario: "temp_rise",
    batches: [
      { batch_id: "VAC-2026-001", content_type: "VACCINE", quantity: 180 },
      { batch_id: "VAC-2026-018", content_type: "VACCINE", quantity: 120 },
      { batch_id: "MED-BOOST-07", content_type: "MEDICINE", quantity: 64 },
    ],
  },
  {
    fridge_id: "FRIDGE-B",
    location: "Lab Hematologi",
    medical_content: "BLOOD_SAMPLE",
    base_temperature: 5.1,
    base_humidity: 48,
    base_pressure: 1004,
    scenario: "power_fail",
    batches: [
      { batch_id: "BLD-A24-002", content_type: "BLOOD_SAMPLE", quantity: 42 },
      { batch_id: "BLD-B19-006", content_type: "BLOOD_SAMPLE", quantity: 36 },
    ],
  },
  {
    fridge_id: "FRIDGE-C",
    location: "ICU Storage",
    medical_content: "MEDICINE",
    base_temperature: 7.2,
    base_humidity: 55,
    base_pressure: 999,
    scenario: "chaos",
    batches: [
      { batch_id: "INS-2201", content_type: "MEDICINE", quantity: 88 },
      { batch_id: "ANT-7742", content_type: "MEDICINE", quantity: 52 },
      { batch_id: "IVD-1200", content_type: "OTHER", quantity: 24 },
      { batch_id: "MED-445A", content_type: "MEDICINE", quantity: 71 },
    ],
  },
];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function wave(index, amplitude = 1) {
  return Math.sin(index / 4) * amplitude;
}

function buildReading(box, tick) {
  const cycle = tick % 24;
  const progress = cycle / 23;
  const reading = {
    fridge_id: box.fridge_id,
    session_id: `dummy-${box.fridge_id}`,
    timestamp: Date.now(),
    temperature_celsius: box.base_temperature + wave(tick, 0.55),
    humidity_percent: box.base_humidity + wave(tick, 3),
    pressure_hpa: box.base_pressure + wave(tick, 5),
    door_open: false,
    door_open_duration_seconds: 0,
    power_stable: true,
    location: box.location,
    medical_content: box.medical_content,
  };

  if (box.scenario === "temp_rise") {
    reading.temperature_celsius = 4 + progress * 8.8;
  }

  if (box.scenario === "power_fail") {
    reading.power_stable = !(progress > 0.42 && progress < 0.74);
    if (!reading.power_stable) {
      reading.temperature_celsius = 9.5 + wave(tick, 1.1);
    }
  }

  if (box.scenario === "chaos") {
    reading.temperature_celsius = tick % 9 === 0 ? 11.6 : reading.temperature_celsius + progress * 2.4;
    reading.humidity_percent = tick % 7 === 0 ? 66 : reading.humidity_percent;
    reading.pressure_hpa = tick % 11 === 0 ? 1028 : reading.pressure_hpa;
    reading.power_stable = tick % 13 !== 0;
    reading.door_open = tick % 8 === 0;
    reading.door_open_duration_seconds = reading.door_open ? 44 : 0;
  }

  return {
    ...reading,
    temperature_celsius: Number(reading.temperature_celsius.toFixed(2)),
    humidity_percent: Number(reading.humidity_percent.toFixed(2)),
    pressure_hpa: Number(reading.pressure_hpa.toFixed(2)),
  };
}

async function publishBox(client, box) {
  await publishJson(
    client,
    topics.boxUpsertCommand(),
    {
      correlation_id: randomUUID(),
      fridge_id: box.fridge_id,
      location: box.location,
      medical_content: box.medical_content,
      base_temperature: box.base_temperature,
    },
    { qos: 1, retain: false },
  );
}

async function publishInventory(client, box) {
  for (const batch of box.batches) {
    await publishJson(
      client,
      topics.inventoryRegister(box.fridge_id),
      {
        correlation_id: randomUUID(),
        fridge_id: box.fridge_id,
        batch_id: batch.batch_id,
        content_type: batch.content_type,
        quantity: batch.quantity,
        expiry_date: "2026-12-31",
        notes: "Seeded by dummy sender service",
        replace_existing: true,
      },
      { qos: 1, retain: false },
    );
  }
}

async function seed(client) {
  for (const box of boxes) {
    await publishBox(client, box);
    await publishInventory(client, box);
  }
}

async function main() {
  const client = createMqttClient(`dummy-sender-${randomUUID()}`);
  console.log(`Connecting dummy sender to ${BROKER_URL}`);
  await waitForConnect(client);

  let tick = 0;
  await sleep(2000);
  await seed(client);

  setInterval(() => {
    seed(client).catch((error) => {
      console.error(`Seed error: ${error.message}`);
    });
  }, 30000);

  while (true) {
    const box = boxes[tick % boxes.length];
    const reading = buildReading(box, tick);
    await publishJson(client, topics.telemetryStream(box.fridge_id), reading, {
      qos: 1,
      retain: false,
    });

    console.log(
      `[dummy ${tick}] ${box.fridge_id} temp=${reading.temperature_celsius}C `
      + `hum=${reading.humidity_percent}% power=${reading.power_stable ? "ok" : "fail"}`,
    );

    tick += 1;
    await sleep(900);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
