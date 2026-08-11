#!/usr/bin/env node
import { parseArgs } from './forge/args.mjs';
import { HELP_TEXT, runCommand } from './forge/commands.mjs';
import { usageError } from './forge/errors.mjs';
import { errorReport, printReport, successReport } from './forge/report.mjs';

import process from "node:process";

var VERSION = "0.1.0";
async function main(argv) {
  let command = null;
  let jsonMode = false;
  try {
    const parsed = parseArgs(argv);
    jsonMode = Boolean(parsed.options.json);
    [command] = parsed.positional;
    if (parsed.options.help) {
      if (jsonMode) {
        printReport(successReport("help", { usage: HELP_TEXT, commands: commandNames() }), true);
      } else {
        process.stdout.write(HELP_TEXT);
      }
      return;
    }
    if (parsed.options.version) {
      if (jsonMode) printReport(successReport("version", { version: VERSION }), true);
      else process.stdout.write(`${VERSION}
`);
      return;
    }
    if (!command) throw usageError("缺少命令；使用 --help 查看用法");
    const report = await runCommand(command, parsed.positional.slice(1), parsed.options);
    printReport(report, jsonMode);
    process.exitCode = report.code;
  } catch (error) {
    const report = errorReport(command, error);
    printReport(report, jsonMode);
    process.exitCode = report.code;
  }
}
function commandNames() {
  return [
    "init",
    "inspect",
    "unpack",
    "validate",
    "build",
    "pack",
    "diff",
    "roundtrip",
    "state",
    "doctor"
  ];
}
await main(process.argv.slice(2));
