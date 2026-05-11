"use strict";

const { randomUUID } = require("node:crypto");
const { highestSeverity } = require("./severity");

const SAFE_LIMITS = {
  temperatureCelsius: {
    min: 2,
    max: 8,
    emergencyMin: 0,
    emergencyMax: 10,
    physicalMin: -50,
    physicalMax: 100,
  },
  humidityPercent: {
    min: 30,
    max: 60,
    physicalMin: 0,
    physicalMax: 100,
  },
  pressureHpa: {
    min: 980,
    max: 1020,
    physicalMin: 800,
    physicalMax: 1200,
  },
  doorOpenSecondsMax: 30,
};

function requireNumber(value, field) {
  if (!Number.isFinite(Number(value))) {
    throw new RangeError(`${field} harus berupa angka`);
  }

  return Number(value);
}

function validatePhysicalRange(reading) {
  const temperature = requireNumber(reading.temperature_celsius, "temperature_celsius");
  const humidity = requireNumber(reading.humidity_percent, "humidity_percent");
  const pressure = requireNumber(reading.pressure_hpa, "pressure_hpa");

  if (
    temperature < SAFE_LIMITS.temperatureCelsius.physicalMin
    || temperature > SAFE_LIMITS.temperatureCelsius.physicalMax
  ) {
    throw new RangeError(`temperature_celsius di luar range fisik sensor: ${temperature}`);
  }

  if (
    humidity < SAFE_LIMITS.humidityPercent.physicalMin
    || humidity > SAFE_LIMITS.humidityPercent.physicalMax
  ) {
    throw new RangeError(`humidity_percent di luar range fisik sensor: ${humidity}`);
  }

  if (
    pressure < SAFE_LIMITS.pressureHpa.physicalMin
    || pressure > SAFE_LIMITS.pressureHpa.physicalMax
  ) {
    throw new RangeError(`pressure_hpa di luar range fisik sensor: ${pressure}`);
  }
}

function alert(type, level, reading, description, sensorValue, thresholdValue) {
  return {
    alert_id: randomUUID(),
    fridge_id: reading.fridge_id,
    type,
    level,
    description,
    sensor_value: sensorValue,
    threshold_value: thresholdValue,
    timestamp: reading.timestamp || Date.now(),
    resolved: false,
    resolved_by: "",
    notes: "",
  };
}

function inspectReading(reading) {
  validatePhysicalRange(reading);

  const alerts = [];
  const temperature = Number(reading.temperature_celsius);
  const humidity = Number(reading.humidity_percent);
  const pressure = Number(reading.pressure_hpa);
  const doorOpenDuration = Number(reading.door_open_duration_seconds || 0);

  if (
    temperature < SAFE_LIMITS.temperatureCelsius.emergencyMin
    || temperature > SAFE_LIMITS.temperatureCelsius.emergencyMax
  ) {
    alerts.push(
      alert(
        "TEMPERATURE_OUT_OF_SAFE_RANGE",
        "EMERGENCY",
        reading,
        `Suhu ${temperature.toFixed(1)}C sudah masuk level emergency`,
        temperature,
        temperature > SAFE_LIMITS.temperatureCelsius.emergencyMax
          ? SAFE_LIMITS.temperatureCelsius.emergencyMax
          : SAFE_LIMITS.temperatureCelsius.emergencyMin,
      ),
    );
  } else if (
    temperature < SAFE_LIMITS.temperatureCelsius.min
    || temperature > SAFE_LIMITS.temperatureCelsius.max
  ) {
    alerts.push(
      alert(
        "TEMPERATURE_OUT_OF_SAFE_RANGE",
        "CRITICAL",
        reading,
        `Suhu ${temperature.toFixed(1)}C melewati batas aman cold storage medis`,
        temperature,
        temperature > SAFE_LIMITS.temperatureCelsius.max
          ? SAFE_LIMITS.temperatureCelsius.max
          : SAFE_LIMITS.temperatureCelsius.min,
      ),
    );
  }

  if (humidity < SAFE_LIMITS.humidityPercent.min || humidity > SAFE_LIMITS.humidityPercent.max) {
    alerts.push(
      alert(
        "HUMIDITY_OUT_OF_SAFE_RANGE",
        "WARNING",
        reading,
        `Kelembaban ${humidity.toFixed(1)}% berada di luar batas aman`,
        humidity,
        humidity > SAFE_LIMITS.humidityPercent.max
          ? SAFE_LIMITS.humidityPercent.max
          : SAFE_LIMITS.humidityPercent.min,
      ),
    );
  }

  if (pressure < SAFE_LIMITS.pressureHpa.min || pressure > SAFE_LIMITS.pressureHpa.max) {
    alerts.push(
      alert(
        "PRESSURE_OUT_OF_SAFE_RANGE",
        "WARNING",
        reading,
        `Tekanan ${pressure.toFixed(1)} hPa berada di luar batas normal`,
        pressure,
        pressure > SAFE_LIMITS.pressureHpa.max
          ? SAFE_LIMITS.pressureHpa.max
          : SAFE_LIMITS.pressureHpa.min,
      ),
    );
  }

  if (reading.door_open && doorOpenDuration > SAFE_LIMITS.doorOpenSecondsMax) {
    alerts.push(
      alert(
        "DOOR_OPEN_TOO_LONG",
        "CRITICAL",
        reading,
        `Pintu terbuka selama ${doorOpenDuration} detik`,
        doorOpenDuration,
        SAFE_LIMITS.doorOpenSecondsMax,
      ),
    );
  }

  if (reading.power_stable === false) {
    alerts.push(
      alert(
        "POWER_UNSTABLE",
        "EMERGENCY",
        reading,
        "Daya listrik kulkas medis tidak stabil",
        0,
        1,
      ),
    );
  }

  const level = highestSeverity(alerts.map((item) => item.level));
  return {
    alerts,
    status: level === "NORMAL" ? "STATUS_NORMAL" : `STATUS_${level}`,
  };
}

module.exports = {
  SAFE_LIMITS,
  inspectReading,
  validatePhysicalRange,
};
