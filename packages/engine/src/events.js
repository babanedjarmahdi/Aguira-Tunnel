import { EventEmitter } from 'events';

// Structured pipeline events. The Engine emits these; any consumer (CLI, REST
// API, future UI) subscribes without the Engine knowing about it.
export function createEmitter() {
  return new EventEmitter();
}

// level: 'info' | 'error' | 'warn'
export function emitLog(emitter, level, message) {
  emitter.emit('log', { level, message });
}

export function emitProgress(emitter, stage, message, data) {
  emitter.emit('stage:progress', { stage, message, ...data });
}
