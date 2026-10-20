const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Función global para fecha y hora fija en CDMX (America/Mexico_City)
function getFechaHoraCDMX() {
    const ahora = new Date();
    // Formato ISO local en zona horaria America/Mexico_City: YYYY-MM-DD HH:mm:ss
    const partes = new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(ahora);

    const p = {};
    partes.forEach(part => { p[part.type] = part.value; });
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function getFechaCDMX() {
    return getFechaHoraCDMX().slice(0, 10);
}

const fs = require('fs');
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const db = require('./database');

db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");
    db.run(`CREATE TABLE IF NOT EXISTS categorias_insumos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        padre_id INTEGER,
        FOREIGN KEY(padre_id) REFERENCES categorias_insumos(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS insumos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        categoria_id INTEGER,
        unidad TEXT NOT NULL,
        stock REAL DEFAULT 0,
        es_generico INTEGER DEFAULT 0,
        FOREIGN KEY(categoria_id) REFERENCES categorias_insumos(id) ON DELETE SET NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS categorias_productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        padre_id INTEGER,
        FOREIGN KEY(padre_id) REFERENCES categorias_productos(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS recetas_categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        categoria_id INTEGER,
        insumo_id INTEGER,
        cantidad_requerida REAL NOT NULL,
        FOREIGN KEY(categoria_id) REFERENCES categorias_productos(id) ON DELETE CASCADE,
        FOREIGN KEY(insumo_id) REFERENCES insumos(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS productos_terminados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        categoria_id INTEGER,
        stock REAL DEFAULT 0,
        usa_receta_propia INTEGER DEFAULT 0,
        tipo_producto TEXT DEFAULT 'estandar',
        fases_json TEXT DEFAULT '[]',
        FOREIGN KEY(categoria_id) REFERENCES categorias_productos(id) ON DELETE SET NULL
    )`);

    db.run(`ALTER TABLE productos_terminados ADD COLUMN tipo_producto TEXT DEFAULT 'estandar'`, () => {});
    db.run(`ALTER TABLE productos_terminados ADD COLUMN fases_json TEXT DEFAULT '[]'`, () => {});
    db.run(`ALTER TABLE productos_terminados ADD COLUMN activa INTEGER DEFAULT 1`, () => {});
    db.run(`ALTER TABLE categorias_productos ADD COLUMN activa INTEGER DEFAULT 1`, () => {});
    db.run(`ALTER TABLE productos_terminados ADD COLUMN es_temporada INTEGER DEFAULT 0`, () => {});

    // Tabla de Configuración (PIN de 6 dígitos del taller)
    db.run(`CREATE TABLE IF NOT EXISTS configuracion (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`);
    db.run(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('master_pin', '123456')`);

    db.run(`CREATE TABLE IF NOT EXISTS plan_diario (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT UNIQUE NOT NULL,
        notas_advertencia TEXT DEFAULT '',
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS plan_diario_tareas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        operador TEXT NOT NULL,
        tarea TEXT NOT NULL,
        cantidad REAL DEFAULT NULL,
        unidad TEXT DEFAULT '',
        producto_id INTEGER DEFAULT NULL,
        nota TEXT DEFAULT '',
        completada INTEGER DEFAULT 0,
        completada_en TEXT DEFAULT NULL,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`ALTER TABLE plan_diario_tareas ADD COLUMN nota TEXT DEFAULT ''`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS recetas_productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER,
        insumo_id INTEGER,
        cantidad_requerida REAL NOT NULL,
        FOREIGN KEY(producto_id) REFERENCES productos_terminados(id) ON DELETE CASCADE,
        FOREIGN KEY(insumo_id) REFERENCES insumos(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS mapeo_esencias_productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER,
        insumo_generico_id INTEGER,
        insumo_especifico_id INTEGER,
        FOREIGN KEY(producto_id) REFERENCES productos_terminados(id) ON DELETE CASCADE,
        FOREIGN KEY(insumo_generico_id) REFERENCES insumos(id) ON DELETE CASCADE,
        FOREIGN KEY(insumo_especifico_id) REFERENCES insumos(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS fichas_tecnicas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER UNIQUE,
        calibre_pabilo TEXT,
        temperatura_vertido TEXT,
        tecnica_decorado TEXT,
        desglose_gramos TEXT,
        notas_comentarios TEXT,
        foto TEXT,
        FOREIGN KEY(producto_id) REFERENCES productos_terminados(id) ON DELETE CASCADE
    )`);
    db.run(`ALTER TABLE fichas_tecnicas ADD COLUMN foto TEXT`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS operadores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        activo INTEGER DEFAULT 1,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS historial_insumos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        insumo_id INTEGER,
        cantidad REAL NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'ENTRADA',
        codigo_lote TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (insumo_id) REFERENCES insumos(id) ON DELETE CASCADE
    )`);
    db.run(`ALTER TABLE historial_insumos ADD COLUMN tipo TEXT DEFAULT 'ENTRADA'`, () => {});
    db.run(`ALTER TABLE historial_insumos ADD COLUMN codigo_lote TEXT`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS historial_productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER,
        cantidad REAL NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'ENTRADA',
        origen TEXT DEFAULT 'MANUAL',
        codigo_lote TEXT,
        operador TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos_terminados(id) ON DELETE CASCADE
    )`);
    db.run(`ALTER TABLE historial_productos ADD COLUMN tipo TEXT DEFAULT 'ENTRADA'`, () => {});
    db.run(`ALTER TABLE historial_productos ADD COLUMN origen TEXT DEFAULT 'MANUAL'`, () => {});
    db.run(`ALTER TABLE historial_productos ADD COLUMN codigo_lote TEXT`, () => {});
    db.run(`ALTER TABLE historial_productos ADD COLUMN operador TEXT`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS historial_produccion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_lote TEXT,
        operador TEXT,
        fecha_produccion TEXT,
        detalle TEXT,
        resumen TEXT,
        insumos_json TEXT,
        productos_json TEXT,
        detalles_json TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`ALTER TABLE historial_produccion ADD COLUMN codigo_lote TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN operador TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN fecha_produccion TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN detalle TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN resumen TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN insumos_json TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN productos_json TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN detalles_json TEXT`, () => {});
});

// --- API CATEGORÍAS INSUMOS ---
app.get('/api/categorias-insumos', (req, res) => {
    const query = `SELECT c.*, p.nombre as padre_nombre, COALESCE(c.activa, 1) as activa FROM categorias_insumos c LEFT JOIN categorias_insumos p ON c.padre_id = p.id`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/categorias-insumos', (req, res) => {
    const { nombre, padre_id } = req.body;
    db.run(`INSERT INTO categorias_insumos (nombre, padre_id) VALUES (?, ?)`, [nombre, padre_id || null], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, nombre, padre_id });
    });
});

app.put('/api/categorias-insumos/:id', (req, res) => {
    const { nombre, padre_id } = req.body;
    db.run(`UPDATE categorias_insumos SET nombre = ?, padre_id = ? WHERE id = ?`, [nombre, padre_id || null, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.patch('/api/categorias-insumos/:id/toggle-activa', (req, res) => {
    const catId = req.params.id;
    db.get('SELECT activa FROM categorias_insumos WHERE id = ?', [catId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Categoría no encontrada' });
        const nuevoEstado = (row.activa === 1 || row.activa === null) ? 0 : 1;
        db.run('UPDATE categorias_insumos SET activa = ? WHERE id = ?', [nuevoEstado, catId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            db.run('UPDATE categorias_insumos SET activa = ? WHERE padre_id = ?', [nuevoEstado, catId], () => {
                res.json({ success: true, activa: nuevoEstado });
            });
        });
    });
});

app.delete('/api/categorias-insumos/:id', (req, res) => {
    db.run(`DELETE FROM categorias_insumos WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- API AUTENTICACIÓN / PIN DEL TALLER ---
app.post('/api/auth/verificar-pin', (req, res) => {
    const { pin } = req.body;
    db.get(`SELECT valor FROM configuracion WHERE clave = 'master_pin'`, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const pinCorrecto = process.env.APP_PIN ? String(process.env.APP_PIN).trim() : (row ? String(row.valor).trim() : '123456');
        if (String(pin).trim() === pinCorrecto) {
            res.json({ success: true, valido: true });
        } else {
            res.status(401).json({ success: false, error: 'PIN incorrecto' });
        }
    });
});

app.post('/api/auth/cambiar-pin', (req, res) => {
    const { pin_actual, pin_nuevo } = req.body;
    if (!pin_nuevo || String(pin_nuevo).length !== 6 || !/^\d{6}$/.test(pin_nuevo)) {
        return res.status(400).json({ error: 'El nuevo PIN debe contener exactamente 6 dígitos numéricos' });
    }
    db.get(`SELECT valor FROM configuracion WHERE clave = 'master_pin'`, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const pinCorrecto = process.env.APP_PIN ? String(process.env.APP_PIN).trim() : (row ? String(row.valor).trim() : '123456');
        if (String(pin_actual).trim() !== pinCorrecto) {
            return res.status(401).json({ error: 'El PIN actual es incorrecto' });
        }
        db.run(`UPDATE configuracion SET valor = ? WHERE clave = 'master_pin'`, [String(pin_nuevo)], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true, mensaje: 'PIN actualizado exitosamente' });
        });
    });
});

