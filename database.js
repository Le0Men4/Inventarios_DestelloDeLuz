const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'inventario.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");

    db.run(`
        CREATE TABLE IF NOT EXISTS categorias_insumos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            padre_id INTEGER DEFAULT NULL,
            FOREIGN KEY (padre_id) REFERENCES categorias_insumos(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS insumos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            categoria_id INTEGER,
            unidad TEXT NOT NULL,
            stock REAL DEFAULT 0,
            es_generico INTEGER DEFAULT 0,
            FOREIGN KEY (categoria_id) REFERENCES categorias_insumos(id) ON DELETE SET NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS categorias_productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            padre_id INTEGER DEFAULT NULL,
            FOREIGN KEY (padre_id) REFERENCES categorias_productos(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS productos_terminados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            categoria_id INTEGER,
            stock REAL DEFAULT 0,
            usa_receta_propia INTEGER DEFAULT 0,
            tipo_producto TEXT DEFAULT 'estandar',
            fases_json TEXT DEFAULT '[]',
            FOREIGN KEY (categoria_id) REFERENCES categorias_productos(id) ON DELETE SET NULL
        )
    `);

    // Migraciones automáticas no destructivas
    db.run(`ALTER TABLE productos_terminados ADD COLUMN tipo_producto TEXT DEFAULT 'estandar'`, () => {});
    db.run(`ALTER TABLE productos_terminados ADD COLUMN fases_json TEXT DEFAULT '[]'`, () => {});
    db.run(`ALTER TABLE productos_terminados ADD COLUMN activa INTEGER DEFAULT 1`, () => {});
    db.run(`ALTER TABLE productos_terminados ADD COLUMN es_temporada INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE categorias_productos ADD COLUMN activa INTEGER DEFAULT 1`, () => {});

    // Tabla de Configuración (PIN de 6 dígitos del taller)
    db.run(`
        CREATE TABLE IF NOT EXISTS configuracion (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        )
    `);
    db.run(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('master_pin', '123456')`);

    // Tablas para Pestaña 5: Plan del Día y Producción Esperada
    db.run(`
        CREATE TABLE IF NOT EXISTS plan_diario (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT UNIQUE NOT NULL,
            notas_advertencia TEXT DEFAULT '',
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS plan_diario_tareas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT NOT NULL,
            operador TEXT NOT NULL,
            tarea TEXT NOT NULL,
            cantidad REAL DEFAULT NULL,
            unidad TEXT DEFAULT '',
            producto_id INTEGER DEFAULT NULL,
            completada INTEGER DEFAULT 0,
            completada_en DATETIME DEFAULT NULL,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS recetas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            producto_id INTEGER DEFAULT NULL,
            categoria_id INTEGER DEFAULT NULL,
            insumo_id INTEGER NOT NULL,
            cantidad_requerida REAL NOT NULL,
            FOREIGN KEY (producto_id) REFERENCES productos_terminados(id) ON DELETE CASCADE,
            FOREIGN KEY (categoria_id) REFERENCES categorias_productos(id) ON DELETE CASCADE,
            FOREIGN KEY (insumo_id) REFERENCES insumos(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS mapa_insumos_producto (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            producto_id INTEGER NOT NULL,
            insumo_generico_id INTEGER NOT NULL,
            insumo_especifico_id INTEGER NOT NULL,
            FOREIGN KEY (producto_id) REFERENCES productos_terminados(id) ON DELETE CASCADE,
            FOREIGN KEY (insumo_generico_id) REFERENCES insumos(id) ON DELETE CASCADE,
            FOREIGN KEY (insumo_especifico_id) REFERENCES insumos(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS fichas_tecnicas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            producto_id INTEGER UNIQUE NOT NULL,
            calibre_pabilo TEXT,
            temperatura_vertido TEXT,
            tecnica_decorado TEXT,
            desglose_gramos TEXT,
            notas_comentarios TEXT,
            foto TEXT,
            FOREIGN KEY (producto_id) REFERENCES productos_terminados(id) ON DELETE CASCADE
        )
    `);

    // Migración no destructiva para foto en fichas_tecnicas
    db.run(`ALTER TABLE fichas_tecnicas ADD COLUMN foto TEXT`, () => {});

    // Tabla de Operadores / Equipo de Taller
    db.run(`
        CREATE TABLE IF NOT EXISTS operadores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            activo INTEGER DEFAULT 1,
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tablas de Historiales para Pestañas 1, 2 y 3
    db.run(`
        CREATE TABLE IF NOT EXISTS historial_insumos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            insumo_id INTEGER,
            cantidad REAL NOT NULL,
            tipo TEXT NOT NULL,
            codigo_lote TEXT,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (insumo_id) REFERENCES insumos(id) ON DELETE CASCADE
        )
    `);

    // Migración para tipo y codigo_lote en historial_insumos
    db.run(`ALTER TABLE historial_insumos ADD COLUMN tipo TEXT DEFAULT 'ENTRADA'`, () => {});
    db.run(`ALTER TABLE historial_insumos ADD COLUMN codigo_lote TEXT`, () => {});

    db.run(`
        CREATE TABLE IF NOT EXISTS historial_productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            producto_id INTEGER,
            cantidad REAL NOT NULL,
            tipo TEXT NOT NULL DEFAULT 'ENTRADA',
            origen TEXT DEFAULT 'MANUAL',
            codigo_lote TEXT,
            operador TEXT,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (producto_id) REFERENCES productos_terminados(id) ON DELETE CASCADE
        )
    `);

    // Migraciones no destructivas para historial_productos
    db.run(`ALTER TABLE historial_productos ADD COLUMN tipo TEXT DEFAULT 'ENTRADA'`, () => {});
    db.run(`ALTER TABLE historial_productos ADD COLUMN origen TEXT DEFAULT 'MANUAL'`, () => {});
    db.run(`ALTER TABLE historial_productos ADD COLUMN codigo_lote TEXT`, () => {});
    db.run(`ALTER TABLE historial_productos ADD COLUMN operador TEXT`, () => {});

    db.run(`
        CREATE TABLE IF NOT EXISTS historial_produccion (
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
        )
    `);

    // Migraciones no destructivas para historial_produccion
    db.run(`ALTER TABLE historial_produccion ADD COLUMN codigo_lote TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN operador TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN fecha_produccion TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN detalle TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN resumen TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN insumos_json TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN productos_json TEXT`, () => {});
    db.run(`ALTER TABLE historial_produccion ADD COLUMN detalles_json TEXT`, () => {});

    // Tablas de Plan del Día y Tareas
    db.run(`
        CREATE TABLE IF NOT EXISTS plan_diario (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT UNIQUE NOT NULL,
            notas_advertencia TEXT DEFAULT '',
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS plan_diario_tareas (
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
        )
    `);

    db.run(`ALTER TABLE plan_diario_tareas ADD COLUMN nota TEXT DEFAULT ''`, () => {});
});

module.exports = db;