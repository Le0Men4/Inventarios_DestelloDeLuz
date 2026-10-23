
// Formateador de fecha y hora local fija para CDMX (America/Mexico_City)
function formatearFechaCDMX(fechaOriginal) {
    if (!fechaOriginal) return 'N/A';
    try {
        // Si ya viene con formato ISO o SQL YYYY-MM-DD HH:mm:ss
        let str = String(fechaOriginal).trim();
        // Si no tiene 'Z' ni offset y fue generada por SQLite CURRENT_TIMESTAMP, tratar como UTC
        let d;
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
            d = new Date(str.replace(' ', 'T') + 'Z');
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            return str;
        } else {
            d = new Date(str);
        }

        if (isNaN(d.getTime())) return str;

        return d.toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch(e) {
        return String(fechaOriginal);
    }
}

// Función maestra que actualiza y sincroniza todos los módulos, tablas y selectores en vivo
async function refrescarTodoElProyecto() {
    try {
        await cargarCategorias();
        await cargarInsumos();
        await cargarProductos();
        await cargarRecetasYMapeos();
        await cargarFichasTecnicas();
        await cargarOperadores();
        await cargarHistoriales();
        poblarSelectorProductosFicha();
        poblarSelectoresCalculadora();
        if (typeof cargarPlanDiario === 'function') {
            await cargarPlanDiario();
        }
    } catch(e) {
        console.error("Error sincronizando proyecto:", e);
    }
}
let insumosLista = [];
let productosLista = [];
let categoriasInsumosLista = [];
let categoriasProductosLista = [];
let fichasTecnicasLista = [];
let operadoresLista = [];
let todasLasRecetas = [];
let todosLosMapeos = [];
let configuracionesMezclasGuardadas = JSON.parse(localStorage.getItem('configuracionesMezclasGuardadas') || '{}');

// Normalizador de texto (ignora acentos/tildes y mayúsculas, ej. "sanda" coincide con "Sándalo" y "Sandalo")
function normalizarTexto(str) {
    return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function limpiarTextoOpcion(txt) {
    return String(txt || '').replace(/^[\s\u00A0↳]+/, '').trim();
}

function resaltarCoincidencia(texto, query) {
    if (!query) return texto;
    const normTexto = String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normQuery = normalizarTexto(query);
    const idx = normTexto.indexOf(normQuery);
    if (idx === -1) return texto;
    const antes = texto.slice(0, idx);
    const match = texto.slice(idx, idx + normQuery.length);
    const despues = texto.slice(idx + normQuery.length);
    return `${antes}<mark class="bg-rose-200 text-rose-950 font-black rounded px-0.5">${match}</mark>${despues}`;
}

let portalAutocompleteActivo = null;

function cerrarPortalAutocomplete() {
    const portal = document.getElementById('portal-autocomplete-menu');
    if (portal) portal.remove();
    if (portalAutocompleteActivo && portalAutocompleteActivo.onClose) {
        portalAutocompleteActivo.onClose();
    }
    portalAutocompleteActivo = null;
}

document.addEventListener('mousedown', (e) => {
    const portal = document.getElementById('portal-autocomplete-menu');
    if (!portal) return;
    if (portal.contains(e.target)) return;
    if (portalAutocompleteActivo?.wrapper?.contains(e.target)) return;
    cerrarPortalAutocomplete();
});

window.addEventListener('resize', () => {
    if (portalAutocompleteActivo?.reposicionar) portalAutocompleteActivo.reposicionar();
});
window.addEventListener('scroll', (e) => {
    const portal = document.getElementById('portal-autocomplete-menu');
    if (portal && portal.contains(e.target)) return;
    if (portalAutocompleteActivo?.reposicionar) portalAutocompleteActivo.reposicionar();
}, true);

function crearSelectorBuscable(selectEl, placeholderCustom = '') {
    if (!selectEl) return;

    // Extraer texto de la opción seleccionada actualmente
    const obtenerTextoSeleccionado = () => {
        const opt = selectEl.options[selectEl.selectedIndex];
        if (!opt || !opt.value) return '';
        return limpiarTextoOpcion(opt.text);
    };

    const obtenerPlaceholder = () => {
        if (placeholderCustom) return placeholderCustom;
        const firstOpt = selectEl.options[0];
        if (firstOpt && !firstOpt.value) return limpiarTextoOpcion(firstOpt.text);
        return '🔍 Escribe para buscar o selecciona...';
    };

    selectEl.style.display = 'none';

    let wrapper = selectEl.nextElementSibling;
    if (!wrapper || !wrapper.classList.contains('combobox-container')) {
        wrapper = document.createElement('div');
        wrapper.className = 'combobox-container relative w-full';
        wrapper.innerHTML = `
            <div class="relative flex items-center w-full">
                <input type="text" autocomplete="off" class="combobox-input w-full border-2 border-rose-200 focus:border-rose-500 p-2.5 pr-9 rounded-xl text-sm font-bold text-rose-950 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 transition placeholder:text-rose-400/80 placeholder:font-semibold shadow-2xs">
                <button type="button" tabindex="-1" class="combobox-toggle absolute right-2.5 text-rose-400 hover:text-rose-600 text-xs font-black px-1 py-1 select-none">▾</button>
            </div>
        `;
        selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);

        const input = wrapper.querySelector('.combobox-input');
        const btnToggle = wrapper.querySelector('.combobox-toggle');

        const abrirMenuSugerencias = (filtroTexto = '') => {
            if (portalAutocompleteActivo && portalAutocompleteActivo.wrapper !== wrapper) {
                cerrarPortalAutocomplete();
            }

            let portal = document.getElementById('portal-autocomplete-menu');
            if (!portal) {
                portal = document.createElement('div');
                portal.id = 'portal-autocomplete-menu';
                portal.className = 'fixed z-[99999] bg-white border-2 border-rose-300 rounded-2xl shadow-2xl overflow-y-auto max-h-72 p-1.5 space-y-0.5';
                document.body.appendChild(portal);
            }

            const reposicionar = () => {
                const rect = input.getBoundingClientRect();
                const espacioAbajo = window.innerHeight - rect.bottom;
                const ancho = Math.max(rect.width, 280);
                portal.style.width = `${Math.min(ancho, window.innerWidth - 16)}px`;
                portal.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - ancho - 8))}px`;
                if (espacioAbajo < 220 && rect.top > 240) {
                    portal.style.top = 'auto';
                    portal.style.bottom = `${window.innerHeight - rect.top + 4}px`;
                } else {
                    portal.style.bottom = 'auto';
                    portal.style.top = `${rect.bottom + 4}px`;
                }
            };

            const query = normalizarTexto(filtroTexto);
            portal.innerHTML = '';

            // Opción vacía / Todas si existe y no hay filtro
            const firstOpt = selectEl.options[0];
            if (firstOpt && !firstOpt.value && !query) {
                const itemReset = document.createElement('div');
                itemReset.className = 'px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-800 cursor-pointer transition';
                itemReset.innerText = limpiarTextoOpcion(firstOpt.text);
                itemReset.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selectEl.value = '';
                    input.value = '';
                    input.placeholder = obtenerPlaceholder();
                    cerrarPortalAutocomplete();
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                });
                portal.appendChild(itemReset);
            }

            let totalCoincidencias = 0;
            let primeraOpcionValida = null;

            const renderOpcion = (opt, grupoNombre = '') => {
                if (!opt.value && opt === selectEl.options[0]) return;
                if (opt.disabled) {
                    if (!query) {
                        const subHeader = document.createElement('div');
                        subHeader.className = 'px-3 py-1 text-[11px] font-black text-rose-500 bg-rose-50/60 rounded-lg mt-1 select-none';
                        subHeader.innerText = limpiarTextoOpcion(opt.text);
                        portal.appendChild(subHeader);
                    }
                    return;
                }

                const textoLimpio = limpiarTextoOpcion(opt.text);
                const coincideTexto = normalizarTexto(textoLimpio).includes(query);
                const coincideGrupo = grupoNombre && normalizarTexto(grupoNombre).includes(query);

                if (query && !coincideTexto && !coincideGrupo) return;

                totalCoincidencias++;
                if (!primeraOpcionValida) primeraOpcionValida = opt;

                const esSeleccionado = (selectEl.value == opt.value);
                const divOpt = document.createElement('div');
                divOpt.className = `px-3.5 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition whitespace-normal break-words leading-snug flex items-center justify-between gap-2 ${
                    esSeleccionado ? 'bg-rose-500 text-white' : 'text-rose-950 hover:bg-rose-100/80'
                }`;

                const htmlLabel = esSeleccionado ? textoLimpio : resaltarCoincidencia(textoLimpio, filtroTexto);
                const badgeGrupo = (query && grupoNombre) 
                    ? `<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${esSeleccionado ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'}">${grupoNombre.replace('📁', '').trim()}</span>`
                    : '';

                divOpt.innerHTML = `<span>${htmlLabel}</span>${badgeGrupo}`;
                divOpt.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selectEl.value = opt.value;
                    input.value = limpiarTextoOpcion(opt.text);
                    portalAutocompleteActivo = null;
                    portal.remove();
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                });
                portal.appendChild(divOpt);
            };

            Array.from(selectEl.children).forEach(child => {
                if (child.tagName === 'OPTGROUP') {
                    const opcionesGrupo = Array.from(child.children);
                    const tieneCoincidencias = opcionesGrupo.some(o => {
                        if (o.disabled || !o.value) return false;
                        return !query || normalizarTexto(o.text).includes(query) || normalizarTexto(child.label).includes(query);
                    });
                    if (tieneCoincidencias) {
                        const header = document.createElement('div');
                        header.className = 'px-3 py-1.5 text-[11px] font-black text-rose-800 uppercase tracking-wider bg-rose-100/70 rounded-lg mt-1 select-none';
                        header.innerText = child.label;
                        portal.appendChild(header);
                        opcionesGrupo.forEach(opt => renderOpcion(opt, child.label));
                    }
                } else if (child.tagName === 'OPTION') {
                    renderOpcion(child);
                }
            });

            if (totalCoincidencias === 0) {
                portal.innerHTML = `
                    <div class="p-4 text-center text-xs font-bold text-rose-400">
                        No se encontraron coincidencias para "${filtroTexto}"
                    </div>
                `;
            }

            reposicionar();

            portalAutocompleteActivo = {
                wrapper,
                reposicionar,
                primeraOpcionValida,
                onClose: () => {
                    input.value = obtenerTextoSeleccionado();
                    input.placeholder = obtenerPlaceholder();
                }
            };
        };

        input.addEventListener('focus', () => {
            input.select();
            abrirMenuSugerencias('');
        });

        input.addEventListener('click', () => {
            if (!document.getElementById('portal-autocomplete-menu')) {
                abrirMenuSugerencias('');
            }
        });

        input.addEventListener('input', () => {
            abrirMenuSugerencias(input.value);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cerrarPortalAutocomplete();
                input.blur();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (portalAutocompleteActivo?.primeraOpcionValida) {
                    const opt = portalAutocompleteActivo.primeraOpcionValida;
                    selectEl.value = opt.value;
                    input.value = limpiarTextoOpcion(opt.text);
                    portalAutocompleteActivo = null;
                    document.getElementById('portal-autocomplete-menu')?.remove();
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    input.blur();
                }
            }
        });

        btnToggle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (document.getElementById('portal-autocomplete-menu') && portalAutocompleteActivo?.wrapper === wrapper) {
                cerrarPortalAutocomplete();
            } else {
                input.focus();
                abrirMenuSugerencias('');
            }
        });
    }

    const inputExistente = wrapper.querySelector('.combobox-input');
    if (inputExistente) {
        inputExistente.value = obtenerTextoSeleccionado();
        inputExistente.placeholder = obtenerPlaceholder();
    }
}

// Autocompletado con sugerencias en vivo para los buscadores de tablas (Insumos, Productos, Fichas)
function configurarSugerenciasBuscadorGlobal(inputId, obtenerItemsFn, alElegirFn) {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.autocompleteReady === '1') return;
    input.dataset.autocompleteReady = '1';

    const mostrarSugerencias = () => {
        const texto = input.value;
        const query = normalizarTexto(texto);
        if (!query) {
            if (portalAutocompleteActivo?.wrapper === input) cerrarPortalAutocomplete();
            return;
        }

        const items = obtenerItemsFn().filter(it => normalizarTexto(`${it.titulo} ${it.subtitulo || ''}`).includes(query));
        if (items.length === 0) {
            if (portalAutocompleteActivo?.wrapper === input) cerrarPortalAutocomplete();
            return;
        }

        let portal = document.getElementById('portal-autocomplete-menu');
        if (!portal) {
            portal = document.createElement('div');
            portal.id = 'portal-autocomplete-menu';
            portal.className = 'fixed z-[99999] bg-white border-2 border-rose-300 rounded-2xl shadow-2xl overflow-y-auto max-h-72 p-1.5 space-y-1';
            document.body.appendChild(portal);
        }

        const reposicionar = () => {
            const rect = input.getBoundingClientRect();
            portal.style.width = `${Math.max(rect.width, 280)}px`;
            portal.style.left = `${rect.left}px`;
            portal.style.top = `${rect.bottom + 4}px`;
            portal.style.bottom = 'auto';
        };

        portal.innerHTML = `<div class="px-3 py-1 text-[10px] font-black text-rose-500 uppercase tracking-wider select-none">💡 Sugerencias encontradas (${items.length}):</div>`;

        items.slice(0, 15).forEach(it => {
            const row = document.createElement('div');
            row.className = 'px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold text-rose-950 hover:bg-rose-100 cursor-pointer transition flex items-center justify-between gap-2';
            row.innerHTML = `
                <span>${resaltarCoincidencia(it.titulo, texto)}</span>
                ${it.subtitulo ? `<span class="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200 shrink-0">${it.subtitulo}</span>` : ''}
            `;
            row.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = it.valorBusqueda || it.titulo;
                cerrarPortalAutocomplete();
                alElegirFn();
            });
            portal.appendChild(row);
        });

        reposicionar();
        portalAutocompleteActivo = { wrapper: input, reposicionar };
    };

    input.addEventListener('input', mostrarSugerencias);
    input.addEventListener('focus', () => {
        if (input.value.trim()) mostrarSugerencias();
    });
}

function filtrarOpcionesSelect(inputElem) {
    // Mantenido por compatibilidad
}

document.addEventListener("DOMContentLoaded", async () => {
    await cargarCategorias();
    await cargarInsumos();
    await cargarProductos();
    await cargarRecetasYMapeos();
    await cargarFichasTecnicas();
    await cargarOperadores();
    await cargarHistoriales();

    const inputFecha = document.getElementById('fecha-produccion-input');
    if (inputFecha && !inputFecha.value) {
        inputFecha.value = new Date().toISOString().slice(0, 10);
    }

    if (document.getElementById('contenedor-lote-productos')?.children.length === 0) {
        agregarFilaProductoLote();
    }
    if (document.getElementById('contenedor-filas-calculadora')?.children.length === 0) {
        agregarFilaCalculadora();
    }

    // Activar selectores buscables con autocompletado en vivo
    ['filtro-cat-insumo', 'filtro-cat-prod', 'filtro-cat-ficha', 'insumo-categoria', 'insumo-unidad', 'prod-categoria', 'ficha-producto-id', 'operador-lote'].forEach(id => {
        const el = document.getElementById(id);
        if (el) crearSelectorBuscable(el);
    });

    // Activar autocompletado en vivo en las barras de búsqueda globales
    configurarSugerenciasBuscadorGlobal('buscador-global-insumos', () => insumosLista.map(i => ({
        titulo: i.nombre,
        subtitulo: `${i.categoria || 'Taller'} • ${i.stock} ${i.unidad}`,
        valorBusqueda: i.nombre
    })), () => cargarInsumos());

    configurarSugerenciasBuscadorGlobal('buscador-global-productos', () => productosLista.map(p => ({
        titulo: p.nombre,
        subtitulo: `${p.categoria || 'Vela'} • ${p.stock} pzas`,
        valorBusqueda: p.nombre
    })), () => cargarProductos());

    configurarSugerenciasBuscadorGlobal('buscar-ficha', () => fichasTecnicasLista.map(f => ({
        titulo: f.producto_nombre,
        subtitulo: f.categoria || 'Ficha',
        valorBusqueda: f.producto_nombre
    })), () => renderizarFichasTecnicas());

    configurarSugerenciasBuscadorGlobal('buscar-cat-insumo', () => categoriasInsumosLista.map(c => ({
        titulo: c.nombre,
        subtitulo: c.padre_nombre ? `Sub de ${c.padre_nombre}` : 'Categoría Principal',
        valorBusqueda: c.nombre
    })), () => renderizarArbolCategorias('insumo'));

    configurarSugerenciasBuscadorGlobal('buscar-cat-prod', () => categoriasProductosLista.map(c => ({
        titulo: c.nombre,
        subtitulo: c.padre_nombre ? `Sub de ${c.padre_nombre}` : 'Categoría Principal',
        valorBusqueda: c.nombre
    })), () => renderizarArbolCategorias('prod'));

    // Restaurar pestaña activa guardada en localStorage
    const pestanaGuardada = localStorage.getItem('pestana_activa_taller') || 'taller';
    cambiarPestana(pestanaGuardada);
});

function cambiarPestana(pestana) {
    localStorage.setItem('pestana_activa_taller', pestana);

    const pestanas = ['taller', 'terminado', 'produccion', 'fichas', 'plan'];
    pestanas.forEach(p => {
        const sec = document.getElementById(`pestana-${p}`);
        const btn = document.getElementById(`tab-${p}-btn`);
        if (sec) sec.classList.add('hidden');
        if (btn) {
            btn.className = 'py-2.5 px-5 rounded-2xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 text-rose-950/70 hover:text-rose-600 hover:bg-rose-50';
        }
    });

    const secActiva = document.getElementById(`pestana-${pestana}`);
    const btnActivo = document.getElementById(`tab-${pestana}-btn`);
    if (secActiva) secActiva.classList.remove('hidden');
    if (btnActivo) {
        btnActivo.className = 'py-2.5 px-5 rounded-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 bg-rose-500 text-white shadow-sm shadow-rose-200';
    }

    if (pestana === 'taller') {
        cargarInsumos();
        cargarHistorialInsumos();
    } else if (pestana === 'terminado') {
        cargarProductos();
        cargarHistorialProductos();
    } else if (pestana === 'produccion') {
        cargarOperadores();
        cargarHistorialProduccion();
        const inputFecha = document.getElementById('fecha-produccion-input');
        if (inputFecha && !inputFecha.value) inputFecha.value = new Date().toISOString().slice(0, 10);
    } else if (pestana === 'fichas') {
        poblarSelectorProductosFicha();
        poblarSelectoresCalculadora();
        poblarFiltroCategoriasFicha();
        renderizarFichasTecnicas();
    } else if (pestana === 'plan') {
        inicializarPestanaPlan();
    }
}

async function cargarHistoriales() {
    await cargarHistorialInsumos();
    await cargarHistorialProductos();
    await cargarHistorialProduccion();
}

let historialInsumosAbierto = false;
let historialProductosAbierto = false;

function toggleHistorialDesplegable(tipo) {
    if (tipo === 'insumos') {
        historialInsumosAbierto = !historialInsumosAbierto;
        const cont = document.getElementById('contenedor-desplegable-historial-insumos');
        const icono = document.getElementById('icono-flecha-historial-insumos');
        if (cont) {
            if (historialInsumosAbierto) {
                cont.classList.remove('hidden');
                if (icono) icono.innerText = '▲ Ocultar Historial';
                cargarHistorialInsumos();
            } else {
                cont.classList.add('hidden');
                if (icono) icono.innerText = '▼ Ver Historial';
            }
        }
    } else {
        historialProductosAbierto = !historialProductosAbierto;
        const cont = document.getElementById('contenedor-desplegable-historial-productos');
        const icono = document.getElementById('icono-flecha-historial-productos');
        if (cont) {
            if (historialProductosAbierto) {
                cont.classList.remove('hidden');
                if (icono) icono.innerText = '▲ Ocultar Historial';
                cargarHistorialProductos();
            } else {
                cont.classList.add('hidden');
                if (icono) icono.innerText = '▼ Ver Historial';
            }
        }
    }
}

