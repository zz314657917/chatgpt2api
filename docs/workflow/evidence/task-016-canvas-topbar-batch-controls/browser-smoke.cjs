const path = require("node:path");

process.env.QA_TASK_ID = "task-016-canvas-topbar-batch-controls-browser-qa";
process.env.QA_SCENARIO = "topbar batch controls responsive";
process.env.QA_OUT_DIR = process.env.QA_OUT_DIR || path.resolve(__dirname, "../../../../output/playwright/task-016-canvas-topbar-batch-controls");

require("../task-013-prompt-split-canvas/browser-smoke.cjs");
