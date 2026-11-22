import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);

let sqlPromise = null;

function loadSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm'),
    });
  }
  return sqlPromise;
}

class Statement {
  constructor(connection, sql) {
    this.connection = connection;
    this.sql = sql;
    this.stmt = connection.raw.prepare(sql);
  }

  bind(params) {
    this.stmt.reset();
    if (params.length === 0) return;
    if (
      params.length === 1 &&
      params[0] &&
      typeof params[0] === 'object' &&
      !Array.isArray(params[0]) &&
      !(params[0] instanceof Uint8Array)
    ) {
      this.stmt.bind(params[0]);
      return;
    }
    this.stmt.bind(params);
  }

  get(...params) {
    this.bind(params);
    try {
      return this.stmt.step() ? this.stmt.getAsObject() : undefined;
    } finally {
      this.stmt.reset();
    }
  }

  all(...params) {
    this.bind(params);
    const rows = [];
    try {
      while (this.stmt.step()) rows.push(this.stmt.getAsObject());
    } finally {
      this.stmt.reset();
    }
    return rows;
  }

  run(...params) {
    this.bind(params);
    try {
      this.stmt.step();
    } finally {
      this.stmt.reset();
    }
    const changes = this.connection.raw.getRowsModified();
    const result = this.connection.raw.exec('SELECT last_insert_rowid() AS id');
    const lastInsertRowid =
      result.length && result[0].values.length ? Number(result[0].values[0][0]) : 0;
    this.connection.persist();
    return { changes, lastInsertRowid };
  }
}

class Database {
  constructor(file, raw) {
    this.file = file;
    this.raw = raw;
    this.inTransaction = false;
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  exec(sql) {
    const text = String(sql).trim();
    this.raw.run(sql);
    const command = text.toUpperCase();
    if (/^BEGIN\b/.test(command) || /^SAVEPOINT\b/.test(command)) {
      this.inTransaction = true;
    } else if (/^(COMMIT|END|ROLLBACK)\b/.test(command)) {
      this.inTransaction = false;
    }
    this.persist();
  }

  persist() {
    if (this.inTransaction) return;
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, Buffer.from(this.raw.export()));
    fs.renameSync(temporary, this.file);
  }
}

export async function openDatabase(filePath) {
  const SQL = await loadSql();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  let raw;
  if (!fs.existsSync(filePath)) {
    raw = new SQL.Database();
  } else {
    // 文件存在却读不出来 / 是空文件时，绝不能再静默建空库（否则会用空库覆盖原数据）
    const size = fs.statSync(filePath).size;
    if (size === 0) {
      throw new Error(`数据库文件为空：${filePath}（拒绝启动，避免用空库覆盖历史数据，请从备份恢复）`);
    }
    raw = new SQL.Database(new Uint8Array(fs.readFileSync(filePath)));
  }

  return new Database(filePath, raw);
}