async function cargarHistorialInsumos() {
    try {
        const limite = document.getElementById('limite-historial-insumos')?.value || '10';
        const fecha = document.getElementById('filtro-fecha-historial-insumos')?.value || '';
        let url = `/api/historial-insumos?limit=${limite}`;
        if (fecha) url += `&fecha=${encodeURIComponent(fecha)}`;

        const res = await fetch(url);
        const data = await res.json();
        
        const badgeCont = document.getElementById('badge-contador-historial-insumos');
        if (badgeCont && Array.isArray(data)) {
            badgeCont.innerText = `${data.length} movimientos`;
        }

        const tbody = document.getElementById('tabla-historial-insumos');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-5 text-center text-rose-300 font-bold">No hay movimientos registrados con los filtros seleccionados.</td></tr>`;
            return;
        }

        data.forEach(h => {
            const esEntrada = h.tipo === 'ENTRADA';
            const tipoBadge = esEntrada 
                ? `<span class="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-xl font-black text-xs inline-flex items-center gap-1 border border-emerald-200"><span>▲</span> Entrada</span>` 
                : `<span class="bg-rose-100 text-rose-800 px-3 py-1 rounded-xl font-black text-xs inline-flex items-center gap-1 border border-rose-200"><span>▼</span> Salida / Consumo</span>`;

            let origenBadge = `<span class="text-slate-500 text-xs font-semibold">✏️ Ajuste manual</span>`;
            if (h.codigo_lote === 'STOCK_INICIAL') {
                origenBadge = `<span class="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-xl text-xs font-black">Stock Inicial</span>`;
            } else if (h.tipo === 'SALIDA') {
                origenBadge = `<span class="bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-1 rounded-xl text-xs font-black">🏭 Consumo en taller</span>`;
            }

            tbody.innerHTML += `
                <tr class="hover:bg-rose-50/50 transition border-b border-rose-100">
                    <td class="p-3.5 text-slate-500 font-medium text-xs whitespace-nowrap">${formatearFechaCDMX(h.fecha)}</td>
                    <td class="p-3.5 font-black text-rose-950 text-sm">${h.insumo_nombre}</td>
                    <td class="p-3.5">${tipoBadge}</td>
                    <td class="p-3.5 font-black text-rose-900 text-sm sm:text-base">${esEntrada ? '+' : '-'}${Math.abs(h.cantidad)} ${h.unidad || ''}</td>
                    <td class="p-3.5">${origenBadge}</td>
                    <td class="p-3.5 text-center">
                        <button onclick="eliminarMovimientoInsumo(${h.id}, '${h.insumo_nombre}', ${h.cantidad}, '${h.tipo}')" class="bg-red-50 text-red-600 hover:bg-red-100 px-3.5 py-1.5 rounded-xl font-black text-xs transition border border-red-200 active:scale-95">✕ Eliminar</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error("Error cargando historial de insumos:", e);
    }
}

async function eliminarMovimientoInsumo(id, nombreInsumo, cantidad, tipo) {
    const accion = tipo === 'ENTRADA' ? 'restará' : 'devolverá';
    if (!confirm(`¿Estás seguro de eliminar este registro del historial?\n\nInsumo: ${nombreInsumo}\nCantidad: ${cantidad}\n\n⚠️ Al eliminarlo, esta cantidad se ${accion} automáticamente del stock actual en el taller.`)) return;

    const res = await fetch(`/api/historial-insumos/${id}`, { method: 'DELETE' });
    if (res.ok) {
        alert("Movimiento eliminado y stock actualizado correctamente.");
        await cargarInsumos(true);
        cargarHistorialInsumos();
    } else {
        alert("Error al eliminar el movimiento.");
    }
}

async function cargarHistorialProductos() {
    try {
        const limite = document.getElementById('limite-historial-productos')?.value || '10';
        const fecha = document.getElementById('filtro-fecha-historial-productos')?.value || '';
        let url = `/api/historial-productos?limit=${limite}`;
        if (fecha) url += `&fecha=${encodeURIComponent(fecha)}`;

        const res = await fetch(url);
        const data = await res.json();

        const badgeCont = document.getElementById('badge-contador-historial-productos');
        if (badgeCont && Array.isArray(data)) {
            badgeCont.innerText = `${data.length} movimientos`;
        }

        const tbody = document.getElementById('tabla-historial-productos');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-5 text-center text-rose-300 font-bold">No hay entradas registradas con los filtros seleccionados.</td></tr>`;
            return;
        }

        data.forEach(h => {
            const esEntrada = h.tipo === 'ENTRADA';
            const tipoBadge = esEntrada 
                ? `<span class="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-xl font-black text-xs inline-flex items-center gap-1 border border-emerald-200"><span>▲</span> Entrada</span>` 
                : `<span class="bg-rose-100 text-rose-800 px-3 py-1 rounded-xl font-black text-xs inline-flex items-center gap-1 border border-rose-200"><span>▼</span> Salida / Resta</span>`;

            let origenHtml = '';
            if (h.origen === 'PRODUCCION') {
                origenHtml = `
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="bg-rose-100 text-rose-900 border border-rose-300 px-2.5 py-1 rounded-xl text-xs font-black">🏭 Producción de taller</span>
                        <span class="bg-pink-100 text-pink-800 px-2.5 py-1 rounded-xl text-xs font-bold">👤 ${h.operador || 'Taller'}</span>
                    </div>
                `;
            } else if (h.codigo_lote === 'STOCK_INICIAL') {
                origenHtml = `<span class="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-xl text-xs font-black">Stock Inicial</span>`;
            } else {
                origenHtml = `<span class="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1">✏️ Agregado manualmente</span>`;
            }

            tbody.innerHTML += `
                <tr class="hover:bg-rose-50/50 transition border-b border-rose-100">
                    <td class="p-3.5 text-slate-500 font-medium text-xs whitespace-nowrap">${formatearFechaCDMX(h.fecha)}</td>
                    <td class="p-3.5 font-black text-rose-950 text-sm">${h.producto_nombre}</td>
                    <td class="p-3.5">${tipoBadge}</td>
                    <td class="p-3.5 font-black text-rose-900 text-sm sm:text-base">${esEntrada ? '+' : '-'}${Math.abs(h.cantidad)} pzas</td>
                    <td class="p-3.5">${origenHtml}</td>
                    <td class="p-3.5 text-center">
                        <button onclick="eliminarMovimientoProducto(${h.id}, '${h.producto_nombre}', ${h.cantidad}, '${h.tipo}')" class="bg-red-50 text-red-600 hover:bg-red-100 px-3.5 py-1.5 rounded-xl font-black text-xs transition border border-red-200 active:scale-95">✕ Eliminar</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error("Error cargando historial de productos:", e);
    }
}

async function eliminarMovimientoProducto(id, nombreProd, cantidad, tipo) {
    const accion = tipo === 'ENTRADA' ? 'descontará' : 'devolverá';
    if (!confirm(`¿Estás seguro de eliminar este registro del historial?\n\nProducto: ${nombreProd}\nCantidad: ${cantidad}\n\n⚠️ Al eliminarlo, esta cantidad se ${accion} automáticamente del inventario de producto terminado.`)) return;

    const res = await fetch(`/api/historial-productos/${id}`, { method: 'DELETE' });
    if (res.ok) {
        alert("Movimiento eliminado y stock actualizado correctamente.");
        await cargarProductos(true);
        cargarHistorialProductos();
    } else {
        alert("Error al eliminar el movimiento.");
    }
}

async function cargarHistorialProduccion() {
    try {
        const res = await fetch('/api/historial-produccion');
        const data = await res.json();
        const tbody = document.getElementById('tabla-historial-produccion');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-5 text-center text-rose-300 font-bold">No hay producciones registradas en el historial.</td></tr>`;
            return;
        }

        data.forEach(h => {
            const fechaProd = h.fecha_produccion ? h.fecha_produccion : (h.fecha ? formatearFechaCDMX(h.fecha) : 'N/A');
            const operadorBadge = `<span class="bg-rose-100 text-rose-900 border border-rose-300 px-3 py-1 rounded-xl text-xs font-black">👤 ${h.operador || 'Taller'}</span>`;

            tbody.innerHTML += `
                <tr class="hover:bg-rose-50/50 transition border-b border-rose-100">
                    <td class="p-3.5 text-slate-600 font-bold text-xs whitespace-nowrap">${fechaProd}</td>
                    <td class="p-3.5">${operadorBadge}</td>
                    <td class="p-3.5 text-rose-950 font-black text-sm">${h.detalle || h.resumen || 'Detalle no disponible'}</td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <button onclick="eliminarLoteProduccion(${h.id})" class="bg-red-50 text-red-600 hover:bg-red-100 px-3.5 py-1.5 rounded-xl font-black text-xs transition border border-red-200 active:scale-95">↺ Revertir / Eliminar</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error("Error cargando historial de producción:", e);
    }
}

async function eliminarLoteProduccion(id) {
    if (!confirm(`¿Estás seguro de eliminar y revertir esta producción?\n\n⚠️ Al eliminarla:\n1. Se RESTARÁN las velas fabricadas de tu inventario de Producto Terminado.\n2. Se DEVOLVERÁN (sumarán) todos los insumos consumidos a tu inventario de Taller.\n3. Los demás movimientos de tus historiales permanecerán intactos.`)) return;

    const res = await fetch(`/api/historial-produccion/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
        alert(data.message || "Producción revertida: se restaron las velas terminadas y se devolvieron los insumos al taller.");
        await cargarInsumos();
        await cargarProductos();
        await cargarHistoriales();
    } else {
        alert("Error al revertir la producción: " + (data.error || "Error desconocido"));
    }
}

async function cargarRecetasYMapeos() {
    try {
        const resR = await fetch('/api/recetas');
        todasLasRecetas = await resR.json();
        const resM = await fetch('/api/mapeos-todos');
        todosLosMapeos = await resM.json();
    } catch (e) {
        console.error("Error cargando recetas/mapeos:", e);
    }
}

async function cargarCategorias() {
    try {
        const resCatInsumo = await fetch('/api/categorias-insumos');
        categoriasInsumosLista = await resCatInsumo.json();
        
        const selectCatInsumo = document.getElementById('insumo-categoria');
        const filtroCatInsumo = document.getElementById('filtro-cat-insumo');
        
        if (selectCatInsumo) selectCatInsumo.innerHTML = '<option value="">Categoría / Subcategoría...</option>';
        if (filtroCatInsumo) filtroCatInsumo.innerHTML = '<option value="">Todas las categorías</option>';

        const principalesInsumo = categoriasInsumosLista.filter(c => !c.padre_id);
        principalesInsumo.forEach(padre => {
            let optGroupForm = `<optgroup label="📁 ${padre.nombre}">`;
            optGroupForm += `<option value="${padre.id}">📁 ${padre.nombre} (Principal)</option>`;
            
            let optGroupFiltro = `<optgroup label="📁 ${padre.nombre}">`;
            optGroupFiltro += `<option value="${padre.id}">📁 ${padre.nombre} (Todo)</option>`;

            const subs = categoriasInsumosLista.filter(c => c.padre_id === padre.id);
            subs.forEach(sub => {
                optGroupForm += `<option value="${sub.id}">&nbsp;&nbsp;↳ ${sub.nombre}</option>`;
                optGroupFiltro += `<option value="${sub.id}">&nbsp;&nbsp;↳ ${sub.nombre}</option>`;
            });

            optGroupForm += `</optgroup>`;
            optGroupFiltro += `</optgroup>`;

            if (selectCatInsumo) selectCatInsumo.innerHTML += optGroupForm;
            if (filtroCatInsumo) filtroCatInsumo.innerHTML += optGroupFiltro;
        });

        if (selectCatInsumo) crearSelectorBuscable(selectCatInsumo, 'Selecciona categoría...');
        if (filtroCatInsumo) crearSelectorBuscable(filtroCatInsumo, 'Todas las categorías');

        renderizarArbolCategorias('insumo');

        const resCatProd = await fetch('/api/categorias-productos');
        categoriasProductosLista = await resCatProd.json();

        const selectCatProd = document.getElementById('prod-categoria');
        const filtroCatProd = document.getElementById('filtro-cat-prod');

        if (selectCatProd) selectCatProd.innerHTML = '<option value="">Categoría / Subcategoría...</option>';
        if (filtroCatProd) filtroCatProd.innerHTML = '<option value="">Todas las categorías</option>';

        const principalesProd = categoriasProductosLista.filter(c => !c.padre_id);
        principalesProd.forEach(padre => {
            let optGroupForm = `<optgroup label="📁 ${padre.nombre}">`;
            optGroupForm += `<option value="${padre.id}">📁 ${padre.nombre} (Principal)</option>`;
            
            let optGroupFiltro = `<optgroup label="📁 ${padre.nombre}">`;
            optGroupFiltro += `<option value="${padre.id}">📁 ${padre.nombre} (Todo)</option>`;

            const subs = categoriasProductosLista.filter(c => c.padre_id === padre.id);
            subs.forEach(sub => {
                optGroupForm += `<option value="${sub.id}">&nbsp;&nbsp;↳ ${sub.nombre}</option>`;
                optGroupFiltro += `<option value="${sub.id}">&nbsp;&nbsp;↳ ${sub.nombre}</option>`;
            });

            optGroupForm += `</optgroup>`;
            optGroupFiltro += `</optgroup>`;

            if (selectCatProd) selectCatProd.innerHTML += optGroupForm;
            if (filtroCatProd) filtroCatProd.innerHTML += optGroupFiltro;
        });

        if (selectCatProd) crearSelectorBuscable(selectCatProd, 'Selecciona categoría...');
        if (filtroCatProd) crearSelectorBuscable(filtroCatProd, 'Todas las categorías');

        renderizarArbolCategorias('prod');
        poblarFiltroCategoriasFicha();

    } catch (e) {
        console.error("Error cargando categorías:", e);
    }
}

function renderizarArbolCategorias(tipo) {
    const lista = tipo === 'insumo' ? categoriasInsumosLista : categoriasProductosLista;
    const contenedor = document.getElementById(tipo === 'insumo' ? 'arbol-cat-insumo' : 'arbol-cat-prod');
    const contador = document.getElementById(tipo === 'insumo' ? 'count-cat-insumo' : 'count-cat-prod');
    const inputFiltro = document.getElementById(tipo === 'insumo' ? 'buscar-cat-insumo' : 'buscar-cat-prod');

    if (!contenedor) return;

    const filtroTexto = normalizarTexto(inputFiltro?.value || '');
    if (contador) contador.innerText = lista.length;
    contenedor.innerHTML = '';

    if (lista.length === 0) {
        contenedor.innerHTML = `
            <div class="text-center py-6 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p class="text-xs mb-2">No tienes categorías registradas aún.</p>
                <button type="button" onclick="abrirModalCrearCategoria('${tipo}')" class="bg-indigo-50 text-indigo-700 font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-indigo-100 transition">
                    + Crear tu primera categoría
                </button>
            </div>
        `;
        return;
    }

    const principales = lista.filter(c => !c.padre_id);
    const principalesMostrar = principales.filter(p => {
        if (!filtroTexto) return true;
        const nombrePadre = normalizarTexto(p.nombre);
        const subs = lista.filter(c => c.padre_id === p.id);
        const coincideSub = subs.some(s => normalizarTexto(s.nombre).includes(filtroTexto));
        return nombrePadre.includes(filtroTexto) || coincideSub;
    });

    if (principalesMostrar.length === 0) {
        contenedor.innerHTML = `<div class="text-center py-4 text-xs text-slate-400">No se encontraron categorías con "${inputFiltro?.value || ''}".</div>`;
        return;
    }

    principalesMostrar.forEach(padre => {
        const subs = lista.filter(c => c.padre_id === padre.id);
        
        const cantItemsPadre = tipo === 'insumo' 
            ? insumosLista.filter(i => i.categoria_id === padre.id).length
            : productosLista.filter(p => p.categoria_id === padre.id).length;

        const labelItemsPadre = cantItemsPadre === 1 
            ? `1 ${tipo === 'insumo' ? 'insumo' : 'producto'}` 
            : `${cantItemsPadre} ${tipo === 'insumo' ? 'insumos' : 'productos'}`;

        let badgeTemporadaPadre = '';
        if (tipo === 'prod') {
            const estaActiva = padre.activa !== 0;
            badgeTemporadaPadre = `
                <button type="button" onclick="alternarTemporadaCategoria(${padre.id})" class="text-[10px] font-bold px-2 py-0.5 rounded-md border transition ${estaActiva ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'}" title="${estaActiva ? 'Categoría activa en temporada. Clic para pausar.' : 'Categoría fuera de temporada (oculta en calculadora/producción). Clic para activar.'}">
                    ${estaActiva ? '☀️ En temporada' : '❄️ Pausada'}
                </button>
            `;
        }
        let badgeFormulaPadre = '';
        if (tipo === 'prod') {
            const recetaCat = todasLasRecetas.filter(r => r.categoria_id === padre.id);
            if (recetaCat.length > 0) {
                badgeFormulaPadre = `
                    <button type="button" onclick="abrirModalRecetaCat(${padre.id})" class="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold px-2 py-0.5 rounded-md hover:bg-emerald-100 flex items-center gap-1 transition shadow-xs" title="Ver / Modificar fórmula base">
                        🧪 Base: ${recetaCat.length} ins.
                    </button>
                `;
            } else {
                badgeFormulaPadre = `
                    <button type="button" onclick="abrirModalRecetaCat(${padre.id})" class="text-[10px] bg-slate-100 hover:bg-indigo-50 text-indigo-700 border border-dashed border-indigo-300 font-semibold px-2 py-0.5 rounded-md transition" title="Definir fórmula predeterminada para esta categoría">
                        + Asignar Fórmula
                    </button>
                `;
            }
        }

        let htmlSubs = '';
        subs.forEach(sub => {
            const cantItemsSub = tipo === 'insumo' 
                ? insumosLista.filter(i => i.categoria_id === sub.id).length
                : productosLista.filter(p => p.categoria_id === sub.id).length;

            const labelItemsSub = cantItemsSub === 1 
                ? `1 ${tipo === 'insumo' ? 'insumo' : 'producto'}` 
                : `${cantItemsSub} ${tipo === 'insumo' ? 'insumos' : 'productos'}`;

            let badgeTemporadaSub = '';
            if (tipo === 'prod') {
                const subActiva = sub.activa !== 0 && padre.activa !== 0;
                badgeTemporadaSub = `
                    <button type="button" onclick="alternarTemporadaCategoria(${sub.id})" class="text-[9px] font-bold px-1.5 py-0.5 rounded border transition ${subActiva ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'}" title="${subActiva ? 'Subcategoría activa' : 'Subcategoría pausada'}">
                        ${subActiva ? '☀️ Activa' : '❄️ Pausada'}
                    </button>
                `;
            }
            let badgeFormulaSub = '';
            if (tipo === 'prod') {
                const recetaSub = todasLasRecetas.filter(r => r.categoria_id === sub.id);
                if (recetaSub.length > 0) {
                    badgeFormulaSub = `
                        <button type="button" onclick="abrirModalRecetaCat(${sub.id})" class="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold px-2 py-0.5 rounded-md hover:bg-emerald-100 flex items-center gap-1 transition shadow-xs" title="Fórmula propia para esta subcategoría">
                            🧪 Propia: ${recetaSub.length} ins.
                        </button>
                    `;
                } else {
                    badgeFormulaSub = `
                        <button type="button" onclick="abrirModalRecetaCat(${sub.id})" class="text-[10px] text-slate-400 hover:text-indigo-600 underline" title="Hereda fórmula de la principal, o haz clic para personalizar">
                            (Hereda fórmula)
                        </button>
                    `;
                }
            }

            htmlSubs += `
                <div class="flex items-center justify-between gap-2 bg-white p-2 rounded-lg border border-slate-200 hover:border-indigo-300 transition group shadow-xs">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-slate-400 text-xs font-mono select-none">↳</span>
                        <span class="text-xs font-bold text-slate-700">${sub.nombre}</span>
                        <span class="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">${labelItemsSub}</span>
                        ${badgeFormulaSub} ${badgeTemporadaSub}
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="abrirModalEditarCategoria('${tipo}', ${sub.id})" class="text-xs text-slate-500 hover:text-indigo-600 p-1 hover:bg-slate-100 rounded" title="Editar nombre o cambiar categoría principal">✏️</button>
                        <button type="button" onclick="eliminarCategoriaSegura('${tipo}', ${sub.id})" class="text-xs text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded" title="Eliminar subcategoría">✕</button>
                    </div>
                </div>
            `;
        });

        contenedor.innerHTML += `
            <div class="border border-slate-200 rounded-xl bg-slate-50/70 p-3 space-y-2 hover:border-indigo-200 transition shadow-xs">
                <!-- Encabezado Categoría Principal -->
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-sm">📁</span>
                        <span class="font-extrabold text-slate-800 text-xs sm:text-sm">${padre.nombre}</span>
                        <span class="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">Principal</span>
                        <span class="text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">${labelItemsPadre}</span>
                        ${badgeFormulaPadre} ${badgeTemporadaPadre}
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="abrirModalCrearSubcategoria('${tipo}', ${padre.id})" class="text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded-md transition flex items-center gap-1 whitespace-nowrap shadow-xs" title="Crear una subcategoría dentro de ${padre.nombre}">
                            <span>+</span> Subcategoría
                        </button>
                        <button type="button" onclick="abrirModalEditarCategoria('${tipo}', ${padre.id})" class="text-xs text-slate-500 hover:text-indigo-600 p-1 hover:bg-white rounded" title="Editar categoría">✏️</button>
                        <button type="button" onclick="eliminarCategoriaSegura('${tipo}', ${padre.id})" class="text-xs text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded" title="Eliminar categoría principal">✕</button>
                    </div>
                </div>

                <!-- Subcategorías si existen -->
                ${subs.length > 0 ? `
                    <div class="pl-4 space-y-1.5 border-l-2 border-indigo-200 ml-2 mt-2">
                        ${htmlSubs}
                    </div>
                ` : `
                    <div class="pl-4 border-l-2 border-slate-200 ml-2 pt-0.5">
                        <button type="button" onclick="abrirModalCrearSubcategoria('${tipo}', ${padre.id})" class="text-[11px] text-slate-400 hover:text-indigo-600 italic hover:underline">
                            + Añadir subcategoría aquí (ej. tamaños o variantes)
                        </button>
                    </div>
                `}
            </div>
        `;
    });
}

function filtrarCategoríasRegistradas(tipo) {
    renderizarArbolCategorias(tipo);
}

async function cargarInsumos() {
    try {
        const filtroCat = document.getElementById('filtro-cat-insumo')?.value || '';
        const buscarTexto = normalizarTexto(document.getElementById('buscador-global-insumos')?.value || '');
        const filtroTemporada = document.getElementById('filtro-temporada-insumo')?.value || 'todos';
        
        let url = '/api/insumos';
        if (filtroCat) {
            url = `/api/insumos?categoria_id=${filtroCat}`;
        }
        
        const res = await fetch(url);
        insumosLista = await res.json();
        
        if (insumosLista.length === 0) {
            for (let idx = localStorage.length - 1; idx >= 0; idx--) {
                const k = localStorage.key(idx);
                if (k && k.startsWith('min_stock_insumo_')) {
                    localStorage.removeItem(k);
                }
            }
        }

        let listaMostrar = insumosLista;
        if (buscarTexto) {
            listaMostrar = insumosLista.filter(i => {
                const nombre = normalizarTexto(i.nombre);
                const cat = normalizarTexto(i.categoria || '');
                const padre = normalizarTexto(i.categoria_padre || '');
                return nombre.includes(buscarTexto) || cat.includes(buscarTexto) || padre.includes(buscarTexto);
            });
        }

        // Filtro estricto de Colección / Temporada / Alerta de Stock para Insumos
        if (filtroTemporada === 'stock_bajo') {
            // ALERTA DE STOCK: filtra solo insumos con stock menor o igual al mínimo configurado
            listaMostrar = listaMostrar.filter(i => {
                const minStockVal = parseFloat(localStorage.getItem(`min_stock_insumo_${i.id}`) || '5');
                return i.stock <= minStockVal;
            });
        } else if (filtroTemporada === 'linea') {
            listaMostrar = listaMostrar.filter(i => i.es_temporada !== 1 && i.activa !== 0 && i.categoria_activa !== 0 && i.categoria_padre_activa !== 0);
        } else if (filtroTemporada === 'temporada') {
            listaMostrar = listaMostrar.filter(i => i.es_temporada === 1 && i.activa !== 0 && i.categoria_activa !== 0 && i.categoria_padre_activa !== 0);
        } else if (filtroTemporada === 'pausados') {
            listaMostrar = listaMostrar.filter(i => (i.activa === 0) || (i.categoria_activa === 0) || (i.categoria_padre_activa === 0));
        } else {
            // 'todos': no se muestran pausados
            listaMostrar = listaMostrar.filter(i => (i.activa !== 0) && (i.categoria_activa !== 0) && (i.categoria_padre_activa !== 0));
        }

        const tabla = document.getElementById('tabla-insumos');
        if (!tabla) return;
        tabla.innerHTML = '';

        if (listaMostrar.length === 0) {
            tabla.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-gray-400">No hay insumos que coincidan con la selección.</td></tr>`;
            return;
        }

        listaMostrar.forEach(i => {
            const catNombre = i.categoria_padre ? `${i.categoria_padre} ➔ ${i.categoria}` : (i.categoria || 'Sin categoría');
            const tipoInsumo = i.es_generico === 1 
                ? `<span class="bg-rose-100 text-rose-900 border border-rose-200 px-2.5 py-1 rounded-xl text-xs font-black">Genérico / Plantilla</span>` 
                : `<span class="text-rose-900/70 text-xs font-bold">Aroma / Específico</span>`;

            const minStockKey = `min_stock_insumo_${i.id}`;
            const minStockVal = parseFloat(localStorage.getItem(minStockKey) || '5');
            const esStockBajo = i.stock <= minStockVal;

            const stockBadge = esStockBajo
                ? `<span class="bg-red-100 text-red-700 border-2 border-red-300 px-3 py-1 rounded-xl text-sm sm:text-base font-black flex items-center gap-1 inline-flex shadow-xs" title="¡Stock bajo!">⚠️ ${i.stock}</span>`
                : `<span class="text-base sm:text-lg font-black text-rose-950">${i.stock}</span>`;

            // Columna de Colección / Temporada para Insumo
            let colTemporada = '';
            const estaPausado = (i.activa === 0) || (i.categoria_activa === 0) || (i.categoria_padre_activa === 0);

            if (i.es_temporada === 1) {
                if (estaPausado) {
                    colTemporada = `
                        <button type="button" onclick="alternarTemporadaInsumo(${i.id})" class="text-xs font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200 transition shadow-2xs cursor-pointer" title="Insumo de temporada pausado. Clic para reactivar.">
                            ❄️ Pausado
                        </button>
                    `;
                } else {
                    colTemporada = `
                        <button type="button" onclick="alternarTemporadaInsumo(${i.id})" class="text-xs font-bold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition shadow-2xs cursor-pointer" title="Insumo de temporada activo. Clic para pausar.">
                            🍁 Temporada
                        </button>
                    `;
                }
            } else {
                colTemporada = `<span class="text-xs font-semibold text-slate-400 select-none">De línea</span>`;
            }

            tabla.innerHTML += `
                <tr class="hover:bg-rose-50/40 transition border-b border-rose-100 ${esStockBajo ? 'bg-red-50/50' : ''}">
                    <td class="p-3.5 font-black text-rose-950 text-sm sm:text-base">${i.nombre}</td>
                    <td class="p-3.5 text-rose-800 text-xs sm:text-sm font-semibold">${catNombre}</td>
                    <td class="p-3.5">${tipoInsumo}</td>
                    <td class="p-3.5">
                        <div class="flex items-center gap-2">
                            ${stockBadge}
                            <button onclick="cambiarMinimoStockInsumo(${i.id}, ${minStockVal})" class="text-[11px] text-rose-400 hover:text-rose-600 font-bold underline" title="Ajustar mínimo">Mín: ${minStockVal}</button>
                        </div>
                    </td>
                    <td class="p-3.5 text-rose-900 font-bold text-xs uppercase">${i.unidad}</td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        ${colTemporada}
                    </td>
                    <td class="p-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5 bg-rose-50/60 p-1 rounded-2xl border border-rose-200">
                            <input type="number" step="0.01" id="sumar-stock-insumo-${i.id}" placeholder="Cant." class="w-20 border-2 border-rose-200 p-1.5 rounded-xl text-xs sm:text-sm text-center font-black text-rose-950 bg-white focus:outline-none focus:border-rose-400">
                            <button onclick="ajustarStockInsumo(${i.id}, 1)" class="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-xs transition active:scale-95" title="Agregar">+ Entrada</button>
                            <button onclick="ajustarStockInsumo(${i.id}, -1)" class="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-xs transition active:scale-95" title="Restar">- Restar</button>
                        </div>
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <button onclick="prepararEditarInsumo(${i.id})" class="bg-rose-100 text-rose-800 hover:bg-rose-200 px-3 py-1.5 rounded-xl text-xs font-black mr-1 transition border border-rose-300">✏️ Editar</button>
                        <button onclick="eliminarInsumo(${i.id}, '${i.nombre}')" class="bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-1.5 rounded-xl text-xs font-black transition border border-red-200">✕</button>
                    </td>
                </tr>
            `;
        });
        renderizarArbolCategorias('insumo');
    } catch (e) {
        console.error("Error cargando insumos:", e);
    }
}

function cambiarMinimoStockInsumo(id, actual) {
    const nuevo = prompt("Define la cantidad mínima de stock para la alerta en rojo:", actual);
    if (nuevo === null || isNaN(parseFloat(nuevo))) return;
    localStorage.setItem(`min_stock_insumo_${id}`, parseFloat(nuevo));
    cargarInsumos();
}

function cambiarMinimoStockProd(id, actual) {
    const nuevo = prompt("Define la cantidad mínima de piezas para la alerta en rojo:", actual);
    if (nuevo === null || isNaN(parseFloat(nuevo))) return;
    localStorage.setItem(`min_stock_prod_${id}`, parseFloat(nuevo));
    cargarProductos();
}

async function cargarProductos() {
    try {
        const filtroCat = document.getElementById('filtro-cat-prod')?.value || '';
        const buscarTexto = normalizarTexto(document.getElementById('buscador-global-productos')?.value || '');
        const filtroTemporada = document.getElementById('filtro-temporada-prod')?.value || 'todos';

        let url = '/api/productos-terminados';
        if (filtroCat) {
            url = `/api/productos-terminados?categoria_id=${filtroCat}`;
        }

        const res = await fetch(url);
        productosLista = await res.json();
        
        if (productosLista.length === 0) {
            configuracionesMezclasGuardadas = {};
            localStorage.removeItem('configuracionesMezclasGuardadas');
            for (let idx = localStorage.length - 1; idx >= 0; idx--) {
                const k = localStorage.key(idx);
                if (k && k.startsWith('min_stock_prod_')) {
                    localStorage.removeItem(k);
                }
            }
        } else {
            const idsValidos = new Set(productosLista.map(p => String(p.id)));
            let modificado = false;
            for (let k in configuracionesMezclasGuardadas) {
                if (!idsValidos.has(String(k))) {
                    delete configuracionesMezclasGuardadas[k];
                    modificado = true;
                }
            }
            if (modificado) {
                localStorage.setItem('configuracionesMezclasGuardadas', JSON.stringify(configuracionesMezclasGuardadas));
            }
        }

        let listaMostrar = productosLista;
        if (buscarTexto) {
            listaMostrar = productosLista.filter(p => {
                const nombre = normalizarTexto(p.nombre);
                const cat = normalizarTexto(p.categoria || '');
                const padre = normalizarTexto(p.categoria_padre || '');
                return nombre.includes(buscarTexto) || cat.includes(buscarTexto) || padre.includes(buscarTexto);
            });
        }

        // Filtro estricto de Colección / Temporada / Alerta de Stock para Productos
        if (filtroTemporada === 'stock_bajo') {
            // ALERTA DE STOCK: filtra solo productos terminados con stock menor o igual al mínimo configurado
            listaMostrar = listaMostrar.filter(p => {
                const minStockVal = parseFloat(localStorage.getItem(`min_stock_prod_${p.id}`) || '3');
                return p.stock <= minStockVal;
            });
        } else if (filtroTemporada === 'linea') {
            listaMostrar = listaMostrar.filter(p => p.es_temporada !== 1 && p.activa !== 0 && p.categoria_activa !== 0 && p.categoria_padre_activa !== 0);
        } else if (filtroTemporada === 'temporada') {
            listaMostrar = listaMostrar.filter(p => p.es_temporada === 1 && p.activa !== 0 && p.categoria_activa !== 0 && p.categoria_padre_activa !== 0);
        } else if (filtroTemporada === 'pausados') {
            listaMostrar = listaMostrar.filter(p => (p.activa === 0) || (p.categoria_activa === 0) || (p.categoria_padre_activa === 0));
        } else {
            listaMostrar = listaMostrar.filter(p => (p.activa !== 0) && (p.categoria_activa !== 0) && (p.categoria_padre_activa !== 0));
        }

        const tabla = document.getElementById('tabla-productos');
        if (!tabla) return;
        tabla.innerHTML = '';

        poblarSelectorProductosFicha();

        if (listaMostrar.length === 0) {
            tabla.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-400">No hay productos que coincidan con la búsqueda.</td></tr>`;
            return;
        }

        listaMostrar.forEach(p => {
            const catNombre = p.categoria_padre ? `${p.categoria_padre} ➔ ${p.categoria}` : (p.categoria || 'Sin categoría');
            
            let fases = [];
            try {
                fases = typeof p.fases_json === 'string' ? JSON.parse(p.fases_json) : (p.fases_json || []);
            } catch(e) {
                fases = [];
            }

            let tipoReceta = '';
            if (p.tipo_producto === 'postre' || (Array.isArray(fases) && fases.length > 0)) {
                const resumenFases = fases.map(f => `${f.nombre} (${f.color || 'Sin color'})`).join(' + ');
                tipoReceta = `
                    <div>
                        <span class="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs font-bold inline-flex items-center gap-1">
                            🧁 Postre (${fases.length} fases)
                        </span>
                        <div class="text-[11px] text-gray-500 mt-0.5 max-w-[200px] truncate" title="${resumenFases}">
                            ${resumenFases || 'Fases configuradas'}
                        </div>
                    </div>
                `;
            } else if (p.usa_receta_propia === 1) {
                tipoReceta = `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs font-bold">🕯️ Especial propia</span>`;
            } else {
                tipoReceta = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold">📁 Fórmula Categoría</span>`;
            }

            const minStockKey = `min_stock_prod_${p.id}`;
            const minStockVal = parseFloat(localStorage.getItem(minStockKey) || '3');
            const esStockBajo = p.stock <= minStockVal;

            const stockBadge = esStockBajo
                ? `<span class="bg-red-100 text-red-700 border-2 border-red-300 px-3 py-1 rounded-xl text-sm sm:text-base font-black flex items-center gap-1 inline-flex shadow-xs" title="¡Inventario bajo!">⚠️ ${p.stock} pzas</span>`
                : `<span class="text-base sm:text-lg font-black text-rose-950">${p.stock} pzas</span>`;

            // Columna de Colección / Temporada
            let colTemporada = '';
            const estaPausado = (p.activa === 0) || (p.categoria_activa === 0) || (p.categoria_padre_activa === 0);

            if (p.es_temporada === 1) {
                if (estaPausado) {
                    colTemporada = `
                        <button type="button" onclick="alternarTemporadaProducto(${p.id})" class="text-xs font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200 transition shadow-2xs cursor-pointer" title="Producto de temporada pausado. Clic para reactivar.">
                            ❄️ Pausado
                        </button>
                    `;
                } else {
                    colTemporada = `
                        <button type="button" onclick="alternarTemporadaProducto(${p.id})" class="text-xs font-bold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition shadow-2xs cursor-pointer" title="Producto de temporada activo. Clic para pausar.">
                            🍁 Temporada
                        </button>
                    `;
                }
            } else {
                colTemporada = `<span class="text-xs font-semibold text-slate-400 select-none">De línea</span>`;
            }

            tabla.innerHTML += `
                <tr class="hover:bg-rose-50/40 transition border-b border-rose-100 ${esStockBajo ? 'bg-red-50/50' : ''}">
                    <td class="p-3.5 font-black text-rose-950 text-sm sm:text-base">${p.nombre}</td>
                    <td class="p-3.5 text-rose-800 text-xs sm:text-sm font-semibold">${catNombre}</td>
                    <td class="p-3.5">${tipoReceta}</td>
                    <td class="p-3.5">
                        <div class="flex items-center gap-2">
                            ${stockBadge}
                            <button onclick="cambiarMinimoStockProd(${p.id}, ${minStockVal})" class="text-[11px] text-rose-400 hover:text-rose-600 font-bold underline" title="Ajustar mínimo">Mín: ${minStockVal}</button>
                        </div>
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        ${colTemporada}
                    </td>
                    <td class="p-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5 bg-rose-50/60 p-1 rounded-2xl border border-rose-200">
                            <input type="number" step="1" id="sumar-stock-prod-${p.id}" placeholder="Cant." class="w-20 border-2 border-rose-200 p-1.5 rounded-xl text-xs sm:text-sm text-center font-black text-rose-950 bg-white focus:outline-none focus:border-rose-400">
                            <button onclick="ajustarStockProducto(${p.id}, 1)" class="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-xs transition active:scale-95" title="Agregar stock">+ Entrada</button>
                            <button onclick="ajustarStockProducto(${p.id}, -1)" class="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-xs transition active:scale-95" title="Restar stock">- Restar</button>
                        </div>
                    </td>
                    <td class="p-3.5 text-center whitespace-nowrap">
                        <button onclick="duplicarProducto(${p.id})" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-xl text-xs font-black mr-1 transition shadow-xs active:scale-95" title="Clonar esta vela con 1 clic para crear una variante en segundos con otro aroma o color">📋 Duplicar</button>
                        <button onclick="prepararEditarProducto(${p.id})" class="bg-rose-100 text-rose-800 hover:bg-rose-200 px-3 py-1.5 rounded-xl text-xs font-black mr-1 transition border border-rose-300">✏️ Editar</button>
                        <button onclick="eliminarProducto(${p.id}, '${p.nombre}')" class="bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 rounded-xl text-xs font-black transition border border-red-200">✕</button>
                    </td>
                </tr>
            `;
        });
        renderizarArbolCategorias('prod');
    } catch (e) {
        console.error("Error cargando productos:", e);
    }
}

function obtenerOpcionesInsumosCascada(insumoSeleccionadoId = null) {
    if (!insumosLista || insumosLista.length === 0) return '<option value="">No hay insumos registrados en taller</option>';

    let html = '<option value="">Selecciona insumo...</option>';

    if (categoriasInsumosLista && categoriasInsumosLista.length > 0) {
        const principales = categoriasInsumosLista.filter(c => !c.padre_id);
        
        principales.forEach(padre => {
            let insumosPadre = insumosLista.filter(i => i.categoria_id === padre.id);
            let subs = categoriasInsumosLista.filter(c => c.padre_id === padre.id);

            html += `<optgroup label="📁 ${padre.nombre}">`;

            insumosPadre.forEach(i => {
                const sel = i.id == insumoSeleccionadoId ? 'selected' : '';
                html += `<option value="${i.id}" ${sel}>${i.nombre} (${i.unidad})</option>`;
            });

            subs.forEach(sub => {
                let insumosSub = insumosLista.filter(i => i.categoria_id === sub.id);
                if (insumosSub.length > 0) {
                    html += `<option disabled class="font-bold text-gray-500">&nbsp;&nbsp;↳ Subcategoría: ${sub.nombre}</option>`;
                    insumosSub.forEach(i => {
                        const sel = i.id == insumoSeleccionadoId ? 'selected' : '';
                        html += `<option value="${i.id}" ${sel}>&nbsp;&nbsp;&nbsp;&nbsp;${i.nombre} (${i.unidad})</option>`;
                    });
                }
            });

            html += `</optgroup>`;
        });
    }

    insumosLista.forEach(i => {
        const sel = i.id == insumoSeleccionadoId ? 'selected' : '';
        if (!html.includes(`value="${i.id}"`)) {
            const catTxt = i.categoria ? ` [${i.categoria}]` : '';
            html += `<option value="${i.id}" ${sel}>${i.nombre}${catTxt} (${i.unidad})</option>`;
        }
    });

    return html;
}

let stockUpdatingInsumo = {};
async function ajustarStockInsumo(id, signo = 1, btnElem = null) {
    if (stockUpdatingInsumo[id]) return;
    const input = document.getElementById(`sumar-stock-insumo-${id}`);
    if (!input) return;
    const val = parseFloat(input.value);

    if (isNaN(val) || val === 0) return alert("Ingresa una cantidad válida.");
    const cantidad = val * signo;

    stockUpdatingInsumo[id] = true;
    if (btnElem) {
        btnElem.disabled = true;
        btnElem.classList.add('opacity-40');
    }

    const item = (insumosLista || []).find(i => i.id == id);
    if (item) {
        item.stock = Math.max(0, parseFloat(((item.stock || 0) + cantidad).toFixed(3)));
        filtrarInsumosInstantaneo();
    }
    input.value = '';

    try {
        const res = await fetch(`/api/insumos/${id}/stock`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cantidad })
        });
        if (!res.ok) {
            await cargarInsumos(true);
        } else {
            if (historialInsumosAbierto) {
                cargarHistorialInsumos();
            }
        }
    } catch(e) {
        console.error("Error al actualizar stock de insumo:", e);
        await cargarInsumos(true);
    } finally {
        stockUpdatingInsumo[id] = false;
        if (btnElem) {
            btnElem.disabled = false;
            btnElem.classList.remove('opacity-40');
        }
    }
}