// --- API INSUMOS ---
app.get('/api/insumos', (req, res) => {
    const categoria_id = req.query.categoria_id;
    let query = `SELECT i.*, c.nombre as categoria, cp.nombre as categoria_padre, COALESCE(c.activa, 1) as categoria_activa, COALESCE(cp.activa, 1) as categoria_padre_activa FROM insumos i 
                 LEFT JOIN categorias_insumos c ON i.categoria_id = c.id 
                 LEFT JOIN categorias_insumos cp ON c.padre_id = cp.id`;
    let params = [];
    if (categoria_id) {
        query += ` WHERE i.categoria_id = ? OR c.padre_id = ?`;
        params = [categoria_id, categoria_id];
    }
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/insumos/:id', (req, res) => {
    db.get('SELECT * FROM insumos WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Insumo no encontrado' });
        res.json(row);
    });
});

app.post('/api/insumos', (req, res) => {
    const { nombre, categoria_id, unidad, stock, es_generico, es_temporada, activa } = req.body;
    const initialStock = parseFloat(stock) || 0;
    db.run(`INSERT INTO insumos (nombre, categoria_id, unidad, stock, es_generico, es_temporada, activa) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [nombre, categoria_id, unidad, initialStock, es_generico ? 1 : 0, es_temporada ? 1 : 0, activa !== undefined ? (activa ? 1 : 0) : 1], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const insumoId = this.lastID;
            if (initialStock > 0) {
                db.run(`INSERT INTO historial_insumos (insumo_id, cantidad, tipo, codigo_lote, fecha) VALUES (?, ?, 'ENTRADA', 'STOCK_INICIAL', getFechaHoraCDMX())`, [insumoId, initialStock], () => {});
            }
            res.json({ id: insumoId });
        });
});

app.put('/api/insumos/:id', (req, res) => {
    const { nombre, categoria_id, unidad, stock, es_generico, es_temporada, activa } = req.body;
    db.run(`UPDATE insumos SET nombre = ?, categoria_id = ?, unidad = ?, stock = ?, es_generico = ?, es_temporada = ?, activa = ? WHERE id = ?`,
        [nombre, categoria_id, unidad, stock, es_generico ? 1 : 0, es_temporada ? 1 : 0, activa !== undefined ? (activa ? 1 : 0) : 1, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.patch('/api/insumos/:id/stock', (req, res) => {
    const { cantidad } = req.body;
    const numCant = parseFloat(cantidad);
    if (isNaN(numCant) || numCant === 0) return res.status(400).json({ error: "Cantidad inválida" });

    db.serialize(() => {
        db.run(`UPDATE insumos SET stock = stock + ? WHERE id = ?`, [numCant, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`INSERT INTO historial_insumos (insumo_id, cantidad, tipo, codigo_lote, fecha) VALUES (?, ?, ?, 'MANUAL', getFechaHoraCDMX())`, 
                [req.params.id, Math.abs(numCant), numCant > 0 ? 'ENTRADA' : 'RESTA'], () => {
                res.json({ success: true });
            });
        });
    });
});

app.patch('/api/insumos/:id/toggle-activa', (req, res) => {
    const insumoId = req.params.id;
    db.get('SELECT activa, es_temporada FROM insumos WHERE id = ?', [insumoId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Insumo no encontrado' });
        const nuevoEstado = (row.activa === 1 || row.activa === null) ? 0 : 1;
        db.run('UPDATE insumos SET activa = ?, es_temporada = 1 WHERE id = ?', [nuevoEstado, insumoId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true, activa: nuevoEstado });
        });
    });
});

app.delete('/api/insumos/:id', (req, res) => {
    db.run(`DELETE FROM insumos WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- API HISTORIAL INSUMOS ---
app.get('/api/historial-insumos', (req, res) => {
    db.all(`SELECT h.*, i.nombre as insumo_nombre, i.unidad FROM historial_insumos h JOIN insumos i ON h.insumo_id = i.id ORDER BY h.fecha DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/historial-insumos/:id', (req, res) => {
    db.get(`SELECT * FROM historial_insumos WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Movimiento no encontrado" });

        db.serialize(() => {
            // Revertir stock según sea entrada o resta/salida
            const delta = (row.tipo === 'ENTRADA') ? -Math.abs(row.cantidad) : Math.abs(row.cantidad);
            db.run(`UPDATE insumos SET stock = stock + ? WHERE id = ?`, [delta, row.insumo_id], () => {
                db.run(`DELETE FROM historial_insumos WHERE id = ?`, [req.params.id], () => {
                    res.json({ success: true });
                });
            });
        });
    });
});

// --- API CATEGORÍAS PRODUCTOS & RECETAS BASE ---
app.get('/api/categorias-productos', (req, res) => {
    const query = `SELECT c.*, p.nombre as padre_nombre FROM categorias_productos c LEFT JOIN categorias_productos p ON c.padre_id = p.id`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/categorias-productos', (req, res) => {
    const { nombre, padre_id, receta } = req.body;
    db.serialize(() => {
        db.run(`INSERT INTO categorias_productos (nombre, padre_id) VALUES (?, ?)`, [nombre, padre_id || null], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const catId = this.lastID;
            if (receta && receta.length > 0) {
                const stmt = db.prepare(`INSERT INTO recetas_categorias (categoria_id, insumo_id, cantidad_requerida) VALUES (?, ?, ?)`);
                receta.forEach(r => stmt.run(catId, r.insumo_id, r.cantidad_requerida));
                stmt.finalize();
            }
            res.json({ id: catId });
        });
    });
});

app.put('/api/categorias-productos/:id', (req, res) => {
    const catId = req.params.id;
    const { nombre, padre_id, receta } = req.body;
    db.serialize(() => {
        db.run(`UPDATE categorias_productos SET nombre = ?, padre_id = ? WHERE id = ?`, [nombre, padre_id || null, catId], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            if (receta !== undefined) {
                db.run(`DELETE FROM recetas_categorias WHERE categoria_id = ?`, [catId], () => {
                    if (receta && receta.length > 0) {
                        const stmt = db.prepare(`INSERT INTO recetas_categorias (categoria_id, insumo_id, cantidad_requerida) VALUES (?, ?, ?)`);
                        receta.forEach(r => stmt.run(catId, r.insumo_id, r.cantidad_requerida));
                        stmt.finalize();
                    }
                    res.json({ success: true });
                });
            } else {
                res.json({ success: true });
            }
        });
    });
});

