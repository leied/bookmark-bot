/**
 * Error hierarchy mirroring the Rust `Error` / `InteractionError` enums: every
 * error carries the HTTP status the worker should answer the request with.
 */
export abstract class BotError extends Error {
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class EnvironmentVariableNotFound extends BotError {
  readonly status = 500;
  constructor(key: string) {
    super(`Environment variable '${key}' not found.`);
  }
}

export class HeaderNotFound extends BotError {
  readonly status = 400;
  constructor(key: string) {
    super(`Header '${key}' not found.`);
  }
}

export class InvalidPayload extends BotError {
  readonly status = 400;
  constructor(reason: string) {
    super(`Invalid payload provided: ${reason}.`);
  }
}

export class VerificationFailed extends BotError {
  readonly status = 401;
  constructor(reason: string) {
    super(`Verification failed: ${reason}.`);
  }
}

export class UnknownCommand extends BotError {
  readonly status = 400;
  constructor(name: string) {
    super(`Command not found: ${name}.`);
  }
}

/** Anything that went wrong while running a command or component handler. */
export class InteractionFailed extends BotError {
  readonly status = 500;
  constructor(message: string, readonly cause?: unknown) {
    super(`Interaction failed: ${message}`);
  }
}

export class UpstreamError extends BotError {
  readonly status = 502;
  constructor(what: string) {
    super(`Error communicating with ${what}.`);
  }
}

export function statusOf(error: unknown): number {
  return error instanceof BotError ? error.status : 500;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
