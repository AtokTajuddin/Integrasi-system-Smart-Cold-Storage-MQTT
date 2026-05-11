"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { registerBatch } = require("../src/server/logic/inventory");
const { createStore } = require("../src/server/stateStore");

test("register batch returns retained inventory snapshot shape", () => {
  const store = createStore();
  const result = registerBatch(store, {
    fridge_id: "FRIDGE-A",
    batch_id: "BATCH-001",
    content_type: "vaccine",
    quantity: 200,
  });

  assert.equal(result.success, true);
  assert.equal(result.batch.content_type, "VACCINE");
  assert.equal(result.inventory.total_batches, 1);
});

test("duplicate batch id is rejected", () => {
  const store = createStore();
  const payload = {
    fridge_id: "FRIDGE-A",
    batch_id: "BATCH-001",
    quantity: 200,
  };

  registerBatch(store, payload);
  assert.throws(() => registerBatch(store, payload), /sudah terdaftar/);
});

test("dummy sender can replace existing batch idempotently", () => {
  const store = createStore();
  const payload = {
    fridge_id: "FRIDGE-A",
    batch_id: "BATCH-001",
    quantity: 200,
  };

  registerBatch(store, payload);
  const result = registerBatch(store, {
    ...payload,
    quantity: 210,
    replace_existing: true,
  });

  assert.equal(result.inventory.total_batches, 1);
  assert.equal(result.batch.quantity, 210);
});
