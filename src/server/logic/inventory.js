"use strict";

const CONTENT_TYPES = new Set(["VACCINE", "BLOOD_SAMPLE", "MEDICINE", "OTHER"]);

function normalizeContentType(value) {
  const normalized = String(value || "OTHER").trim().toUpperCase();
  return CONTENT_TYPES.has(normalized) ? normalized : "OTHER";
}

function validateBatch(payload) {
  const batchId = String(payload.batch_id || "").trim();
  const fridgeId = String(payload.fridge_id || "").trim();
  const quantity = Number(payload.quantity);

  if (!batchId) {
    throw new Error("batch_id wajib diisi");
  }

  if (!fridgeId) {
    throw new Error("fridge_id wajib diisi");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("quantity harus angka lebih dari 0");
  }

  return {
    batch_id: batchId,
    fridge_id: fridgeId,
    content_type: normalizeContentType(payload.content_type),
    quantity,
    expiry_date: String(payload.expiry_date || "").trim(),
    notes: String(payload.notes || "").trim(),
    replace_existing: payload.replace_existing === true,
  };
}

function registerBatch(store, payload) {
  const batch = validateBatch(payload);
  const record = store.registerBatch(batch.fridge_id, batch);
  return {
    success: true,
    message: `Batch ${record.batch_id} berhasil didaftarkan ke ${record.fridge_id}`,
    batch: record,
    inventory: store.getInventorySnapshot(record.fridge_id),
  };
}

module.exports = {
  CONTENT_TYPES,
  normalizeContentType,
  registerBatch,
  validateBatch,
};
