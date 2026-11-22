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
    const command = text.toUpperCase();
    try {
      this.raw.run(sql);
    } catch (err) {
      // ROLLBACK/COMMIT 本身失败时（例如 SQLite 已因 IO/磁盘错误自动回滚），
      // 必须同步复位事务标记，否则后续所有写操作都会「静默不落盘」。
      if (/^(COMMIT|END|ROLLBACK)\b/.test(command)) this.inTransaction = false;
      throw err;
    }
    if (/^BEGIN\b/.test(command) || /^SAVEPOINT\b/.test(command)) {
      this.inTransaction = true;
    } else if (/^(COMMIT|END|ROLLBACK)\b/.test(command)) {
      this.inTransaction = false;
    }
    this.persist();
  }

  persist() {
    if (this.inTransaction) {
      // 事务期间跳过落盘是设计行为；但若长期卡在事务里说明状态异常，需要告警
      this.skippedPersists = (this.skippedPersists || 0) + 1;
      if (this.skippedPersists === 500) {
        console.warn('[sqlite] 已连续跳过 500 次落盘（事务标记可能异常卡住），请检查');
      }
      return;
    }
    this.skippedPersists = 0;
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const temporary = `${this.file}.tmp`;
    const payload = Buffer.from(this.raw.export());
    // 写临时文件 → fsync → 原子 rename → fsync 目录，保证断电后不会出现半写/空文件
    const fd = fs.openSync(temporary, 'w');
    try {
      fs.writeFileSync(fd, payload);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, this.file);
    try {
      const dirFd = fs.openSync(dir, 'r');
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // 某些文件系统不支持目录 fsync，忽略
    }
  }
}

/**
 * 单实例锁：同一份数据库文件只允许一个进程写，避免两个进程各自持内存副本互相覆盖。
 * 进程正常退出时会删除锁文件；异常退出留下的陈旧锁会校验 PID 后接管。
 */
function acquireInstanceLock(filePath) {
  const lockFile = `${filePath}.lock`;
  const writeLock = () => {
    const fd = fs.openSync(lockFile, 'w');
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
  };
  try {
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    let holderPid = 0;
    try {
      holderPid = Number(fs.readFileSync(lockFile, 'utf8').trim());
    } catch {
      holderPid = 0;
    }
    let alive = false;
    if (holderPid > 0 && holderPid !== process.pid) {
      try {
        process.kill(holderPid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) {
      throw new Error(`数据库已被另一个进程占用（pid ${holderPid}），拒绝启动以避免数据被覆盖`);
    }
    writeLock(); // 接管陈旧锁
  }
  const release = () => {
    try {
      if (Number(fs.readFileSync(lockFile, 'utf8').trim()) === process.pid) fs.unlinkSync(lockFile);
    } catch {
      // ignore
    }
  };
  process.on('exit', release);
  process.on('SIGTERM', () => {
    release();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    release();
    process.exit(0);
  });
}

export async function openDatabase(filePath) {
  const SQL = await loadSql();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  // 清理上次崩溃留下的临时文件（每次写入最多残留一份全库大小，长期会占满磁盘）
  try {
    fs.rmSync(`${filePath}.tmp`, { force: true });
  } catch {
    // ignore
  }

  acquireInstanceLock(filePath);

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
    // 完整性校验：损坏文件直接拒绝启动，并把坏文件改名保留，绝不带着坏库跑
    try {
      const check = raw.exec('PRAGMA integrity_check');
      const verdict = check.length && check[0].values.length ? String(check[0].values[0][0]) : 'unknown';
      if (verdict.toLowerCase() !== 'ok') {
        throw new Error(`完整性校验失败：${verdict}`);
      }
    } catch (err) {
      const corruptPath = `${filePath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(filePath, corruptPath);
      } catch {
        // ignore
      }
      throw new Error(
        `数据库文件损坏（${err.message}），已备份为 ${corruptPath}。请放入最近一次备份后重启服务`
      );
    }
  }

  return new Database(filePath, raw);
}
