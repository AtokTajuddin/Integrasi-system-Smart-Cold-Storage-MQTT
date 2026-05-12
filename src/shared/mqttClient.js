"use strict";

const mqtt = require("mqtt");
const { stringifyJsonMessage } = require("./json");

const BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

/**
 * Create MQTT client dengan MQTT 5.0 features:
 * - Protocol Version 5
 * - Last Will & Testament untuk graceful disconnection
 * - Clean session control
 * - Connection timeout & keepalive
 */
function createMqttClient(clientId, options = {}) {
  const willTopic = options.willTopic || `${process.env.MQTT_TOPIC_ROOT || "medicold"}/system/client-status`;
  const willMessage = JSON.stringify({
    schema: "medicold.mqtt.v1",
    type: "client.offline",
    client_id: clientId,
    disconnected_at: new Date().toISOString(),
    reason: "connection-lost",
  });

  return mqtt.connect(BROKER_URL, {
    protocolVersion: 5,
    clean: options.clean ?? true,
    clientId,
    connectTimeout: 5000,
    keepalive: 30,
    reconnectPeriod: 1000,
    
    // Last Will & Testament: publish when client unexpectedly disconnects
    will: {
      topic: willTopic,
      payload: willMessage,
      qos: 1,
      retain: false,
      properties: {
        willDelayInterval: 1, // delay sebelum publish will message (detik)
      },
    },

    // Properties untuk MQTT 5.0
    properties: {
      sessionExpiryInterval: 3600, // session valid 1 jam
      receiveMaximum: 100,
      maximumPacketSize: 268435455,
      topicAliasMaximum: 50,
    },
  });
}

function waitForConnect(client) {
  if (client.connected) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("error", reject);
  });
}

/**
 * Publish JSON message dengan MQTT 5.0 features:
 * - messageExpiryInterval: Message expires setelah N detik di broker
 * - userProperties: Custom metadata dalam message header
 * - topicAlias: Reduce bandwidth dengan topic alias (MQTT 5.0)
 * - Qos & Retain policy
 */
function publishJson(client, topic, message, options = {}) {
  return new Promise((resolve, reject) => {
    // User properties untuk metadata dan correlation tracking
    const userProperties = options.userProperties || {};
    if (options.correlationId) {
      userProperties["correlation-id"] = options.correlationId;
    }
    if (options.source) {
      userProperties["source"] = options.source;
    }
    if (options.priority) {
      userProperties["priority"] = options.priority; // "critical", "high", "normal", "low"
    }

    const publishOptions = {
      qos: options.qos ?? 1,
      retain: options.retain ?? false,
    };

    // MQTT 5.0: Message expiry interval (detik)
    // Default: 1 jam untuk snapshot retained, 5 menit untuk streaming
    if (options.messageExpiryInterval !== undefined) {
      publishOptions.properties = publishOptions.properties || {};
      publishOptions.properties.messageExpiryInterval = options.messageExpiryInterval;
    } else if (options.retain) {
      // Retained message: expire dalam 24 jam
      publishOptions.properties = publishOptions.properties || {};
      publishOptions.properties.messageExpiryInterval = 24 * 3600;
    } else {
      // Non-retained message: expire dalam 5 menit
      publishOptions.properties = publishOptions.properties || {};
      publishOptions.properties.messageExpiryInterval = 5 * 60;
    }

    // MQTT 5.0: User properties untuk metadata
    if (Object.keys(userProperties).length > 0) {
      publishOptions.properties = publishOptions.properties || {};
      publishOptions.properties.userProperties = userProperties;
    }

    // MQTT 5.0: Topic alias (mengurangi bandwidth)
    if (options.topicAlias) {
      publishOptions.properties = publishOptions.properties || {};
      publishOptions.properties.topicAlias = options.topicAlias;
    }

    client.publish(
      topic,
      stringifyJsonMessage(message),
      publishOptions,
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      },
    );
  });
}

function subscribe(client, topic, options = {}) {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, { qos: options.qos ?? 1 }, (error, granted) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(granted);
    });
  });
}

module.exports = {
  BROKER_URL,
  createMqttClient,
  publishJson,
  subscribe,
  waitForConnect,
};