let stockUpdatingProd = {};
async function ajustarStockProducto(id, signo = 1, btnElem = null) {
    if (stockUpdatingProd[id]) return;
    const input = document.getElementById(`sumar-stock-prod-${id}`);
    if (!input) return;
    const val = parseFloat(input.value);

    if (isNaN(val) || val === 0) return alert("Ingresa una cantidad válida.");
    const cantidad = val * signo;

    stockUpdatingProd[id] = true;
    if (btnElem) {
        btnElem.disabled = true;
        btnElem.classList.add('opacity-40');
    }

    const item = (productosLista || []).find(p => p.id == id);
    if (item) {
        item.stock = Math.max(0, Math.round((item.stock || 0) + cantidad));
        filtrarProductosInstantaneo();
    }
    input.value = '';

    try {
        const res = await fetch(`/api/productos-terminados/${id}/stock`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cantidad })
        });
        if (!res.ok) {
            await cargarProductos(true);
        } else {
            if (historialProductosAbierto) {
                cargarHistorialProductos();
            }
        }
    } catch(e) {
        console.error("Error al actualizar stock de producto:", e);
        await cargarProductos(true);
    } finally {
        stockUpdatingProd[id] = false;
        if (btnElem) {
            btnElem.disabled = false;
            btnElem.classList.remove('opacity-40');
        }
    }
}

