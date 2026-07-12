const path = require("node:path");

process.env.QA_TASK_ID = "task-015-canvas-batch-controls-browser-qa";
process.env.QA_SCENARIO = "batch controls and zoom lod";
process.env.QA_OUT_DIR = process.env.QA_OUT_DIR || path.resolve(__dirname, "../../../../output/playwright/task-015-canvas-batch-controls");

require("../task-013-prompt-split-canvas/browser-smoke.cjs");
