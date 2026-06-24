// errors.js — TYPEDE fejl med stabil kode + område, så en fremtidig fejl er nem at finde.
export class AppError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'AppError';
    this.code = code;      // stabil kode, fx 'DB_OPEN'
    this.cause = cause;    // den underliggende fejl
  }
}
export const Err = {
  db:     (m, c) => new AppError('DB', m, c),
  file:   (m, c) => new AppError('FILE', m, c),
  import: (m, c) => new AppError('IMPORT', m, c),
  export: (m, c) => new AppError('EXPORT', m, c),
};
