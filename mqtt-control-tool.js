#!/usr/bin/env node
"use strict";

/**
 * MQTT Control Tool - Interactive CLI untuk test & debug MQTT
 * 
 * Features:
 * - Subscribe ke topic dan lihat messages dengan properties
 * - Publish message dengan custom properties
 * - Monitor connection status
 * - Inspect message headers (expiry, userProperties, etc)
 * - Message history logging
 * 
 * Usage:
 *   node mqtt-control-tool.js
 * 
 * Commands:
 *   subscribe <topic>     - Subscribe ke topic (wildcard allowed)
 *   publish <topic>       - Publish message ke topic
 *   list-subs             - List active subscriptions
 *   history               - Show message history
 *   clear-history         - Clear message history
 *   status                - Show connection status
 *   exit                  - Disconnect & exit
 */

const mqtt = require("mqtt");
const readline = require("readline");
const { randomUUID } = require("crypto");

const BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const TOPIC_ROOT = process.env.MQTT_TOPIC_ROOT || "medicold";

class MQTTControlTool {
  constructor() {
    this.client = null;
    this.subscriptions = new Set();
    this.messageHistory = [];
    this.maxHistorySize = 100;
    this.rl = null;
    this.connected = false;
  }

  async start() {
    console.log("🚀 MQTT Control Tool");
    console.log(`📡 Broker: ${BROKER_URL}`);
    console.log(`📂 Topic Root: ${TOPIC_ROOT}`);
    console.log("");

    this.initReadline();
    await this.connectToBroker();
    this.showPrompt();
  }

  initReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async connectToBroker() {
    return new Promise((resolve) => {
      console.log("Connecting to MQTT broker...");

      const clientId = `mqtt-control-${randomUUID().substring(0, 8)}`;
      this.client = mqtt.connect(BROKER_URL, {
        protocolVersion: 5,
        clientId,
        clean: true,
        connectTimeout: 5000,
        keepalive: 30,
        will: {
          topic: `${TOPIC_ROOT}/system/client-status`,
          payload: JSON.stringify({
            type: "client.offline",
            client_id: clientId,
            tool: "mqtt-control-tool",
            disconnected_at: new Date().toISOString(),
          }),
          qos: 1,
          retain: false,
        },
      });

      this.client.on("connect", () => {
        this.connected = true;
        console.log("✅ Connected to broker\n");
        resolve();
      });

      this.client.on("disconnect", () => {
        this.connected = false;
        console.log("❌ Disconnected from broker");
      });

      this.client.on("message", (topic, payload, packet) => {
        this.onMessage(topic, payload, packet);
      });

      this.client.on("error", (error) => {
        console.error("❌ MQTT Error:", error.message);
      });
    });
  }

  onMessage(topic, payload, packet) {
    // Parse payload
    let message = null;
    try {
      message = JSON.parse(payload);
    } catch {
      message = payload.toString();
    }

    // Build history entry dengan properties
    const entry = {
      timestamp: new Date().toISOString(),
      topic,
      message,
      properties: {
        qos: packet.qos,
        retain: packet.retain,
        dup: packet.dup,
      },
    };

    // Add MQTT 5.0 properties jika ada
    if (packet.properties) {
      if (packet.properties.messageExpiryInterval) {
        entry.properties.messageExpiryInterval = packet.properties.messageExpiryInterval;
      }
      if (packet.properties.userProperties) {
        entry.properties.userProperties = packet.properties.userProperties;
      }
      if (packet.properties.topicAlias) {
        entry.properties.topicAlias = packet.properties.topicAlias;
      }
      if (packet.properties.correlationData) {
        entry.properties.correlationData = packet.properties.correlationData.toString();
      }
    }

    this.messageHistory.push(entry);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }

