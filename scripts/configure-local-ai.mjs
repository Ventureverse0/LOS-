#!/usr/bin/env node
/**
 * Local-Only AI Endpoint & Custom API Key Setup Utility
 * Usage (Interactive or Flags):
 *   npm run configure:local
 *   npm run configure:local -- --mode custom-openai --url http://127.0.0.1:1234/v1 --model qwen2.5-7b-instruct --key sk-...
 *   npm run configure:local -- --mode ollama --url http://127.0.0.1:11434/v1 --model llama3.2
 *
 * Writes non-secret routing settings to `data/config/provider-routing.json`
 * and writes any custom API key strictly to `data/config/local-secrets.json`
 * (chmod 0600, git-ignored, server-only — never exposed to the browser UI).
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rootDir = process.cwd();
const configDir = path.join(rootDir, "data", "config");
const routingFile = path.join(configDir, "provider-routing.json");
const secretsFile = path.join(configDir, "local-secrets.json");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--mode" && argv[i + 1]) out.mode = argv[++i];
    else if (token === "--url" && argv[i + 1]) out.url = argv[++i];
    else if (token === "--model" && argv[i + 1]) out.model = argv[++i];
    else if (token === "--key" && argv[i + 1]) out.key = argv[++i];
    else if (token === "--slot" && argv[i + 1]) out.slot = argv[++i];
  }
  return out;
}

async function main() {
  fs.mkdirSync(configDir, { recursive: true });
  const existingRouting = fs.existsSync(routingFile)
    ? JSON.parse(fs.readFileSync(routingFile, "utf-8"))
    : {};
  const existingSecrets = fs.existsSync(secretsFile)
    ? JSON.parse(fs.readFileSync(secretsFile, "utf-8"))
    : {};

  const flags = parseArgs(process.argv.slice(2));
  let mode = flags.mode;
  let baseUrl = flags.url;
  let model = flags.model;
  let apiKey = flags.key;
  let slot = flags.slot;

  if (!mode && input.isTTY) {
    const rl = readline.createInterface({ input, output });
    output.write("\n=== StudyOS / LearningOS Local Endpoint & Custom API Key Setup ===\n");
    output.write(
      "Modes: ollama | lmstudio | llamacpp | vllm | custom-openai | gemini | openai | groq | deepseek | anthropic | offline | auto\n\n"
    );
    mode =
      (
        await rl.question(
          `Provider mode [${existingRouting.mode || "custom-openai"}]: `
        )
      ).trim() ||
      existingRouting.mode ||
      "custom-openai";

    const defaultUrl =
      mode === "ollama"
        ? "http://127.0.0.1:11434/v1"
        : mode === "lmstudio"
        ? "http://127.0.0.1:1234/v1"
        : mode === "llamacpp"
        ? "http://127.0.0.1:8080/v1"
        : mode === "vllm"
        ? "http://127.0.0.1:8000/v1"
        : existingRouting.baseUrl || "http://127.0.0.1:1234/v1";

    baseUrl =
      (await rl.question(`Local / Custom Base URL [${defaultUrl}]: `)).trim() ||
      defaultUrl;

    const defaultModel =
      existingRouting.model ||
      (mode === "ollama" ? "llama3.2" : mode === "gemini" ? "gemini-3.8-flash" : "local-model");

    model =
      (await rl.question(`Model ID [${defaultModel}]: `)).trim() || defaultModel;

    apiKey = (
      await rl.question(
        "Custom API Key (stored server-only in data/config/local-secrets.json; press Enter if keyless local): "
      )
    ).trim();
    rl.close();
  }

  const finalMode = mode || existingRouting.mode || "custom-openai";
  const finalSlot =
    slot ||
    (apiKey
      ? finalMode === "gemini"
        ? "GEMINI_API_KEY"
        : "CUSTOM_LLM_API_KEY"
      : existingRouting.credentialSlot || "none");

  const nextRouting = {
    mode: finalMode,
    baseUrl: baseUrl ?? existingRouting.baseUrl ?? "http://127.0.0.1:1234/v1",
    model: model ?? existingRouting.model ?? "local-model",
    credentialSlot: finalSlot,
    timeoutMs: existingRouting.timeoutMs || 30000,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(routingFile, JSON.stringify(nextRouting, null, 2), "utf-8");

  if (apiKey) {
    const targetSecretKey =
      finalSlot === "none" ? "CUSTOM_LLM_API_KEY" : finalSlot;
    const nextSecrets = {
      ...existingSecrets,
      [targetSecretKey]: apiKey,
    };
    fs.writeFileSync(secretsFile, JSON.stringify(nextSecrets, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
  }

  output.write(
    `\nSaved local provider routing -> ${routingFile}\n` +
      `  mode:           ${nextRouting.mode}\n` +
      `  baseUrl:        ${nextRouting.baseUrl || "(provider default)"}\n` +
      `  model:          ${nextRouting.model}\n` +
      `  credentialSlot: ${nextRouting.credentialSlot}${
        apiKey ? ` (saved securely in ${secretsFile})` : ""
      }\n\nStart StudyOS locally with: npm run dev\n`
  );
}

main().catch((err) => {
  console.error("Failed to configure local AI provider:", err);
  process.exit(1);
});
