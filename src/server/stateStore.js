"use strict";

const { isAtLeast } = require("./logic/severity");

function createStore() {
  const fridges = new Map();
  const batches = new Map();
  const alerts = new Map();

  function ensureFridge(fridgeId) {
    if (!fridges.has(fridgeId)) {
      fridges.set(fridgeId, {
        fridge_id: fridgeId,
        status: "STATUS_NORMAL",
        latest_telemetry: null,
        inventory: [],
        alert_ids: [],
        last_updated: Date.now(),
      });
    }

    return fridges.get(fridgeId);
  }

  function updateTelemetry(reading, status) {
    const fridge = ensureFridge(reading.fridge_id);
    fridge.latest_telemetry = reading;
    fridge.status = status;
    fridge.last_updated = Date.now();
    return fridge;
  }

  function registerBatch(fridgeId, batch) {
    if (batches.has(batch.batch_id)) {
      const error = new Error(`batch_id ${batch.batch_id} sudah terdaftar`);
      error.code = "ALREADY_EXISTS";
      throw error;
    }

    const fridge = ensureFridge(fridgeId);
    const record = {
      batch_id: batch.batch_id,
      fridge_id: fridgeId,
      content_type: batch.content_type || "OTHER",
      quantity: Number(batch.quantity),
      expiry_date: batch.expiry_date || "",
      notes: batch.notes || "",
      registered_at: new Date().toISOString(),
    };

    fridge.inventory.push(record);
    fridge.last_updated = Date.now();
    batches.set(record.batch_id, record);
    return record;
  }

  function getInventorySnapshot(fridgeId) {
    const fridge = ensureFridge(fridgeId);
    return {
      fridge_id: fridge.fridge_id,
      batches: fridge.inventory,
      total_batches: fridge.inventory.length,
      last_updated: fridge.last_updated,
    };
  }

  function addAlert(alert) {
    const fridge = ensureFridge(alert.fridge_id);
    alerts.set(alert.alert_id, alert);
    fridge.alert_ids.push(alert.alert_id);
    fridge.last_updated = Date.now();
    return alert;
  }

  function getAlerts(filter = {}) {
    return Array.from(alerts.values()).filter((alert) => {
      if (filter.fridge_id && alert.fridge_id !== filter.fridge_id) {
        return false;
      }

      if (filter.unresolved_only && alert.resolved) {
        return false;
      }

      if (filter.min_level && !isAtLeast(alert.level, filter.min_level)) {
        return false;
      }

      return true;
    });
  }

  function resolveAlert(alertId, resolvedBy, notes) {
    const found = alerts.get(alertId);
    if (!found) {
      const error = new Error(`alert_id ${alertId} tidak ditemukan`);
      error.code = "NOT_FOUND";
      throw error;
    }

    found.resolved = true;
    found.resolved_by = resolvedBy || "operator";
    found.notes = notes || "";
    found.resolved_at = new Date().toISOString();
    return found;
  }

  function latestUnresolvedAlert(fridgeId) {
    const fridge = ensureFridge(fridgeId);
    const unresolved = fridge.alert_ids
      .map((alertId) => alerts.get(alertId))
      .filter((alert) => alert && !alert.resolved)
      .sort((a, b) => b.timestamp - a.timestamp);

    return unresolved[0] || null;
  }

  return {
    addAlert,
    ensureFridge,
    getAlerts,
    getInventorySnapshot,
    latestUnresolvedAlert,
    registerBatch,
    resolveAlert,
    updateTelemetry,
  };
}

module.exports = {
  createStore,
};
