#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "https://chuly0v0.github.io/schedule-maker/";
const MAX_ROWS = 200;

function fail(message) {
  throw new Error(message);
}

function cleanString(value, field, { required = false, max = 200 } = {}) {
  if (typeof value !== "string") fail(`${field} 必须是字符串`);
  const cleaned = value.replace(/\s*\r?\n\s*/g, " ").trim();
  if (required && !cleaned) fail(`${field} 不能为空`);
  if (cleaned.length > max) fail(`${field} 不能超过 ${max} 个字符`);
  return cleaned;
}

function normalizeSchedule(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("输入必须是一个 JSON 对象");
  if (!Array.isArray(input.rows) || input.rows.length === 0) fail("rows 必须是非空数组");
  if (input.rows.length > MAX_ROWS) fail(`rows 不能超过 ${MAX_ROWS} 行`);

  const schedule = {
    title: cleanString(input.title, "title", { required: true, max: 60 }),
    dateRange: cleanString(input.dateRange, "dateRange", { max: 40 }),
    description: cleanString(input.description, "description", { max: 100 }),
    rows: input.rows.map((item, index) => {
      const prefix = `rows[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) fail(`${prefix} 必须是对象`);
      if (typeof item.highlight !== "boolean") fail(`${prefix}.highlight 必须是布尔值`);
      return {
        date: cleanString(item.date, `${prefix}.date`, { required: true, max: 24 }),
        title: cleanString(item.title, `${prefix}.title`, { required: true, max: 60 }),
        label: cleanString(item.label, `${prefix}.label`, { max: 40 }),
        content: cleanString(item.content, `${prefix}.content`, { max: 240 }),
        highlight: item.highlight
      };
    })
  };

  let cardCount = 0;
  let previousKey = "";
  let groupHighlight = false;
  schedule.rows.forEach((item, index) => {
    const key = `${item.date}\u0000${item.title}`;
    if (key !== previousKey) {
      cardCount += 1;
      previousKey = key;
      groupHighlight = item.highlight;
    } else if (item.highlight !== groupHighlight) {
      fail(`rows[${index}].highlight 与同一卡片的其他行不一致`);
    }
  });

  return { schedule, cardCount };
}

function createEditUrl(schedule, baseUrl = DEFAULT_BASE_URL) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    fail("base URL 无效");
  }
  if (!/^https?:$/.test(url.protocol) && url.protocol !== "file:") fail("base URL 必须使用 http、https 或 file");
  const payload = Buffer.from(JSON.stringify(schedule), "utf8").toString("base64url");
  url.hash = `schedule=${payload}`;
  return url.toString();
}

function verifyEditUrl(editUrl, schedule) {
  let url;
  try {
    url = new URL(editUrl);
  } catch {
    fail("生成的编辑链接无效");
  }
  const prefix = "#schedule=";
  if (!url.hash.startsWith(prefix)) fail("生成的编辑链接缺少 schedule 数据");
  const payload = url.hash.slice(prefix.length);
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (error) {
    fail(`生成的编辑链接无法还原日程：${error.message}`);
  }
  if (JSON.stringify(decoded) !== JSON.stringify(schedule)) {
    fail("生成的编辑链接未能完整还原日程");
  }
}

function parseArgs(argv) {
  let inputPath = "";
  let baseUrl = DEFAULT_BASE_URL;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      baseUrl = argv[index + 1] || fail("--base-url 缺少值");
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      return { help: true, inputPath, baseUrl };
    } else if (!inputPath) {
      inputPath = arg;
    } else {
      fail(`无法识别参数：${arg}`);
    }
  }
  return { help: false, inputPath, baseUrl };
}

function readInput(inputPath) {
  const text = !inputPath || inputPath === "-"
    ? fs.readFileSync(0, "utf8")
    : fs.readFileSync(inputPath, "utf8");
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    fail(`无法解析 JSON：${error.message}`);
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write("Usage: node scripts/prepare_schedule.mjs <input.json|-> [--base-url URL]\n");
      return;
    }
    const { schedule, cardCount } = normalizeSchedule(readInput(args.inputPath));
    const editUrl = createEditUrl(schedule, args.baseUrl);
    verifyEditUrl(editUrl, schedule);
    process.stdout.write(`${JSON.stringify({
      schedule,
      rowCount: schedule.rows.length,
      cardCount,
      editUrl,
      editMarkdown: `[在线编辑日程](${editUrl})`
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`schedule-maker: ${error.message}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) main();

export { normalizeSchedule, createEditUrl, verifyEditUrl };
