export var ExitCode = Object.freeze({
  OK: 0,
  USAGE: 2,
  INPUT: 3,
  VALIDATION: 4,
  CONFLICT: 5,
  UNSUPPORTED: 6,
  INTEGRITY: 7,
  INTERNAL: 8
});
var ForgeError = class extends Error {
  constructor(kind, message, code = ExitCode.INTERNAL, details = void 0) {
    super(message);
    this.name = "ForgeError";
    this.kind = kind;
    this.code = code;
    this.details = details;
  }
};
export function usageError(message, details) {
  return new ForgeError("usage", message, ExitCode.USAGE, details);
}
export function inputError(message, details) {
  return new ForgeError("input", message, ExitCode.INPUT, details);
}
export function validationError(message, details) {
  return new ForgeError("validation", message, ExitCode.VALIDATION, details);
}
export function conflictError(message, details) {
  return new ForgeError("conflict", message, ExitCode.CONFLICT, details);
}
export function unsupportedError(message, details) {
  return new ForgeError("unsupported", message, ExitCode.UNSUPPORTED, details);
}
export function integrityError(message, details) {
  return new ForgeError("integrity", message, ExitCode.INTEGRITY, details);
}
export function normalizeError(error) {
  if (error instanceof ForgeError) return error;
  if (error?.code === "ENOENT") {
    return inputError(`找不到文件或目录: ${error.path ?? ""}`.trim(), {
      cause: error.message
    });
  }
  if (error instanceof SyntaxError) {
    return inputError(`输入内容无法解析: ${error.message}`);
  }
  return new ForgeError("internal", error?.message ?? String(error), ExitCode.INTERNAL, {
    cause: error?.stack
  });
}