    // Display message
    this.displayMessage(entry);
  }

  displayMessage(entry) {
    console.log("");
    console.log(`📨 Message from ${entry.topic}`);
    console.log(`⏰ ${entry.timestamp}`);

    // Display properties
    console.log("Properties:");
    console.log(`  QoS: ${entry.properties.qos}`);
    console.log(`  Retain: ${entry.properties.retain}`);
    if (entry.properties.messageExpiryInterval) {
      console.log(`  Expiry: ${entry.properties.messageExpiryInterval}s`);
    }
    if (entry.properties.userProperties) {
      console.log("  User Properties:");
      for (const [key, value] of Object.entries(entry.properties.userProperties)) {
        console.log(`    - ${key}: ${value}`);
      }
    }

    // Display message content
    if (typeof entry.message === "object") {
      console.log("Payload:");
      console.log(JSON.stringify(entry.message, null, 2));
    } else {
      console.log(`Payload: ${entry.message}`);
    }

    console.log("");
    this.showPrompt();
  }

  showPrompt() {
    this.rl.question("mqtt-ctrl> ", (input) => {
      this.handleCommand(input);
    });
  }

  async handleCommand(input) {
    const parts = input.trim().split(" ");
    const command = parts[0];
    const args = parts.slice(1);

    switch (command) {
      case "subscribe":
        this.handleSubscribe(args);
        break;

      case "publish":
        await this.handlePublish(args);
        break;

      case "list-subs":
      case "ls":
        this.handleListSubs();
        break;

      case "history":
        this.handleHistory();
        break;

      case "clear-history":
        this.messageHistory = [];
        console.log("✅ Message history cleared");
        break;

      case "status":
        this.handleStatus();
        break;

      case "help":
      case "h":
        this.showHelp();
        break;

      case "exit":
      case "quit":
      case "q":
        this.disconnect();
        return;

      case "":
        break;

      default:
        console.log(`❌ Unknown command: ${command}`);
        console.log("Type 'help' for available commands");
    }

    this.showPrompt();
  }

  handleSubscribe(args) {
    if (args.length === 0) {
      console.log("❌ Usage: subscribe <topic>");
      console.log("   Example: subscribe medicold/+/telemetry/stream");
      return;
    }

    const topic = args.join(" ");

    if (this.subscriptions.has(topic)) {
      console.log(`⚠️  Already subscribed to: ${topic}`);
      return;
    }

    this.client.subscribe(topic, { qos: 1 }, (error) => {
      if (error) {
        console.log(`❌ Subscribe error: ${error.message}`);
      } else {
        this.subscriptions.add(topic);
        console.log(`✅ Subscribed to: ${topic}`);
        console.log("   Waiting for messages...");
      }
    });
  }

  async handlePublish(args) {
    if (args.length < 2) {
      console.log("❌ Usage: publish <topic> <message> [properties]");
      console.log("   Example: publish medicold/test/data {\"temp\": 25.5}");
      console.log("   Properties can include: expiry=3600 priority=high");
      return;
    }

    const topic = args[0];
    const messageParts = args.slice(1);
    const propertyParts = [];

    while (messageParts.length > 1 && /^[a-zA-Z][\w-]*=/.test(messageParts.at(-1))) {
      propertyParts.unshift(messageParts.pop());
    }

    const messageStr = messageParts.join(" ");

    let message = null;
    try {
      message = JSON.parse(messageStr);
    } catch {
      message = messageStr;
    }

    const options = {
      qos: 1,
      retain: false,
      properties: {
        messageExpiryInterval: 5 * 60, // Default 5 menit
      },
    };

    for (const property of propertyParts) {
      const [key, rawValue] = property.split("=", 2);
      const value = rawValue === "true" ? true : rawValue === "false" ? false : rawValue;

      if (key === "qos") {
        options.qos = Number(value);
      } else if (key === "retain") {
        options.retain = Boolean(value);
      } else if (key === "expiry") {
        options.properties.messageExpiryInterval = Number(value);
      } else if (key === "priority" || key === "source" || key === "correlation-id") {
        options.properties.userProperties = options.properties.userProperties || {};
        options.properties.userProperties[key] = String(value);
      }
    }

    this.client.publish(
      topic,
      typeof message === "string" ? message : JSON.stringify(message),
      options,
      (error) => {
        if (error) {
          console.log(`❌ Publish error: ${error.message}`);
        } else {
          console.log(`✅ Published to ${topic}`);
          console.log(`   Message: ${JSON.stringify(message)}`);
        }
      }
    );
  }

  handleListSubs() {
    if (this.subscriptions.size === 0) {
      console.log("❌ No active subscriptions");
      return;
    }

    console.log(`📋 Active Subscriptions (${this.subscriptions.size}):`);
    let i = 1;
    for (const topic of this.subscriptions) {
      console.log(`  ${i}. ${topic}`);
      i++;
    }
  }

  handleHistory() {
    if (this.messageHistory.length === 0) {
      console.log("❌ No message history");
      return;
    }

    console.log(`📚 Message History (last ${this.messageHistory.length}):`);
    console.log("");

    for (let i = 0; i < this.messageHistory.length; i++) {
      const entry = this.messageHistory[i];
      console.log(`[${i + 1}] ${entry.timestamp} | ${entry.topic}`);
      console.log(`    QoS: ${entry.properties.qos}, Retain: ${entry.properties.retain}`);

      if (entry.properties.userProperties) {
        console.log(`    User Props:`, entry.properties.userProperties);
      }

      if (typeof entry.message === "object") {
        console.log(`    ${JSON.stringify(entry.message)}`);
      } else {
        console.log(`    ${entry.message}`);
      }
      console.log("");
    }
  }

  handleStatus() {
    console.log("📊 Connection Status:");
    console.log(`  Broker: ${BROKER_URL}`);
    console.log(`  Connected: ${this.connected ? "✅ Yes" : "❌ No"}`);
    console.log(`  Client ID: ${this.client?.options.clientId}`);
    console.log(`  Active Subscriptions: ${this.subscriptions.size}`);
    console.log(`  Message History: ${this.messageHistory.length}/${this.maxHistorySize}`);
  }

  showHelp() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║          MQTT Control Tool - Commands Reference                ║