async function actualizarMapeoGenericosProducto(idProdEditar = null, mapeosPrevios = []) {
    const catSelect = document.getElementById('prod-categoria');
    const panel = document.getElementById('panel-mapeo-genericos');
    const contenedor = document.getElementById('contenedor-mapeo-genericos');
    if (!panel || !contenedor || !catSelect) return;
    
    contenedor.innerHTML = '';
    const catId = catSelect.value;

    if (!catId) {
        panel.classList.add('hidden');
        return;
    }

    // Buscar receta de la categoría seleccionada (o de su categoría principal)
    let recetaCat = todasLasRecetas.filter(r => r.categoria_id == catId);
    let catObj = categoriasProductosLista.find(c => c.id == catId);
    if (recetaCat.length === 0 && catObj && catObj.padre_id) {
        recetaCat = todasLasRecetas.filter(r => r.categoria_id == catObj.padre_id);
    }

    if (recetaCat && recetaCat.length > 0) {
        // Detallar insumos que hereda de la categoría
        const nombresInsumos = recetaCat.map(r => {
            const ins = insumosLista.find(i => i.id === r.insumo_id);
            return `${r.cantidad_requerida} ${ins ? ins.unidad : ''} ${ins ? ins.nombre : 'Insumo'}`;
        }).join(', ');

        let htmlResumen = `
            <div class="mb-2 p-2.5 bg-white rounded-lg border border-indigo-200 text-xs text-indigo-950 shadow-2xs">
                <span class="font-bold flex items-center gap-1 text-indigo-800">
                    <span>📁</span> Fórmula Base de "${catObj ? catObj.nombre : 'Categoría'}":
                </span>
                <p class="text-[11px] text-gray-600 mt-1">${nombresInsumos}</p>
            </div>
        `;

        // Buscar si incluye algún insumo genérico o esencia
        const insumosGenericos = recetaCat.filter(r => {
            const ins = insumosLista.find(i => i.id === r.insumo_id);
            return ins && (ins.es_generico === 1 || normalizarTexto(ins.nombre).includes('esencia'));
        });

        if (insumosGenericos.length > 0) {
            htmlResumen += `<label class="block text-xs font-bold text-indigo-900 mb-1">💧 Selecciona el Aroma / Esencia para esta vela:</label>`;
            
            // Opciones de todas las esencias registradas en taller
            const esencias = insumosLista.filter(i => {
                const cat = normalizarTexto(i.categoria || '');
                const nom = normalizarTexto(i.nombre);
                return nom.includes('esencia') || cat.includes('esencia');
            });

            insumosGenericos.forEach(genRow => {
                const gen = insumosLista.find(i => i.id === genRow.insumo_id);
                const prev = mapeosPrevios.find(m => m.insumo_generico_id === gen.id);
                const valSel = prev ? prev.insumo_especifico_id : '';

                let optEsencias = '<option value="">-- Elige el aroma para esta vela --</option>';
                (esencias.length > 0 ? esencias : insumosLista).forEach(e => {
                    const sel = (e.id == valSel) ? 'selected' : '';
                    optEsencias += `<option value="${e.id}" ${sel}>${e.nombre} (${e.unidad})</option>`;
                });

                htmlResumen += `
                    <div class="fila-mapeo-generico flex flex-col gap-1 mb-2">
                        <span class="text-[11px] font-semibold text-gray-500">Aroma específico para [${gen.nombre}]:</span>
                        <input type="hidden" class="val-generico-id" value="${gen.id}">
                        <select class="border border-indigo-300 p-2 rounded-lg text-xs w-full val-especifico-id focus:ring-2 focus:ring-indigo-500 bg-white font-bold text-indigo-950 shadow-2xs">
                            ${optEsencias}
                        </select>
                    </div>
                `;
            });
        }

        contenedor.innerHTML = htmlResumen;
        contenedor.querySelectorAll('.val-especifico-id').forEach(sel => {
            crearSelectorBuscable(sel, '🔍 Buscar esencia o aroma...');
        });
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

async function guardarInsumo() {
    const editId = document.getElementById('edit-insumo-id')?.value;
    const nombre = document.getElementById('insumo-nombre')?.value.trim();
    const categoria_id = document.getElementById('insumo-categoria')?.value;
    const unidad = document.getElementById('insumo-unidad')?.value;
    const stock = document.getElementById('insumo-stock')?.value;
    const es_generico = document.getElementById('insumo-es-generico')?.checked ? 1 : 0;
    const es_temporada = document.getElementById('check-insumo-temporada')?.checked ? 1 : 0;
    const estadoTemporada = document.getElementById('insumo-temporada-estado')?.value;
    const activa = es_temporada ? parseInt(estadoTemporada || '1') : 1;

    if (!nombre || !categoria_id) return alert('Ingresa nombre y carpeta / categoría del insumo');

    const url = editId ? `/api/insumos/${editId}` : '/api/insumos';
    const method = editId ? 'PUT' : 'POST';

    try {
        const payload = { 
            nombre, 
            categoria_id: parseInt(categoria_id), 
            unidad, 
            es_generico,
            es_temporada,
            activa
        };
        if (stock !== '' && !isNaN(parseFloat(stock))) {
            payload.stock = parseFloat(stock);
        } else if (!editId) {
            payload.stock = 0;
        }

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert(editId ? '¡Insumo actualizado exitosamente!' : '¡Insumo agregado al taller exitosamente!');
            limpiarFormularioInsumo();
            await refrescarTodoElProyecto();
        } else {
            const err = await res.json();
            alert('Error al guardar insumo: ' + (err.error || 'Ocurrió un error'));
        }
    } catch(e) {
        alert('Error de conexión: ' + e.message);
    }
}

function limpiarFormularioInsumo() {
    document.getElementById('edit-insumo-id').value = '';
    document.getElementById('insumo-nombre').value = '';
    document.getElementById('insumo-stock').value = '';
    document.getElementById('insumo-es-generico').checked = false;
    const checkTemp = document.getElementById('check-insumo-temporada');
    if (checkTemp) checkTemp.checked = false;
    if (typeof toggleOpcionesTemporadaInsumoForm === 'function') toggleOpcionesTemporadaInsumoForm();
    const catSelect = document.getElementById('insumo-categoria');
    if (catSelect) {
        catSelect.value = '';
        crearSelectorBuscable(catSelect, 'Selecciona categoría...');
    }
    document.getElementById('titulo-form-insumo').innerText = 'Agregar Insumo a Taller';
    const btnGuardar = document.getElementById('btn-guardar-insumo');
    if (btnGuardar) {
        btnGuardar.innerText = '💾 Guardar Insumo en Taller';
        btnGuardar.className = 'bg-rose-500 hover:bg-rose-600 text-white px-4 py-3.5 rounded-xl text-sm font-bold col-span-2 shadow-md shadow-rose-200 transition active:scale-[0.98]';
    }
}

async function prepararEditarInsumo(id) {
    try {
        const res = await fetch(`/api/insumos/${id}`);
        if (!res.ok) throw new Error('No se pudo cargar el insumo');
        const insumo = await res.json();

        document.getElementById('edit-insumo-id').value = insumo.id;
        const inputNom = document.getElementById('insumo-nombre');
        if (inputNom) inputNom.value = insumo.nombre;
        const inputStock = document.getElementById('insumo-stock');
        if (inputStock) inputStock.value = insumo.stock !== undefined ? insumo.stock : '';

        const catSelect = document.getElementById('insumo-categoria');
        if (catSelect) {
            catSelect.value = insumo.categoria_id || '';
            crearSelectorBuscable(catSelect, 'Selecciona categoría...');
        }

        const selUnidad = document.getElementById('insumo-unidad');
        if (selUnidad) {
            selUnidad.value = insumo.unidad;
            crearSelectorBuscable(selUnidad, 'Unidad de medida...');
        }

        const checkGen = document.getElementById('insumo-es-generico');
        if (checkGen) checkGen.checked = (insumo.es_generico === 1);

        const checkTemp = document.getElementById('check-insumo-temporada');
        if (checkTemp) checkTemp.checked = (insumo.es_temporada === 1);
        if (typeof toggleOpcionesTemporadaInsumoForm === 'function') toggleOpcionesTemporadaInsumoForm();

        const estadoTemp = document.getElementById('insumo-temporada-estado');
        if (estadoTemp) estadoTemp.value = (insumo.activa !== 0 ? '1' : '0');

        document.getElementById('titulo-form-insumo').innerText = `✏️ Editar Insumo: "${insumo.nombre}"`;
        const btnGuardar = document.getElementById('btn-guardar-insumo');
        if (btnGuardar) {
            btnGuardar.innerText = 'Actualizar Insumo';
            btnGuardar.className = 'bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3.5 rounded-xl text-sm font-bold col-span-2 shadow-md shadow-emerald-200 transition active:scale-[0.98]';
        }

        // Bajar automáticamente al formulario de edición con scroll suave y resalte
        const seccion = document.getElementById('seccion-form-insumo');
        if (seccion) {
            seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
            seccion.classList.add('ring-4', 'ring-rose-400');
            setTimeout(() => seccion.classList.remove('ring-4', 'ring-rose-400'), 2500);
        }
        if (inputNom) inputNom.focus();

    } catch(e) {
        alert('Error al preparar edición del insumo: ' + e.message);
    }
}

let tipoEstructuraActiva = 'estandar';

function seleccionarTipoEstructuraProducto(tipo) {
    tipoEstructuraActiva = tipo;
    const btnEst = document.getElementById('btn-tipo-prod-estandar');
    const btnPostre = document.getElementById('btn-tipo-prod-postre');
    const panelEst = document.getElementById('panel-modo-estandar');
    const panelPostre = document.getElementById('panel-modo-postre');

    if (tipo === 'postre') {
        if (btnPostre) btnPostre.className = 'p-3 rounded-xl border-2 border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold text-xs flex flex-col items-center gap-1 transition shadow-xs';
        if (btnEst) btnEst.className = 'p-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-600 font-bold text-xs flex flex-col items-center gap-1 transition';
        if (panelPostre) panelPostre.classList.remove('hidden');
        if (panelEst) panelEst.classList.add('hidden');

        const contFases = document.getElementById('contenedor-fases-prod');
        if (contFases && contFases.children.length === 0) {
            cargarPlantillaFases('clasica_postre');
        }
        const contFisicos = document.getElementById('contenedor-insumos-fisicos');
        if (contFisicos && contFisicos.children.length === 0) {
            agregarFilaInsumoFisico();
            agregarFilaInsumoFisico();
        }
    } else {
        if (btnEst) btnEst.className = 'p-3 rounded-xl border-2 border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold text-xs flex flex-col items-center gap-1 transition shadow-xs';
        if (btnPostre) btnPostre.className = 'p-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-600 font-bold text-xs flex flex-col items-center gap-1 transition';
        if (panelEst) panelEst.classList.remove('hidden');
        if (panelPostre) panelPostre.classList.add('hidden');
    }
}

function renumerarFasesCards() {
    const badges = document.querySelectorAll('.tarjeta-fase-prod .num-fase-badge');
    badges.forEach((b, idx) => {
        b.innerText = `Fase ${idx + 1}`;
    });
}

function actualizarTotalesFaseCard(card) {
    if (!card) return;
    const soya = parseFloat(card.querySelector('.fase-soya')?.value) || 0;
    const coco = parseFloat(card.querySelector('.fase-coco')?.value) || 0;
    const pct = parseFloat(card.querySelector('.fase-pct-esencia')?.value) || 0;
    const totalFase = soya + coco;
    const esenciaGramos = totalFase * (pct / 100);
    const ceraPura = totalFase - esenciaGramos;

    const subCera = card.querySelector('.subtotal-cera-badge');
    if (subCera) subCera.innerText = `Cera pura: ${ceraPura.toFixed(1)}g`;

    const subEsencia = card.querySelector('.subtotal-esencia-badge');
    if (subEsencia) subEsencia.innerText = `Esencia: ${esenciaGramos.toFixed(1)}g | Cera + Esencia: ${totalFase.toFixed(1)}g`;
}

function agregarFilaFaseProducto(faseData = null) {
    const contenedor = document.getElementById('contenedor-fases-prod');
    if (!contenedor) return;

    const numFase = contenedor.children.length + 1;
    const defaultData = {
        nombre: numFase === 1 ? 'Base' : (numFase === 2 ? 'Betún' : 'Decorado'),
        tipoFase: numFase === 1 ? 'Base' : (numFase === 2 ? 'Betún' : 'Decorado'),
        color: numFase === 1 ? 'Café' : (numFase === 2 ? 'Blanco' : 'Rosa'),
        cera_soya: numFase === 1 ? 120 : (numFase === 2 ? 40 : 0),
        cera_coco: numFase === 1 ? 0 : (numFase === 2 ? 40 : 30),
        esencia_id: '',
        porcentaje_esencia: 10,
        temperatura: numFase === 1 ? 'Vertido 55°C' : (numFase === 2 ? 'Batir a 40°C' : 'Molde a 65°C')
    };

    const d = faseData || defaultData;

    // Selector de esencias de insumosLista
    const esencias = insumosLista.filter(i => {
        const cat = normalizarTexto(i.categoria || '');
        const padre = normalizarTexto(i.categoria_padre || '');
        const nom = normalizarTexto(i.nombre);
        return nom.includes('esencia') || cat.includes('esencia') || padre.includes('esencia');
    });

    let opcionesEsencias = '<option value="">Sin aroma / No lleva</option>';
    esencias.forEach(e => {
        const sel = (d.esencia_id == e.id) ? 'selected' : '';
        opcionesEsencias += `<option value="${e.id}" ${sel}>💧 ${e.nombre}</option>`;
    });

    if (esencias.length === 0) {
        insumosLista.forEach(i => {
            const sel = (d.esencia_id == i.id) ? 'selected' : '';
            opcionesEsencias += `<option value="${i.id}" ${sel}>${i.nombre}</option>`;
        });
    }

    const div = document.createElement('div');
    div.className = 'tarjeta-fase-prod bg-white p-3.5 rounded-xl border border-indigo-200 shadow-sm space-y-3';
    div.innerHTML = `
        <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div class="flex items-center gap-2 flex-1">
                <span class="text-xs bg-indigo-100 text-indigo-800 font-extrabold px-2 py-0.5 rounded-md num-fase-badge">Fase</span>
                <input type="text" value="${d.nombre}" placeholder="Nombre de fase (Base, Betún, Toppers)" class="fase-nombre border border-slate-300 p-1.5 rounded-md text-xs font-bold w-full max-w-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            </div>
            <button type="button" onclick="this.closest('.tarjeta-fase-prod').remove(); renumerarFasesCards();" class="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded text-xs font-bold transition" title="Eliminar fase">✕ Quitar</button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
                <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Color de esta capa:</label>
                <select class="fase-color border border-slate-300 p-1.5 rounded-md w-full bg-slate-50 font-bold text-slate-700">
                    <option value="Sin Color" ${d.color === 'Sin Color' ? 'selected' : ''}>⚪ Sin Color (Natural)</option>
                    <option value="Blanco" ${d.color === 'Blanco' ? 'selected' : ''}>🤍 Blanco</option>
                    <option value="Café" ${d.color === 'Café' ? 'selected' : ''}>🤎 Café</option>
                    <option value="Rosa" ${d.color === 'Rosa' ? 'selected' : ''}>🩷 Rosa</option>
                    <option value="Amarillo" ${d.color === 'Amarillo' ? 'selected' : ''}>💛 Amarillo</option>
                    <option value="Azul" ${d.color === 'Azul' ? 'selected' : ''}>💙 Azul</option>
                    <option value="Rojo" ${d.color === 'Rojo' ? 'selected' : ''}>❤️ Rojo</option>
                    <option value="Verde" ${d.color === 'Verde' ? 'selected' : ''}>💚 Verde</option>
                    <option value="Violeta" ${d.color === 'Violeta' ? 'selected' : ''}>💜 Violeta</option>
                    <option value="Negro" ${d.color === 'Negro' ? 'selected' : ''}>🖤 Negro</option>
                </select>
            </div>
            <div>
                <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tipo de Fase:</label>
                <select class="fase-tipo border border-slate-300 p-1.5 rounded-md w-full bg-slate-50 font-bold text-slate-700">
                    <option value="Base" ${d.tipoFase === 'Base' ? 'selected' : ''}>🕯️ Base Principal</option>
                    <option value="Betún" ${d.tipoFase === 'Betún' ? 'selected' : ''}>🧁 Betún / Whipped</option>
                    <option value="Decorado" ${d.tipoFase === 'Decorado' ? 'selected' : ''}>🎨 Decorado / Moldes</option>
                </select>
            </div>
        </div>

        <div class="bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100 space-y-2 text-xs">
            <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="font-bold text-slate-700">Gramos de Cera por Vela:</span>
                <span class="subtotal-cera-badge font-extrabold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">Total cera: 0g</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-[10px] font-semibold text-emerald-800">Cera Soya (g):</label>
                    <input type="number" step="0.1" min="0" value="${d.cera_soya}" oninput="actualizarTotalesFaseCard(this.closest('.tarjeta-fase-prod'))" class="fase-soya w-full border border-slate-300 p-1.5 rounded text-center font-bold text-emerald-700 bg-white">
                </div>
                <div>
                    <label class="block text-[10px] font-semibold text-amber-800">Cera Coco (g):</label>
                    <input type="number" step="0.1" min="0" value="${d.cera_coco}" oninput="actualizarTotalesFaseCard(this.closest('.tarjeta-fase-prod'))" class="fase-coco w-full border border-slate-300 p-1.5 rounded text-center font-bold text-amber-700 bg-white">
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
                <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Aroma / Esencia:</label>
                <select class="fase-esencia border border-slate-300 p-1.5 rounded-md w-full bg-white text-xs">
                    ${opcionesEsencias}
                </select>
            </div>
            <div>
                <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Dosis Esencia (%):</label>
                <div class="flex items-center gap-1.5">
                    <input type="number" step="0.5" min="0" max="25" value="${d.porcentaje_esencia || 10}" oninput="actualizarTotalesFaseCard(this.closest('.tarjeta-fase-prod'))" class="fase-pct-esencia w-16 border border-slate-300 p-1.5 rounded text-center font-bold text-indigo-700 bg-white">
                    <span class="text-xs text-gray-500">%</span>
                    <span class="subtotal-esencia-badge text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">12g</span>
                </div>
            </div>
        </div>

        <div>
            <input type="text" value="${d.temperatura || ''}" placeholder="Nota de vertido o batido (ej. Vertido a 55°C o Batir a 40°C)" class="fase-temperatura border border-slate-300 p-1.5 rounded-md text-[11px] w-full text-gray-600 bg-slate-50">
        </div>
    `;

    contenedor.appendChild(div);
    const selEsencia = div.querySelector('.fase-esencia');
    if (selEsencia) crearSelectorBuscable(selEsencia, '🔍 Buscar esencia...');
    renumerarFasesCards();
    actualizarTotalesFaseCard(div);
}

function cargarPlantillaFases(tipo) {
    const contenedor = document.getElementById('contenedor-fases-prod');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (tipo === 'clasica_postre') {
        agregarFilaFaseProducto({
            nombre: 'Base',
            tipoFase: 'Base',
            color: 'Café',
            cera_soya: 120,
            cera_coco: 0,
            porcentaje_esencia: 10,
            temperatura: 'Vertido a 55°C'
        });
        agregarFilaFaseProducto({
            nombre: 'Betún',
            tipoFase: 'Betún',
            color: 'Blanco',
            cera_soya: 40,
            cera_coco: 40,
            porcentaje_esencia: 10,
            temperatura: 'Batir a 40°C'
        });
    } else if (tipo === 'postre_3fases') {
        agregarFilaFaseProducto({
            nombre: 'Base',
            tipoFase: 'Base',
            color: 'Café',
            cera_soya: 120,
            cera_coco: 0,
            porcentaje_esencia: 10,
            temperatura: 'Vertido a 55°C'
        });
        agregarFilaFaseProducto({
            nombre: 'Betún',
            tipoFase: 'Betún',
            color: 'Blanco',
            cera_soya: 40,
            cera_coco: 40,
            porcentaje_esencia: 10,
            temperatura: 'Batir a 40°C'
        });
        agregarFilaFaseProducto({
            nombre: 'Decorado / Toppers',
            tipoFase: 'Decorado',
            color: 'Rosa',
            cera_soya: 0,
            cera_coco: 30,
            porcentaje_esencia: 10,
            temperatura: 'Molde a 65°C'
        });
    }
}

function agregarFilaInsumoFisico(insumo_id = null, cantidad = 1) {
    const contenedor = document.getElementById('contenedor-insumos-fisicos');
    if (!contenedor) return;

    let opcionesCascada = obtenerOpcionesInsumosCascada(insumo_id);

    const div = document.createElement('div');
    div.className = 'fila-insumo-fisico flex gap-2 items-center bg-white p-2 rounded-lg border border-slate-200 shadow-xs';
    div.innerHTML = `
        <div class="w-2/3">
            <select class="sel-insumo-fisico border border-slate-300 p-2 rounded-md text-xs w-full bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                ${opcionesCascada}
            </select>
        </div>
        <div class="flex items-center gap-1 w-1/3">
            <input type="number" step="0.1" min="0.1" value="${cantidad}" placeholder="Cant." class="cant-insumo-fisico w-full border border-slate-300 p-2 rounded-md text-xs text-center font-bold text-indigo-700 bg-white">
            <button type="button" onclick="this.closest('.fila-insumo-fisico').remove()" class="text-red-400 hover:text-red-600 font-bold px-2 py-1 hover:bg-red-50 rounded text-xs transition">✕</button>
        </div>
    `;
    contenedor.appendChild(div);
    const selFis = div.querySelector('.sel-insumo-fisico');
    if (selFis) crearSelectorBuscable(selFis, '🔍 Buscar envase o pabilo...');
}

function limpiarFormularioProducto() {
    document.getElementById('edit-prod-id').value = '';
    document.getElementById('prod-nombre').value = '';
    const inputStock = document.getElementById('prod-stock');
    if (inputStock) inputStock.value = '';
    const catProd = document.getElementById('prod-categoria');
    if (catProd) {
        catProd.value = '';
        crearSelectorBuscable(catProd, 'Selecciona categoría...');
    }
    document.getElementById('contenedor-fases-prod').innerHTML = '';
    document.getElementById('contenedor-insumos-fisicos').innerHTML = '';
    document.getElementById('contenedor-receta-prod').innerHTML = '';
    document.getElementById('check-receta-propia').checked = false;
    toggleRecetaPropia();
    const checkTemp = document.getElementById('check-prod-temporada');
    if (checkTemp) checkTemp.checked = false;
    if (typeof toggleOpcionesTemporadaForm === 'function') toggleOpcionesTemporadaForm();
    document.getElementById('panel-mapeo-genericos').classList.add('hidden');
    seleccionarTipoEstructuraProducto('estandar');

    document.getElementById('titulo-form-producto').innerText = 'Agregar Nuevo Producto';
    document.getElementById('subtitulo-form-producto').innerText = 'Define una vela estándar o una vela de postre con capas.';
    document.getElementById('btn-guardar-prod').innerText = '💾 Guardar Producto';
    document.getElementById('btn-guardar-prod').className = 'flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl text-xs font-bold shadow-md transition';
}

async function duplicarProducto(id) {
    try {
        const res = await fetch(`/api/productos-terminados/${id}`);
        if (!res.ok) throw new Error("No se pudo cargar la información del producto");
        const prod = await res.json();

        // Limpiar edit ID para crear NUEVO producto
        document.getElementById('edit-prod-id').value = '';

        const inputNombre = document.getElementById('prod-nombre');
        inputNombre.value = `Copia de ${prod.nombre}`;
        const inputStock = document.getElementById('prod-stock');
        if (inputStock) inputStock.value = (prod.stock !== undefined && prod.stock !== null) ? prod.stock : 0;
        const catProd = document.getElementById('prod-categoria');
        if (catProd) {
            catProd.value = prod.categoria_id || '';
            crearSelectorBuscable(catProd, 'Selecciona categoría...');
        }

        const fases = prod.fases || [];
        if (prod.tipo_producto === 'postre' || fases.length > 0) {
            seleccionarTipoEstructuraProducto('postre');
            const contFases = document.getElementById('contenedor-fases-prod');
            contFases.innerHTML = '';
            fases.forEach(f => agregarFilaFaseProducto(f));

            const contFisicos = document.getElementById('contenedor-insumos-fisicos');
            contFisicos.innerHTML = '';
            if (prod.receta && prod.receta.length > 0) {
                prod.receta.forEach(r => agregarFilaInsumoFisico(r.insumo_id, r.cantidad_requerida));
            }
        } else {
            seleccionarTipoEstructuraProducto('estandar');
            const check = document.getElementById('check-receta-propia');
            check.checked = (prod.usa_receta_propia === 1);
            toggleRecetaPropia();
            const contReceta = document.getElementById('contenedor-receta-prod');
            contReceta.innerHTML = '';
            if (prod.receta && prod.receta.length > 0) {
                prod.receta.forEach(r => agregarFilaIngredienteProd(r.insumo_id, r.cantidad_requerida));
            }
            actualizarMapeoGenericosProducto(null, prod.mapeos || []);
        }

        document.getElementById('titulo-form-producto').innerText = `📋 Duplicando Vela: "${prod.nombre}"`;
        document.getElementById('subtitulo-form-producto').innerText = `💡 Modifica el nombre, aroma o color y guarda para crear la nueva variante en segundos.`;
        document.getElementById('btn-guardar-prod').innerText = `💾 Guardar Nueva Vela Duplicada`;
        document.getElementById('btn-guardar-prod').className = 'flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl text-xs font-bold shadow-md transition';

        const seccion = document.getElementById('seccion-form-producto');
        if (seccion) {
            seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
            seccion.classList.add('ring-2', 'ring-indigo-500');
            setTimeout(() => seccion.classList.remove('ring-2', 'ring-indigo-500'), 2500);
        }
        inputNombre.focus();
        inputNombre.select();

    } catch (e) {
        alert("Error al duplicar: " + e.message);
    }
}

async function prepararEditarProducto(id) {
    try {
        const res = await fetch(`/api/productos-terminados/${id}`);
        if (!res.ok) throw new Error("No se pudo cargar la información del producto");
        const prod = await res.json();

        document.getElementById('edit-prod-id').value = prod.id;
        document.getElementById('prod-nombre').value = prod.nombre;
        const inputStock = document.getElementById('prod-stock');
        if (inputStock) inputStock.value = (prod.stock !== undefined && prod.stock !== null) ? prod.stock : 0;

        const checkTemp = document.getElementById('check-prod-temporada');
        if (checkTemp) checkTemp.checked = (prod.es_temporada === 1);
        if (typeof toggleOpcionesTemporadaForm === 'function') toggleOpcionesTemporadaForm();
        const estadoTemp = document.getElementById('prod-temporada-estado');
        if (estadoTemp) estadoTemp.value = (prod.activa !== 0 ? '1' : '0');
        const catProd = document.getElementById('prod-categoria');
        if (catProd) {
            catProd.value = prod.categoria_id || '';
            crearSelectorBuscable(catProd, 'Selecciona categoría...');
        }

        const fases = prod.fases || [];
        if (prod.tipo_producto === 'postre' || fases.length > 0) {
            seleccionarTipoEstructuraProducto('postre');
            const contFases = document.getElementById('contenedor-fases-prod');
            contFases.innerHTML = '';
            fases.forEach(f => agregarFilaFaseProducto(f));

            const contFisicos = document.getElementById('contenedor-insumos-fisicos');
            contFisicos.innerHTML = '';
            if (prod.receta && prod.receta.length > 0) {
                prod.receta.forEach(r => agregarFilaInsumoFisico(r.insumo_id, r.cantidad_requerida));
            }
        } else {
            seleccionarTipoEstructuraProducto('estandar');
            const check = document.getElementById('check-receta-propia');
            check.checked = (prod.usa_receta_propia === 1);
            toggleRecetaPropia();
            const contReceta = document.getElementById('contenedor-receta-prod');
            contReceta.innerHTML = '';
            if (prod.receta && prod.receta.length > 0) {
                prod.receta.forEach(r => agregarFilaIngredienteProd(r.insumo_id, r.cantidad_requerida));
            }
            actualizarMapeoGenericosProducto(prod.id, prod.mapeos || []);
        }

        document.getElementById('titulo-form-producto').innerText = `✏️ Editar Producto: "${prod.nombre}"`;
        document.getElementById('subtitulo-form-producto').innerText = `Modifica las fases, proporciones o categoría del producto.`;
        document.getElementById('btn-guardar-prod').innerText = `Actualizar Producto`;
        document.getElementById('btn-guardar-prod').className = 'flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl text-xs font-bold shadow-md transition';

        const seccion = document.getElementById('seccion-form-producto');
        if (seccion) {
            seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } catch(e) {
        alert("Error al cargar producto: " + e.message);
    }
}

function toggleRecetaPropia() {
    const check = document.getElementById('check-receta-propia');
    const panel = document.getElementById('panel-receta-propia');
    if (!check || !panel) return;
    if (check.checked) panel.classList.remove('hidden');
    else panel.classList.add('hidden');
}

async function guardarProductoTerminado() {
    const editId = document.getElementById('edit-prod-id')?.value;
    const nombre = document.getElementById('prod-nombre')?.value.trim();
    const categoria_id = document.getElementById('prod-categoria')?.value;

    if (!nombre) return alert('Por favor ingresa el nombre de la vela o producto.');
    if (!categoria_id) return alert('Por favor selecciona una categoría o carpeta.');

    const tipo_producto = tipoEstructuraActiva;
    let fases_json = [];
    let receta = [];
    let mapeo_genericos = [];
    let usa_receta_propia = false;

    if (tipo_producto === 'postre') {
        usa_receta_propia = true;
        
        const tarjetasFases = document.querySelectorAll('.tarjeta-fase-prod');
        tarjetasFases.forEach((card, idx) => {
            const nom = card.querySelector('.fase-nombre')?.value.trim() || `Fase ${idx + 1}`;
            const tipoFase = card.querySelector('.fase-tipo')?.value || 'Base';
            const color = card.querySelector('.fase-color')?.value || 'Sin Color';
            const cera_soya = parseFloat(card.querySelector('.fase-soya')?.value) || 0;
            const cera_coco = parseFloat(card.querySelector('.fase-coco')?.value) || 0;
            const esencia_id = parseInt(card.querySelector('.fase-esencia')?.value) || null;
            const porcentaje_esencia = parseFloat(card.querySelector('.fase-pct-esencia')?.value) || 10;
            const temperatura = card.querySelector('.fase-temperatura')?.value.trim() || '';

            fases_json.push({
                nombre: nom,
                tipoFase,
                color,
                cera_soya,
                cera_coco,
                esencia_id,
                porcentaje_esencia,
                temperatura
            });
        });

        if (fases_json.length === 0) {
            return alert('Agrega al menos una fase de cera para la vela de postre (ej. Base o Betún).');
        }

        const filasFisicas = document.querySelectorAll('.fila-insumo-fisico');
        filasFisicas.forEach(f => {
            const insumo_id = parseInt(f.querySelector('.sel-insumo-fisico')?.value);
            const cantidad_requerida = parseFloat(f.querySelector('.cant-insumo-fisico')?.value);
            if (insumo_id && !isNaN(cantidad_requerida) && cantidad_requerida > 0) {
                receta.push({ insumo_id, cantidad_requerida });
            }
        });

    } else {
        usa_receta_propia = document.getElementById('check-receta-propia')?.checked;
        if (usa_receta_propia) {
            const filasReceta = document.querySelectorAll('.fila-ingrediente-prod');
            filasReceta.forEach(f => {
                const insumo_id = parseInt(f.querySelector('.sel-insumo')?.value);
                const cantidad_requerida = parseFloat(f.querySelector('.cant-insumo')?.value);
                if (insumo_id && !isNaN(cantidad_requerida) && cantidad_requerida > 0) {
                    receta.push({ insumo_id, cantidad_requerida });
                }
            });
        }

        const filasMapeo = document.querySelectorAll('.fila-mapeo-generico');
        filasMapeo.forEach(f => {
            const insumo_generico_id = parseInt(f.querySelector('.val-generico-id')?.value);
            const insumo_especifico_id = parseInt(f.querySelector('.val-especifico-id')?.value);
            if (insumo_generico_id && insumo_especifico_id) {
                mapeo_genericos.push({ insumo_generico_id, insumo_especifico_id });
            }
        });
    }

    const es_temporada = document.getElementById('check-prod-temporada')?.checked ? 1 : 0;
    const estadoTemporada = document.getElementById('prod-temporada-estado')?.value;
    const activa = es_temporada ? parseInt(estadoTemporada || '1') : 1;

    const stockInput = document.getElementById('prod-stock')?.value;
    let stockVal = undefined;
    if (stockInput !== '' && !isNaN(parseFloat(stockInput))) {
        stockVal = parseFloat(stockInput);
    } else if (!editId) {
        stockVal = 0;
    }

    const url = editId ? `/api/productos-terminados/${editId}` : '/api/productos-terminados';
    const method = editId ? 'PUT' : 'POST';

    try {
        const payload = {
            nombre,
            categoria_id,
            usa_receta_propia,
            tipo_producto,
            fases_json,
            receta,
            mapeo_genericos,
            es_temporada,
            activa
        };
        if (stockVal !== undefined) {
            payload.stock = stockVal;
        }

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert(editId ? '¡Producto actualizado exitosamente!' : '¡Producto guardado exitosamente!');
            limpiarFormularioProducto();
            await cargarRecetasYMapeos();
            await cargarProductos();
        } else {
            const errData = await res.json();
            alert('Error al guardar: ' + (errData.error || 'Ocurrió un error inesperado'));
        }
    } catch (e) {
        alert('Error de conexión: ' + e.message);
    }
}

// ========================================================
// --- CONTROLADORES DE MODALES Y GESTIÓN DE CATEGORÍAS ---
// ========================================================

let tipoJerarquiaSeleccionada = 'principal';

function abrirModalCrearCategoria(tipo) {
    document.getElementById('modal-cat-id').value = '';
    document.getElementById('modal-cat-tipo').value = tipo;
    document.getElementById('modal-cat-nombre').value = '';
    document.getElementById('modal-cat-titulo').innerText = tipo === 'insumo' 
        ? 'Nueva Categoría de Insumos' 
        : 'Nueva Categoría de Productos';

    poblarSelectorModalPadre(tipo);
    seleccionarTipoJerarquia('principal');

    document.getElementById('modal-categoria').classList.remove('hidden');
    setTimeout(() => document.getElementById('modal-cat-nombre').focus(), 50);
}

function abrirModalCrearSubcategoria(tipo, padreId) {
    abrirModalCrearCategoria(tipo);
    seleccionarTipoJerarquia('sub');
    document.getElementById('modal-cat-padre-select').value = padreId;
    document.getElementById('modal-cat-titulo').innerText = tipo === 'insumo' 
        ? 'Nueva Subcategoría de Insumos' 
        : 'Nueva Subcategoría de Productos';
    setTimeout(() => document.getElementById('modal-cat-nombre').focus(), 50);
}

function abrirModalEditarCategoria(tipo, id) {
    const lista = tipo === 'insumo' ? categoriasInsumosLista : categoriasProductosLista;
    const cat = lista.find(c => c.id == id);
    if (!cat) return;

    document.getElementById('modal-cat-id').value = id;
    document.getElementById('modal-cat-tipo').value = tipo;
    document.getElementById('modal-cat-nombre').value = cat.nombre;
    document.getElementById('modal-cat-titulo').innerText = '✏️ Editar Categoría';

    poblarSelectorModalPadre(tipo, id);

    if (cat.padre_id) {
        seleccionarTipoJerarquia('sub');
        document.getElementById('modal-cat-padre-select').value = cat.padre_id;
    } else {
        seleccionarTipoJerarquia('principal');
    }

    document.getElementById('modal-categoria').classList.remove('hidden');
    setTimeout(() => document.getElementById('modal-cat-nombre').focus(), 50);
}

function poblarSelectorModalPadre(tipo, excluirId = null) {
    const select = document.getElementById('modal-cat-padre-select');
    if (!select) return;
    const lista = tipo === 'insumo' ? categoriasInsumosLista : categoriasProductosLista;
    const principales = lista.filter(c => !c.padre_id && (!excluirId || c.id != excluirId));

    select.innerHTML = '<option value="">-- Selecciona Categoría Principal --</option>';
    principales.forEach(p => {
        select.innerHTML += `<option value="${p.id}">📁 ${p.nombre}</option>`;
    });
}

function seleccionarTipoJerarquia(tipoJerarquia) {
    tipoJerarquiaSeleccionada = tipoJerarquia;
    const btnPrincipal = document.getElementById('btn-tipo-cat-principal');
    const btnSub = document.getElementById('btn-tipo-cat-sub');
    const campoPadre = document.getElementById('campo-modal-cat-padre');
    const explicacion = document.getElementById('modal-cat-explicacion');

    if (tipoJerarquia === 'principal') {
        btnPrincipal.className = 'p-3 rounded-xl border-2 border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold text-xs flex flex-col items-center gap-1 transition';
        btnSub.className = 'p-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-600 font-bold text-xs flex flex-col items-center gap-1 transition';
        campoPadre.classList.add('hidden');
        explicacion.innerHTML = '💡 Las <strong>Categorías Principales</strong> agrupan familias completas (ej. Ceras, Esencias, Envases, Sprays).';
    } else {
        btnSub.className = 'p-3 rounded-xl border-2 border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold text-xs flex flex-col items-center gap-1 transition';
        btnPrincipal.className = 'p-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-600 font-bold text-xs flex flex-col items-center gap-1 transition';
        campoPadre.classList.remove('hidden');
        explicacion.innerHTML = '💡 Las <strong>Subcategorías</strong> dependen de una Principal (ej. Cera de Soya dentro de Ceras, o Sprays Chicos dentro de Sprays).';
    }
}

function cerrarModalCategoria() {
    document.getElementById('modal-categoria').classList.add('hidden');
}

async function guardarModalCategoria() {
    const id = document.getElementById('modal-cat-id').value;
    const tipo = document.getElementById('modal-cat-tipo').value;
    const nombre = document.getElementById('modal-cat-nombre').value.trim();

    if (!nombre) return alert('Por favor escribe el nombre de la categoría.');

    let padre_id = null;
    if (tipoJerarquiaSeleccionada === 'sub') {
        padre_id = document.getElementById('modal-cat-padre-select').value;
        if (!padre_id) return alert('Por favor selecciona la Categoría Principal a la que pertenecerá.');
    }

    const endpoint = tipo === 'insumo' ? '/api/categorias-insumos' : '/api/categorias-productos';
    const url = id ? `${endpoint}/${id}` : endpoint;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, padre_id: padre_id ? parseInt(padre_id) : null })
    });

    if (res.ok) {
        cerrarModalCategoria();
        await cargarCategorias();
        if (tipo === 'insumo') await cargarInsumos();
        else await cargarProductos();
    } else {
        const err = await res.json();
        alert('Error al guardar categoría: ' + (err.error || 'Error desconocido'));
    }
}

