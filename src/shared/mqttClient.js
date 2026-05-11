"use strict";

const mqtt = require("mqtt");
const { stringifyJsonMessage } = require("./json");

const BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

function createMqttClient(clientId, options = {}) {
  return mqtt.connect(BROKER_URL, {
    protocolVersion: 5,
    clean: options.clean ?? true,
    clientId,
    connectTimeout: 5000,
    keepalive: 30,
    reconnectPeriod: 1000,
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

function publishJson(client, topic, message, options = {}) {
  return new Promise((resolve, reject) => {
    client.publish(
      topic,
      stringifyJsonMessage(message),
      {
        qos: options.qos ?? 1,
        retain: options.retain ?? false,
      },
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