app.patch('/api/categorias-productos/:id/toggle-activa', (req, res) => {
    const catId = req.params.id;
    db.get(`SELECT activa FROM categorias_productos WHERE id = ?`, [catId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Categoría no encontrada" });
        const nuevoEstado = (row.activa === 1 || row.activa === null) ? 0 : 1;
        db.run(`UPDATE categorias_productos SET activa = ? WHERE id = ?`, [nuevoEstado, catId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            db.run(`UPDATE categorias_productos SET activa = ? WHERE padre_id = ?`, [nuevoEstado, catId], () => {
                res.json({ success: true, activa: nuevoEstado });
            });
        });
    });
});

app.delete('/api/categorias-productos/:id', (req, res) => {
    db.run(`DELETE FROM categorias_productos WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/recetas-categoria/:id', (req, res) => {
    db.all(`SELECT insumo_id, cantidad_requerida FROM recetas_categorias WHERE categoria_id = ?`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- API PRODUCTOS TERMINADOS & FÓRMULAS ---
app.get('/api/productos-terminados', (req, res) => {
    const categoria_id = req.query.categoria_id;
    let query = `SELECT p.*, c.nombre as categoria, cp.nombre as categoria_padre, COALESCE(c.activa, 1) as categoria_activa, COALESCE(cp.activa, 1) as categoria_padre_activa FROM productos_terminados p 
                 LEFT JOIN categorias_productos c ON p.categoria_id = c.id 
                 LEFT JOIN categorias_productos cp ON c.padre_id = cp.id`;
    let params = [];
    if (categoria_id) {
        query += ` WHERE p.categoria_id = ? OR c.padre_id = ?`;
        params = [categoria_id, categoria_id];
    }
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/productos-terminados/:id', (req, res) => {
    const prodId = req.params.id;
    db.get(`SELECT p.*, c.nombre as categoria, cp.nombre as categoria_padre FROM productos_terminados p 
             LEFT JOIN categorias_productos c ON p.categoria_id = c.id 
             LEFT JOIN categorias_productos cp ON c.padre_id = cp.id 
             WHERE p.id = ?`, [prodId], (err, prod) => {
        if (err || !prod) return res.status(404).json({ error: "Producto no encontrado" });

        db.all(`SELECT r.*, i.nombre as insumo_nombre, i.unidad FROM recetas_productos r 
                 JOIN insumos i ON r.insumo_id = i.id 
                 WHERE r.producto_id = ?`, [prodId], (errR, receta) => {
            db.all(`SELECT * FROM mapeo_esencias_productos WHERE producto_id = ?`, [prodId], (errM, mapeos) => {
                let fases = [];
                try {
                    fases = typeof prod.fases_json === 'string' ? JSON.parse(prod.fases_json) : (prod.fases_json || []);
                } catch(e) {
                    fases = [];
                }
                res.json({
                    ...prod,
                    fases,
                    receta: receta || [],
                    mapeos: mapeos || []
                });
            });
        });
    });
});

app.patch('/api/productos-terminados/:id/fases', (req, res) => {
    const prodId = req.params.id;
    const { fases_json, tipo_producto } = req.body;
    db.run(`UPDATE productos_terminados SET fases_json = ?, tipo_producto = ? WHERE id = ?`,
        [typeof fases_json === 'string' ? fases_json : JSON.stringify(fases_json || []), tipo_producto || 'postre', prodId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.post('/api/productos-terminados', (req, res) => {
    const { nombre, categoria_id, usa_receta_propia, tipo_producto, fases_json, receta, mapeo_genericos, es_temporada, activa } = req.body;
    db.serialize(() => {
        db.run(`INSERT INTO productos_terminados (nombre, categoria_id, stock, usa_receta_propia, tipo_producto, fases_json, es_temporada, activa) VALUES (?, ?, 0, ?, ?, ?, ?, ?)`,
            [nombre, categoria_id, usa_receta_propia ? 1 : 0, tipo_producto || 'estandar', typeof fases_json === 'string' ? fases_json : JSON.stringify(fases_json || []), es_temporada ? 1 : 0, activa !== undefined ? (activa ? 1 : 0) : 1], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                const prodId = this.lastID;

                if (receta && receta.length > 0) {
                    const stmt = db.prepare(`INSERT INTO recetas_productos (producto_id, insumo_id, cantidad_requerida) VALUES (?, ?, ?)`);
                    receta.forEach(r => stmt.run(prodId, r.insumo_id, r.cantidad_requerida));
                    stmt.finalize();
                }

                if (mapeo_genericos && mapeo_genericos.length > 0) {
                    const stmtM = db.prepare(`INSERT INTO mapeo_esencias_productos (producto_id, insumo_generico_id, insumo_especifico_id) VALUES (?, ?, ?)`);
                    mapeo_genericos.forEach(m => stmtM.run(prodId, m.insumo_generico_id, m.insumo_especifico_id));
                    stmtM.finalize();
                }

                res.json({ id: prodId });
            });
    });
});

app.put('/api/productos-terminados/:id', (req, res) => {
    const prodId = req.params.id;
    const { nombre, categoria_id, usa_receta_propia, tipo_producto, fases_json, receta, mapeo_genericos, es_temporada, activa } = req.body;
    db.serialize(() => {
        db.run(`UPDATE productos_terminados SET nombre = ?, categoria_id = ?, usa_receta_propia = ?, tipo_producto = ?, fases_json = ?, es_temporada = ?, activa = ? WHERE id = ?`,
            [nombre, categoria_id, usa_receta_propia ? 1 : 0, tipo_producto || 'estandar', typeof fases_json === 'string' ? fases_json : JSON.stringify(fases_json || []), es_temporada ? 1 : 0, activa !== undefined ? (activa ? 1 : 0) : 1, prodId], (err) => {
                if (err) return res.status(500).json({ error: err.message });

                db.run(`DELETE FROM recetas_productos WHERE producto_id = ?`, [prodId], () => {
                    if (receta && receta.length > 0) {
                        const stmt = db.prepare(`INSERT INTO recetas_productos (producto_id, insumo_id, cantidad_requerida) VALUES (?, ?, ?)`);
                        receta.forEach(r => stmt.run(prodId, r.insumo_id, r.cantidad_requerida));
                        stmt.finalize();
                    }
                });

                db.run(`DELETE FROM mapeo_esencias_productos WHERE producto_id = ?`, [prodId], () => {
                    if (mapeo_genericos && mapeo_genericos.length > 0) {
                        const stmtM = db.prepare(`INSERT INTO mapeo_esencias_productos (producto_id, insumo_generico_id, insumo_especifico_id) VALUES (?, ?, ?)`);
                        mapeo_genericos.forEach(m => stmtM.run(prodId, m.insumo_generico_id, m.insumo_especifico_id));
                        stmtM.finalize();
                    }
                });

                res.json({ success: true });
            });
    });
});

app.patch('/api/productos-terminados/:id/stock', (req, res) => {
    const { cantidad } = req.body;
    const numCant = parseFloat(cantidad);
    if (isNaN(numCant) || numCant === 0) return res.status(400).json({ error: "Cantidad inválida" });

    db.serialize(() => {
        db.run(`UPDATE productos_terminados SET stock = stock + ? WHERE id = ?`, [numCant, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`INSERT INTO historial_productos (producto_id, cantidad, tipo, origen) VALUES (?, ?, ?, 'MANUAL')`, 
                [req.params.id, Math.abs(numCant), numCant > 0 ? 'ENTRADA' : 'RESTA'], () => {
                res.json({ success: true });
            });
        });
    });
});

app.patch('/api/productos-terminados/:id/toggle-activa', (req, res) => {
    const prodId = req.params.id;
    db.get(`SELECT activa FROM productos_terminados WHERE id = ?`, [prodId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Producto no encontrado" });
        const nuevoEstado = (row.activa === 1 || row.activa === null) ? 0 : 1;
        db.run(`UPDATE productos_terminados SET activa = ?, es_temporada = 1 WHERE id = ?`, [nuevoEstado, prodId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true, activa: nuevoEstado });
        });
    });
});

app.delete('/api/productos-terminados/:id', (req, res) => {
    db.run(`DELETE FROM productos_terminados WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- API HISTORIAL PRODUCTOS TERMINADOS ---
app.get('/api/historial-productos', (req, res) => {
    db.all(`SELECT h.*, p.nombre as producto_nombre FROM historial_productos h JOIN productos_terminados p ON h.producto_id = p.id ORDER BY h.fecha DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/historial-productos/:id', (req, res) => {
    db.get(`SELECT * FROM historial_productos WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Movimiento no encontrado" });

        db.serialize(() => {
            const delta = (row.tipo === 'ENTRADA') ? -Math.abs(row.cantidad) : Math.abs(row.cantidad);
            db.run(`UPDATE productos_terminados SET stock = stock + ? WHERE id = ?`, [delta, row.producto_id], () => {
                db.run(`DELETE FROM historial_productos WHERE id = ?`, [req.params.id], () => {
                    res.json({ success: true });
                });
            });
        });
    });
});

app.get('/api/recetas', (req, res) => {
    db.all(`SELECT id, producto_id, NULL as categoria_id, insumo_id, cantidad_requerida FROM recetas_productos UNION ALL SELECT id, NULL as producto_id, categoria_id, insumo_id, cantidad_requerida FROM recetas_categorias`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/productos-terminados/:id/mapeo', (req, res) => {
    db.all(`SELECT * FROM mapeo_esencias_productos WHERE producto_id = ?`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/mapeos-todos', (req, res) => {
    db.all(`SELECT * FROM mapeo_esencias_productos`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- API OPERADORES ---
app.get('/api/operadores', (req, res) => {
    db.all(`SELECT * FROM operadores WHERE activo = 1 ORDER BY nombre COLLATE NOCASE ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/operadores', (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
    const nom = nombre.trim();
    db.run(`INSERT INTO operadores (nombre, activo) VALUES (?, 1)
            ON CONFLICT(nombre) DO UPDATE SET activo = 1`, [nom], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, nombre: nom });
    });
});

app.delete('/api/operadores/:id', (req, res) => {
    db.run(`UPDATE operadores SET activo = 0 WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- API SUBIDA DE FOTOS PARA FICHAS TÉCNICAS ---
app.post('/api/upload-foto', (req, res) => {
    try {
        const { dataUrl } = req.body;
        if (!dataUrl) return res.status(400).json({ error: "No se proporcionó imagen" });

        const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: "Formato de imagen inválido" });
        }

        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        let ext = 'jpg';
        if (mimeType.includes('png')) ext = 'png';
        else if (mimeType.includes('webp')) ext = 'webp';
        else if (mimeType.includes('jpeg')) ext = 'jpg';

        const fileName = `vela_${Date.now()}_${Math.floor(1000 + Math.random()*9000)}.${ext}`;
        const filePath = path.join(uploadsDir, fileName);

        fs.writeFileSync(filePath, buffer);
        res.json({ url: `/uploads/${fileName}` });
    } catch (err) {
        console.error("Error guardando foto:", err);
        res.status(500).json({ error: "Error al guardar la fotografía: " + err.message });
    }
});

// --- API PRODUCCIÓN MÚLTIPLE & DESCUENTO DE TALLER ---
app.post('/api/produccion-multiple', (req, res) => {
    const { productos_lote, insumos_adicionales, operador, fecha_produccion } = req.body;
    if (!productos_lote || productos_lote.length === 0) return res.status(400).json({ error: "No hay productos seleccionados" });

    const fechaHoy = getFechaCDMX();
    const operadorFinal = (operador && operador.trim()) ? operador.trim() : 'Taller';
    const fechaProdFinal = (fecha_produccion && fecha_produccion.trim()) ? fecha_produccion.trim() : fechaHoy;

    db.serialize(async () => {
        const consumosTotales = {};
        let nombresLoteDesc = [];

        // Identificar IDs de Cera Soya y Cera Coco en inventario
        const ceraSoyaRow = await new Promise((resolve) => db.get(`SELECT id FROM insumos WHERE LOWER(nombre) LIKE '%soya%' LIMIT 1`, (_, r) => resolve(r)));
        const ceraCocoRow = await new Promise((resolve) => db.get(`SELECT id FROM insumos WHERE LOWER(nombre) LIKE '%coco%' LIMIT 1`, (_, r) => resolve(r)));
        const idSoya = ceraSoyaRow ? ceraSoyaRow.id : 1;
        const idCoco = ceraCocoRow ? ceraCocoRow.id : 2;

        for (let item of productos_lote) {
            const prod = await new Promise((resolve) => {
                db.get(`SELECT * FROM productos_terminados WHERE id = ?`, [item.producto_id], (_, row) => resolve(row));
            });
            if (!prod) continue;
            nombresLoteDesc.push(`${item.cantidad}x ${prod.nombre}`);

            let fases = [];
            try {
                fases = typeof prod.fases_json === 'string' ? JSON.parse(prod.fases_json) : (prod.fases_json || []);
            } catch (e) {
                fases = [];
            }

            const tieneFases = Array.isArray(fases) && fases.length > 0;

            if (tieneFases) {
                fases.forEach(f => {
                    const cantSoya = (parseFloat(f.cera_soya) || 0) * item.cantidad;
                    const cantCoco = (parseFloat(f.cera_coco) || 0) * item.cantidad;
                    if (cantSoya > 0) {
                        consumosTotales[idSoya] = (consumosTotales[idSoya] || 0) + cantSoya;
                    }
                    if (cantCoco > 0) {
                        consumosTotales[idCoco] = (consumosTotales[idCoco] || 0) + cantCoco;
                    }
                    if (f.esencia_id) {
                        const pct = parseFloat(f.porcentaje_esencia) || 10;
                        const cantEsencia = ((parseFloat(f.cera_soya) || 0) + (parseFloat(f.cera_coco) || 0)) * (pct / 100) * item.cantidad;
                        if (cantEsencia > 0) {
                            consumosTotales[f.esencia_id] = (consumosTotales[f.esencia_id] || 0) + cantEsencia;
                        }
                    }
                });

                const recetaFisica = await new Promise((resolve) => {
                    db.all(`SELECT * FROM recetas_productos WHERE producto_id = ?`, [prod.id], (_, rows) => resolve(rows || []));
                });

                recetaFisica.forEach(r => {
                    if (r.insumo_id === idSoya || r.insumo_id === idCoco) return;
                    const totalReq = r.cantidad_requerida * item.cantidad;
                    consumosTotales[r.insumo_id] = (consumosTotales[r.insumo_id] || 0) + totalReq;
                });

            } else {
                let receta = [];
                if (prod.usa_receta_propia === 1) {
                    receta = await new Promise((resolve) => {
                        db.all(`SELECT * FROM recetas_productos WHERE producto_id = ?`, [prod.id], (_, rows) => resolve(rows));
                    });
                } else {
                    receta = await new Promise((resolve) => {
                        db.all(`SELECT * FROM recetas_categorias WHERE categoria_id = ?`, [prod.categoria_id], (_, rows) => resolve(rows));
                    });
                    if (!receta || receta.length === 0) {
                        const catRow = await new Promise((resolve) => {
                            db.get(`SELECT padre_id FROM categorias_productos WHERE id = ?`, [prod.categoria_id], (_, row) => resolve(row));
                        });
                        if (catRow && catRow.padre_id) {
                            receta = await new Promise((resolve) => {
                                db.all(`SELECT * FROM recetas_categorias WHERE categoria_id = ?`, [catRow.padre_id], (_, rows) => resolve(rows));
                            });
                        }
                    }
                }

                const mapeos = await new Promise((resolve) => {
                    db.all(`SELECT * FROM mapeo_esencias_productos WHERE producto_id = ?`, [prod.id], (_, rows) => resolve(rows));
                });

                receta.forEach(r => {
                    let insumoIdFinal = r.insumo_id;
                    const sust = mapeos.find(m => m.insumo_generico_id === r.insumo_id);
                    if (sust) insumoIdFinal = sust.insumo_especifico_id;

                    const totalReq = r.cantidad_requerida * item.cantidad;
                    consumosTotales[insumoIdFinal] = (consumosTotales[insumoIdFinal] || 0) + totalReq;
                });
            }
        }

        if (insumos_adicionales) {
            insumos_adicionales.forEach(ex => {
                consumosTotales[ex.insumo_id] = (consumosTotales[ex.insumo_id] || 0) + ex.cantidad;
            });
        }

        for (let insumoId in consumosTotales) {
            const ins = await new Promise((resolve) => {
                db.get(`SELECT * FROM insumos WHERE id = ?`, [insumoId], (_, row) => resolve(row));
            });
            if (!ins || ins.stock < consumosTotales[insumoId]) {
                return res.status(400).json({ error: `Stock insuficiente en taller para: ${ins ? ins.nombre : 'ID ' + insumoId}. Requerido: ${consumosTotales[insumoId]}, Disponible: ${ins ? ins.stock : 0}` });
            }
        }

        // 1. Registrar primero en historial_produccion para obtener su ID único interno
        const detalleTexto = nombresLoteDesc.join(', ');
        const insumosJson = JSON.stringify(consumosTotales);
        const prodsJson = JSON.stringify(productos_lote);

        db.run(`INSERT INTO historial_produccion (operador, fecha_produccion, detalle, resumen, insumos_json, productos_json, detalles_json, fecha) VALUES (?, ?, ?, ?, ?, ?, ?, getFechaHoraCDMX())`, 
            [operadorFinal, fechaProdFinal, detalleTexto, detalleTexto, insumosJson, prodsJson, prodsJson], 
            function(err) {
                if (err) {
                    console.error("Error al guardar historial_produccion:", err);
                    return res.status(500).json({ error: "Error al registrar la producción" });
                }

                const prodHistId = this.lastID;
                const refUnica = `PROD_REF_${prodHistId}`;

                // 2. Descontar insumos y registrar movimientos en historial_insumos con referencia única
                for (let insumoId in consumosTotales) {
                    const cantConsumo = consumosTotales[insumoId];
                    db.run(`UPDATE insumos SET stock = stock - ? WHERE id = ?`, [cantConsumo, insumoId]);
                    db.run(`INSERT INTO historial_insumos (insumo_id, cantidad, tipo, codigo_lote) VALUES (?, ?, 'SALIDA', ?)`,
                        [insumoId, cantConsumo, refUnica]);
                }

                // 3. Incrementar stock de productos y registrar en historial_productos con referencia única
                for (let item of productos_lote) {
                    db.run(`UPDATE productos_terminados SET stock = stock + ? WHERE id = ?`, [item.cantidad, item.producto_id]);
                    db.run(`INSERT INTO historial_productos (producto_id, cantidad, tipo, origen, operador, codigo_lote) VALUES (?, ?, 'ENTRADA', 'PRODUCCION', ?, ?)`,
                        [item.producto_id, item.cantidad, operadorFinal, refUnica]);
                }

                res.json({ 
                    success: true, 
                    message: `¡Producción registrada exitosamente!`
                });
            });
    });
});

// --- API HISTORIAL PRODUCCIÓN (Pestaña 3) ---
app.get('/api/historial-produccion', (req, res) => {
    db.all(`SELECT * FROM historial_produccion ORDER BY fecha DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/historial-produccion/:id', (req, res) => {
    const prodHistId = req.params.id;
    db.get(`SELECT * FROM historial_produccion WHERE id = ?`, [prodHistId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Registro de producción no encontrado" });

        let insumosRevertir = {};
        let productosRevertir = [];
        try { insumosRevertir = JSON.parse(row.insumos_json || '{}'); } catch (e) {}
        try { productosRevertir = JSON.parse(row.productos_json || row.detalles_json || '[]'); } catch (e) {}

        db.serialize(() => {
            // 1. Volver a sumar a los insumos del taller lo que se gastó en esta producción
            for (let insId in insumosRevertir) {
                const cant = parseFloat(insumosRevertir[insId]) || 0;
                if (cant > 0) {
                    db.run(`UPDATE insumos SET stock = stock + ? WHERE id = ?`, [cant, insId]);
                }
            }

            // 2. Restar al producto terminado las velas que se crearon en esta producción
            if (Array.isArray(productosRevertir)) {
                productosRevertir.forEach(item => {
                    const cant = parseFloat(item.cantidad) || 0;
                    if (cant > 0 && item.producto_id) {
                        db.run(`UPDATE productos_terminados SET stock = stock - ? WHERE id = ?`, [cant, item.producto_id]);
                    }
                });
            }

            // 3. Eliminar únicamente los movimientos vinculados a ESTA producción específica (sin borrar otros historiales)
            const refUnica = `PROD_REF_${prodHistId}`;
            db.run(`DELETE FROM historial_insumos WHERE codigo_lote = ?`, [refUnica]);
            db.run(`DELETE FROM historial_productos WHERE codigo_lote = ?`, [refUnica]);

            // 4. Eliminar este registro del historial de producción
            db.run(`DELETE FROM historial_produccion WHERE id = ?`, [prodHistId], function(errDel) {
                if (errDel) return res.status(500).json({ error: errDel.message });
                res.json({ 
                    success: true, 
                    message: "Producción revertida: se restó del producto terminado y se devolvieron los insumos al taller." 
                });
            });
        });
    });
});

// --- API FICHAS TÉCNICAS ---
app.get('/api/fichas-tecnicas', (req, res) => {
    const query = `SELECT f.*, p.nombre as producto_nombre, c.nombre as categoria, cp.nombre as categoria_padre FROM fichas_tecnicas f 
                   JOIN productos_terminados p ON f.producto_id = p.id 
                   LEFT JOIN categorias_productos c ON p.categoria_id = c.id 
                   LEFT JOIN categorias_productos cp ON c.padre_id = cp.id`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/fichas-tecnicas/producto/:id', (req, res) => {
    db.get(`SELECT * FROM fichas_tecnicas WHERE producto_id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

app.post('/api/fichas-tecnicas', (req, res) => {
    const { producto_id, calibre_pabilo, temperatura_vertido, tecnica_decorado, desglose_gramos, notas_comentarios, foto } = req.body;
    db.run(`INSERT INTO fichas_tecnicas (producto_id, calibre_pabilo, temperatura_vertido, tecnica_decorado, desglose_gramos, notas_comentarios, foto) 
            VALUES (?, ?, ?, ?, ?, ?, ?) 
            ON CONFLICT(producto_id) DO UPDATE SET 
            calibre_pabilo=excluded.calibre_pabilo, temperatura_vertido=excluded.temperatura_vertido, 
            tecnica_decorado=excluded.tecnica_decorado, desglose_gramos=excluded.desglose_gramos, 
            notas_comentarios=excluded.notas_comentarios, foto=COALESCE(excluded.foto, fichas_tecnicas.foto)`,
        [producto_id, calibre_pabilo, temperatura_vertido, tecnica_decorado, desglose_gramos, notas_comentarios, foto || null], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.delete('/api/fichas-tecnicas/:id', (req, res) => {
    db.run(`DELETE FROM fichas_tecnicas WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- API PLAN DEL DÍA & CHECKLIST DE TALLER ---
app.get('/api/plan-diario/:fecha', (req, res) => {
    const fecha = req.params.fecha;
    db.get(`SELECT * FROM plan_diario WHERE fecha = ?`, [fecha], (err, plan) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all(`SELECT t.*, p.nombre as producto_nombre FROM plan_diario_tareas t 
                LEFT JOIN productos_terminados p ON t.producto_id = p.id 
                WHERE t.fecha = ? ORDER BY t.operador ASC, t.id ASC`, [fecha], (err2, tareas) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({
                plan: plan || { fecha, notas_advertencia: '' },
                tareas: tareas || []
            });
        });
    });
});

app.post('/api/plan-diario/notas', (req, res) => {
    const { fecha, notas_advertencia } = req.body;
    if (!fecha) return res.status(400).json({ error: "Fecha requerida" });
    db.run(`INSERT INTO plan_diario (fecha, notas_advertencia) VALUES (?, ?) 
            ON CONFLICT(fecha) DO UPDATE SET notas_advertencia = excluded.notas_advertencia`, 
            [fecha, notas_advertencia || ''], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/plan-diario/tarea', (req, res) => {
    const { fecha, operador, tarea, cantidad, unidad, producto_id, nota } = req.body;
    if (!fecha || !operador || !tarea) return res.status(400).json({ error: "Fecha, operador y tarea son requeridos" });
    db.run(`INSERT INTO plan_diario_tareas (fecha, operador, tarea, cantidad, unidad, producto_id, nota, completada) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)`, 
            [fecha, operador, tarea, cantidad ? parseFloat(cantidad) : null, unidad || '', producto_id || null, nota || ''], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.patch('/api/plan-diario/tarea/:id/toggle', (req, res) => {
    const id = req.params.id;
    db.get(`SELECT completada FROM plan_diario_tareas WHERE id = ?`, [id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Tarea no encontrada" });
        const nuevoEstado = row.completada === 1 ? 0 : 1;
        const completada_en = nuevoEstado === 1 ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
        db.run(`UPDATE plan_diario_tareas SET completada = ?, completada_en = ? WHERE id = ?`, [nuevoEstado, completada_en, id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true, completada: nuevoEstado, completada_en });
        });
    });
});

app.delete('/api/plan-diario/tarea/:id', (req, res) => {
    db.run(`DELETE FROM plan_diario_tareas WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});