async function eliminarCategoriaSegura(tipo, id) {
    const lista = tipo === 'insumo' ? categoriasInsumosLista : categoriasProductosLista;
    const cat = lista.find(c => c.id == id);
    if (!cat) return;

    const subs = lista.filter(c => c.padre_id == id);
    const cantItems = tipo === 'insumo' 
        ? insumosLista.filter(i => i.categoria_id == id).length
        : productosLista.filter(p => p.categoria_id == id).length;

    let mensaje = `¿Estás seguro de eliminar la categoría "${cat.nombre}"?\n\n`;
    if (cantItems > 0) {
        mensaje += `⚠️ Contiene ${cantItems} ${tipo === 'insumo' ? 'insumos' : 'productos'}. Al eliminarla, estos elementos quedarán sin categoría (no se borrarán).\n`;
    }
    if (subs.length > 0) {
        mensaje += `⚠️ Esta categoría tiene ${subs.length} subcategorías asociadas (${subs.map(s => s.nombre).join(', ')}).\n`;
    }

    if (!confirm(mensaje)) return;

    const endpoint = tipo === 'insumo' ? `/api/categorias-insumos/${id}` : `/api/categorias-productos/${id}`;
    const res = await fetch(endpoint, { method: 'DELETE' });

    if (res.ok) {
        await cargarCategorias();
        if (tipo === 'insumo') await cargarInsumos();
        else await cargarProductos();
    } else {
        alert('Error al eliminar categoría.');
    }
}

// --- FÓRMULAS BASE DE CATEGORÍA (MODAL DEDICADO) ---
async function abrirModalRecetaCat(catId) {
    const cat = categoriasProductosLista.find(c => c.id == catId);
    if (!cat) return;

    document.getElementById('modal-receta-cat-id').value = catId;
    document.getElementById('modal-receta-cat-nombre').innerText = `Categoría: 📁 ${cat.nombre}`;
    const contenedor = document.getElementById('contenedor-receta-cat-modal');
    contenedor.innerHTML = '';

    try {
        const res = await fetch(`/api/recetas-categoria/${catId}`);
        const receta = await res.json();

        if (receta && receta.length > 0) {
            receta.forEach(r => {
                agregarFilaIngredienteCatModal(r.insumo_id, r.cantidad_requerida);
            });
        } else {
            agregarFilaIngredienteCatModal();
        }
    } catch (e) {
        console.error("Error cargando receta:", e);
        agregarFilaIngredienteCatModal();
    }

    document.getElementById('modal-receta-cat').classList.remove('hidden');
}

function cerrarModalRecetaCat() {
    document.getElementById('modal-receta-cat').classList.add('hidden');
}

function agregarFilaIngredienteCatModal(insumoId = '', cantidad = '') {
    const contenedor = document.getElementById('contenedor-receta-cat-modal');
    if (!contenedor) return;
    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center fila-ingrediente-cat-modal mb-2 bg-slate-50 p-2 rounded-lg border border-slate-200';

    const opcionesCascada = obtenerOpcionesInsumosCascada(insumoId);

    div.innerHTML = `
        <div class="w-2/3">
            <select class="border border-gray-300 p-2 rounded text-xs w-full sel-insumo-modal focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
                ${opcionesCascada}
            </select>
        </div>
        <input type="number" step="0.0001" min="0" value="${cantidad}" placeholder="Cant. un/vela" class="border border-gray-300 p-2 rounded text-xs w-1/3 cant-insumo-modal focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-bold text-indigo-700">
        <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 font-bold px-2 text-sm">✕</button>
    `;
    contenedor.appendChild(div);
    const selModal = div.querySelector('.sel-insumo-modal');
    if (selModal) crearSelectorBuscable(selModal, '🔍 Buscar insumo...');
}

