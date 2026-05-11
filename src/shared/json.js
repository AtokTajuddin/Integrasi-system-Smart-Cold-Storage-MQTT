"use strict";

function parseJsonMessage(topic, payload) {
  try {
    return JSON.parse(payload.toString("utf8"));
  } catch (error) {
    error.message = `Payload topic ${topic} bukan JSON valid: ${error.message}`;
    throw error;
  }
}

function stringifyJsonMessage(message) {
  return JSON.stringify(message);
}

module.exports = {
  parseJsonMessage,
  stringifyJsonMessage,
};