╚════════════════════════════════════════════════════════════════╝

📨 SUBSCRIBE:
  subscribe <topic>
  Example: subscribe medicold/+/telemetry/stream
  Wildcard: + (single level), # (multi level)

📤 PUBLISH:
  publish <topic> <message>
  Example: publish medicold/test/temp {"celsius": 25.5}

📋 MANAGEMENT:
  list-subs (ls)           - List active subscriptions
  history                  - Show last 100 messages
  clear-history            - Clear message history
  status                   - Show connection status

🔧 UTILITY:
  help (h)                 - Show this help
  exit (quit, q)           - Disconnect & exit

📚 EXAMPLES:

  # Subscribe to all fridge telemetry
  > subscribe medicold/+/telemetry/stream

  # Subscribe to all alerts
  > subscribe medicold/+/alerts/stream

  # Subscribe to system status
  > subscribe medicold/system/+

  # Publish test message
  > publish medicold/test/data {"test": true}

  # View message history
  > history

  # Check status
  > status

💡 MQTT 5.0 Features:
  - Message Expiry: Auto-cleanup after interval
  - User Properties: Custom metadata in header
  - Topic Alias: Bandwidth optimization
  - Last Will: Auto-notify on disconnect

📌 TIPS:
  - Use wildcards to monitor patterns
  - View user properties in history for MQTT 5.0 info
  - Message expiry prevents broker memory bloat
  - Correlation-id in user properties link request-response
    `);
  }

  disconnect() {
    console.log("\nDisconnecting...");
    this.client.end(true, () => {
      console.log("✅ Disconnected");
      this.rl.close();
      process.exit(0);
    });
  }
}

// Run tool
const tool = new MQTTControlTool();
tool.start().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