async function guardarRecetaCategoriaModal() {
    const catId = document.getElementById('modal-receta-cat-id').value;
    const cat = categoriasProductosLista.find(c => c.id == catId);
    if (!cat) return;

    const filas = document.querySelectorAll('.fila-ingrediente-cat-modal');
    const receta = [];

    filas.forEach(f => {
        const insumo_id = f.querySelector('.sel-insumo-modal')?.value;
        const cantidad_requerida = parseFloat(f.querySelector('.cant-insumo-modal')?.value);
        if (insumo_id && !isNaN(cantidad_requerida) && cantidad_requerida > 0) {
            receta.push({ insumo_id: parseInt(insumo_id), cantidad_requerida });
        }
    });

    const res = await fetch(`/api/categorias-productos/${catId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: cat.nombre, padre_id: cat.padre_id, receta })
    });

    if (res.ok) {
        alert('¡Fórmula base guardada exitosamente!');
        cerrarModalRecetaCat();
        await cargarRecetasYMapeos();
        renderizarArbolCategorias('prod');
    } else {
        alert('Error al guardar fórmula base.');
    }
}

// Aliases para compatibilidad
function crearCategoriaInsumo() { abrirModalCrearCategoria('insumo'); }
function crearCategoriaProducto() { abrirModalCrearCategoria('prod'); }
function crearOActualizarCategoriaProducto() { abrirModalCrearCategoria('prod'); }
function editarCategoriaInsumo(id) { abrirModalEditarCategoria('insumo', id); }
function prepararEditarCategoriaProducto(id) { abrirModalEditarCategoria('prod', id); }
function eliminarCategoriaInsumo(id) { eliminarCategoriaSegura('insumo', id); }
function eliminarCategoriaProducto(id) { eliminarCategoriaSegura('prod', id); }

async function eliminarInsumo(id, nombre) {
    if (!confirm(`¿Eliminar el insumo "${nombre}"?`)) return;
    await fetch(`/api/insumos/${id}`, { method: 'DELETE' });
    cargarInsumos();
}

async function eliminarProducto(id, nombre) {
    if (!confirm(`¿Eliminar el producto "${nombre}"?`)) return;
    await fetch(`/api/productos-terminados/${id}`, { method: 'DELETE' });
    cargarProductos();
}

function agregarFilaIngredienteCat(insumoId = '', cantidad = '') {
    const contenedor = document.getElementById('contenedor-receta-cat');
    if (!contenedor) return;
    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center fila-ingrediente-cat mb-2';

    const opcionesCascada = obtenerOpcionesInsumosCascada(insumoId);

    div.innerHTML = `
        <div class="w-2/3">
            <select class="border border-gray-300 p-2 rounded text-sm w-full sel-insumo focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
                ${opcionesCascada}
            </select>
        </div>
        <input type="number" step="0.0001" min="0" value="${cantidad}" placeholder="Cant." class="border border-gray-300 p-2 rounded text-sm w-1/3 cant-insumo focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        <button onclick="this.parentElement.remove()" class="text-red-500 font-bold px-2 hover:text-red-700">✕</button>
    `;
    contenedor.appendChild(div);
    const sel = div.querySelector('.sel-insumo');
    if (sel) crearSelectorBuscable(sel, '🔍 Buscar insumo...');
}

function agregarFilaIngredienteProd(insumoId = '', cantidad = '') {
    const contenedor = document.getElementById('contenedor-receta-prod');
    if (!contenedor) return;
    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center fila-ingrediente-prod mb-2';

    const opcionesCascada = obtenerOpcionesInsumosCascada(insumoId);

    div.innerHTML = `
        <div class="w-2/3">
            <select class="border border-gray-300 p-2 rounded text-sm w-full sel-insumo focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
                ${opcionesCascada}
            </select>
        </div>
        <input type="number" step="0.0001" min="0" value="${cantidad}" placeholder="Cant. un/vela" class="border border-gray-300 p-2 rounded text-sm w-1/3 cant-insumo focus:ring-2 focus:ring-indigo-500 focus:outline-none">
        <button onclick="this.parentElement.remove()" class="text-red-500 font-bold px-2 hover:text-red-700">✕</button>
    `;
    contenedor.appendChild(div);
    const sel = div.querySelector('.sel-insumo');
    if (sel) crearSelectorBuscable(sel, '🔍 Buscar insumo...');
}

function agregarFilaProductoLote() {
    const contenedor = document.getElementById('contenedor-lote-productos');
    if (!contenedor) return;
    const div = document.createElement('div');
    div.className = 'flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center fila-producto-lote bg-rose-50/40 p-3 rounded-2xl border-2 border-rose-200 mb-2 shadow-xs';

    if (productosLista.length === 0) {
        div.innerHTML = `<select class="border p-2.5 rounded-xl text-sm w-full font-bold" disabled><option>Crea productos en la pestaña 2 primero</option></select>`;
        contenedor.appendChild(div);
        return;
    }

    let opcionesCascada = '<option value="">Selecciona vela o producto fabricado...</option>';

    const principales = categoriasProductosLista.filter(c => !c.padre_id);
    principales.forEach(padre => {
        let prodsPadre = productosLista.filter(p => p.categoria_id === padre.id && p.activa !== 0 && padre.activa !== 0 && p.categoria_activa !== 0 && p.categoria_padre_activa !== 0);
        let subs = categoriasProductosLista.filter(c => c.padre_id === padre.id);

        opcionesCascada += `<optgroup label="📁 ${padre.nombre}">`;
        
        prodsPadre.forEach(p => {
            opcionesCascada += `<option value="${p.id}">${p.nombre}</option>`;
        });

        subs.forEach(sub => {
            let prodsSub = productosLista.filter(p => p.categoria_id === sub.id && p.activa !== 0 && sub.activa !== 0 && padre.activa !== 0 && p.categoria_activa !== 0 && p.categoria_padre_activa !== 0);
            if (prodsSub.length > 0) {
                opcionesCascada += `<option disabled class="font-bold text-gray-500">&nbsp;&nbsp;↳ Subcategoría: ${sub.nombre}</option>`;
                prodsSub.forEach(p => {
                    opcionesCascada += `<option value="${p.id}">&nbsp;&nbsp;&nbsp;&nbsp;${p.nombre}</option>`;
                });
            }
        });

        opcionesCascada += `</optgroup>`;
    });

    div.innerHTML = `
        <div class="flex-1">
            <select class="border-2 border-rose-200 p-2.5 rounded-xl text-sm w-full sel-producto-lote focus:ring-2 focus:ring-rose-400 focus:outline-none bg-white font-bold text-rose-950">
                ${opcionesCascada}
            </select>
        </div>
        <div class="flex items-center gap-2 sm:w-44 self-end sm:self-center">
            <input type="number" min="1" step="1" placeholder="Cant. Piezas" class="border-2 border-rose-200 p-2.5 rounded-xl text-sm w-full cant-producto-lote focus:ring-2 focus:ring-rose-400 focus:outline-none font-black text-rose-900 bg-white shadow-2xs">
            <button type="button" onclick="this.closest('.fila-producto-lote').remove()" class="text-red-500 hover:text-red-700 bg-white hover:bg-red-50 border border-rose-200 font-bold px-3.5 py-2.5 rounded-xl text-sm transition">✕</button>
        </div>
    `;
    contenedor.appendChild(div);
    const selNuevo = div.querySelector('.sel-producto-lote');
    if (selNuevo) crearSelectorBuscable(selNuevo, '🔍 Escribe para buscar vela (ej. sandalo, chocolate)...');
}

function agregarFilaInsumoExtra() {
    const contenedor = document.getElementById('contenedor-insumos-extra');
    if (!contenedor) return;
    const div = document.createElement('div');
    div.className = 'flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center fila-insumo-extra bg-white p-3.5 rounded-2xl border-2 border-rose-200 mb-2.5 shadow-xs transition hover:border-rose-400';

    if (insumosLista.length === 0) return;
    let opcionesCascada = obtenerOpcionesInsumosCascada();

    div.innerHTML = `
        <div class="flex-1 min-w-[200px]">
            <label class="block text-[11px] font-bold text-rose-900 uppercase mb-1">Insumo extra / Merma:</label>
            <select class="border-2 border-rose-200 p-2.5 rounded-xl text-sm w-full sel-insumo-extra focus:ring-2 focus:ring-rose-400 focus:outline-none bg-white font-bold text-rose-950">
                ${opcionesCascada}
            </select>
        </div>
        <div class="w-full lg:w-44">
            <label class="block text-[11px] font-bold text-rose-900 uppercase mb-1">Cantidad a descontar:</label>
            <input type="number" step="0.0001" min="0" placeholder="Ej. 50" class="border-2 border-rose-200 p-2.5 rounded-xl text-sm w-full cant-insumo-extra focus:ring-2 focus:ring-rose-400 focus:outline-none font-black text-rose-900 bg-white shadow-2xs">
        </div>
        <div class="flex-1 min-w-[240px]">
            <label class="block text-[11px] font-bold text-rose-900 uppercase mb-1">Motivo / Para qué se usó (Opcional):</label>
            <input type="text" placeholder="Ej. Flores decorativas, merma, prueba de pabilo..." class="comentario-insumo-extra border-2 border-rose-200 p-2.5 rounded-xl text-xs sm:text-sm font-semibold text-rose-950 bg-rose-50/40 w-full focus:ring-2 focus:ring-rose-400 focus:outline-none">
        </div>
        <div class="self-end lg:self-end pb-0.5">
            <button type="button" onclick="this.closest('.fila-insumo-extra').remove()" class="text-red-500 hover:text-red-700 bg-rose-50 hover:bg-red-100 border border-rose-200 font-bold px-3.5 py-2.5 rounded-xl text-sm transition" title="Eliminar fila">✕ Quitar</button>
        </div>
    `;
    contenedor.appendChild(div);
    const selNuevo = div.querySelector('.sel-insumo-extra');
    if (selNuevo) crearSelectorBuscable(selNuevo, '🔍 Escribe para buscar insumo...');
}

async function procesarProduccionMúltiple() {
    const operador = document.getElementById('operador-lote')?.value.trim();
    const fecha_produccion = document.getElementById('fecha-produccion-input')?.value;

    const filasProductos = document.querySelectorAll('.fila-producto-lote');
    const productos_lote = [];

    filasProductos.forEach(f => {
        const producto_id = f.querySelector('.sel-producto-lote')?.value;
        const cantidad = parseFloat(f.querySelector('.cant-producto-lote')?.value);
        if (producto_id && !isNaN(cantidad) && cantidad > 0) {
            productos_lote.push({ producto_id: parseInt(producto_id), cantidad });
        }
    });

    const filasExtra = document.querySelectorAll('.fila-insumo-extra');
    const insumos_adicionales = [];

    filasExtra.forEach(f => {
        const insumo_id = f.querySelector('.sel-insumo-extra')?.value;
        const cantidad = parseFloat(f.querySelector('.cant-insumo-extra')?.value);
        if (insumo_id && !isNaN(cantidad) && cantidad > 0) {
            insumos_adicionales.push({ insumo_id: parseInt(insumo_id), cantidad });
        }
    });

    if (productos_lote.length === 0) {
        return alert("Por favor selecciona al menos un producto e indica la cantidad a fabricar.");
    }

    const res = await fetch('/api/produccion-multiple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            productos_lote, 
            insumos_adicionales,
            operador: operador || 'Taller',
            fecha_produccion
        })
    });

    const data = await res.json();
    if (res.ok) {
        alert(data.message);
        document.getElementById('contenedor-lote-productos').innerHTML = '';
        document.getElementById('contenedor-insumos-extra').innerHTML = '';
        agregarFilaProductoLote();
        await cargarInsumos();
        await cargarProductos();
        await cargarHistoriales();
    } else {
        alert("Error en la producción:\n\n" + data.error);
    }
}

// ========================================================
// --- GESTIÓN DE OPERADORES / EQUIPO DE TALLER ---
// ========================================================
async function cargarOperadores() {
    try {
        const res = await fetch('/api/operadores');
        operadoresLista = await res.json();
        const selectOperador = document.getElementById('operador-lote');
        const listaModal = document.getElementById('lista-operadores-modal');

        if (selectOperador) {
            const valPrevio = selectOperador.value;
            selectOperador.innerHTML = '<option value="">Selecciona operador responsable...</option>';
            operadoresLista.forEach(op => {
                const sel = op.nombre === valPrevio ? 'selected' : '';
                selectOperador.innerHTML += `<option value="${op.nombre}" ${sel}>👤 ${op.nombre}</option>`;
            });
            crearSelectorBuscable(selectOperador, '👤 ¿Quién fabricó este lote?');
        }

        if (listaModal) {
            listaModal.innerHTML = '';
            if (operadoresLista.length === 0) {
                listaModal.innerHTML = `<p class="text-xs text-rose-300 py-2">No hay operadores registrados aún. Agrega uno arriba.</p>`;
            } else {
                operadoresLista.forEach(op => {
                    listaModal.innerHTML += `
                        <div class="flex justify-between items-center bg-rose-50/70 p-2.5 rounded-xl border border-rose-200">
                            <span class="text-xs font-bold text-rose-950">👤 ${op.nombre}</span>
                            <button type="button" onclick="eliminarOperador(${op.id}, '${op.nombre}')" class="text-red-400 hover:text-red-600 font-bold text-xs p-1" title="Eliminar de la lista">✕</button>
                        </div>
                    `;
                });
            }
        }
    } catch (e) {
        console.error("Error cargando operadores:", e);
    }
}

function abrirModalOperador() {
    document.getElementById('nuevo-operador-nombre').value = '';
    document.getElementById('modal-operador').classList.remove('hidden');
    setTimeout(() => document.getElementById('nuevo-operador-nombre').focus(), 50);
}

function cerrarModalOperador() {
    document.getElementById('modal-operador').classList.add('hidden');
}

async function crearOperador() {
    const input = document.getElementById('nuevo-operador-nombre');
    const nombre = input?.value.trim();
    if (!nombre) return alert("Por favor escribe el nombre de la persona.");

    const res = await fetch('/api/operadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre })
    });

    if (res.ok) {
        input.value = '';
        await cargarOperadores();
        const selectOperador = document.getElementById('operador-lote');
        if (selectOperador) {
            selectOperador.value = nombre;
            crearSelectorBuscable(selectOperador, '👤 ¿Quién fabricó este lote?');
        }
        cerrarModalOperador();
    } else {
        const err = await res.json();
        alert("Error al registrar operador: " + (err.error || 'Error desconocido'));
    }
}

async function eliminarOperador(id, nombre) {
    if (!confirm(`¿Eliminar a "${nombre}" de la lista de operadores?`)) return;
    await fetch(`/api/operadores/${id}`, { method: 'DELETE' });
    cargarOperadores();
}

function generarSugerenciaCodigoLote() {
    const inputFecha = document.getElementById('fecha-produccion-input');
    const hoy = new Date().toISOString().slice(0, 10);
    if (inputFecha && !inputFecha.value) {
        inputFecha.value = hoy;
    }
}

function poblarSelectorProductosFicha() {
    const select = document.getElementById('ficha-producto-id');
    if (!select) return;
    select.innerHTML = '<option value="">Selecciona vela o producto...</option>';
    if (!productosLista || productosLista.length === 0) return;

    const principales = categoriasProductosLista.filter(c => !c.padre_id);
    principales.forEach(padre => {
        let prodsPadre = productosLista.filter(p => p.categoria_id === padre.id && p.activa !== 0 && padre.activa !== 0 && p.categoria_activa !== 0 && p.categoria_padre_activa !== 0);
        let subs = categoriasProductosLista.filter(c => c.padre_id === padre.id);
        let optGroup = `<optgroup label="📁 ${padre.nombre}">`;

        prodsPadre.forEach(p => { optGroup += `<option value="${p.id}">${p.nombre}</option>`; });
        subs.forEach(sub => {
            let prodsSub = productosLista.filter(p => p.categoria_id === sub.id && p.activa !== 0 && sub.activa !== 0 && padre.activa !== 0 && p.categoria_activa !== 0 && p.categoria_padre_activa !== 0);
            if (prodsSub.length > 0) {
                optGroup += `<option disabled class="font-bold text-gray-500">&nbsp;&nbsp;↳ Subcategoría: ${sub.nombre}</option>`;
                prodsSub.forEach(p => { optGroup += `<option value="${p.id}">&nbsp;&nbsp;&nbsp;&nbsp;${p.nombre}</option>`; });
            }
        });
        optGroup += `</optgroup>`;
        select.innerHTML += optGroup;
    });

    crearSelectorBuscable(select, '🔍 Escribe para buscar vela o producto...');
}

function poblarFiltroCategoriasFicha() {
    const filtro = document.getElementById('filtro-cat-ficha');
    if (!filtro) return;
    filtro.innerHTML = '<option value="">Todas las familias</option>';
    const principales = categoriasProductosLista.filter(c => !c.padre_id);
    principales.forEach(padre => {
        let optGroup = `<optgroup label="📁 ${padre.nombre}">`;
        optGroup += `<option value="${padre.id}">${padre.nombre}</option>`;
        const subs = categoriasProductosLista.filter(c => c.padre_id === padre.id);
        subs.forEach(sub => { optGroup += `<option value="${sub.id}">&nbsp;&nbsp;↳ ${sub.nombre}</option>`; });
        optGroup += `</optgroup>`;
        filtro.innerHTML += optGroup;
    });

    crearSelectorBuscable(filtro, 'Todas las familias');
}

function poblarSelectoresCalculadora() {
    const selectores = document.querySelectorAll('.sel-calc-producto');
    selectores.forEach(s => {
        const valActual = s.value;
        s.innerHTML = '<option value="">Selecciona vela o producto a fabricar...</option>';
        const principales = categoriasProductosLista.filter(c => !c.padre_id);
        principales.forEach(padre => {
            let prodsPadre = productosLista.filter(p => p.categoria_id === padre.id && p.activa !== 0 && padre.activa !== 0 && p.categoria_activa !== 0 && p.categoria_padre_activa !== 0);
            let subs = categoriasProductosLista.filter(c => c.padre_id === padre.id);
            let optGroup = `<optgroup label="📁 ${padre.nombre}">`;

            prodsPadre.forEach(p => {
                let fases = [];
                try { fases = typeof p.fases_json === 'string' ? JSON.parse(p.fases_json) : (p.fases_json || []); } catch(e) {}
                const tieneFases = p.tipo_producto === 'postre' || (Array.isArray(fases) && fases.length > 0);
                const tag = tieneFases ? ` 🧁 [${fases.length} fases]` : '';
                optGroup += `<option value="${p.id}">${p.nombre}${tag}</option>`;
            });
            subs.forEach(sub => {
                let prodsSub = productosLista.filter(p => p.categoria_id === sub.id && p.activa !== 0 && sub.activa !== 0 && padre.activa !== 0 && p.categoria_activa !== 0 && p.categoria_padre_activa !== 0);
                if (prodsSub.length > 0) {
                    optGroup += `<option disabled class="font-bold text-gray-500">&nbsp;&nbsp;↳ Subcategoría: ${sub.nombre}</option>`;
                    prodsSub.forEach(p => {
                        let fases = [];
                        try { fases = typeof p.fases_json === 'string' ? JSON.parse(p.fases_json) : (p.fases_json || []); } catch(e) {}
                        const tieneFases = p.tipo_producto === 'postre' || (Array.isArray(fases) && fases.length > 0);
                        const tag = tieneFases ? ` 🧁 [${fases.length} fases]` : '';
                        optGroup += `<option value="${p.id}">&nbsp;&nbsp;&nbsp;&nbsp;${p.nombre}${tag}</option>`;
                    });
                }
            });
            optGroup += `</optgroup>`;
            s.innerHTML += optGroup;
        });
        if (valActual) s.value = valActual;
        crearSelectorBuscable(s, '🔍 Escribe para buscar vela (ej. sandalo, chocolate)...');
    });
}

function agregarFilaCalculadora() {
    const contenedor = document.getElementById('contenedor-filas-calculadora');
    if (!contenedor) return;
    const div = document.createElement('div');
    div.className = 'bg-rose-50/40 p-4 sm:p-5 rounded-2xl border-2 border-rose-200 shadow-xs fila-calc-item mb-3 transition hover:border-rose-400';

    div.innerHTML = `
        <div class="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div class="flex-1 w-full space-y-1">
                <label class="block text-[11px] font-black text-rose-900 uppercase tracking-wider">Producto / Vela a Fabricar:</label>
                <select onchange="onCambioSelectCalculadora(this)" class="border-2 border-rose-200 p-2.5 rounded-xl text-sm w-full sel-calc-producto focus:ring-2 focus:ring-rose-400 focus:outline-none bg-white font-bold text-rose-950">
                    <option value="">Selecciona vela...</option>
                </select>
            </div>
            <div class="w-full sm:w-36 self-end sm:self-center">
                <label class="block text-[11px] font-black text-rose-900 uppercase tracking-wider mb-1">Cantidad:</label>
                <input type="number" min="1" step="1" oninput="calcularFórmulaLote()" placeholder="Ej. 10 pzas" class="border-2 border-rose-200 p-2.5 rounded-xl text-sm w-full cant-calc-piezas focus:ring-2 focus:ring-rose-400 focus:outline-none font-black text-rose-700 bg-white shadow-2xs">
            </div>
            <div class="self-end sm:self-center pt-2 sm:pt-4">
                <button onclick="this.closest('.fila-calc-item').remove(); calcularFórmulaLote();" class="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-2.5 rounded-xl text-xs transition active:scale-95" title="Eliminar fila">✕ Quitar</button>
            </div>
        </div>
        <div class="contenedor-aviso-especial mt-3 pt-3 border-t border-rose-100 text-xs"></div>
    `;
    contenedor.appendChild(div);
    poblarSelectoresCalculadora();
}

function onCambioSelectCalculadora(selectElem) {
    const prodId = selectElem.value;
    const fila = selectElem.closest('.fila-calc-item');
    const avisoDiv = fila.querySelector('.contenedor-aviso-especial');
    if (!avisoDiv) return;
    avisoDiv.innerHTML = '';
    if (!prodId) return;

    const prod = productosLista.find(p => p.id == prodId);
    let fases = [];
    try {
        fases = typeof prod?.fases_json === 'string' ? JSON.parse(prod.fases_json) : (prod?.fases_json || []);
    } catch(e) {}

    const tieneFases = prod && (prod.tipo_producto === 'postre' || (Array.isArray(fases) && fases.length > 0));

    if (tieneFases && fases.length > 0) {
        const resumen = fases.map(f => `${f.nombre} (${f.color || 'Sin color'})`).join(' | ');
        avisoDiv.innerHTML = `
            <div class="bg-rose-50/70 p-3 rounded-xl border border-rose-200 flex flex-col sm:flex-row justify-between items-center gap-2 text-rose-950">
                <span class="text-xs">🧁 <strong>Vela Multicapa Activa:</strong> ${fases.length} fases configuradas <span class="text-rose-600 font-medium">(${resumen})</span></span>
                <button type="button" onclick="abrirModalEditorMezcla(${prodId})" class="bg-rose-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold hover:bg-rose-600 shadow-xs transition whitespace-nowrap active:scale-95">✏️ Ver / Ajustar Fases</button>
            </div>
        `;
    } else {
        avisoDiv.innerHTML = `
            <button type="button" onclick="abrirModalEditorMezcla(${prodId})" class="w-full bg-white hover:bg-rose-50 text-rose-700 font-bold p-2.5 rounded-xl border-2 border-dashed border-rose-300 text-center transition">
                + Configurar fases de cera (Base, Betún, Decorado...) para esta vela
            </button>
        `;
    }
    calcularFórmulaLote();
}

function abrirModalEditorMezcla(prodId) {
    const prod = productosLista.find(p => p.id == prodId);
    if (!prod) return;

    let fases = [];
    try {
        fases = typeof prod.fases_json === 'string' ? JSON.parse(prod.fases_json) : (prod.fases_json || []);
    } catch(e) {}

    if (!Array.isArray(fases) || fases.length === 0) {
        fases = [
            { nombre: 'Base', color: 'Café', tipoFase: 'Base', cera_soya: 120, cera_coco: 0, porcentaje_esencia: 10 },
            { nombre: 'Betún', color: 'Blanco', tipoFase: 'Betún', cera_soya: 40, cera_coco: 40, porcentaje_esencia: 10 }
        ];
    }

    let htmlJarras = '';
    fases.forEach((j) => {
        const soya = j.cera_soya !== undefined ? j.cera_soya : (j.cera1GramosaUnidad || 0);
        const coco = j.cera_coco !== undefined ? j.cera_coco : (j.cera2GramosaUnidad || 0);
        htmlJarras += `
            <div class="bg-rose-50/50 p-4 rounded-2xl border-2 border-rose-200 space-y-3 jarra-item-editor shadow-2xs">
                <div class="flex justify-between items-center gap-2">
                    <input type="text" value="${j.nombre}" placeholder="Nombre de fase (ej. Base, Betún)" class="border-2 border-rose-200 p-2.5 rounded-xl text-xs font-black w-full nom-jarra bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
                    <button type="button" onclick="this.closest('.jarra-item-editor').remove()" class="text-red-500 font-bold hover:text-red-700 bg-red-50 px-2.5 py-1.5 rounded-xl text-xs">✕</button>
                </div>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                        <label class="block text-[10px] font-bold text-rose-900 mb-1 uppercase">Color de Cera:</label>
                        <select class="border-2 border-rose-200 p-2 rounded-xl text-xs font-bold w-full color-jarra bg-white focus:outline-none">
                            <option value="Sin Color" ${j.color === 'Sin Color' ? 'selected' : ''}>⚪ Sin Color (Natural)</option>
                            <option value="Café" ${j.color === 'Café' ? 'selected' : ''}>🤎 Café</option>
                            <option value="Rosa" ${j.color === 'Rosa' ? 'selected' : ''}>🩷 Rosa</option>
                            <option value="Blanco" ${j.color === 'Blanco' ? 'selected' : ''}>🤍 Blanco</option>
                            <option value="Negro" ${j.color === 'Negro' ? 'selected' : ''}>🖤 Negro</option>
                            <option value="Azul" ${j.color === 'Azul' ? 'selected' : ''}>💙 Azul</option>
                            <option value="Amarillo" ${j.color === 'Amarillo' ? 'selected' : ''}>💛 Amarillo</option>
                            <option value="Rojo" ${j.color === 'Rojo' ? 'selected' : ''}>❤️ Rojo</option>
                            <option value="Verde" ${j.color === 'Verde' ? 'selected' : ''}>💚 Verde</option>
                            <option value="Violeta" ${j.color === 'Violeta' ? 'selected' : ''}>💜 Violeta</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-rose-900 mb-1 uppercase">Tipo de Fase:</label>
                        <select class="border-2 border-rose-200 p-2 rounded-xl text-xs font-bold w-full fase-jarra bg-white focus:outline-none">
                            <option value="Base" ${j.tipoFase === 'Base' ? 'selected' : ''}>🕯️ Base Principal</option>
                            <option value="Betún" ${j.tipoFase === 'Betún' ? 'selected' : ''}>🧁 Betún / Relleno</option>
                            <option value="Decorado" ${j.tipoFase === 'Decorado' ? 'selected' : ''}>🎨 Decorado / Moldes</option>
                        </select>
                    </div>
                </div>

                <div class="flex items-center gap-3 pt-2 border-t border-rose-200 text-xs">
                    <span class="font-bold text-rose-900">Gramos por unidad:</span>
                    <div class="flex items-center gap-1">
                        <span class="text-emerald-700 font-bold">Soya:</span>
                        <input type="number" step="0.1" value="${soya}" class="w-16 border-2 border-emerald-200 p-1 rounded-lg text-center font-black text-emerald-800 soya-jarra bg-white"> g
                    </div>
                    <div class="flex items-center gap-1">
                        <span class="text-amber-700 font-bold">Coco:</span>
                        <input type="number" step="0.1" value="${coco}" class="w-16 border-2 border-amber-200 p-1 rounded-lg text-center font-black text-amber-800 coco-jarra bg-white"> g
                    </div>
                </div>
            </div>
        `;
    });

    const modalId = 'modal-mezcla-especial';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-xl w-full space-y-4 max-h-[90vh] flex flex-col border-2 border-rose-100">
            <div class="flex justify-between items-center border-b border-rose-100 pb-3">
                <div>
                    <h3 class="font-black text-rose-950 text-base">🥣 Fases de Cera y Jarras de Fundición</h3>
                    <p class="text-xs text-rose-600 font-bold">Producto: ${prod.nombre}</p>
                </div>
                <button type="button" onclick="document.getElementById('${modalId}').remove()" class="text-slate-400 hover:text-rose-600 font-bold text-xl leading-none">✕</button>
            </div>
            
            <p class="text-xs text-rose-950 bg-rose-50 p-3 rounded-2xl border border-rose-200 font-medium leading-relaxed">
                💡 Si asignas el mismo <strong>Color</strong> y el mismo <strong>Nombre de Fase</strong> en varias velas, el sistema **las unirá automáticamente en una sola olla para fundir en la estufa**.
            </p>

            <div id="contenedor-jarras-modal" class="space-y-3 overflow-y-auto pr-1 flex-1">
                ${htmlJarras}
            </div>

            <button type="button" onclick="agregarJarraModal()" class="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-2.5 rounded-xl text-xs border-2 border-dashed border-rose-300 transition">
                + Añadir otra Olla o Fase de Cera
            </button>

            <div class="flex gap-3 pt-3 border-t border-rose-100">
                <button type="button" onclick="guardarConfiguracionMezcla(${prodId})" class="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl text-xs shadow-md shadow-rose-200 transition">
                    💾 Guardar en Base de Datos
                </button>
                <button type="button" onclick="document.getElementById('${modalId}').remove()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-3 rounded-xl text-xs transition">
                    Cerrar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function agregarJarraModal() {
    const contenedor = document.getElementById('contenedor-jarras-modal');
    if (!contenedor) return;
    const div = document.createElement('div');
    div.className = 'bg-rose-50/50 p-4 rounded-2xl border-2 border-rose-200 space-y-3 jarra-item-editor shadow-2xs';
    div.innerHTML = `
        <div class="flex justify-between items-center gap-2">
            <input type="text" value="Betún" placeholder="Nombre de olla" class="border-2 border-rose-200 p-2.5 rounded-xl text-xs font-black w-full nom-jarra bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
            <button type="button" onclick="this.closest('.jarra-item-editor').remove()" class="text-red-500 font-bold hover:text-red-700 bg-red-50 px-2.5 py-1.5 rounded-xl text-xs">✕</button>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
                <label class="block text-[10px] font-bold text-rose-900 mb-1 uppercase">Color de Cera:</label>
                <select class="border-2 border-rose-200 p-2 rounded-xl text-xs font-bold w-full color-jarra bg-white focus:outline-none">
                    <option value="Sin Color">⚪ Sin Color (Natural)</option>
                    <option value="Café">🤎 Café</option>
                    <option value="Rosa">🩷 Rosa</option>
                    <option value="Blanco" selected>🤍 Blanco</option>
                    <option value="Negro">🖤 Negro</option>
                    <option value="Azul">💙 Azul</option>
                    <option value="Amarillo">💛 Amarillo</option>
                    <option value="Rojo">❤️ Rojo</option>
                    <option value="Verde">💚 Verde</option>
                    <option value="Violeta">💜 Violeta</option>
                </select>
            </div>
            <div>
                <label class="block text-[10px] font-bold text-rose-900 mb-1 uppercase">Tipo de Fase:</label>
                <select class="border-2 border-rose-200 p-2 rounded-xl text-xs font-bold w-full fase-jarra bg-white focus:outline-none">
                    <option value="Base">🕯️ Base Principal</option>
                    <option value="Betún" selected>🧁 Betún / Relleno</option>
                    <option value="Decorado">🎨 Decorado / Detalle</option>
                </select>
            </div>
        </div>

        <div class="flex items-center gap-3 pt-2 border-t border-rose-200 text-xs">
            <span class="font-bold text-rose-900">Gramos por unidad:</span>
            <div class="flex items-center gap-1">
                <span class="text-emerald-700 font-bold">Soya:</span>
                <input type="number" step="0.1" value="40" class="w-16 border-2 border-emerald-200 p-1 rounded-lg text-center font-black text-emerald-800 soya-jarra bg-white"> g
            </div>
            <div class="flex items-center gap-1">
                <span class="text-amber-700 font-bold">Coco:</span>
                <input type="number" step="0.1" value="40" class="w-16 border-2 border-amber-200 p-1 rounded-lg text-center font-black text-amber-800 coco-jarra bg-white"> g
            </div>
        </div>
    `;
    contenedor.appendChild(div);
}

async function guardarConfiguracionMezcla(prodId) {
    const jarraItems = document.querySelectorAll('.jarra-item-editor');
    const jarras = [];

    jarraItems.forEach(item => {
        const nombre = item.querySelector('.nom-jarra')?.value.trim() || 'Fase';
        const color = item.querySelector('.color-jarra')?.value || 'Sin Color';
        const tipoFase = item.querySelector('.fase-jarra')?.value || 'Base';
        const cera_soya = parseFloat(item.querySelector('.soya-jarra')?.value) || 0;
        const cera_coco = parseFloat(item.querySelector('.coco-jarra')?.value) || 0;
        jarras.push({
            nombre,
            color,
            tipoFase,
            cera_soya,
            cera_coco,
            porcentaje_esencia: 10
        });
    });

    if (jarras.length === 0) return alert('Agrega al menos una fase de cera.');

    try {
        const res = await fetch(`/api/productos-terminados/${prodId}/fases`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fases_json: jarras,
                tipo_producto: 'postre'
            })
        });

        if (res.ok) {
            const prod = productosLista.find(p => p.id == prodId);
            if (prod) {
                prod.fases_json = JSON.stringify(jarras);
                prod.tipo_producto = 'postre';
            }

            document.getElementById('modal-mezcla-especial')?.remove();
            poblarSelectoresCalculadora();

            document.querySelectorAll('.fila-calc-item').forEach(f => {
                const sel = f.querySelector('.sel-calc-producto');
                if (sel && sel.value == prodId) onCambioSelectCalculadora(sel);
            });

            calcularFórmulaLote();
            cargarProductos();
            alert('¡Fases guardadas exitosamente en la base de datos!');
        } else {
            alert('No se pudo guardar la configuración.');
        }
    } catch(e) {
        alert('Error al guardar: ' + e.message);
    }
}

function calcularFórmulaLote() {
    const filas = document.querySelectorAll('.fila-calc-item');
    const desglosadoInsumosReales = {};
    const jarrasFusionadasLote = {};
    const checklistMesa = {};

    // Resolver dinámicamente Cera de Soya y Cera de Coco desde el inventario de taller
    const insumoSoya = insumosLista.find(i => normalizarTexto(i.nombre).includes('soya')) || insumosLista.find(i => i.id === 8) || insumosLista.find(i => i.id === 1);
    const insumoCoco = insumosLista.find(i => normalizarTexto(i.nombre).includes('coco')) || insumosLista.find(i => i.id === 9) || insumosLista.find(i => i.id === 2);
    const idSoya = insumoSoya ? insumoSoya.id : 'cera_soya';
    const idCoco = insumoCoco ? insumoCoco.id : 'cera_coco';
    const nombreSoya = insumoSoya ? insumoSoya.nombre : 'Cera de Soya';
    const unidadSoya = insumoSoya ? insumoSoya.unidad : 'gramos';
    const nombreCoco = insumoCoco ? insumoCoco.nombre : 'Cera de Coco';
    const unidadCoco = insumoCoco ? insumoCoco.unidad : 'gramos';

    filas.forEach(f => {
        const prodId = parseInt(f.querySelector('.sel-calc-producto')?.value);
        const piezas = parseFloat(f.querySelector('.cant-calc-piezas')?.value);

        if (prodId && !isNaN(piezas) && piezas > 0) {
            const prod = productosLista.find(p => p.id === prodId);
            if (prod) {
                let fases = [];
                try {
                    fases = typeof prod.fases_json === 'string' ? JSON.parse(prod.fases_json) : (prod.fases_json || []);
                } catch(e) {}

                const tieneFases = prod.tipo_producto === 'postre' || (Array.isArray(fases) && fases.length > 0);

                if (tieneFases && fases.length > 0) {
                    // Ceras y Fases fusionadas con Desglose Inverso Exacto
                    fases.forEach(j => {
                        const nom = (j.nombre || 'Fase').trim();
                        const color = j.color || 'Sin Color';
                        const tipoFase = j.tipoFase || 'Base';
                        const nombreOllaKey = `${nom} [Color: ${color}] [Fase: ${tipoFase}]`;

                        const soyaBruto = j.cera_soya !== undefined ? parseFloat(j.cera_soya) || 0 : (parseFloat(j.cera1GramosaUnidad) || 0);
                        const cocoBruto = j.cera_coco !== undefined ? parseFloat(j.cera_coco) || 0 : (parseFloat(j.cera2GramosaUnidad) || 0);
                        const totalFaseBrutaUnidad = (soyaBruto + cocoBruto);
                        const totalFaseLote = totalFaseBrutaUnidad * piezas;

                        // Desglose Inverso: El peso bruto (ej. 180g o 30g) ya incluye el aroma
                        const pctAroma = (j.esencia_id ? (parseFloat(j.porcentaje_esencia) || 10) : 0);
                        const grEsenciaLote = totalFaseLote * (pctAroma / 100);
                        const grCeraPuraLote = totalFaseLote - grEsenciaLote;

                        const factorSoya = totalFaseBrutaUnidad > 0 ? (soyaBruto / totalFaseBrutaUnidad) : 0;
                        const factorCoco = totalFaseBrutaUnidad > 0 ? (cocoBruto / totalFaseBrutaUnidad) : 0;

                        const soyaPuraLote = grCeraPuraLote * factorSoya;
                        const cocoPuraLote = grCeraPuraLote * factorCoco;

                        if (!jarrasFusionadasLote[nombreOllaKey]) {
                            jarrasFusionadasLote[nombreOllaKey] = {
                                nombreOlla: nom,
                                color: color,
                                tipoFase: tipoFase,
                                soya: 0,
                                coco: 0,
                                esenciaGramos: 0,
                                pesoTotalEsperado: 0,
                                origenProductos: []
                            };
                        }

                        // Jarras a fundir en estufa (pesos reales a fundir)
                        jarrasFusionadasLote[nombreOllaKey].soya += soyaPuraLote;
                        jarrasFusionadasLote[nombreOllaKey].coco += cocoPuraLote;
                        jarrasFusionadasLote[nombreOllaKey].esenciaGramos += grEsenciaLote;
                        jarrasFusionadasLote[nombreOllaKey].pesoTotalEsperado += totalFaseLote;

                        const infoProd = `${piezas}x ${prod.nombre}`;
                        if (!jarrasFusionadasLote[nombreOllaKey].origenProductos.includes(infoProd)) {
                            jarrasFusionadasLote[nombreOllaKey].origenProductos.push(infoProd);
                        }

                        // Acumular cera pura en desglose de insumos de taller
                        if (soyaPuraLote > 0) {
                            if (!desglosadoInsumosReales[idSoya]) {
                                desglosadoInsumosReales[idSoya] = { nombre: nombreSoya, unidad: unidadSoya, cantLoteTotal: 0, detalles: [] };
                            }
                            desglosadoInsumosReales[idSoya].cantLoteTotal += soyaPuraLote;
                            desglosadoInsumosReales[idSoya].detalles.push(`${prod.nombre}: ${soyaPuraLote.toFixed(1)}g`);
                        }
                        if (cocoPuraLote > 0) {
                            if (!desglosadoInsumosReales[idCoco]) {
                                desglosadoInsumosReales[idCoco] = { nombre: nombreCoco, unidad: unidadCoco, cantLoteTotal: 0, detalles: [] };
                            }
                            desglosadoInsumosReales[idCoco].cantLoteTotal += cocoPuraLote;
                            desglosadoInsumosReales[idCoco].detalles.push(`${prod.nombre}: ${cocoPuraLote.toFixed(1)}g`);
                        }

                        // Esencia desglosada
                        if (j.esencia_id && grEsenciaLote > 0) {
                            const insEsencia = insumosLista.find(i => i.id == j.esencia_id);
                            const nomEsencia = insEsencia ? insEsencia.nombre : 'Esencia / Aroma';
                            const uniEsencia = insEsencia ? insEsencia.unidad : 'gramos';
                            if (!desglosadoInsumosReales[j.esencia_id]) {
                                desglosadoInsumosReales[j.esencia_id] = { nombre: nomEsencia, unidad: uniEsencia, cantLoteTotal: 0, detalles: [] };
                            }
                            desglosadoInsumosReales[j.esencia_id].cantLoteTotal += grEsenciaLote;
                            desglosadoInsumosReales[j.esencia_id].detalles.push(`${prod.nombre}: ${grEsenciaLote.toFixed(1)}g`);
                        }
                    });

                    // Insumos físicos (envases, pabilos) de recetas_productos
                    const recetaFisica = todasLasRecetas.filter(r => r.producto_id === prod.id);
                    recetaFisica.forEach(ing => {
                        let insumo = insumosLista.find(i => i.id === ing.insumo_id);
                        const nomInsNorm = normalizarTexto(insumo ? insumo.nombre : '');
                        // Omitir ceras que ya fueron computadas por las fases
                        if (ing.insumo_id === 1 || ing.insumo_id === 2 || ing.insumo_id === idSoya || ing.insumo_id === idCoco || nomInsNorm.includes('soya') || nomInsNorm.includes('coco')) {
                            return;
                        }
                        const insumoNom = insumo ? insumo.nombre : 'Insumo de Taller';
                        const insumoUni = insumo ? insumo.unidad : 'piezas';
                        const subtotal = ing.cantidad_requerida * piezas;

                        // Checklist
                        if (!checklistMesa[ing.insumo_id]) {
                            checklistMesa[ing.insumo_id] = { nombre: insumoNom, cantidad: 0, unidad: insumoUni, productos: [] };
                        }
                        checklistMesa[ing.insumo_id].cantidad += subtotal;
                        checklistMesa[ing.insumo_id].productos.push(`${piezas}x ${prod.nombre}`);

                        // Totales taller
                        if (!desglosadoInsumosReales[ing.insumo_id]) {
                            desglosadoInsumosReales[ing.insumo_id] = { nombre: insumoNom, unidad: insumoUni, cantLoteTotal: 0, detalles: [] };
                        }
                        desglosadoInsumosReales[ing.insumo_id].cantLoteTotal += subtotal;
                        desglosadoInsumosReales[ing.insumo_id].detalles.push(`${prod.nombre}: ${subtotal} ${insumoUni}`);
                    });

                } else {
                    // Modo estándar (fórmula de categoría o receta propia)
                    let receta = [];
                    if (prod.usa_receta_propia === 1) {
                        receta = todasLasRecetas.filter(r => r.producto_id === prodId);
                    } else {
                        receta = todasLasRecetas.filter(r => r.categoria_id === prod.categoria_id);
                        if (receta.length === 0) {
                            const catObj = categoriasProductosLista.find(c => c.id == prod.categoria_id);
                            if (catObj && catObj.padre_id) {
                                receta = todasLasRecetas.filter(r => r.categoria_id == catObj.padre_id);
                            }
                        }
                    }

                    const mapeos = todosLosMapeos.filter(m => m.producto_id === prodId);

                    let soyaEstandarUnit = 0;
                    let cocoEstandarUnit = 0;
                    let ceraOtraUnit = 0;

                    receta.forEach(ing => {
                        let insumoIdFinal = ing.insumo_id;
                        const sust = mapeos.find(m => m.insumo_generico_id === ing.insumo_id);
                        if (sust) insumoIdFinal = sust.insumo_especifico_id;

                        let insumo = insumosLista.find(i => i.id === insumoIdFinal);
                        // Si por alguna razón un ID antiguo (1 o 2) estaba guardado, mapearlo a Cera de Soya o Cera de Coco actual
                        if (!insumo && insumoIdFinal === 1 && insumoSoya) {
                            insumo = insumoSoya;
                            insumoIdFinal = insumoSoya.id;
                        } else if (!insumo && insumoIdFinal === 2 && insumoCoco) {
                            insumo = insumoCoco;
                            insumoIdFinal = insumoCoco.id;
                        }

                        const insumoNom = insumo ? insumo.nombre : (insumoIdFinal === 1 ? 'Cera de Soya' : (insumoIdFinal === 2 ? 'Cera de Coco' : 'Insumo de Taller'));
                        const insumoUni = insumo ? insumo.unidad : 'gramos';
                        const subtotal = ing.cantidad_requerida * piezas;

                        // Detectar ceras para las ollas de fundición
                        const nomInsumoNorm = normalizarTexto(insumoNom);
                        if (nomInsumoNorm.includes('soya') || insumoIdFinal === idSoya) {
                            soyaEstandarUnit += ing.cantidad_requerida;
                        } else if (nomInsumoNorm.includes('coco') || insumoIdFinal === idCoco) {
                            cocoEstandarUnit += ing.cantidad_requerida;
                        } else if (nomInsumoNorm.includes('cera')) {
                            ceraOtraUnit += ing.cantidad_requerida;
                        }

                        if (!desglosadoInsumosReales[insumoIdFinal]) {
                            desglosadoInsumosReales[insumoIdFinal] = { nombre: insumoNom, unidad: insumoUni, cantLoteTotal: 0, detalles: [] };
                        }
                        desglosadoInsumosReales[insumoIdFinal].cantLoteTotal += subtotal;
                        desglosadoInsumosReales[insumoIdFinal].detalles.push(`${prod.nombre}: ${subtotal.toFixed(2)} ${insumoUni}`);

                        // Si es envase o pabilo, agregar al checklist
                        const catInsumo = normalizarTexto(insumo?.categoria || '');
                        if (catInsumo.includes('envase') || catInsumo.includes('pabilo') || insumo?.unidad === 'piezas') {
                            if (!checklistMesa[insumoIdFinal]) {
                                checklistMesa[insumoIdFinal] = { nombre: insumoNom, cantidad: 0, unidad: insumoUni, productos: [] };
                            }
                            checklistMesa[insumoIdFinal].cantidad += subtotal;
                            checklistMesa[insumoIdFinal].productos.push(`${piezas}x ${prod.nombre}`);
                        }
                    });

                    // Si esta vela estándar contiene ceras, crear / acumular en la Olla de Fundición unificada por AROMA
                    const totalCerasUnit = soyaEstandarUnit + cocoEstandarUnit + ceraOtraUnit;
                    if (totalCerasUnit > 0) {
                        // Extraer el nombre del aroma de la receta o del nombre del producto
                        let nombreAromaFase = '';
                        let esenciaGramosUnit = 0;

                        receta.forEach(ing => {
                            let insumoIdFinal = ing.insumo_id;
                            const sust = mapeos.find(m => m.insumo_generico_id === ing.insumo_id);
                            if (sust) insumoIdFinal = sust.insumo_especifico_id;

                            const insumo = insumosLista.find(i => i.id === insumoIdFinal);
                            const nomIns = insumo ? insumo.nombre : '';
                            const catIns = normalizarTexto(insumo?.categoria || '');
                            const nomNorm = normalizarTexto(nomIns);

                            if (catIns.includes('esencia') || catIns.includes('aroma') || nomNorm.includes('esencia') || nomNorm.includes('aroma')) {
                                nombreAromaFase = nomIns.replace(/^Esencia\s+(de\s+)?/i, '').replace(/^Aroma\s+(de\s+)?/i, '').trim();
                                esenciaGramosUnit = ing.cantidad_requerida;
                            }
                        });

                        if (!nombreAromaFase) {
                            // Si no tiene insumo con categoría 'esencia', extraer aroma del nombre del producto
                            nombreAromaFase = prod.nombre.replace(/^Vela\s+(Golden\s+)?/i, '').replace(/\s+(Chica|Grande|Mediana|Mini|Extra)$/i, '').trim() || 'Estándar';
                        }

                        // Juntar por Aroma (ej. "Mezcla: Sándalo") para que Chica, Mediana o Grande se preparen en la misma olla
                        const nombreOllaKey = `Mezcla: ${nombreAromaFase}`;

                        if (!jarrasFusionadasLote[nombreOllaKey]) {
                            jarrasFusionadasLote[nombreOllaKey] = {
                                nombreOlla: `Mezcla: ${nombreAromaFase}`,
                                color: 'Natural / Aroma',
                                tipoFase: `Velas ${nombreAromaFase}`,
                                soya: 0,
                                coco: 0,
                                esenciaGramos: 0,
                                pesoTotalEsperado: 0,
                                origenProductos: []
                            };
                        }

                        const soyaPura = (soyaEstandarUnit + ceraOtraUnit) * piezas;
                        const cocoPura = cocoEstandarUnit * piezas;
                        const esenciaTotal = esenciaGramosUnit * piezas;

                        jarrasFusionadasLote[nombreOllaKey].soya += soyaPura;
                        jarrasFusionadasLote[nombreOllaKey].coco += cocoPura;
                        jarrasFusionadasLote[nombreOllaKey].esenciaGramos += esenciaTotal;
                        jarrasFusionadasLote[nombreOllaKey].pesoTotalEsperado += (soyaPura + cocoPura + esenciaTotal);

                        const infoProd = `${piezas}x ${prod.nombre}`;
                        if (!jarrasFusionadasLote[nombreOllaKey].origenProductos.includes(infoProd)) {
                            jarrasFusionadasLote[nombreOllaKey].origenProductos.push(infoProd);
                        }
                    }
                }
            }
        }
    });

    const divResultado = document.getElementById('resultado-calculadora-insumos');
    if (!divResultado) return;
    divResultado.innerHTML = '';

    const idsInsumos = Object.keys(desglosadoInsumosReales);
    const keysJarras = Object.keys(jarrasFusionadasLote);
    const idsChecklist = Object.keys(checklistMesa);

    if (idsInsumos.length === 0 && keysJarras.length === 0) {
        divResultado.innerHTML = `<p class="text-rose-400 font-bold italic text-center py-8">Selecciona productos y cantidades arriba para ver las órdenes de fundición y totales exactos...</p>`;
        return;
    }

    // 1. SECCIÓN: JARRAS / OLLAS DE FUNDICIÓN COMPARTIDAS (GRANDE Y CLARO)
    if (keysJarras.length > 0) {
        divResultado.innerHTML += `
            <div class="bg-rose-500 text-white p-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider mb-4 flex items-center gap-2 shadow-xs">
                <span class="text-lg sm:text-xl">🥣</span> ÓRDENES DE FUNDICIÓN EN ESTUFA (JARRAS Y MEZCLAS A CALENTAR):
            </div>
        `;

        keysJarras.forEach(key => {
            const jData = jarrasFusionadasLote[key];
            const totalCeraJarra = jData.soya + jData.coco;
            const cantEsencia = (jData.esenciaGramos > 0) ? jData.esenciaGramos : (totalCeraJarra * 0.10);
            const totalCeraConEsencia = totalCeraJarra + cantEsencia;

            let badgeColor = 'bg-slate-100 text-slate-800 border-slate-300';
            if (jData.color === 'Café') badgeColor = 'bg-amber-100 text-amber-900 border-amber-300';
            else if (jData.color === 'Rosa') badgeColor = 'bg-pink-100 text-pink-900 border-pink-300';
            else if (jData.color === 'Blanco') badgeColor = 'bg-slate-100 text-slate-800 border-slate-300';
            else if (jData.color === 'Negro') badgeColor = 'bg-gray-800 text-white border-black';
            else if (jData.color === 'Azul') badgeColor = 'bg-blue-100 text-blue-900 border-blue-300';
            else if (jData.color === 'Amarillo') badgeColor = 'bg-yellow-100 text-yellow-900 border-yellow-300';
            else if (jData.color === 'Rojo') badgeColor = 'bg-red-100 text-red-900 border-red-300';
            else if (jData.color === 'Verde') badgeColor = 'bg-emerald-100 text-emerald-900 border-emerald-300';
            else if (jData.color === 'Violeta') badgeColor = 'bg-purple-100 text-purple-900 border-purple-300';

            divResultado.innerHTML += `
                <div class="bg-white border-2 border-rose-200 p-5 sm:p-6 rounded-3xl space-y-4 mb-4 shadow-sm hover:border-rose-400 transition">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-2 border-rose-100 pb-3 gap-2">
                        <div class="flex items-center gap-2.5 flex-wrap">
                            <span class="text-xl sm:text-2xl">🥣</span>
                            <strong class="text-rose-950 text-base sm:text-lg font-black tracking-tight">Olla: "${jData.nombreOlla}"</strong>
                            <span class="text-xs px-3 py-1 rounded-full font-black border ${badgeColor}">🎨 Color: ${jData.color}</span>
                            <span class="text-xs px-3 py-1 rounded-full font-black bg-rose-100 text-rose-900 border border-rose-200">📌 ${jData.tipoFase}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs sm:text-sm font-black text-emerald-900 bg-emerald-100 px-3.5 py-1.5 rounded-xl border border-emerald-200">Cera Pura: ${totalCeraJarra.toFixed(1)} g</span>
                            <span class="text-xs sm:text-sm font-black text-amber-900 bg-amber-100 px-3.5 py-1.5 rounded-xl border border-amber-300">💧 Esencia: ${cantEsencia.toFixed(1)} g</span>
                            <span class="text-xs sm:text-sm font-black text-purple-900 bg-purple-100 px-3.5 py-1.5 rounded-xl border border-purple-300">🎯 Cera + Esencia: ${totalCeraConEsencia.toFixed(1)} g</span>
                        </div>
                    </div>

                    <!-- ALIMENTA A (DESTACADO, GRANDE Y CLARO) -->
                    <div class="bg-rose-50 border-2 border-rose-200 p-4 sm:p-5 rounded-2xl">
                        <span class="block text-xs font-black text-rose-600 uppercase tracking-widest mb-1.5">🥣 ALIMENTA A:</span>
                        <span class="text-base sm:text-lg font-black text-rose-950 leading-relaxed">${jData.origenProductos.join(' &nbsp;•&nbsp; ')}</span>
                    </div>

                    <!-- PASOS DE PESAJE: CERAS Y ESENCIA -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                        ${jData.soya > 0 ? `
                            <div class="bg-emerald-50 border-2 border-emerald-300 p-4 rounded-2xl flex items-center justify-between shadow-2xs">
                                <div>
                                    <span class="block text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider mb-0.5">🌱 1. Cera de Soya a pesar:</span>
                                    <span class="text-2xl sm:text-3xl font-black text-emerald-950 tracking-tight">${jData.soya.toFixed(1)} <span class="text-xs sm:text-sm font-bold text-emerald-700">g</span></span>
                                </div>
                                <span class="text-2xl">🌱</span>
                            </div>
                        ` : ''}
                        ${jData.coco > 0 ? `
                            <div class="bg-amber-50 border-2 border-amber-300 p-4 rounded-2xl flex items-center justify-between shadow-2xs">
                                <div>
                                    <span class="block text-[11px] font-extrabold text-amber-800 uppercase tracking-wider mb-0.5">🥥 1. Cera de Coco a pesar:</span>
                                    <span class="text-2xl sm:text-3xl font-black text-amber-950 tracking-tight">${jData.coco.toFixed(1)} <span class="text-xs sm:text-sm font-bold text-amber-700">g</span></span>
                                </div>
                                <span class="text-2xl">🥥</span>
                            </div>
                        ` : ''}
                        <div class="bg-sky-50 border-2 border-sky-300 p-4 rounded-2xl flex items-center justify-between shadow-2xs">
                            <div>
                                <span class="block text-[11px] font-extrabold text-sky-800 uppercase tracking-wider mb-0.5">💧 2. Cantidad de Esencia:</span>
                                <span class="text-2xl sm:text-3xl font-black text-sky-950 tracking-tight">${cantEsencia.toFixed(1)} <span class="text-xs sm:text-sm font-bold text-sky-700">g</span></span>
                            </div>
                            <span class="text-2xl">💧</span>
                        </div>
                    </div>

                    <!-- META EN BÁSCULA: CERA + ESENCIA (HASTA DÓNDE PONER DE AROMA) -->
                    <div class="bg-purple-50/90 border-2 border-purple-300 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-xl">🎯</span>
                                <span class="text-xs sm:text-sm font-black text-purple-950 uppercase tracking-wider">Cera con Esencia (Marca Final en Báscula):</span>
                            </div>
                            <p class="text-xs sm:text-sm text-purple-900 font-bold">
                                👉 Pon tu cera (${totalCeraJarra.toFixed(1)} g) y luego <span class="text-purple-700 font-black underline">vierte aroma hasta que la báscula marque exactamente:</span>
                            </p>
                        </div>
                        <div class="bg-white border-2 border-purple-400 px-5 py-2.5 rounded-2xl shadow-inner text-center self-stretch sm:self-auto min-w-[170px]">
                            <span class="text-2xl sm:text-3xl font-black text-purple-950 tracking-tight">${totalCeraConEsencia.toFixed(1)}</span>
                            <span class="text-xs sm:text-sm font-black text-purple-700 ml-1">gramos</span>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    // 2. SECCIÓN: CHECKLIST DE ARMADO EN MESA
    if (idsChecklist.length > 0) {
        let itemsChecklistHtml = '';
        idsChecklist.forEach(id => {
            const item = checklistMesa[id];
            itemsChecklistHtml += `
                <label class="flex items-center gap-3 bg-white p-3 rounded-xl border-2 border-emerald-200 cursor-pointer hover:bg-emerald-50/50 transition shadow-2xs">
                    <input type="checkbox" class="w-4 h-4 text-emerald-600 rounded cursor-pointer accent-emerald-600">
                    <span class="text-xs sm:text-sm font-bold text-slate-800 flex-1">${item.cantidad}x ${item.nombre}</span>
                    <span class="text-[10px] text-slate-400 font-semibold">(${item.productos.join(', ')})</span>
                </label>
            `;
        });

        divResultado.innerHTML += `
            <div class="bg-white border-2 border-emerald-200 p-5 rounded-2xl space-y-3 my-4 shadow-sm">
                <div class="flex items-center justify-between border-b border-emerald-100 pb-2.5">
                    <h4 class="font-black text-xs sm:text-sm text-emerald-950 uppercase tracking-wider flex items-center gap-2">
                        <span>📋</span> Checklist de Mesa (Envases, Pabilos y Toppers a Preparar):
                    </h4>
                    <span class="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">Marca conforme coloques en mesa</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    ${itemsChecklistHtml}
                </div>
            </div>
        `;
    }

    // 3. SECCIÓN: TOTALES REALES DE INSUMOS PARA DESCONTAR DE TALLER
    divResultado.innerHTML += `
        <div class="bg-rose-500 text-white p-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider mt-6 mb-3 flex items-center gap-2 shadow-xs">
            <span class="text-lg sm:text-xl">📦</span> TOTALES REALES DE INSUMOS PARA DESCONTAR DE TALLER:
        </div>
    `;

    idsInsumos.forEach(idStr => {
        const item = desglosadoInsumosReales[idStr];
        const idNum = parseInt(idStr);
        const insumo = !isNaN(idNum) ? insumosLista.find(i => i.id === idNum) : null;
        const nombre = item.nombre || (insumo ? insumo.nombre : 'Insumo de Taller');
        const unidad = item.unidad || (insumo ? insumo.unidad : '');

        divResultado.innerHTML += `
            <div class="bg-white p-4 sm:p-5 rounded-2xl border-2 border-rose-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-3 shadow-2xs hover:border-rose-400 transition">
                <div class="space-y-1">
                    <span class="font-black text-rose-950 text-base sm:text-lg">${nombre}</span>
                    <span class="text-xs text-rose-700/80 font-bold block">${item.detalles.join(' &nbsp;|&nbsp; ')}</span>
                </div>
                <div class="flex items-center gap-2 self-end md:self-center">
                    <span class="text-xs font-black text-rose-900 uppercase">Total a Preparar:</span>
                    <input type="number" step="0.001" value="${item.cantLoteTotal.toFixed(2)}" class="w-36 border-2 p-2.5 rounded-xl text-right font-black text-rose-950 border-rose-300 text-base focus:ring-2 focus:ring-rose-400 bg-rose-50/50 shadow-2xs">
                    <span class="text-rose-950 font-black text-sm">${unidad}</span>
                </div>
            </div>
        `;
    });
}

function agregarInsumoExtraCalculadora() {
    const divResultado = document.getElementById('resultado-calculadora-insumos');
    if (!divResultado) return;
    if (insumosLista.length === 0) return alert('No hay insumos registrados');
    let opcionesCascada = obtenerOpcionesInsumosCascada();

    const div = document.createElement('div');
    div.className = 'flex justify-between items-center bg-rose-50/60 p-3 rounded-2xl border-2 border-rose-200 mt-2 shadow-2xs gap-3';
    div.innerHTML = `
        <div class="w-2/3">
            <select class="sel-insumo-extra-calc border-2 border-rose-200 p-2.5 rounded-xl text-xs w-full bg-white font-bold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-400">
                ${opcionesCascada}
            </select>
        </div>
        <div class="flex items-center gap-2">
            <input type="number" step="0.001" placeholder="Cant." class="w-24 border-2 p-2 rounded-xl text-right font-black text-rose-800 border-rose-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
            <button onclick="this.closest('.flex').remove()" class="text-red-500 hover:text-red-700 font-black px-2.5 py-1.5 bg-white rounded-xl border border-rose-200 hover:bg-red-50">✕</button>
        </div>
    `;
    divResultado.appendChild(div);
    const sel = div.querySelector('.sel-insumo-extra-calc');
    if (sel) crearSelectorBuscable(sel, '🔍 Escribe para buscar insumo...');
}

// ========================================================
// --- FOTOGRAFÍA DE REFERENCIA PARA FICHAS TÉCNICAS ---
// ========================================================
async function procesarFotoFicha(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
        alert("La fotografía es muy pesada. Por favor sube una imagen de menos de 15MB.");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Data = e.target.result;
        try {
            const res = await fetch('/api/upload-foto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imagen_base64: base64Data,
                    nombre_archivo: file.name
                })
            });
            const data = await res.json();
            if (res.ok && data.url) {
                document.getElementById('ficha-foto-url').value = data.url;
                const imgPreview = document.getElementById('ficha-foto-preview');
                const contPreview = document.getElementById('ficha-foto-preview-container');
                const btnQuitar = document.getElementById('btn-quitar-foto');
                if (imgPreview && contPreview) {
                    imgPreview.src = data.url;
                    contPreview.classList.remove('hidden');
                }
                if (btnQuitar) btnQuitar.classList.remove('hidden');
            } else {
                alert("Error al subir la fotografía: " + (data.error || 'Error desconocido'));
            }
        } catch (err) {
            console.error("Error subiendo foto:", err);
            alert("Error de conexión al subir la imagen");
        }
    };
    reader.readAsDataURL(file);
}

