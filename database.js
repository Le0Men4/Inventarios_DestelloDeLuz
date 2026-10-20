const { createClient } = require('@libsql/client');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://inventariodestello-le0men4.aws-us-east-1.turso.io';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTI1MjcwMjAsImlkIjoiMDFhMTVhZWYtOGMwMS03ZDNmLTg1MTctZjZiZWRkNmI0MjM1Iiwia2lkIjoicWpxYXRPLV9RQ0xkMzhsTTU0blBpR1pZaldPZVBWejl0eXF0Vkc4OGFPNCIsInJpZCI6ImJiNDJmZTdiLWFmMTUtNDNjNS04ZDExLTFmODFkODg0YWYwYiJ9.ln8KIsTz4cplJufMY0g3Vkf1NNDONs34ry8Sd25ldJqC3pA7To3H9i-djBGsKZjDd_YqfR8zvvNcZwWNDM2KCw';

let db = null;

if (TURSO_URL && TURSO_AUTH_TOKEN) {
    console.log('🌐 Conectando a Turso Cloud Database (libSQL)...');
    const client = createClient({
        url: TURSO_URL,
        authToken: TURSO_AUTH_TOKEN
    });

    function normalizeArgs(params, callback) {
        if (typeof params === 'function') {
            return { args: [], cb: params };
        }
        if (Array.isArray(params)) {
            return { args: params.map(v => (v === undefined ? null : v)), cb: callback || (() => {}) };
        }
        if (params !== undefined && params !== null) {
            return { args: [params], cb: callback || (() => {}) };
        }
        return { args: [], cb: callback || (() => {}) };
    }

    db = {
        isTurso: true,
        all(sql, params, callback) {
            const { args, cb } = normalizeArgs(params, callback);
            client.execute({ sql, args })
                .then(res => cb(null, res.rows))
                .catch(err => {
                    console.error('[Turso db.all Error]:', err.message, 'SQL:', sql);
                    cb(err, []);
                });
        },
        get(sql, params, callback) {
            const { args, cb } = normalizeArgs(params, callback);
            client.execute({ sql, args })
                .then(res => cb(null, res.rows.length > 0 ? res.rows[0] : undefined))
                .catch(err => {
                    console.error('[Turso db.get Error]:', err.message, 'SQL:', sql);
                    cb(err, undefined);
                });
        },
        run(sql, params, callback) {
            const { args, cb } = normalizeArgs(params, callback);
            client.execute({ sql, args })
                .then(res => {
                    const ctx = {
                        lastID: Number(res.lastInsertRowid || 0),
                        changes: Number(res.rowsAffected || 0)
                    };
                    cb.call(ctx, null);
                })
                .catch(err => {
                    const msg = (err.message || '').toLowerCase();
                    if (msg.includes('duplicate column') || msg.includes('already exists') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
                        return cb.call({ lastID: 0, changes: 0 }, null);
                    }
                    console.error('[Turso db.run Error]:', err.message, 'SQL:', sql);
                    cb.call({ lastID: 0, changes: 0 }, err);
                });
        },
        prepare(sql, callback) {
            const queue = [];
            let active = false;

            const runNext = () => {
                if (queue.length === 0) {
                    active = false;
                    return;
                }
                active = true;
                const item = queue.shift();
                client.execute({ sql, args: item.args })
                    .then(res => {
                        if (typeof item.cb === 'function') {
                            item.cb.call({
                                lastID: Number(res.lastInsertRowid || 0),
                                changes: Number(res.rowsAffected || 0)
                            }, null);
                        }
                    })
                    .catch(err => {
                        console.error('[Turso stmt Error]:', err.message, 'SQL:', sql);
                        if (typeof item.cb === 'function') {
                            item.cb.call({ lastID: 0, changes: 0 }, err);
                        }
                    })
                    .finally(() => {
                        runNext();
                    });
            };

            const stmtObj = {
                run(...params) {
                    let cb = null;
                    let args = [];
                    if (params.length > 0 && typeof params[params.length - 1] === 'function') {
                        cb = params.pop();
                    }
                    if (params.length === 1 && Array.isArray(params[0])) {
                        args = params[0];
                    } else {
                        args = params;
                    }
                    args = args.map(v => (v === undefined ? null : v));
                    queue.push({ args, cb });
                    if (!active) {
                        runNext();
                    }
                    return stmtObj;
                },
                finalize(cb) {
                    if (typeof cb === 'function') {
                        if (!active && queue.length === 0) {
                            cb(null);
                        } else {
                            const interval = setInterval(() => {
                                if (!active && queue.length === 0) {
                                    clearInterval(interval);
                                    cb(null);
                                }
                            }, 25);
                        }
                    }
                    return stmtObj;
                }
            };

            if (typeof callback === 'function') callback(null, stmtObj);
            return stmtObj;
        },
        serialize(fn) {
            if (typeof fn === 'function') fn();
        },
        exec(sql, callback) {
            client.execute(sql)
                .then(() => callback && callback(null))
                .catch(err => callback && callback(err));
        }
    };
    console.log('✅ Cliente Turso inicializado exitosamente.');
} else {
    console.log('📁 Usando SQLite local (inventario.db)...');
    const dbPath = path.resolve(__dirname, 'inventario.db');
    db = new sqlite3.Database(dbPath);
}

module.exports = db;
