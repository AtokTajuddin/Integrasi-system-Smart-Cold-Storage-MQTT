"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectReading, validatePhysicalRange } = require("../src/server/logic/anomaly");

function reading(overrides = {}) {
  return {
    fridge_id: "FRIDGE-A",
    timestamp: Date.now(),
    temperature_celsius: 4,
    humidity_percent: 45,
    pressure_hpa: 1001,
    door_open: false,
    door_open_duration_seconds: 0,
    power_stable: true,
    ...overrides,
  };
}

test("normal reading stays normal", () => {
  const result = inspectReading(reading());
  assert.equal(result.status, "STATUS_NORMAL");
  assert.equal(result.alerts.length, 0);
});

test("temperature above medical safe limit creates critical alert", () => {
  const result = inspectReading(reading({ temperature_celsius: 9 }));
  assert.equal(result.status, "STATUS_CRITICAL");
  assert.equal(result.alerts[0].level, "CRITICAL");
  assert.equal(result.alerts[0].type, "TEMPERATURE_OUT_OF_SAFE_RANGE");
});

test("temperature near upper safe limit creates warning alert", () => {
  const result = inspectReading(reading({ temperature_celsius: 7 }));
  assert.equal(result.status, "STATUS_WARNING");
  assert.equal(result.alerts[0].level, "WARNING");
  assert.equal(result.alerts[0].type, "TEMPERATURE_APPROACHING_LIMIT");
});

test("open door starts warning before becoming critical", () => {
  const warning = inspectReading(reading({
    door_open: true,
    door_open_duration_seconds: 12,
  }));
  const critical = inspectReading(reading({
    door_open: true,
    door_open_duration_seconds: 42,
  }));

  assert.equal(warning.status, "STATUS_WARNING");
  assert.equal(warning.alerts[0].type, "DOOR_OPEN");
  assert.equal(critical.status, "STATUS_CRITICAL");
  assert.equal(critical.alerts[0].type, "DOOR_OPEN_TOO_LONG");
});

test("power failure creates emergency alert", () => {
  const result = inspectReading(reading({ power_stable: false }));
  assert.equal(result.status, "STATUS_EMERGENCY");
  assert.equal(result.alerts[0].level, "EMERGENCY");
});

test("impossible physical sensor value is rejected", () => {
  assert.throws(
    () => validatePhysicalRange(reading({ temperature_celsius: 140 })),
    /temperature_celsius di luar range fisik sensor/,
  );
});
