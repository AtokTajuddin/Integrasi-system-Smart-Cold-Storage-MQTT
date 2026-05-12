"use strict";

const ROOT = process.env.MQTT_TOPIC_ROOT || "medicold";

function topicFridgeId(fridgeId) {
  if (!fridgeId) {
    throw new Error("fridge_id wajib diisi untuk membuat topic MQTT");
  }

  return String(fridgeId).trim().replaceAll("/", "_");
}

function topicGroupId(groupId) {
  if (!groupId) {
    throw new Error("shared subscription group wajib diisi");
  }

  return String(groupId).trim().replaceAll("/", "_");
}

function sharedSubscription(groupId, topicPattern) {
  return `$share/${topicGroupId(groupId)}/${topicPattern}`;
}

const topics = {
  root: ROOT,

  patterns: {
    telemetryStream: `${ROOT}/+/telemetry/stream`,
    inventoryRegister: `${ROOT}/+/inventory/commands/register`,
    resolveAlert: `${ROOT}/system/alerts/commands/resolve`,
    boxUpsert: `${ROOT}/system/boxes/commands/upsert`,
    boxDelete: `${ROOT}/system/boxes/commands/delete`,
  },

  telemetryStream(fridgeId) {
    return `${ROOT}/${topicFridgeId(fridgeId)}/telemetry/stream`;
  },

  telemetryLatest(fridgeId) {
    return `${ROOT}/${topicFridgeId(fridgeId)}/telemetry/latest`;
  },

  status(fridgeId) {
    return `${ROOT}/${topicFridgeId(fridgeId)}/status`;
  },

  alertStream(fridgeId) {
    return `${ROOT}/${topicFridgeId(fridgeId)}/alerts/stream`;
  },

  alertLatest(fridgeId) {
    return `${ROOT}/${topicFridgeId(fridgeId)}/alerts/latest`;
  },

  inventoryRegister(fridgeId) {
    return `${ROOT}/${topicFridgeId(fridgeId)}/inventory/commands/register`;
  },

  inventorySnapshot(fridgeId) {
    return `${ROOT}/${topicFridgeId(fridgeId)}/inventory/snapshot`;
  },

  boxSnapshot(fridgeId) {
    return `${ROOT}/${topicFridgeId(fridgeId)}/box/snapshot`;
  },

  boxesSnapshot() {
    return `${ROOT}/system/boxes/snapshot`;
  },

  boxUpsertCommand() {
    return `${ROOT}/system/boxes/commands/upsert`;
  },

  boxDeleteCommand() {
    return `${ROOT}/system/boxes/commands/delete`;
  },

  resolveAlertCommand() {
    return `${ROOT}/system/alerts/commands/resolve`;
  },

  systemStatus() {
    return `${ROOT}/system/status`;
  },

  replies(clientId) {
    return `${ROOT}/replies/${topicFridgeId(clientId)}`;
  },
};

function parseTopic(topic) {
  const parts = topic.split("/");
  if (parts[0] !== ROOT) {
    return null;
  }

  if (parts[1] === "system") {
    return {
      root: parts[0],
      scope: "system",
      domain: parts[2],
      kind: parts[3],
      action: parts[4],
    };
  }

  if (parts[1] === "replies") {
    return {
      root: parts[0],
      scope: "replies",
      clientId: parts[2],
    };
  }

  return {
    root: parts[0],
    scope: "fridge",
    fridgeId: parts[1],
    domain: parts[2],
    kind: parts[3],
    action: parts[4],
  };
}

module.exports = {
  ROOT,
  parseTopic,
  sharedSubscription,
  topicFridgeId,
  topicGroupId,
  topics,
};
