"use strict";

const SEVERITY_RANK = {
  NORMAL: 0,
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3,
  EMERGENCY: 4,
};

function highestSeverity(levels) {
  return levels.reduce((highest, level) => {
    return SEVERITY_RANK[level] > SEVERITY_RANK[highest] ? level : highest;
  }, "NORMAL");
}

function isAtLeast(level, minLevel = "INFO") {
  return SEVERITY_RANK[level] >= SEVERITY_RANK[minLevel];
}

module.exports = {
  SEVERITY_RANK,
  highestSeverity,
  isAtLeast,
};