function quitarFotoFicha() {
    const inputUrl = document.getElementById('ficha-foto-url');
    const inputFile = document.getElementById('ficha-foto-input');
    const imgPreview = document.getElementById('ficha-foto-preview');
    const contPreview = document.getElementById('ficha-foto-preview-container');
    const btnQuitar = document.getElementById('btn-quitar-foto');

    if (inputUrl) inputUrl.value = '';
    if (inputFile) inputFile.value = '';
    if (imgPreview) imgPreview.src = '';
    if (contPreview) contPreview.classList.add('hidden');
    if (btnQuitar) btnQuitar.classList.add('hidden');
}

function ampliarFoto(url) {
    if (!url) return;
    const modal = document.getElementById('modal-foto-zoom');
    const img = document.getElementById('img-foto-zoom');
    if (modal && img) {
        img.src = url;
        modal.classList.remove('hidden');
    }
}

function cerrarFotoZoom() {
    const modal = document.getElementById('modal-foto-zoom');
    const img = document.getElementById('img-foto-zoom');
    if (modal) modal.classList.add('hidden');
    if (img) img.src = '';
}

// ========================================================
// --- GESTIÓN DE FICHAS TÉCNICAS DE TALLER ---
// ========================================================
async function cargarDatosFichaAlSeleccionar() {
    const selectElem = document.getElementById('ficha-producto-id');
    if (!selectElem) return;
    const producto_id = selectElem.value;
    if (!producto_id) { limpiarFormularioFicha(); return; }

    try {
        const res = await fetch(`/api/fichas-tecnicas/producto/${producto_id}`);
        const ficha = await res.json();

        document.getElementById('ficha-pabilo').value = ficha.calibre_pabilo || '';
        document.getElementById('ficha-temperatura').value = ficha.temperatura_vertido || '';
        document.getElementById('ficha-tecnica').value = ficha.tecnica_decorado || '';
        document.getElementById('ficha-gramos').value = ficha.desglose_gramos || '';
        document.getElementById('ficha-notas').value = ficha.notas_comentarios || '';

        if (ficha.foto) {
            document.getElementById('ficha-foto-url').value = ficha.foto;
            const imgPreview = document.getElementById('ficha-foto-preview');
            const contPreview = document.getElementById('ficha-foto-preview-container');
            const btnQuitar = document.getElementById('btn-quitar-foto');
            if (imgPreview && contPreview) {
                imgPreview.src = ficha.foto;
                contPreview.classList.remove('hidden');
            }
            if (btnQuitar) btnQuitar.classList.remove('hidden');
        } else {
            quitarFotoFicha();
        }

        document.getElementById('titulo-form-ficha').innerText = '✏️ Editar Ficha Técnica';
    } catch (e) {
        console.error("Error al cargar datos de ficha:", e);
    }
}

function prepararEditarFicha(producto_id) {
    const selectElem = document.getElementById('ficha-producto-id');
    if (!selectElem) return;
    selectElem.value = producto_id;
    crearSelectorBuscable(selectElem, '🔍 Escribe para buscar vela o producto...');
    cargarDatosFichaAlSeleccionar();
    window.scrollTo({ top: 400, behavior: 'smooth' });
}

function limpiarFormularioFicha() {
    const ids = ['ficha-producto-id', 'ficha-pabilo', 'ficha-temperatura', 'ficha-tecnica', 'ficha-gramos', 'ficha-notas'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const selectElem = document.getElementById('ficha-producto-id');
    if (selectElem) crearSelectorBuscable(selectElem, '🔍 Escribe para buscar vela o producto...');
    quitarFotoFicha();
    const titulo = document.getElementById('titulo-form-ficha');
    if (titulo) titulo.innerText = 'Crear / Editar Ficha Técnica';
}

async function guardarFichaTecnica() {
    const producto_id = document.getElementById('ficha-producto-id')?.value;
    const calibre_pabilo = document.getElementById('ficha-pabilo')?.value.trim();
    const temperatura_vertido = document.getElementById('ficha-temperatura')?.value.trim();
    const tecnica_decorado = document.getElementById('ficha-tecnica')?.value.trim();
    const desglose_gramos = document.getElementById('ficha-gramos')?.value.trim();
    const notas_comentarios = document.getElementById('ficha-notas')?.value.trim();
    const foto = document.getElementById('ficha-foto-url')?.value || null;

    if (!producto_id) return alert('Por favor selecciona un producto.');

    const res = await fetch('/api/fichas-tecnicas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto_id, calibre_pabilo, temperatura_vertido, tecnica_decorado, desglose_gramos, notas_comentarios, foto })
    });

    if (res.ok) {
        alert('¡Ficha técnica guardada correctamente!');
        limpiarFormularioFicha();
        cargarFichasTecnicas();
    } else {
        const err = await res.json();
        alert('Error al guardar ficha: ' + (err.error || 'Error desconocido'));
    }
}

async function cargarFichasTecnicas() {
    try {
        const res = await fetch('/api/fichas-tecnicas');
        fichasTecnicasLista = await res.json();
        renderizarFichasTecnicas();
    } catch (e) {
        console.error("Error cargando fichas técnicas:", e);
    }
}

function renderizarFichasTecnicas() {
    const contenedor = document.getElementById('contenedor-tarjetas-fichas');
    if (!contenedor) return;

    const filtroTexto = normalizarTexto(document.getElementById('buscar-ficha')?.value || '');
    const filtroCategoria = document.getElementById('filtro-cat-ficha')?.value || '';
    contenedor.innerHTML = '';

    const filtradas = fichasTecnicasLista.filter(f => {
        const coincideTexto = normalizarTexto(`${f.producto_nombre} ${f.categoria} ${f.calibre_pabilo} ${f.tecnica_decorado} ${f.notas_comentarios}`).includes(filtroTexto);
        let coincideCategoria = true;
        if (filtroCategoria) {
            const catId = parseInt(filtroCategoria);
            const prod = productosLista.find(p => p.id === f.producto_id);
            if (prod) coincideCategoria = (prod.categoria_id === catId);
        }
        return coincideTexto && coincideCategoria;
    });

    if (filtradas.length === 0) {
        contenedor.innerHTML = `<p class="text-sm text-rose-300 text-center py-8">No hay fichas técnicas registradas para esta búsqueda.</p>`;
        return;
    }

    filtradas.forEach(f => {
        const catNombre = f.categoria_padre ? `${f.categoria_padre} ➔ ${f.categoria}` : (f.categoria || 'Sin categoría');
        contenedor.innerHTML += `
            <div class="bg-white border-2 border-rose-100 p-5 sm:p-6 rounded-2xl shadow-sm space-y-4 relative hover:border-rose-400 transition">
                <div class="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-rose-100 pb-3">
                    <div class="flex items-start gap-3.5">
                        ${f.foto ? `
                            <div class="relative group cursor-pointer shrink-0" onclick="ampliarFoto('${f.foto}')" title="Clic para ampliar foto">
                                <img src="${f.foto}" alt="${f.producto_nombre}" class="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-2xl border-2 border-rose-200 shadow-2xs group-hover:scale-105 transition">
                                <div class="absolute inset-0 bg-black/20 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                    <span class="text-white text-xs">🔍</span>
                                </div>
                            </div>
                        ` : `
                            <div class="w-16 h-16 sm:w-20 sm:h-20 bg-rose-50 rounded-2xl border-2 border-rose-200 flex items-center justify-center text-rose-300 text-2xl font-bold shrink-0">
                                🕯️
                            </div>
                        `}
                        <div>
                            <h3 class="font-black text-rose-950 text-base sm:text-lg">${f.producto_nombre}</h3>
                            <span class="inline-block bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full text-xs font-bold mt-1 border border-rose-200">📁 ${catNombre}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 self-end sm:self-start">
                        <button onclick="prepararEditarFicha(${f.producto_id})" class="bg-rose-50 text-rose-600 hover:bg-rose-100 px-3.5 py-1.5 rounded-xl text-xs font-bold transition border border-rose-200">✏️ Editar</button>
                        <button onclick="eliminarFichaTecnica(${f.id})" class="text-red-400 hover:text-red-600 font-black text-sm px-2" title="Eliminar ficha">✕</button>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-rose-950">
                    ${f.calibre_pabilo ? `<div class="bg-rose-50/50 p-3 rounded-xl border border-rose-100"><strong>🕯️ Pabilo:</strong> ${f.calibre_pabilo}</div>` : ''}
                    ${f.temperatura_vertido ? `<div class="bg-rose-50/50 p-3 rounded-xl border border-rose-100"><strong>🌡️ Temp. Vertido:</strong> ${f.temperatura_vertido}</div>` : ''}
                    ${f.tecnica_decorado ? `<div class="bg-rose-50/50 p-3 rounded-xl border border-rose-100 md:col-span-2"><strong>🎨 Técnica Especial:</strong> ${f.tecnica_decorado}</div>` : ''}
                    ${f.desglose_gramos ? `<div class="bg-rose-50/70 p-3.5 rounded-xl border border-rose-200 md:col-span-2"><strong>⚖️ Gramaje / Fases:</strong><div class="whitespace-pre-line leading-relaxed text-rose-950 font-bold mt-1">${f.desglose_gramos}</div></div>` : ''}
                    ${f.notas_comentarios ? `<div class="bg-amber-50/80 p-3.5 rounded-xl border border-amber-200 text-amber-950 md:col-span-2"><strong>📝 Notas Taller:</strong><div class="whitespace-pre-line leading-relaxed font-semibold mt-1">${f.notas_comentarios}</div></div>` : ''}
                </div>
            </div>
        `;
    });
}

async function eliminarFichaTecnica(id) {
    if (!confirm('¿Eliminar esta ficha técnica?')) return;
    const res = await fetch(`/api/fichas-tecnicas/${id}`, { method: 'DELETE' });
    if (res.ok) cargarFichasTecnicas();
}

// ==========================================
// CONTROL DE TEMPORADA (CATEGORÍAS Y PRODUCTOS)
// ==========================================

async function alternarTemporadaCategoria(catId) {
    try {
        const res = await fetch(`/api/categorias-productos/${catId}/toggle-activa`, { method: 'PATCH' });
        if (res.ok) {
            await cargarCategorias();
            await cargarProductos();
        }
    } catch(e) {
        console.error("Error al alternar temporada de categoría:", e);
    }
}

async function alternarTemporadaProducto(prodId) {
    try {
        const res = await fetch(`/api/productos-terminados/${prodId}/toggle-activa`, { method: 'PATCH' });
        if (res.ok) {
            await cargarProductos();
        }
    } catch(e) {
        console.error("Error al alternar temporada de producto:", e);
    }
}

// ==========================================
// SECCIÓN 5: PLAN DEL DÍA & CHECKLIST INTERACTIVO
// ==========================================

let planDiarioFechaSeleccionada = new Date().toISOString().slice(0, 10);
let planDiarioDatos = { plan: null, tareas: [] };
let filtroOperadorPlanActual = 'TODOS';

function inicializarPestanaPlan() {
    const inputFecha = document.getElementById('plan-fecha-input');
    if (inputFecha) {
        if (!inputFecha.value) inputFecha.value = planDiarioFechaSeleccionada;
        else planDiarioFechaSeleccionada = inputFecha.value;
    }
    poblarOperadoresPlan();
    poblarSelectorProductosPlan();
    cargarPlanDiario(planDiarioFechaSeleccionada);
}

function cambiarFechaPlan() {
    const inputFecha = document.getElementById('plan-fecha-input');
    if (inputFecha && inputFecha.value) {
        planDiarioFechaSeleccionada = inputFecha.value;
        cargarPlanDiario(planDiarioFechaSeleccionada);
    }
}

function irFechaPlan(modo) {
    const d = new Date();
    if (modo === 'hoy') {
        // hoy
    } else if (modo === 'manana') {
        d.setDate(d.getDate() + 1);
    }
    const fechaStr = d.toISOString().slice(0, 10);
    planDiarioFechaSeleccionada = fechaStr;
    const inputFecha = document.getElementById('plan-fecha-input');
    if (inputFecha) inputFecha.value = fechaStr;
    cargarPlanDiario(fechaStr);
}

function poblarOperadoresPlan() {
    const sel = document.getElementById('nueva-tarea-operador');
    if (!sel) return;
    const valActual = sel.value;
    sel.innerHTML = '<option value="">Selecciona operador...</option>';
    operadoresLista.forEach(op => {
        sel.innerHTML += `<option value="${op.nombre}">${op.nombre}</option>`;
    });
    if (valActual) sel.value = valActual;
}

function poblarSelectorProductosPlan() {
    const sel = document.getElementById('nueva-tarea-producto-id');
    if (!sel) return;
    const valActual = sel.value;
    sel.innerHTML = '<option value="">Ninguno / General</option>';

    const principales = categoriasProductosLista.filter(c => !c.padre_id);
    principales.forEach(padre => {
        let prodsPadre = productosLista.filter(p => p.categoria_id === padre.id && p.activa !== 0 && padre.activa !== 0 && p.categoria_activa !== 0 && p.categoria_padre_activa !== 0);
        let subs = categoriasProductosLista.filter(c => c.padre_id === padre.id);

        let optGroup = `<optgroup label="📁 ${padre.nombre}">`;

        prodsPadre.forEach(p => {
            optGroup += `<option value="${p.id}">${p.nombre}</option>`;
        });

        subs.forEach(sub => {
            let prodsSub = productosLista.filter(p => p.categoria_id === sub.id && p.activa !== 0 && sub.activa !== 0 && padre.activa !== 0 && p.categoria_activa !== 0 && p.categoria_padre_activa !== 0);
            if (prodsSub.length > 0) {
                optGroup += `<option disabled class="font-bold text-gray-500">&nbsp;&nbsp;↳ Subcategoría: ${sub.nombre}</option>`;
                prodsSub.forEach(p => {
                    optGroup += `<option value="${p.id}">&nbsp;&nbsp;&nbsp;&nbsp;${p.nombre}</option>`;
                });
            }
        });

        optGroup += `</optgroup>`;
        sel.innerHTML += optGroup;
    });

    if (valActual) sel.value = valActual;
    crearSelectorBuscable(sel, '🔍 Escribe para buscar producto...');
}

async function cargarPlanDiario(fecha = null) {
    if (!fecha) fecha = planDiarioFechaSeleccionada;
    try {
        const res = await fetch(`/api/plan-diario/${fecha}`);
        planDiarioDatos = await res.json();
        renderizarPlanDiario();
    } catch(e) {
        console.error("Error cargando plan diario:", e);
    }
}

function renderizarPlanDiario() {
    const notasInput = document.getElementById('plan-notas-input');
    if (notasInput) {
        notasInput.value = planDiarioDatos.plan?.notas_advertencia || '';
    }

    const tareas = planDiarioDatos.tareas || [];
    const total = tareas.length;

    // Renderizar pills de operadores
    const contenedorPills = document.getElementById('pills-filtro-operador');
    if (contenedorPills) {
        const opsConTareas = [...new Set(tareas.map(t => t.operador))];
        let opsPills = ['TODOS', ...operadoresLista.map(o => o.nombre)];
        opsConTareas.forEach(op => { if (!opsPills.includes(op)) opsPills.push(op); });

        let pillsHtml = `
            <button type="button" onclick="filtrarTareasOperador('TODOS')" class="pill-operador text-xs font-bold px-3.5 py-1.5 rounded-full transition shadow-xs ${filtroOperadorPlanActual === 'TODOS' ? 'bg-rose-500 text-white shadow-rose-200' : 'bg-white text-rose-950 border border-rose-200 hover:bg-rose-50'}">
                👥 Todos (${total})
            </button>
        `;

        opsPills.filter(o => o !== 'TODOS').forEach(op => {
            const tareasOp = tareas.filter(t => t.operador === op);
            const compOp = tareasOp.filter(t => t.completada === 1).length;
            const esActivo = filtroOperadorPlanActual === op;
            pillsHtml += `
                <button type="button" onclick="filtrarTareasOperador('${op}')" class="pill-operador text-xs font-bold px-3.5 py-1.5 rounded-full transition shadow-xs ${esActivo ? 'bg-rose-500 text-white shadow-rose-200' : 'bg-white text-rose-950 border border-rose-200 hover:bg-rose-50'}">
                    👤 ${op} (${compOp}/${tareasOp.length})
                </button>
            `;
        });
        contenedorPills.innerHTML = pillsHtml;
    }

    // Agrupar tareas por operador para las tarjetas
    const contenedorTarjetas = document.getElementById('contenedor-checklist-operadores');
    if (!contenedorTarjetas) return;
    contenedorTarjetas.innerHTML = '';

    if (total === 0) {
        contenedorTarjetas.innerHTML = `
            <div class="col-span-full text-center py-10 bg-rose-50/40 rounded-3xl border-2 border-dashed border-rose-200 p-6 space-y-2">
                <span class="text-3xl">📋</span>
                <h4 class="font-black text-rose-950 text-base">No hay tareas asignadas para el ${planDiarioFechaSeleccionada}</h4>
                <p class="text-xs text-slate-500 font-medium">Asigna una tarea en el formulario de abajo para comenzar la jornada.</p>
            </div>
        `;
        return;
    }

    const todosOperadores = [...new Set(tareas.map(t => t.operador))];
    const operadoresMostrar = filtroOperadorPlanActual === 'TODOS' 
        ? todosOperadores 
        : todosOperadores.filter(o => o === filtroOperadorPlanActual);

    operadoresMostrar.forEach(op => {
        const tareasOp = tareas.filter(t => t.operador === op);
        const compOp = tareasOp.filter(t => t.completada === 1).length;
        const totalOp = tareasOp.length;
        const porcOp = totalOp > 0 ? Math.round((compOp / totalOp) * 100) : 0;
        const terminadoTodo = compOp === totalOp && totalOp > 0;

        let itemsHtml = '';
        tareasOp.forEach(t => {
            const estaHecho = t.completada === 1;
            let badgeCant = '';
            if (t.cantidad) {
                badgeCant = `<span class="bg-rose-100 text-rose-900 px-2 py-0.5 rounded-lg text-xs font-black">${t.cantidad} ${t.unidad || 'pzas'}</span>`;
            }
            if (t.producto_nombre) {
                badgeCant += ` <span class="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-lg text-xs font-bold">📦 ${t.producto_nombre}</span>`;
            }

            let badgeNota = '';
            if (t.nota) {
                badgeNota = `
                    <div class="bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-xl text-xs font-semibold mt-1 flex items-start gap-1.5 shadow-2xs">
                        <span class="text-xs mt-0.5">📝</span>
                        <span class="leading-tight"><strong class="text-amber-950 font-bold">Nota:</strong> ${t.nota}</span>
                    </div>
                `;
            }

            let horaComp = '';
            if (estaHecho && t.completada_en) {
                horaComp = `<span class="text-[10px] text-emerald-700 font-bold block mt-0.5">✓ Hecho a las ${t.completada_en}</span>`;
            }

            itemsHtml += `
                <div class="flex items-start justify-between gap-3 p-3 rounded-2xl transition border ${estaHecho ? 'bg-emerald-50/70 border-emerald-200' : 'bg-white border-rose-100 hover:border-rose-300 shadow-2xs'}">
                    <label class="flex items-start gap-3 cursor-pointer flex-1">
                        <input type="checkbox" onchange="toggleTareaPlan(${t.id})" ${estaHecho ? 'checked' : ''} class="w-5 h-5 text-rose-500 rounded-lg focus:ring-rose-400 mt-0.5 cursor-pointer">
                        <div class="space-y-1 w-full">
                            <span class="text-sm font-bold ${estaHecho ? 'line-through text-slate-400' : 'text-rose-950'} block leading-snug">
                                ${t.tarea}
                            </span>
                            <div class="flex items-center gap-1.5 flex-wrap">
                                ${badgeCant}
                            </div>
                            ${badgeNota}
                            ${horaComp}
                        </div>
                    </label>
                    <button type="button" onclick="eliminarTareaPlan(${t.id})" class="text-slate-300 hover:text-red-500 font-black text-xs p-1 rounded transition" title="Eliminar tarea">
                        ✕
                    </button>
                </div>
            `;
        });

        contenedorTarjetas.innerHTML += `
            <div class="bg-white rounded-3xl border-2 ${terminadoTodo ? 'border-emerald-300 shadow-emerald-100' : 'border-rose-100'} p-5 space-y-4 shadow-sm flex flex-col justify-between">
                <div>
                    <!-- Encabezado Tarjeta Operador -->
                    <div class="flex items-center justify-between border-b border-rose-100 pb-3">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">👤</span>
                            <div>
                                <h3 class="font-black text-rose-950 text-base">Tareas de ${op}</h3>
                                <p class="text-xs text-slate-500 font-semibold">${compOp} de ${totalOp} listas (${porcOp}%)</p>
                            </div>
                        </div>
                        ${terminadoTodo ? '<span class="bg-emerald-100 text-emerald-800 text-xs font-black px-2.5 py-1 rounded-xl">🎉 ¡Completado!</span>' : ''}
                    </div>

                    <!-- Mini Barra de Progreso del Operador -->
                    <div class="w-full bg-rose-50 h-2 rounded-full overflow-hidden mt-3 border border-rose-200">
                        <div class="bg-rose-500 h-full rounded-full transition-all duration-300" style="width: ${porcOp}%"></div>
                    </div>

                    <!-- Lista de Checklist del Operador -->
                    <div class="space-y-2 mt-4">
                        ${itemsHtml}
                    </div>
                </div>

                <div class="pt-3 border-t border-rose-50 flex justify-between items-center text-[11px] text-slate-400">
                    <span>${totalOp} ${totalOp === 1 ? 'meta' : 'metas'} asignadas</span>
                    <button type="button" onclick="prepararTareaRapida('${op}')" class="text-rose-600 font-bold hover:underline">+ Asignar otra</button>
                </div>
            </div>
        `;
    });
}

function filtrarTareasOperador(operador) {
    filtroOperadorPlanActual = operador;
    renderizarPlanDiario();
}

function prepararTareaRapida(operador) {
    const sel = document.getElementById('nueva-tarea-operador');
    const inputDesc = document.getElementById('nueva-tarea-desc');
    if (sel) sel.value = operador;
    if (inputDesc) inputDesc.focus();
}

async function guardarNotasPlan() {
    const notasInput = document.getElementById('plan-notas-input');
    const badge = document.getElementById('badge-guardando-notas');
    if (!notasInput) return;

    if (badge) {
        badge.classList.remove('hidden');
        badge.innerText = 'Guardando...';
    }

    try {
        const res = await fetch('/api/plan-diario/notas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fecha: planDiarioFechaSeleccionada,
                notas_advertencia: notasInput.value
            })
        });
        if (res.ok) {
            if (badge) {
                badge.innerText = '✓ Guardado';
                setTimeout(() => badge.classList.add('hidden'), 2000);
            }
        }
    } catch(e) {
        console.error("Error guardando notas:", e);
        if (badge) badge.innerText = 'Error al guardar';
    }
}

async function agregarTareaPlan() {
    const operador = document.getElementById('nueva-tarea-operador')?.value;
    const tarea = document.getElementById('nueva-tarea-desc')?.value?.trim();
    const cantidad = parseFloat(document.getElementById('nueva-tarea-cantidad')?.value) || null;
    const prodId = parseInt(document.getElementById('nueva-tarea-producto-id')?.value) || null;
    const nota = document.getElementById('nueva-tarea-nota')?.value?.trim() || '';

    if (!operador) {
        alert('Por favor selecciona para quién es la tarea (operador).');
        return;
    }
    if (!tarea) {
        alert('Por favor escribe la tarea o actividad a realizar.');
        return;
    }

    try {
        const res = await fetch('/api/plan-diario/tarea', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fecha: planDiarioFechaSeleccionada,
                operador,
                tarea,
                cantidad,
                unidad: 'pzas',
                producto_id: prodId,
                nota
            })
        });
        if (res.ok) {
            const descEl = document.getElementById('nueva-tarea-desc');
            const cantEl = document.getElementById('nueva-tarea-cantidad');
            const prodEl = document.getElementById('nueva-tarea-producto-id');
            const notaEl = document.getElementById('nueva-tarea-nota');
            if (descEl) descEl.value = '';
            if (cantEl) cantEl.value = '';
            if (prodEl) {
                prodEl.value = '';
                const wrapper = prodEl.nextElementSibling;
                if (wrapper && wrapper.classList.contains('combobox-container')) {
                    const inp = wrapper.querySelector('.combobox-input');
                    if (inp) inp.value = '';
                }
            }
            if (notaEl) notaEl.value = '';
            await cargarPlanDiario(planDiarioFechaSeleccionada);
        }
    } catch(e) {
        console.error("Error agregando tarea al plan:", e);
    }
}

async function toggleTareaPlan(id) {
    try {
        const res = await fetch(`/api/plan-diario/tarea/${id}/toggle`, { method: 'PATCH' });
        if (res.ok) {
            await cargarPlanDiario(planDiarioFechaSeleccionada);
        }
    } catch(e) {
        console.error("Error toggling tarea:", e);
    }
}

async function eliminarTareaPlan(id) {
    if (!confirm('¿Eliminar esta tarea del plan del día?')) return;
    try {
        const res = await fetch(`/api/plan-diario/tarea/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await cargarPlanDiario(planDiarioFechaSeleccionada);
        }
    } catch(e) {
        console.error("Error eliminando tarea:", e);
    }
}


// ==========================================
// CONTROL DE OPCIONES DE TEMPORADA EN FORMULARIO
// ==========================================

function toggleOpcionesTemporadaForm() {
    const check = document.getElementById('check-prod-temporada');
    const panel = document.getElementById('panel-prod-temporada-opciones');
    if (!check || !panel) return;
    if (check.checked) panel.classList.remove('hidden');
    else panel.classList.add('hidden');
}

// ==========================================
// CONTROL DE ACCESO POR PIN DE 6 DÍGITOS Y PERFILES
// ==========================================

let pinIngresadoActual = '';
let operadorActivoTaller = localStorage.getItem('operador_activo_taller') || '';

function verificarEstadoSesionPin() {
    const tiempoVerificadoStr = localStorage.getItem('app_pin_timestamp');
    const pantallaLogin = document.getElementById('pantalla-login-pin');
    const textoPerfil = document.getElementById('texto-perfil-activo');
    const TIEMPO_EXPIRACION_MS = 4 * 60 * 60 * 1000; // 4 horas exactas

    let sesionValida = false;
    if (tiempoVerificadoStr) {
        const tiempoPasado = Date.now() - parseInt(tiempoVerificadoStr, 10);
        if (tiempoPasado < TIEMPO_EXPIRACION_MS) {
            sesionValida = true;
        } else {
            localStorage.removeItem('app_pin_timestamp');
            localStorage.removeItem('app_pin_verificado');
        }
    }

    if (!sesionValida) {
        if (pantallaLogin) pantallaLogin.classList.remove('hidden');
        limpiarPin();
    } else {
        if (pantallaLogin) pantallaLogin.classList.add('hidden');
        if (textoPerfil) {
            textoPerfil.innerText = operadorActivoTaller || 'Elegir Perfil';
        }
    }
}

function actualizarDisplayPin() {
    for (let i = 0; i < 6; i++) {
        const caja = document.querySelector(`.pin-caja[data-idx="${i}"]`);
        if (caja) {
            if (i < pinIngresadoActual.length) {
                caja.innerText = '•';
                caja.classList.add('border-rose-500', 'bg-rose-100/50');
                caja.classList.remove('border-rose-200', 'bg-rose-50/40');
            } else {
                caja.innerText = '-';
                caja.classList.remove('border-rose-500', 'bg-rose-100/50');
                caja.classList.add('border-rose-200', 'bg-rose-50/40');
            }
        }
    }
}

function presionarTeclaPin(num) {
    if (pinIngresadoActual.length >= 6) return;
    pinIngresadoActual += String(num);
    actualizarDisplayPin();
    const errMsg = document.getElementById('error-pin-msg');
    if (errMsg) errMsg.innerText = '';

    if (pinIngresadoActual.length === 6) {
        validarPinConServidor(pinIngresadoActual);
    }
}

function borrarUltimoDigitoPin() {
    if (pinIngresadoActual.length > 0) {
        pinIngresadoActual = pinIngresadoActual.slice(0, -1);
        actualizarDisplayPin();
    }
    const errMsg = document.getElementById('error-pin-msg');
    if (errMsg) errMsg.innerText = '';
}

function limpiarPin() {
    pinIngresadoActual = '';
    actualizarDisplayPin();
    const errMsg = document.getElementById('error-pin-msg');
    if (errMsg) errMsg.innerText = '';
}

async function validarPinConServidor(pin) {
    const errMsg = document.getElementById('error-pin-msg');
    if (errMsg) errMsg.innerText = 'Verificando...';

    try {
        const res = await fetch('/api/auth/verificar-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            localStorage.setItem('app_pin_verificado', 'true');
            localStorage.setItem('app_pin_timestamp', Date.now().toString());
            if (errMsg) errMsg.innerText = '';
            verificarEstadoSesionPin();

            if (!operadorActivoTaller) {
                abrirSelectorPerfil();
            }
        } else {
            if (errMsg) errMsg.innerText = '❌ PIN incorrecto. Intenta de nuevo.';
            setTimeout(() => {
                limpiarPin();
            }, 800);
        }
    } catch (e) {
        console.error('Error validando PIN:', e);
        if (errMsg) errMsg.innerText = 'Error de conexión con el servidor.';
    }
}

function cerrarSesionPin() {
    if (!confirm('¿Deseas bloquear el sistema con PIN?')) return;
    localStorage.removeItem('app_pin_verificado');
    localStorage.removeItem('app_pin_timestamp');
    verificarEstadoSesionPin();
}

function abrirSelectorPerfil() {
    const modal = document.getElementById('modal-seleccionar-perfil');
    const cont = document.getElementById('contenedor-botones-perfil');
    if (!modal || !cont) return;

    cont.innerHTML = '';
    if (operadoresLista.length === 0) {
        cont.innerHTML = '<p class="col-span-2 text-xs text-slate-400 py-3">No hay personas registradas aún. Haz clic en "+ Nueva persona" abajo.</p>';
    } else {
        operadoresLista.forEach(op => {
            const esActivo = operadorActivoTaller === op.nombre;
            cont.innerHTML += `
                <button type="button" onclick="seleccionarPerfilOperador('${op.nombre}')" class="p-3 rounded-2xl border-2 transition flex items-center justify-center gap-2 font-black text-sm active:scale-95 ${esActivo ? 'bg-rose-500 text-white border-rose-600 shadow-sm' : 'bg-rose-50 hover:bg-rose-100 text-rose-950 border-rose-200'}">
                    <span>👤</span>
                    <span>${op.nombre}</span>
                </button>
            `;
        });
    }

    modal.classList.remove('hidden');
}

function cerrarSelectorPerfil() {
    const modal = document.getElementById('modal-seleccionar-perfil');
    if (modal) modal.classList.add('hidden');
}

function seleccionarPerfilOperador(nombre) {
    operadorActivoTaller = nombre;
    localStorage.setItem('operador_activo_taller', nombre);

    const textoPerfil = document.getElementById('texto-perfil-activo');
    if (textoPerfil) textoPerfil.innerText = nombre;

    const selOpProd = document.getElementById('operador-lote');
    if (selOpProd) selOpProd.value = nombre;

    if (typeof filtrarTareasOperador === 'function') {
        filtrarTareasOperador(nombre);
    }

    cerrarSelectorPerfil();
}

document.addEventListener('keydown', (e) => {
    const pantallaLogin = document.getElementById('pantalla-login-pin');
    if (!pantallaLogin || pantallaLogin.classList.contains('hidden')) return;

    if (e.key >= '0' && e.key <= '9') {
        presionarTeclaPin(e.key);
    } else if (e.key === 'Backspace') {
        borrarUltimoDigitoPin();
    } else if (e.key === 'Escape') {
        limpiarPin();
    }
});


// ==========================================
// MODAL CAMBIAR PIN DEL TALLER
// ==========================================

function abrirModalCambiarPin() {
    const modal = document.getElementById('modal-cambiar-pin');
    if (!modal) return;
    const inpAct = document.getElementById('input-pin-actual');
    const inpNue = document.getElementById('input-pin-nuevo');
    const inpConf = document.getElementById('input-pin-confirmar');
    const msg = document.getElementById('msg-cambiar-pin');
    if (inpAct) inpAct.value = '';
    if (inpNue) inpNue.value = '';
    if (inpConf) inpConf.value = '';
    if (msg) msg.innerText = '';
    modal.classList.remove('hidden');
    if (inpAct) inpAct.focus();
}

function cerrarModalCambiarPin() {
    const modal = document.getElementById('modal-cambiar-pin');
    if (modal) modal.classList.add('hidden');
}

async function procesarCambioPin() {
    const pinActual = document.getElementById('input-pin-actual')?.value?.trim();
    const pinNuevo = document.getElementById('input-pin-nuevo')?.value?.trim();
    const pinConfirmar = document.getElementById('input-pin-confirmar')?.value?.trim();
    const msg = document.getElementById('msg-cambiar-pin');

    if (!pinActual) {
        if (msg) { msg.className = 'text-xs font-bold text-red-500 text-center'; msg.innerText = 'Ingresa el PIN actual del taller.'; }
        return;
    }
    if (!pinNuevo || pinNuevo.length !== 6 || !/^\d{6}$/.test(pinNuevo)) {
        if (msg) { msg.className = 'text-xs font-bold text-red-500 text-center'; msg.innerText = 'El nuevo PIN debe tener exactamente 6 dígitos numéricos.'; }
        return;
    }
    if (pinNuevo !== pinConfirmar) {
        if (msg) { msg.className = 'text-xs font-bold text-red-500 text-center'; msg.innerText = 'El nuevo PIN y su confirmación no coinciden.'; }
        return;
    }

    if (msg) { msg.className = 'text-xs font-bold text-rose-600 text-center'; msg.innerText = 'Actualizando PIN...'; }

    try {
        const res = await fetch('/api/auth/cambiar-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin_actual: pinActual, pin_nuevo: pinNuevo })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            if (msg) {
                msg.className = 'text-xs font-bold text-emerald-600 text-center';
                msg.innerText = '✓ ¡PIN actualizado con éxito! Nuevo PIN: ' + pinNuevo;
            }
            setTimeout(() => {
                cerrarModalCambiarPin();
            }, 1500);
        } else {
            if (msg) {
                msg.className = 'text-xs font-bold text-red-500 text-center';
                msg.innerText = '❌ ' + (data.error || 'Error al actualizar el PIN.');
            }
        }
    } catch (e) {
        console.error('Error al cambiar PIN:', e);
        if (msg) {
            msg.className = 'text-xs font-bold text-red-500 text-center';
            msg.innerText = 'Error de conexión con el servidor.';
        }
    }
}

function toggleOpcionesTemporadaInsumoForm() {
    const check = document.getElementById('check-insumo-temporada');
    const panel = document.getElementById('panel-insumo-temporada-opciones');
    if (!check || !panel) return;
    if (check.checked) panel.classList.remove('hidden');
    else panel.classList.add('hidden');
}

async function alternarTemporadaInsumo(insumoId) {
    try {
        const res = await fetch(`/api/insumos/${insumoId}/toggle-activa`, { method: 'PATCH' });
        if (res.ok) {
            await cargarInsumos();
        }
    } catch(e) {
        console.error("Error al alternar temporada de insumo:", e);
    }
}

// Control de modo vista: Computadora vs Teléfono
function alternarModoVista() {
    const body = document.body;
    const esMovilActual = body.classList.contains('modo-movil-forzado');
    const nuevoModo = !esMovilActual;
    aplicarModoVista(nuevoModo);
    localStorage.setItem('modo_vista_taller', nuevoModo ? 'movil' : 'escritorio');
}

function aplicarModoVista(esMovil) {
    const body = document.body;
    const btnTexto = document.getElementById('texto-switch-vista');
    const btnIcono = document.getElementById('icono-switch-vista');
    
    if (esMovil) {
        body.classList.add('modo-movil-forzado');
        if (btnTexto) btnTexto.innerText = 'Vista Computadora';
        if (btnIcono) btnIcono.innerText = '💻';
    } else {
        body.classList.remove('modo-movil-forzado');
        if (btnTexto) btnTexto.innerText = 'Vista Celular';
        if (btnIcono) btnIcono.innerText = '📱';
    }
}

function restaurarModoVista() {
    const modo = localStorage.getItem('modo_vista_taller');
    if (modo === 'movil') {
        aplicarModoVista(true);
    } else {
        aplicarModoVista(false);
    }
}
