/***************************************************************
 * CAMINO HACIA JESÚS 2026 — Código.gs (Backend API unificado)
 * Colegio Privado La Salle del Sur & Parroquia San Pedro de Lurín
 ***************************************************************/

// Acceso de catequizandos protegido por PIN individual desde la hoja CATEQUIZANDOS.
const FASE1_MODO_PRUEBA_ACTIVO = false;
const FASE1_CODIGO_FAMILIA = 'PAD-EST-001';

// MÓDULO GESTOR PASTORAL: ingreso protegido por claves individuales.
const COORDINACION_MODO_PRUEBA_ACTIVO = false;

// Administradoras principales del Portal de Catequistas. Se validan en servidor.
const IDS_ADMINISTRADORAS_CATEQUISTAS = Object.freeze(['LDS-CAT-001', 'LDS-CAT-002']);

// Biblioteca de hasta seis videos por tema. Solo Lily y Kiara pueden gestionarla.
const HOJA_VIDEOS_TEMAS_V8 = 'VIDEOS_TEMAS';
const MAX_VIDEOS_POR_TEMA_V8 = 6;

// Zona horaria institucional: Lima, Perú (UTC-05:00).
const ZONA_HORARIA_CAMINO = 'America/Lima';

const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1QTvIQydI8qyuG3Tpo0SBmbNHjyVXn_IT6mvIwfSttvI',
  SHEET_CONFIG: 'CONFIG',
  SHEET_CATEQUIZANDOS: 'CATEQUIZANDOS',
  SHEET_CATEQUISTAS: 'CATEQUISTAS',
  SHEET_PADRES: 'PADRES',
  SHEET_COLEGIOS: 'COLEGIOS',
  SHEET_SESIONES: 'SESIONES',
  SHEET_CLASES: 'CLASES',
  SHEET_ASISTENCIA: 'ASISTENCIA',
  SHEET_TAREAS: 'TAREAS',
  SHEET_AVISOS: 'AVISOS',
  SHEET_REQUISITOS: 'REQUISITOS',
  SHEET_MATERIALES: 'MATERIALES',
  SHEET_PAGOS: 'PAGOS'
});

function doGet(e) {
  const params = (e && e.parameter) || {};
  const salida = params.action
    ? manejarGetApi_(params)
    : { exito: true, mensaje: 'API Backend - Camino hacia Jesús 2026 operativa' };

  // JSONP para lecturas desde GitHub Pages sin depender de CORS.
  const callback = String(params.callback || '').trim();
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(salida) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return respuestaJson_(salida);
}

/* =========================================================
   doPost — Operaciones del portal
   Trabaja únicamente con hojas existentes.
   ========================================================= */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No se recibió información en la solicitud.');
    }

    const data = JSON.parse(e.postData.contents);
    const accion = String(data.action || '').trim();

    // Identifica la versión activa del backend antes de abrir misiones.
    // Esta acción es de solo lectura y no requiere token ni modifica hojas.
    if (accion === 'verificarVersionCuestionarios') {
      return respuestaJson_({
        exito: true,
        version: 'LDS-CATEQUIZANDO-PORTAL-INTEGRADO-V10-CUESTIONARIOS-10-REANUDABLE',
        agrupacion: 'TEMA',
        progreso: 'BLOQUE_COMPLETO',
        presentacion: 'UNA_PREGUNTA_POR_PANTALLA',
        alternativas: ['A', 'B', 'C'],
        puntosPorPregunta: 2,
        tareas: '68_TAREAS_CON_EVIDENCIA_EN_DRIVE'
      });
    }

    if (accion === 'obtenerProgresoBloqueCatequizando') {
      const idNinoAutorizado = validarTokenCatequizando_(data.token);
      if (!idNinoAutorizado) throw new Error('La sesión del catequizando venció. Ingresa nuevamente con tu PIN.');
      return respuestaJson_(obtenerProgresoBloqueCatequizando_(data.bloque, idNinoAutorizado));
    }
    if (accion === 'obtenerResumenPortalCatequizando') {
      const idNinoAutorizado = validarTokenCatequizando_(data.token);
      if (!idNinoAutorizado) throw new Error('La sesión del catequizando venció. Ingresa nuevamente con tu PIN.');
      return respuestaJson_(obtenerResumenPortalCatequizando_(idNinoAutorizado));
    }
    if (accion === 'validarLoginCatequizando') {
      return respuestaJson_(validarLoginCatequizando_(data.pin, data.idNino));
    }
    if (accion === 'guardarMensaje' || accion === 'guardarMensajeCatequizando') {
      const idNinoAutorizado = validarTokenCatequizando_(data.token);
      if (!idNinoAutorizado) throw new Error('La sesión del catequizando venció. Ingresa nuevamente con tu PIN.');
      const alumnoAutorizado = _obtenerAlumnoActivoPorId_(idNinoAutorizado);
      if (!alumnoAutorizado) throw new Error('El catequizando ya no está habilitado.');
      data.idNino = idNinoAutorizado;
      data.nombreAlumno = [alumnoAutorizado.NOMBRES, alumnoAutorizado.APELLIDOS].filter(Boolean).join(' ');
      return respuestaJson_(guardarMensajeCatequizando_(data));
    }
    if (accion === 'enviarEvidenciaTarea') {
      const idNinoAutorizado = validarTokenCatequizando_(data.token);
      if (!idNinoAutorizado) throw new Error('La sesión del catequizando venció. Ingresa nuevamente con tu PIN.');
      return respuestaJson_(enviarEvidenciaTarea_(data, idNinoAutorizado));
    }
    if (accion === 'revisarEntregaTarea') {
      const idCatequistaAutorizado = validarTokenCatequistaPortal_(data.token);
      if (!idCatequistaAutorizado) throw new Error('Debe iniciar sesión como catequista para revisar evidencias.');
      return respuestaJson_(revisarEntregaTarea_(data, idCatequistaAutorizado));
    }
    if (accion === 'guardarVideoTema') {
      const idAdministradora = validarTokenCatequistaPortal_(data.token);
      if (!idAdministradora || !esAdministradoraCatequista_(idAdministradora)) {
        throw new Error('Acceso denegado: solo Miss Lily y Miss Kiara pueden gestionar videos.');
      }
      return respuestaJson_(guardarVideoTemaV8_(data, idAdministradora));
    }
    if (accion === 'desactivarVideoTema') {
      const idAdministradora = validarTokenCatequistaPortal_(data.token);
      if (!idAdministradora || !esAdministradoraCatequista_(idAdministradora)) {
        throw new Error('Acceso denegado: solo Miss Lily y Miss Kiara pueden gestionar videos.');
      }
      return respuestaJson_(desactivarVideoTemaV8_(data, idAdministradora));
    }

    if (accion === 'registrarFichaCompletada') {
      const idNinoAutorizado = validarTokenCatequizando_(data.token);
      if (!idNinoAutorizado) throw new Error('La sesión del catequizando venció. Ingresa nuevamente con tu PIN.');
      return respuestaJson_(registrarFichaCompletada_(data, idNinoAutorizado));
    }
    if (accion === 'registrarAsistencia' || accion === 'sincronizarAsistencia') {
      const idCatequista = validarTokenCatequistaPortal_(data.token);
      if (!idCatequista) throw new Error('Debe iniciar sesión como catequista para registrar asistencia.');
      data.idCatequistaAutorizado = idCatequista;
      return respuestaJson_(registrarAsistenciaEnMatriz_(data));
    }
    if (accion === 'registrarAsistenciasLote') {
      const idCatequista = validarTokenCatequistaPortal_(data.token);
      if (!idCatequista) throw new Error('Debe iniciar sesión como catequista para registrar asistencia.');
      data.idCatequistaAutorizado = idCatequista;
      return respuestaJson_(registrarAsistenciasEnLote_(data));
    }
    if (accion === 'guardarMaterialSesion') {
      const idCatequista = validarTokenCatequistaPortal_(data.token);
      if (!idCatequista) throw new Error('Debe iniciar sesión como catequista para guardar materiales.');
      data.idCatequistaAutorizado = idCatequista;
      return respuestaJson_(guardarMaterialSesion_(data));
    }
    if (accion === 'guardarPago') {
      const idCatequista = validarTokenCatequistaPortal_(data.token);
      if (!idCatequista) throw new Error('La sesión venció. Ingresa nuevamente al Portal de Catequistas.');
      if (!esAdministradoraCatequista_(idCatequista)) {
        throw new Error('Acceso denegado: solo LILY MELO AZAÑERO y KIARA MORALES ELGUERA pueden modificar Control de Pagos.');
      }
      data.idCatequistaAutorizado = idCatequista;
      return respuestaJson_(guardarPago_(data));
    }
    if (accion === 'actualizarEstadoCatequistaAdmin') {
      const idAdmin = validarTokenCatequistaPortal_(data.token);
      if (!idAdmin || !esAdministradoraCatequista_(idAdmin)) throw new Error('Acceso administrativo no autorizado.');
      return respuestaJson_(actualizarEstadoCatequistaAdmin_(idAdmin, data.idCatequista, data.activo));
    }
    if (accion === 'guardarGestorPastoral') {
      throw new Error('El Gestor Pastoral es de solo lectura. Los registros se modifican desde los módulos autorizados.');
    }
    if (accion === 'guardarCalificacion') {
      const idCatequista = validarTokenCatequistaPortal_(data.token);
      if (!idCatequista) throw new Error('Debe iniciar sesión como catequista para guardar calificaciones.');
      data.catequista = getPerfilCatequista_(idCatequista).perfil.nombre;
      return respuestaJson_(guardarCalificacion_(data));
    }
    if (accion === 'obtenerCuestionariosBloqueCatequizando') { const idNinoAutorizado=validarTokenCatequizando_(data.token); if(!idNinoAutorizado)throw new Error('La sesión del catequizando venció. Ingresa nuevamente con tu PIN.'); return respuestaJson_(obtenerCuestionariosBloque_(data.numeroBloque,idNinoAutorizado)); }
    if (accion === 'obtenerPreguntaCuestionarioBloqueCatequizando') { const idNinoAutorizado=validarTokenCatequizando_(data.token); if(!idNinoAutorizado)throw new Error('La sesión del catequizando venció. Ingresa nuevamente con tu PIN.'); return respuestaJson_(obtenerPreguntaQuizBloque_(data.numeroBloque,data.numeroCuestionario,idNinoAutorizado)); }
    if (accion === 'obtenerCuestionarioCatequizando') {
      const idNinoAutorizado = validarTokenCatequizando_(data.token);
      if (!idNinoAutorizado) throw new Error('La sesión del catequizando venció. Ingresa nuevamente con tu PIN.');
      return respuestaJson_(obtenerCuestionario_(data.idSesion, idNinoAutorizado));
    }
    if (accion === 'enviarCuestionario') {
      const idNinoAutorizado = validarTokenCatequizando_(data.token);
      if (!idNinoAutorizado) throw new Error('La sesión del catequizando venció. Ingresa nuevamente con tu PIN.');
      data.idNino = idNinoAutorizado;
      return respuestaJson_(enviarCuestionario_(data));
    }

    // Compatibilidad con el HTML anterior: nunca agrega filas a ASISTENCIA.
    // Convierte el formato legado en una actualización sobre la matriz real.
    if (!accion && (data.idEstudiante || data.idNino) && data.sesion !== undefined) {
      return respuestaJson_(registrarAsistenciaEnMatriz_(data));
    }

    throw new Error(accion ? 'Acción POST no reconocida: ' + accion : 'La solicitud no contiene una acción válida.');
  } catch (error) {
    return respuestaJson_({ exito: false, mensaje: error && error.message ? error.message : String(error) });
  }
}

function manejarGetApi_(params) {
  try {
    const accion = String(params.action || '').trim();
    // Verificación pública de versión. Se consulta por GET/JSONP igual que getSesiones,
    // para evitar depender de fetch POST/CORS desde GitHub Pages.
    if (accion === 'verificarVersionCuestionarios') return {
      exito: true,
      version: 'LDS-CATEQUIZANDO-PORTAL-INTEGRADO-V10-CUESTIONARIOS-10-REANUDABLE',
      agrupacion: 'TEMA',
      progreso: 'BLOQUE_COMPLETO',
      presentacion: 'UNA_PREGUNTA_POR_PANTALLA',
      alternativas: ['A', 'B', 'C'],
      puntosPorPregunta: 2,
      tareas: '68_TAREAS_CON_EVIDENCIA_EN_DRIVE'
    };
    if (accion === 'validarLogin') return validarLoginPadre(params.codigoPadre, params.clave);
    if (accion === 'listarNombresCatequizandosLogin') return listarNombresCatequizandosLogin_();
    if (accion === 'listarOpcionesLoginPadres') return listarOpcionesLoginPadres_();
    if (accion === 'validarLoginPadreSeleccion') return validarLoginPadreSeleccion_(params.selector, params.clave);
    if (accion === 'listarCatequistasActivas') return listarCatequistasActivas_();
    if (accion === 'validarLoginCatequista') return validarLoginCatequista_(params.idCatequista, params.pin);

    // Rutas de lectura exclusivas del portal de catequistas. La identidad
    // se obtiene del token firmado; el navegador no puede elegir el perfil.
    const idCatequista = validarTokenCatequistaPortal_(params.token);
    if (idCatequista) {
      switch (accion) {
        case 'getPerfilCatequista': return getPerfilCatequista_(idCatequista);
        case 'getAvisosCatequista': return getAvisosCatequista_();
        case 'getEntregasTareasCatequista': return getEntregasTareasCatequista_(idCatequista, params.estado || '');
        case 'getCatequizandos': return getCatequizandos('');
        case 'getAsistenciaNotas': return getAsistenciaNotasCatequizandos('');
        case 'getAportes': return getAportes('');
        case 'getPadres': return getPadres();
        case 'getCalificaciones': return getCalificaciones();
      }
    }


    if (accion === 'getAdminCatequistas') {
      if (!idCatequista || !esAdministradoraCatequista_(idCatequista)) {
        return { exito:false, authRequired:true, mensaje:'Este panel está reservado para las administradoras autorizadas.' };
      }
      return getAdminCatequistas_();
    }

    // ACCESO PROTEGIDO AL GESTOR PASTORAL. La clave nunca se envía en texto,
    // únicamente su resumen SHA-256; el token de sesión dura 6 horas.
    if (accion === 'obtenerDesafioGestor') return obtenerDesafioGestor_(params.perfil);
    if (accion === 'validarAccesoGestor') return validarAccesoGestor_(params.perfil, params.nonce, params.pruebaHash);
    if (accion === 'cerrarSesionGestor') return cerrarSesionGestor_(params.token);
    if (accion === 'getPanelGestor' || accion === 'getGestorPastoral') {
      var perfilAutorizado = validarTokenGestor_(params.token);
      if (!perfilAutorizado) return { exito: false, authRequired: true, mensaje: 'La sesión venció o no está autorizada. Ingrese nuevamente.' };
      var panel = getGestorPastoral_();
      if (panel && panel.exito) panel.perfilAutorizado = perfilAutorizado;
      return panel;
    }

    switch (accion) {
      case 'getSesiones': return getSesiones();
      case 'getConfig': return getConfiguracionPortal();

      // Consultas del módulo PADRES: requieren el token familiar firmado.
      case 'getCalendarioPadres': {
        const codigo = validarTokenPadre_(params.token);
        if (!codigo) return { exito:false, authRequired:true, mensaje:'Ingrese con su código familiar y PIN.' };
        return getCalendarioPadres_();
      }
      case 'getCumpleanosPadres': {
        const codigo = validarTokenPadre_(params.token);
        if (!codigo) return { exito:false, authRequired:true, mensaje:'Ingrese con su código familiar y PIN.' };
        return getCumpleanosPadres_(codigo);
      }
      case 'getAvisos':
      case 'getAvisosPadres': {
        const codigo = validarTokenPadre_(params.token);
        if (codigo) return getAvisosFamilia_(codigo);
        const idNino = validarTokenCatequizando_(params.token);
        if (idNino) return getAvisosNino_(idNino);
        return { exito:false, authRequired:true, mensaje:'La sesión venció. Ingrese nuevamente.' };
      }
      case 'getTareas': {
        const codigo = validarTokenPadre_(params.token);
        if (codigo) return getTareasFamilia_(codigo, params.idSesion || '');
        const idNino = validarTokenCatequizando_(params.token);
        if (idNino) return getTareasNino_(idNino, params.idSesion || '');
        return { exito:false, authRequired:true, mensaje:'La sesión venció. Ingrese nuevamente.' };
      }
      case 'getAsistenciaNotas': {
        const codigo = validarTokenPadre_(params.token);
        if (codigo) {
          const ids = getCatequizandos(codigo).datos.map(a=>String(a.ID_NINO));
          const resp = getAsistenciaNotasCatequizandos(codigo);
          resp.datos = (resp.datos || []).filter(a=>ids.indexOf(String(a.ID_NINO))>=0);
          resp.calificaciones = (resp.calificaciones || []).filter(a=>ids.indexOf(String(a.ID_NINO))>=0);
          resp.total = resp.datos.length;
          return resp;
        }
        const idNino = validarTokenCatequizando_(params.token);
        if (idNino) return getAsistenciaNotasNino_(idNino);
        return { exito:false, authRequired:true, mensaje:'La sesión venció. Ingrese nuevamente.' };
      }
      case 'getCatequizandos': {
        const idNino = validarTokenCatequizando_(params.token);
        if (!idNino) return { exito:false, authRequired:true, mensaje:'Ingresa con tu PIN para continuar.' };
        return getMiPerfilCatequizando_(idNino);
      }
      case 'getAvanceFichas': {
        const idNino = validarTokenCatequizando_(params.token);
        if (!idNino) return { exito:false, authRequired:true, mensaje:'Ingresa con tu PIN para continuar.' };
        return getAvanceFichasNino_(idNino);
      }
      case 'getCuestionario': {
        const idNino = validarTokenCatequizando_(params.token);
        if (!idNino) return { exito:false, authRequired:true, mensaje:'Ingresa con tu PIN para continuar.' };
        return obtenerCuestionario_(params.idSesion, idNino);
      }
      case 'getAportes':
      case 'getRequisitos':
      case 'getMateriales':
      case 'getCalificaciones':
      case 'getDiagnosticoPadres': {
        const codigo = validarTokenPadre_(params.token);
        if (!codigo) return { exito:false, authRequired:true, mensaje:'Ingrese con su código familiar y PIN.' };
        if (accion === 'getAportes') return getAportes(codigo);
        if (accion === 'getRequisitos') return getRequisitosFamilia_(codigo);
        if (accion === 'getMateriales') return getMaterialesFamilia_(codigo);
        if (accion === 'getCalificaciones') return getCalificacionesFamilia_(codigo);
        return getDiagnosticoPadres_(codigo);
      }
      default: return { exito:false, mensaje:'Acción no reconocida.' };
    }
  } catch (error) {
    return { exito: false, mensaje: error && error.message ? error.message : String(error) };
  }
}


/* =========================================================
   AUTENTICACIÓN DEL GESTOR PASTORAL
   Las claves se almacenan como SHA-256; los tokens son temporales.
   ========================================================= */
const GESTOR_PASTORAL_PIN_HASHES = Object.freeze({
  vicario: '5a3650a4d020ef24d5f91e63bfbf715e44fb102a8d4538b50945fa43d4fb72d9',
  guia: '9c41532d06524549121b9a6e315c1338bc1676d4d8125227647af0d202303ea6',
  secretaria: 'f25c50fe75a802aad8e7fa2354b0eed173614a05629c6a3d2b1a97b034fbda40'
});
const GESTOR_PASTORAL_PERFILES = Object.freeze({
  vicario: 'Vicario · Padre Amadeo Raymi',
  guia: 'Guía Espiritual · Padre Carlos Retamoso',
  secretaria: 'Secretaria Parroquial · Milagros Landa'
});

function obtenerDesafioGestor_(perfil) {
  var rol = String(perfil || '').trim().toLowerCase();
  if (!GESTOR_PASTORAL_PIN_HASHES[rol]) {
    return { exito: false, mensaje: 'Perfil no autorizado.' };
  }
  var nonce = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('GP_CHALLENGE_' + nonce, rol, 180);
  return { exito: true, nonce: nonce };
}

function _sha256HexGestor_(texto) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(texto),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    var v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function validarAccesoGestor_(perfil, nonce, pruebaHash) {
  var rol = String(perfil || '').trim().toLowerCase();
  var nonceLimpio = String(nonce || '').trim();
  var prueba = String(pruebaHash || '').trim().toLowerCase();
  var cache = CacheService.getScriptCache();
  var rolDesafio = nonceLimpio ? cache.get('GP_CHALLENGE_' + nonceLimpio) : '';
  if (!rol || !nonceLimpio || rolDesafio !== rol) {
    return { exito: false, mensaje: 'La solicitud de acceso venció. Intente nuevamente.' };
  }
  // El desafío es de un solo uso para impedir repetir una validación capturada.
  cache.remove('GP_CHALLENGE_' + nonceLimpio);
  var pinHash = GESTOR_PASTORAL_PIN_HASHES[rol];
  var esperado = pinHash ? _sha256HexGestor_(pinHash + '|' + nonceLimpio) : '';
  if (!esperado || prueba !== esperado) {
    return { exito: false, mensaje: 'Clave incorrecta. Verifique su perfil e intente nuevamente.' };
  }
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('GP_AUTH_' + token, rol, 21600);
  return {
    exito: true,
    token: token,
    perfil: rol,
    perfilNombre: GESTOR_PASTORAL_PERFILES[rol],
    duracionSegundos: 21600
  };
}

function validarTokenGestor_(token) {
  var valor = String(token || '').trim();
  if (!valor) return '';
  return CacheService.getScriptCache().get('GP_AUTH_' + valor) || '';
}

function cerrarSesionGestor_(token) {
  var valor = String(token || '').trim();
  if (valor) CacheService.getScriptCache().remove('GP_AUTH_' + valor);
  return { exito: true, mensaje: 'Sesión cerrada.' };
}

/**
 * GestorPastoral— devuelve el padrón vigente y las 46 filas de CLASES.
 * La hoja CLASES usa N.º_CLASE como identificador visible, no ID_CLASE.
 */
function getGestorPastoral_() {
  try {
    const ss = getSpreadsheet();
    const hojaClases = ss.getSheetByName(CONFIG.SHEET_CLASES);
    const hojaNinos = ss.getSheetByName(CONFIG.SHEET_CATEQUIZANDOS);
    const hojaSesiones = ss.getSheetByName(CONFIG.SHEET_SESIONES);
    if (!hojaClases) throw new Error('No existe la hoja CLASES.');
    if (!hojaNinos) throw new Error('No existe la hoja CATEQUIZANDOS.');
    if (!hojaSesiones) throw new Error('No existe la hoja SESIONES.');

    // Lecturas de las hojas existentes. Esta función no crea ni modifica hojas.
    const filasClases = _leerTablaPrograma_(hojaClases);
    const filasNinos = _leerTablaPrograma_(hojaNinos);
    const filasSesiones = _leerTablaPrograma_(hojaSesiones);
    const hojaTareas = ss.getSheetByName(CONFIG.SHEET_TAREAS);
    const filasTareas = hojaTareas ? _leerTablaPrograma_(hojaTareas) : [];

    const sesionesPorId = Object.create(null);
    filasSesiones.forEach(function(f) {
      const id = String(f.IDSESION || '').trim();
      if (!id) return;
      sesionesPorId[id] = {
        id: id,
        tema: String(f.TEMA || '').trim(),
        bloque: String(f.BLOQUE || '').trim(),
        subtema: String(f.SUBTEMA || '').trim(),
        objetivo: String(f.OBJETIVO || '').trim(),
        valor: String(f.VALOR || '').trim(),
        cita: String(f.CITABIBLICA || '').trim(),
        actividad: String(f.ACTIVIDAD || '').trim(),
        fichaUrl: normalizarUrlFotoPortal_(f.FICHAURL || ''),
        videoUrl: normalizarUrlFotoPortal_(f.VIDEOURL || ''),
        cuestionarioUrl: normalizarUrlFotoPortal_(f.CUESTIONARIOURL || ''),
        cancionUrl: normalizarUrlFotoPortal_(f.CANCIONURL || ''),
        recursosNotas: String(f.RECURSOSNOTAS || '').trim(),
        estado: String(f.ESTADO || '').trim()
      };
    });

    const idsAsignados = Object.create(null);
    const clases = filasClases.filter(function(f) {
      return f.NCLASE !== '' && f.NCLASE !== null && f.NCLASE !== undefined;
    }).map(function(f) {
      const numero = Number(f.NCLASE);
      const numeroClase = isNaN(numero) ? String(f.NCLASE).trim() : numero;
      const id1 = String(f.IDSESION1 || '').trim();
      const id2 = String(f.IDSESION2 || '').trim();
      [id1, id2].filter(Boolean).forEach(function(id) { idsAsignados[id] = true; });
      const tema1 = (sesionesPorId[id1] && sesionesPorId[id1].tema) || String(f.TEMA1 || '').trim();
      const tema2 = (sesionesPorId[id2] && sesionesPorId[id2].tema) || String(f.TEMA2 || '').trim();
      const temas = [tema1, tema2].filter(Boolean);
      const fechaISO = _fechaISOPrograma_(f.FECHAPROGRAMADA);
      const fechaRealizacionISO = _fechaISOPrograma_(f.FECHAREALIZACION);
      const sesion1 = sesionesPorId[id1] || {};
      const sesion2 = sesionesPorId[id2] || {};
      return {
        ID_CLASE: String(numeroClase),
        NUMERO_CLASE: numeroClase,
        ID_SESION_1: id1,
        ID_SESION_2: id2,
        TEMA: temas.length ? temas.join(' / ') : 'Sin tema asignado',
        TEMAS: temas,
        FECHA: fechaISO ? _fechaTextoCoordinacion_(fechaISO) : '',
        FECHA_ISO: fechaISO || '',
        FECHA_REALIZACION: fechaRealizacionISO || '',
        DIA: String(f.DIA || '').trim(),
        HORA_INICIO: _horaTextoPrograma_(f.HORAINICIO),
        HORA_FIN: _horaTextoPrograma_(f.HORAFIN),
        BLOQUE: String(f.BLOQUE || sesion1.bloque || sesion2.bloque || '').trim(),
        CATEQUISTA: String(f.CATEQUISTA || '').trim(),
        ESTADO_CLASE: String(f.ESTADOCLASE || '').trim(),
        ESTADO_SUPERVISION: String(f.ESTADOSUPERVISION || '').trim() || 'Pendiente',
        OBSERVACIONES: String(f.OBSERVACIONES || '').trim()
      };
    }).sort(function(a, b) { return Number(a.NUMERO_CLASE) - Number(b.NUMERO_CLASE); });

    const catequizandosBase = filasNinos.filter(function(f) {
      const id = String(f.IDNINO || '').trim();
      const vigente = String(f.VIGENTE || '').trim().toUpperCase();
      return id && (!vigente || ['SI', 'SÍ', 'ACTIVO', 'VIGENTE', 'TRUE', '1'].indexOf(vigente) >= 0);
    }).map(function(f) {
      return {
        ID_NINO: String(f.IDNINO || '').trim(),
        NOMBRES: String(f.NOMBRES || '').trim(),
        APELLIDOS: String(f.APELLIDOS || '').trim(),
        NOMBRE_COMPLETO: [String(f.NOMBRES || '').trim(), String(f.APELLIDOS || '').trim()].filter(Boolean).join(' '),
        FOTO: normalizarUrlFotoPortal_(f.FOTO || ''),
        GRADO: String(f.GRADO || '').trim(),
        EDAD: f.EDAD || '',
        BAUTISMO: String(f.BAUTISMO || '').trim(),
        PARROQUIA_BAUTISMO: String(f.PARROQUIA_BAUTISMO || '').trim(),
        ESTADO: String(f.ESTADO || '').trim()
      };
    });

    // Se reutilizan las funciones existentes para respetar las estructuras reales
    // de ASISTENCIA (matriz), PAGOS (encabezado fila 4) y demás hojas.
    const asistenciaResp = getAsistenciaNotasCatequizandos('');
    const asistencia = asistenciaResp && asistenciaResp.datos ? asistenciaResp.datos : [];
    // Una clase se considera realizada si tiene fecha real, estado de realización
    // o al menos un registro A/T/F/FJ en la columna de asistencia de esa clase.
    // En la matriz ASISTENCIA las columnas SESIÓN 1..46 corresponden a N.º_CLASE.
    clases.forEach(function(clase) {
      const numero = Number(clase.NUMERO_CLASE);
      const indiceSesion = numero - 1;
      const registros = indiceSesion >= 0 ? asistencia.reduce(function(total, alumno) {
        const estado = alumno.ESTADOS_SESIONES && alumno.ESTADOS_SESIONES[indiceSesion];
        return total + (['A', 'T', 'F', 'FJ'].indexOf(String(estado || '').toUpperCase()) >= 0 ? 1 : 0);
      }, 0) : 0;
      const estadoTexto = String(clase.ESTADO_CLASE || '').toUpperCase();
      const cancelada = /CANCELAD|SUSPEND/.test(estadoTexto);
      const realizada = !!clase.FECHA_REALIZACION || /REALIZ|COMPLET|FINALIZ|DICTAD|EJECUT|CULMIN/.test(estadoTexto) || registros > 0;
      clase.REGISTROS_ASISTENCIA = registros;
      clase.ESTADO_PANEL = cancelada ? 'CANCELADA' : (realizada ? 'REALIZADA' : 'PENDIENTE');
    });
    const calificacionesResp = getCalificaciones();
    const calificaciones = calificacionesResp && calificacionesResp.datos ? calificacionesResp.datos.slice() : [];

    // Las fichas interactivas guardan sus resultados en FICHAS_AVANCE.
    // Se incorporan a la vista de calificaciones sin modificar la hoja original.
    const hojaFichas = ss.getSheetByName(FICHAS_AVANCE_SHEET);
    const filasFichas = hojaFichas ? _leerTablaPrograma_(hojaFichas) : [];
    filasFichas.forEach(function(f) {
      const idNino = String(f.IDNINO || '').trim();
      const idSesion = String(f.IDSESION || '').trim();
      const nota = Number(f.NOTASOBRE20);
      if (!idNino || !idSesion || !isFinite(nota)) return;
      const duplicada = calificaciones.some(function(n) {
        return String(n.ID_NINO || '').trim() === idNino &&
          String(n.ID_SESION || '').trim() === idSesion &&
          /FICHA/i.test(String(n.TIPO_ACTIVIDAD || ''));
      });
      if (duplicada) return;
      calificaciones.push({
        ID_CALIFICACION: String(f.IDREGISTRO || ('FIC-' + idNino + '-' + idSesion)),
        ID_NINO: idNino,
        FECHA_REGISTRO: f.FECHACOMPLETADA || '',
        NOMBRE_CATEQUIZANDO: String(f.NOMBRECATEQUIZANDO || '').trim(),
        ID_SESION: idSesion,
        TEMA: String(f.TEMA || '').trim(),
        TIPO_ACTIVIDAD: 'Ficha interactiva',
        DESCRIPCION: 'Respuestas correctas: ' + (Number(f.RESPUESTASCORRECTAS) || 0) + ' de ' + (Number(f.TOTALPREGUNTAS) || 0),
        NOTA_NUMERICA: nota,
        EQUIVALENCIA: String(f.EQUIVALENCIA || '').trim(),
        CATEQUISTA: String(f.CATEQUISTAASIGNADA || '').trim(),
        ORIGEN: 'FICHAS_AVANCE'
      });
    });
    const requisitosResp = getRequisitosFamilia_('');
    const materialesResp = getMaterialesFamilia_('');
    const pagosResp = getAportes('');
    const avisosHoja = getSheetData(CONFIG.SHEET_AVISOS);

    const asistenciaPorId = Object.create(null);
    asistencia.forEach(function(a) { asistenciaPorId[String(a.ID_NINO || '').trim()] = a; });
    const requisitosPorId = Object.create(null);
    (requisitosResp.datos || []).forEach(function(r) { requisitosPorId[String(r.ID || '').trim()] = r; });
    const materialesPorId = Object.create(null);
    (materialesResp.datos || []).forEach(function(r) { materialesPorId[String(r.ID || '').trim()] = r; });
    const pagosPorId = Object.create(null);
    (pagosResp.datos || []).forEach(function(p) { pagosPorId[String(p.ID || '').trim()] = p; });
    const conteoNotasPorId = Object.create(null);
    calificaciones.forEach(function(n) {
      const id = String(n.ID_NINO || '').trim();
      if (id) conteoNotasPorId[id] = (conteoNotasPorId[id] || 0) + 1;
    });

    const catequizandos = catequizandosBase.map(function(a) {
      const id = a.ID_NINO;
      const as = asistenciaPorId[id] || {};
      const req = requisitosPorId[id] || {};
      const mat = materialesPorId[id] || {};
      const pago = pagosPorId[id] || {};
      return Object.assign({}, a, {
        ASISTENCIA_PORCENTAJE: as.ASISTENCIA_PORCENTAJE == null ? null : as.ASISTENCIA_PORCENTAJE,
        TOTAL_PRESENTES: Number(as.TOTAL_PRESENTES) || 0,
        TOTAL_TARDANZAS: Number(as.TOTAL_TARDANZAS) || 0,
        TOTAL_FALTAS: Number(as.TOTAL_FALTAS) || 0,
        TOTAL_JUSTIFICADAS: Number(as.TOTAL_JUSTIFICADAS) || 0,
        REQUISITOS_CUMPLIDOS: req['REQUISITOS CUMPLIDOS'] || '',
        AVANCE_REQUISITOS: req['% AVANCE'] || '',
        MATERIALES_ENTREGADOS: mat['MATERIALES ENTREGADOS'] || '',
        AVANCE_MATERIALES: mat['% CUMPLIMIENTO'] || '',
        ESTADO_PAGO: pago.ESTADO_PAGO || 'Sin registro',
        MONTO_PAGO: pago.MONTO || '',
        TOTAL_CALIFICACIONES: conteoNotasPorId[id] || 0
      });
    });

    // Avisos: se devuelven registros con contenido, incluso si aún no están publicados,
    // y el campo PUBLICADO permite diferenciarlos en la vista de supervisión.
    const avisos = (avisosHoja || []).filter(function(a) {
      return String(a.ID_AVISO || a.TITULO || a.MENSAJE || '').trim() !== '';
    }).map(function(a) {
      return {
        ID_AVISO: a.ID_AVISO || '', FECHA: a.FECHA || '', TITULO: a.TITULO || '',
        MENSAJE: a.MENSAJE || '', DIRIGIDO_A: a.DIRIGIDO_A || '', ID_CLASE: a.ID_CLASE || '',
        WHATSAPP_LINK: normalizarUrlFotoPortal_(a.WHATSAPP_LINK || ''),
        PUBLICADO: a.PUBLICADO || '', OBSERVACIONES: a.OBSERVACIONES || ''
      };
    }).sort(function(a, b) { return String(b.FECHA).localeCompare(String(a.FECHA)); });

    // Recursos audiovisuales: se toman solo enlaces reales presentes en SESIONES
    // y MATERIALES; no se fabrican rutas ni archivos.
    const media = [];
    filasSesiones.forEach(function(f) {
      const id = String(f.IDSESION || '').trim();
      const sesion = sesionesPorId[id] || {};
      const recursos = [
        { tipo: 'Ficha', url: sesion.fichaUrl },
        { tipo: 'Video', url: sesion.videoUrl },
        { tipo: 'Cuestionario', url: sesion.cuestionarioUrl },
        { tipo: 'Canción', url: sesion.cancionUrl }
      ];
      recursos.forEach(function(r) {
        if (!/^https?:\/\//i.test(String(r.url || ''))) return;
        media.push({ idSesion: id, tema: sesion.tema || '', bloque: sesion.bloque || '', tipo: r.tipo, titulo: sesion.tema || r.tipo, url: r.url });
      });
    });
    (materialesResp.datos || []).forEach(function(registro) {
      Object.keys(registro).forEach(function(clave) {
        const valor = registro[clave];
        // No se vuelve a listar FOTO como recurso audiovisual. Solo columnas
        // identificadas como materiales por clase pueden aportar enlaces aquí.
        if (/^CLASE\s*\d+/i.test(clave) && typeof valor === 'string' && /^https?:\/\//i.test(valor.trim())) {
          media.push({ idNino: registro.ID || '', tema: String(clave), tipo: 'Material de clase', titulo: clave, url: normalizarUrlFotoPortal_(valor) });
        }
      });
    });
    filasTareas.forEach(function(tarea) {
      const url = String(tarea.EVIDENCIALINK || '').trim();
      if (!/^https?:\/\//i.test(url)) return;
      const sesion = sesionesPorId[String(tarea.IDSESION || '').trim()] || {};
      media.push({
        idSesion: String(tarea.IDSESION || '').trim(),
        tema: sesion.tema || String(tarea.TITULO || 'Evidencia de catequesis'),
        bloque: sesion.bloque || '', tipo: 'Evidencia',
        titulo: String(tarea.TITULO || 'Evidencia de catequesis'),
        url: normalizarUrlFotoPortal_(url)
      });
    });

    const idsMaestros = Object.keys(sesionesPorId);
    const idsNoEncontrados = Object.keys(idsAsignados).filter(function(id) { return !sesionesPorId[id]; });
    return {
      exito: true,
      catequizandos: catequizandos,
      totalCatequizandos: catequizandos.length,
      clases: clases,
      totalClases: clases.length,
      totalTemas: idsMaestros.length,
      totalTemasAsignados: Object.keys(idsAsignados).length,
      idsSesionNoEncontrados: idsNoEncontrados,
      asistencia: asistencia,
      totalAsistencia: asistencia.length,
      totalCalificaciones: calificaciones.length,
      calificaciones: calificaciones,
      documentacion: { requisitos: requisitosResp.datos || [], materiales: materialesResp.datos || [] },
      totalRequisitos: (requisitosResp.datos || []).length,
      totalMateriales: (materialesResp.datos || []).length,
      pagos: pagosResp.datos || [],
      totalPagos: (pagosResp.datos || []).length,
      avisos: avisos,
      totalAvisos: avisos.length,
      media: media,
      totalMedia: media.length,
      resumen: {
        aprobadas: clases.filter(function(c) { return String(c.ESTADO_SUPERVISION).toLowerCase() === 'aprobado'; }).length,
        observadas: clases.filter(function(c) { return String(c.ESTADO_SUPERVISION).toLowerCase() === 'observado'; }).length,
        pendientes: clases.filter(function(c) { return !c.ESTADO_SUPERVISION || String(c.ESTADO_SUPERVISION).toLowerCase() === 'pendiente'; }).length
      },
      mensaje: 'Panel pastoral sincronizado mediante lectura de las hojas existentes.'
    };
  } catch (error) {
    return {
      exito: false, catequizandos: [], clases: [], asistencia: [], calificaciones: [],
      documentacion: { requisitos: [], materiales: [] }, pagos: [], avisos: [], media: [],
      totalCatequizandos: 0, totalClases: 0, totalTemas: 0, totalCalificaciones: 0,
      mensaje: error && error.message ? error.message : String(error)
    };
  }
}

/** Actualiza únicamente ESTADO_SUPERVISION y OBSERVACIONES de una fila de CLASES. */
function guardarGestorPastoral_(idClase, estado, observaciones) {
  const estadosPermitidos = ['Aprobado', 'Observado', 'Pendiente'];
  const estadoNuevo = String(estado || '').trim();
  const idBuscado = _claveGestorPastoral_(idClase);
  const observacionNueva = String(observaciones || '').trim().slice(0, 2500);
  if (!idBuscado) return { exito: false, mensaje: 'No se recibió el número de clase.' };
  if (estadosPermitidos.indexOf(estadoNuevo) < 0) return { exito: false, mensaje: 'El estado de supervisión no es válido.' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { exito: false, mensaje: 'Hay otra actualización en curso. Intente nuevamente.' };
  try {
    const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CLASES);
    if (!hoja) throw new Error('No existe la hoja CLASES.');
    const lastRow = hoja.getLastRow();
    const lastCol = hoja.getLastColumn();
    if (lastRow < 2 || lastCol < 1) throw new Error('La hoja CLASES no contiene registros.');

    const encabezados = hoja.getRange(1, 1, 1, lastCol).getDisplayValues()[0]
      .map(function(h) { return _normalizarEncabezadoPrograma_(h); });
    const colNumero = encabezados.indexOf('NCLASE') + 1;
    const colEstado = encabezados.indexOf('ESTADOSUPERVISION') + 1;
    const colObs = encabezados.indexOf('OBSERVACIONES') + 1;
    if (!colNumero || !colEstado || !colObs) {
      throw new Error('Faltan las columnas N.º_CLASE, ESTADO_SUPERVISION u OBSERVACIONES en CLASES.');
    }

    const numeros = hoja.getRange(2, colNumero, lastRow - 1, 1).getValues();
    let filaEncontrada = 0;
    for (let i = 0; i < numeros.length; i++) {
      if (_claveGestorPastoral_(numeros[i][0]) === idBuscado) { filaEncontrada = i + 2; break; }
    }
    if (!filaEncontrada) throw new Error('No se encontró la clase ' + idClase + ' en CLASES.');

    hoja.getRange(filaEncontrada, colEstado).setValue(estadoNuevo);
    hoja.getRange(filaEncontrada, colObs).setValue(observacionNueva);
    SpreadsheetApp.flush();

    return { exito: true, mensaje: 'Supervisión de la clase ' + idClase + ' actualizada correctamente.',
      idClase: String(idClase), estado: estadoNuevo, observaciones: observacionNueva };
  } catch (error) {
    return { exito: false, mensaje: error && error.message ? error.message : String(error) };
  } finally {
    lock.releaseLock();
  }
}

function _claveClaseSupervision_(valor) {
  const texto = String(valor == null ? '' : valor).trim();
  if (!texto) return '';
  const numero = Number(texto);
  return isNaN(numero) ? texto.toUpperCase() : String(numero);
}

function _fechaTextoCoordinacion_(fechaISO) {
  const p = String(fechaISO || '').slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(fechaISO || '');
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheetData(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const rango = sheet.getRange(1, 1, lastRow, lastCol);
  const values = rango.getValues();
  const richLinks = rango.getRichTextValues();
  const formulasLinks = rango.getFormulas();
  const headers = values[0].map(h => String(h == null ? '' : h).trim());

  return values.slice(1)
    .map((row, r) => ({ row: row, r: r }))
    .filter(item => item.row.some(cell => cell !== '' && cell !== null))
    .map(item => {
      const row = item.row, r = item.r;
      const obj = {};
      headers.forEach((header, index) => {
        if (header) {
          const raw = _esColumnaDeEnlace_(header) ? _obtenerEnlaceCelda_(row[index], richLinks[r + 1] && richLinks[r + 1][index], formulasLinks[r + 1] && formulasLinks[r + 1][index]) : row[index];
          obj[header] = normalizarValor_(raw);
        }
      });
      return obj;
    });
}


/** Extrae una URL de una celda normal, hipervínculo de texto enriquecido o fórmula HYPERLINK. */
function _obtenerEnlaceCelda_(valor, richText, formula) {
  try {
    if (richText && typeof richText.getLinkUrl === 'function') {
      const enlace = richText.getLinkUrl();
      if (enlace) return String(enlace).trim();
    }
  } catch (e) {}
  const f = String(formula || '');
  const m = f.match(/=HYPERLINK\s*\(\s*"([^"]+)"/i);
  if (m && m[1]) return m[1].trim();
  const texto = String(valor == null ? '' : valor).trim();
  return /^https?:\/\//i.test(texto) ? texto : valor;
}

function _esColumnaDeEnlace_(encabezado) {
  return /(URL|LINK|ENLACE|ARCHIVO|DOCUMENTO|ADJUNTO|EVIDENCIA)/i.test(String(encabezado || ''));
}

function normalizarValor_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, ZONA_HORARIA_CAMINO, "yyyy-MM-dd'T'HH:mm:ss");
  }
  return value;
}

/* =========================================================
   ACCESO INDIVIDUAL DE CATEQUIZANDOS — PIN EN GOOGLE SHEETS
   La columna PIN pertenece a CATEQUIZANDOS. Cada PIN debe ser único.
   El token firmado identifica a un solo ID_NINO durante 12 horas.
   ========================================================= */
function _obtenerDatosPINHojaCatequizandos_() {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUIZANDOS);
  if (!hoja) throw new Error('No existe la pestaña CATEQUIZANDOS en Google Sheets.');
  const ultimaFila = hoja.getLastRow();
  const ultimaColumna = hoja.getLastColumn();
  if (ultimaFila < 2 || ultimaColumna < 1) throw new Error('La pestaña CATEQUIZANDOS no tiene niños registrados.');

  // Se usan valores visibles de la hoja, no números convertidos por JavaScript.
  // Así se valida exactamente el PIN de doce dígitos que la titular escribió.
  const valores = hoja.getRange(1, 1, ultimaFila, ultimaColumna).getDisplayValues();
  const encabezados = valores[0].map(_normalizarEncabezadoPrograma_);
  const indice = function(nombre) { return encabezados.indexOf(_normalizarEncabezadoPrograma_(nombre)); };
  const columnas = {
    id: indice('ID_NINO'),
    pin: indice('PIN'),
    nombres: indice('NOMBRES'),
    apellidos: indice('APELLIDOS'),
    grado: indice('GRADO'),
    foto: indice('FOTO'),
    vigente: indice('VIGENTE')
  };
  if (columnas.pin < 0) throw new Error('No se encontró el encabezado PIN en la pestaña CATEQUIZANDOS.');
  if (columnas.id < 0) throw new Error('No se encontró el encabezado ID_NINO en CATEQUIZANDOS.');
  return { filas: valores.slice(1), columnas: columnas };
}

/**
 * Esta función no crea ni desplaza columnas. Verifica que exista el encabezado PIN,
 * esté donde esté, y que el backend lo lea por su nombre.
 */
function prepararColumnaPINCatequizandos() {
  _obtenerDatosPINHojaCatequizandos_();
  return 'Verificado: el PIN se lee por el encabezado PIN de la pestaña CATEQUIZANDOS. No se agregó ni modificó ninguna columna.';
}

/**
 * Lista pública mínima para el selector de acceso: solo ID_NINO y nombre.
 * No expone PIN, teléfonos, fotos ni otros datos personales. No modifica Sheets.
 */
function listarNombresCatequizandosLogin_() {
  const datos = _obtenerDatosPINHojaCatequizandos_();
  const c = datos.columnas;
  if (c.nombres < 0 || c.apellidos < 0) {
    throw new Error('Faltan los encabezados NOMBRES o APELLIDOS en CATEQUIZANDOS.');
  }
  const activos = datos.filas.map(function(fila) {
    const id = String(fila[c.id] || '').trim();
    const vigente = c.vigente < 0 ? '' : String(fila[c.vigente] || '').trim().toUpperCase();
    const estadoActivo = !vigente || ['SI', 'SÍ', 'TRUE', '1', 'ACTIVO', 'VIGENTE'].indexOf(vigente) >= 0;
    const nombres = String(fila[c.nombres] || '').trim();
    const apellidos = String(fila[c.apellidos] || '').trim();
    return id && estadoActivo && (nombres || apellidos) ? { ID_NINO: id, NOMBRE_COMPLETO: [nombres, apellidos].filter(Boolean).join(' ') } : null;
  }).filter(Boolean);
  const unicos = new Map();
  activos.forEach(function(alumno) { if (!unicos.has(alumno.ID_NINO)) unicos.set(alumno.ID_NINO, alumno); });
  return { exito: true, datos: Array.from(unicos.values()).sort(function(a, b) { return a.NOMBRE_COMPLETO.localeCompare(b.NOMBRE_COMPLETO, 'es'); }) };
}

function normalizarPINCatequizando_(valor) {
  // El PIN se compara con los dígitos visibles de la columna H.
  // Quita separadores de formato (espacios/guiones), sin alterar la hoja.
  return String(valor == null ? '' : valor).replace(/\D/g, '');
}

function validarLoginCatequizando_(pinIngresado, idNinoSeleccionado) {
  const pin = normalizarPINCatequizando_(pinIngresado);
  if (!/^\d{12}$/.test(pin)) {
    return { exito: false, mensaje: 'El PIN debe contener exactamente doce números.' };
  }

  const idSeleccionado = String(idNinoSeleccionado == null ? '' : idNinoSeleccionado).trim();
  if (!idSeleccionado) return { exito: false, mensaje: 'Selecciona tu nombre antes de ingresar.' };

  const datos = _obtenerDatosPINHojaCatequizandos_();
  const c = datos.columnas;
  const activos = datos.filas.filter(function(fila) {
    const id = String(fila[c.id] || '').trim();
    const vigente = c.vigente < 0 ? '' : String(fila[c.vigente] || '').trim().toUpperCase();
    const estadoActivo = !vigente || ['SI', 'SÍ', 'TRUE', '1', 'ACTIVO', 'VIGENTE'].indexOf(vigente) >= 0;
    return !!id && estadoActivo;
  });
  const coincidencias = activos.filter(function(fila) {
    return String(fila[c.id] || '').trim() === idSeleccionado && normalizarPINCatequizando_(fila[c.pin]) === pin;
  });

  if (coincidencias.length === 0) {
    return { exito: false, mensaje: 'El PIN no corresponde al catequizando seleccionado. Comprueba tu nombre y vuelve a escribir tu PIN.' };
  }
  if (coincidencias.length > 1) {
    return { exito: false, mensaje: 'Ese PIN está repetido en CATEQUIZANDOS. Cada niño debe tener un PIN diferente.' };
  }

  const fila = coincidencias[0];
  const alumno = {
    ID_NINO: String(fila[c.id] || '').trim(),
    NOMBRES: c.nombres < 0 ? '' : String(fila[c.nombres] || '').trim(),
    APELLIDOS: c.apellidos < 0 ? '' : String(fila[c.apellidos] || '').trim(),
    GRADO: c.grado < 0 ? '' : String(fila[c.grado] || '').trim(),
    FOTO: c.foto < 0 ? '' : String(fila[c.foto] || '').trim()
  };
  const token = crearTokenCatequizando_(alumno.ID_NINO);
  return {
    exito: true,
    token: token,
    perfil: {
      ID_NINO: alumno.ID_NINO,
      NOMBRES: alumno.NOMBRES,
      APELLIDOS: alumno.APELLIDOS,
      NOMBRE_COMPLETO: [alumno.NOMBRES, alumno.APELLIDOS].filter(Boolean).join(' '),
      GRADO: alumno.GRADO
    }
  };
}

/**
 * Diagnóstico seguro: confirma que Apps Script lee la columna H (PIN)
 * y cuenta PIN válidos/duplicados, sin mostrar ni registrar códigos.
 * Ejecutar manualmente desde el editor para comprobar el enlace con Sheets.
 */
function diagnosticarPINDesdeGoogleSheets() {
  const datos = _obtenerDatosPINHojaCatequizandos_();
  const c = datos.columnas;
  const filas = datos.filas.filter(f => String(f[c.id] || '').trim());
  const pines = filas.map(f => normalizarPINCatequizando_(f[c.pin])).filter(p => /^\d{12}$/.test(p));
  const frecuencias = {};
  pines.forEach(p => frecuencias[p] = (frecuencias[p] || 0) + 1);
  const duplicados = Object.keys(frecuencias).filter(p => frecuencias[p] > 1).length;
  const resultado = {
    conexion: 'OK',
    hoja: CONFIG.SHEET_CATEQUIZANDOS,
    columnaPIN: (function(n){var s='';while(n>=0){s=String.fromCharCode(n%26+65)+s;n=Math.floor(n/26)-1;}return s;})(c.pin),
    alumnosRegistrados: filas.length,
    pinesDe12Digitos: pines.length,
    pinesDuplicados: duplicados,
    mensaje: duplicados ? 'Hay PIN repetidos; cada niño debe tener uno distinto.' : 'Lectura de PIN desde Google Sheets correcta.'
  };
  Logger.log(JSON.stringify(resultado));
  return resultado;
}

function crearTokenCatequizando_(idNino) {
  const props = PropertiesService.getScriptProperties();
  let secreto = props.getProperty('CATEQUIZANDO_TOKEN_SECRET');
  if (!secreto) {
    secreto = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('CATEQUIZANDO_TOKEN_SECRET', secreto);
  }
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    id: String(idNino),
    exp: Date.now() + 12 * 60 * 60 * 1000
  }));
  const firma = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secreto));
  return payload + '.' + firma;
}

/**
 * Recupera un único catequizando vigente por su ID_NINO.
 * Esta función es utilizada al comprobar el token de sesión y al guardar
 * mensajes del alumno. Lee la hoja existente; no crea ni modifica columnas.
 */
function _alumnoVigente_(alumno) {
  const valor = String(alumno && alumno.VIGENTE != null ? alumno.VIGENTE : '')
    .trim()
    .toUpperCase();
  return !valor || ['SI', 'SÍ', 'TRUE', '1', 'ACTIVO', 'VIGENTE'].indexOf(valor) >= 0;
}

function _obtenerAlumnoActivoPorId_(idNino) {
  const id = String(idNino == null ? '' : idNino).trim();
  if (!id) return null;

  const alumnos = getSheetData(CONFIG.SHEET_CATEQUIZANDOS).filter(function(alumno) {
    return String(alumno.ID_NINO == null ? '' : alumno.ID_NINO).trim() === id &&
      _alumnoVigente_(alumno);
  });

  // Un ID_NINO debe identificar un solo registro activo.
  if (alumnos.length !== 1) return null;
  return alumnos[0];
}

function validarTokenCatequizando_(token) {
  try {
    const partes = String(token || '').split('.');
    if (partes.length !== 2) return '';
    const secreto = PropertiesService.getScriptProperties().getProperty('CATEQUIZANDO_TOKEN_SECRET');
    if (!secreto) return '';
    const firmaEsperada = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(partes[0], secreto));
    if (firmaEsperada !== partes[1]) return '';
    const datos = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString());
    if (!datos.id || !datos.exp || Date.now() > Number(datos.exp)) return '';
    const alumno = _obtenerAlumnoActivoPorId_(datos.id);
    return alumno ? String(alumno.ID_NINO).trim() : '';
  } catch (e) {
    return '';
  }
}

/**
 * Devuelve en una sola consulta los datos del panel privado del catequizando.
 * La identidad viene del token validado en doPost; el cliente nunca elige otro ID.
 */
function obtenerResumenPortalCatequizando_(idNino) {
  const id = String(idNino || '').trim();
  const alumno = _obtenerAlumnoActivoPorId_(id);
  if (!alumno) throw new Error('No se encontró el catequizando activo.');

  const salida = {
    exito: true,
    asistencia: { exito: false, mensaje: 'No se pudo leer ASISTENCIA.' },
    tareas: { exito: false, total: 0, datos: [], mensaje: 'No se pudo leer TAREAS.' },
    avisos: { exito: false, total: 0, datos: [], mensaje: 'No se pudo leer AVISOS.' },
    bloques: []
  };

  try {
    const asistencia = getAsistenciaNotasNino_(id);
    const a = asistencia && asistencia.datos && asistencia.datos[0] ? asistencia.datos[0] : null;
    salida.asistencia = a ? {
      exito: true,
      porcentaje: a.ASISTENCIA_PORCENTAJE,
      presentes: a.TOTAL_PRESENTES || 0,
      tardanzas: a.TOTAL_TARDANZAS || 0,
      faltas: a.TOTAL_FALTAS || 0,
      justificadas: a.TOTAL_JUSTIFICADAS || 0,
      totalSesiones: a.TOTAL_SESIONES || asistencia.totalSesiones || 0
    } : { exito: true, porcentaje: null, presentes: 0, tardanzas: 0, faltas: 0, justificadas: 0, totalSesiones: 0, mensaje: 'No se encontró una fila de asistencia para este catequizando.' };
  } catch (e) {
    salida.asistencia = { exito: false, mensaje: e && e.message ? e.message : String(e) };
  }

  try {
    const tareas = getTareasNino_(id, '');
    salida.tareas = { exito: true, total: tareas.total || 0, datos: tareas.datos || [] };
  } catch (e) {
    salida.tareas = { exito: false, total: 0, datos: [], mensaje: e && e.message ? e.message : String(e) };
  }

  try {
    const avisos = getAvisosNino_(id);
    salida.avisos = { exito: true, total: avisos.total || 0, datos: avisos.datos || [] };
  } catch (e) {
    salida.avisos = { exito: false, total: 0, datos: [], mensaje: e && e.message ? e.message : String(e) };
  }

  try {
    const catalogo = _quizCargarCatalogo_();
    const respondidas = _quizIdsRespondidosAlumno_(id);
    for (let numero = 1; numero <= 6; numero++) {
      const sesiones = catalogo.sesiones.filter(function(s) { return _quizBloqueNumero_(s.BLOQUE) === numero; });
      if (!sesiones.length) {
        salida.bloques.push({ numero: numero, nombre: 'BLOQUE ' + numero, porcentaje: 0, completado: false, disponible: false });
        continue;
      }
      const nombreBloque = String(sesiones[0].BLOQUE || ('BLOQUE ' + numero)).trim();
      const avance = _quizProgresoBloque_(catalogo, id, nombreBloque, respondidas);
      salida.bloques.push({
        numero: numero,
        nombre: nombreBloque,
        porcentaje: avance.porcentajeBloque,
        completado: avance.completadoBloque,
        disponible: true
      });
    }
  } catch (e) {
    salida.bloquesError = e && e.message ? e.message : String(e);
    salida.bloques = [];
  }

  salida.alumno = {
    id: id,
    nombre: [String(alumno.NOMBRES || '').trim(), String(alumno.APELLIDOS || '').trim()].filter(Boolean).join(' '),
    grado: String(alumno.GRADO || '').trim(),
    foto: String(alumno.FOTO || '').trim()
  };
  return salida;
}

function getMiPerfilCatequizando_(idNino) {
  const id = String(idNino || '').trim();
  const respuesta = getCatequizandos('');
  const alumno = (respuesta.datos || []).find(a => String(a.ID_NINO || '').trim() === id);
  return alumno ? { exito: true, total: 1, datos: [alumno] } : { exito: false, mensaje: 'No se encontró el perfil del catequizando.' };
}

function getAsistenciaNotasNino_(idNino) {
  const id = String(idNino || '').trim();
  const respuesta = getAsistenciaNotasCatequizandos('');
  const datos = (respuesta.datos || []).filter(a => String(a.ID_NINO || '').trim() === id);
  const calificaciones = (respuesta.calificaciones || []).filter(a => String(a.ID_NINO || '').trim() === id);
  return Object.assign({}, respuesta, { total: datos.length, datos: datos, totalCalificaciones: calificaciones.length, calificaciones: calificaciones });
}


/* =====================================================================
   MÓDULO TAREAS DIDÁCTICAS EN FAMILIA — V7
   Fuente: las 68 tareas proporcionadas para CJ-001 a CJ-068.
   TAREAS es el catálogo; ENTREGAS_TAREAS conserva cada entrega individual.
   Las evidencias quedan en una carpeta privada de Drive compartida solo
   con las catequistas activas registradas en CATEQUISTAS.
   ===================================================================== */

const TAREAS_CATEQUESIS_V7 = [{"id":1,"tema":"¿QUIÉN ES DIOS?","tarea":"En familia, conversen sobre una cualidad de Dios que reflejan en su hogar (amor, paciencia o cuidado) y escriban una frase corta en una cartulina o cuaderno.","evidencia_foto":"Foto de la familia reunida sosteniendo juntos la cartulina o cuaderno con la frase elegida."},{"id":2,"tema":"¿QUIÉN ES JESÚS?","tarea":"Cada integrante que participa elige un gesto de servicio o cariño que Jesús enseñó (ayudar, escuchar o compartir) y lo realiza en casa durante el día.","evidencia_foto":"Foto del niño o niña junto a quien participó realizando ese gesto concreto en familia."},{"id":3,"tema":"¿QUIÉN ES EL ESPÍRITU SANTO?","tarea":"Elaboren en casa una paloma o llama de fuego con papel o material reciclado y escriban alrededor palabras como paz, luz, alegría o fuerza.","evidencia_foto":"Foto del niño o niña mostrando la figura terminada junto a quienes ayudaron a armarla."},{"id":4,"tema":"LA SANTÍSIMA TRINIDAD","tarea":"Hagan un trébol de tres hojas o un triángulo en papel representando al Padre, al Hijo y al Espíritu Santo, y conversen sobre su unidad.","evidencia_foto":"Foto de la familia reunida mostrando el símbolo y haciendo juntos la señal de la cruz."},{"id":5,"tema":"LA CREACIÓN","tarea":"Salgan a un espacio verde, patio o cerca de casa en Lurín y observen elementos creados por Dios para agradecerle por la naturaleza.","evidencia_foto":"Foto del niño o niña y su familia junto a plantas, árboles o el cielo agradeciendo por la creación."},{"id":6,"tema":"LA VIDA DE JESÚS","tarea":"Conversen en familia sobre cómo era el hogar de Jesús en Nazaret y compartan una costumbre diaria que fortalezca la unión en su casa.","evidencia_foto":"Foto de la familia compartiendo un momento cotidiano y unido en el hogar."},{"id":7,"tema":"LAS ENSEÑANZAS DE JESÚS","tarea":"Elijan una enseñanza breve de Jesús (como amar al prójimo o perdonar) y anoten cómo ponerla en práctica esta semana en casa.","evidencia_foto":"Foto del niño o niña conversando o leyendo la enseñanza elegida junto a su acompañante."},{"id":8,"tema":"LOS MILAGROS DE JESÚS","tarea":"Recuerden un milagro de Jesús y realicen un 'milagro cotidiano' en casa compartiendo alimentos, agua o un detalle con otro miembro de la familia.","evidencia_foto":"Foto del niño o niña compartiendo algo concreto con la persona de la familia que participa."},{"id":9,"tema":"PASIÓN, MUERTE Y RESURRECCIÓN","tarea":"Enciendan una vela en familia como signo de la luz de Jesús resucitado y oren brevemente pidiendo alegría y esperanza para el hogar.","evidencia_foto":"Foto de la familia reunida en oración alrededor de la vela encendida."},{"id":10,"tema":"¿QUÉ SIGNIFICA TENER FE?","tarea":"Hagan un juego de confianza en un espacio seguro donde el niño camine unos pasos guiado suavemente con los ojos cerrados y conversen sobre confiar en Dios.","evidencia_foto":"Foto del niño o niña siendo guiado con cuidado por un familiar durante el ejercicio de confianza."},{"id":11,"tema":"¿QUÉ ES ORAR? Y REZAR","tarea":"Dediquen unos minutos tranquilos en casa para conversar con Dios desde el corazón, agradeciendo lo vivido y pidiendo por su familia.","evidencia_foto":"Foto del niño o niña y los familiares participantes en actitud de oración en casa."},{"id":12,"tema":"La Adoración y la Oración","tarea":"Armen un pequeño rincón de oración en casa con una cruz, Biblia o imagen religiosa y pasen un momento breve de silencio y adoración.","evidencia_foto":"Foto del niño o niña y su familia orando frente al rincón preparado."},{"id":13,"tema":"Oraciones Fundamentales","tarea":"Practiquen en familia las oraciones fundamentales y preparen una ficha de apoyo con la oración que el niño o niña necesita reforzar más.","evidencia_foto":"Foto de la familia rezando junta o mostrando la ficha de la oración practicada."},{"id":14,"tema":"SEÑAL DE LA SANTA CRUZ","tarea":"Practiquen hacer despacio y con respeto la señal de la Santa Cruz en familia, recordando el nombre del Padre, del Hijo y del Espíritu Santo.","evidencia_foto":"Foto del niño o niña y su familia realizando juntos la señal de la cruz."},{"id":15,"tema":"ORACION DEL PADRE NUESTRO","tarea":"Recen juntos el Padre Nuestro y conversen sobre qué significa llamar 'Padre' a Dios y pedir el pan de cada día.","evidencia_foto":"Foto de la familia reunida rezando el Padre Nuestro."},{"id":16,"tema":"ORACION DEL AVE MARIA","tarea":"Recen juntos el Ave María pidiendo a María que cuide y acompañe a la familia y a los niños de catequesis.","evidencia_foto":"Foto de los participantes rezando juntos el Ave María (con imagen de María si tienen en casa)."},{"id":17,"tema":"GLORIA AL PADRE","tarea":"Recen el Gloria al Padre al terminar una oración familiar para dar gracias a Dios por todo lo que nos da.","evidencia_foto":"Foto del niño o niña y su familia en oración al finalizar el rezo del Gloria."},{"id":18,"tema":"CREDO","tarea":"Lean o recen juntos una parte del Credo y elijan una verdad de la fe que más les guste creer en familia.","evidencia_foto":"Foto del niño o niña junto a quien leyó o rezó el Credo con él o ella."},{"id":19,"tema":"ACTO DE CONTRICSION","tarea":"Hagan un breve momento de reflexión en familia y recen juntos el Acto de Contrición pidiendo perdón a Dios por las faltas.","evidencia_foto":"Foto del niño o niña y los familiares que acompañan en actitud de oración y arrepentimiento."},{"id":20,"tema":"EL SANTO ROSARIO","tarea":"Rezar en familia al menos una decena o un misterio del Santo Rosario ofreciendo por las intenciones del hogar.","evidencia_foto":"Foto de los participantes sosteniendo su rosario y rezando juntos."},{"id":21,"tema":"CUANDO Y DONDE PODEMOS ORAR","tarea":"Elijan un momento fijo del día (al despertar, antes de comer o al acostarse) para orar en familia y cúmplanlo.","evidencia_foto":"Foto de la familia orando en el momento y lugar elegidos en casa."},{"id":22,"tema":"COMO HACER UNA ORACION EXPONTANEA","tarea":"Anime al niño o niña a hacer una oración con sus propias palabras (sin leerla), agradeciendo o pidiendo algo sincero.","evidencia_foto":"Foto del niño o niña orando con sus propias palabras acompañado de su familia."},{"id":23,"tema":"LA GRACIA","tarea":"Rieguen juntos una planta en casa y conversen sobre cómo la gracia de Dios alimenta y hace crecer nuestra vida espiritual.","evidencia_foto":"Foto del niño o niña regando la planta junto a un familiar."},{"id":24,"tema":"LOS SACRAMENTOS","tarea":"Elaboren un dibujo o lista de los 7 sacramentos y comenten cuáles conoce el niño o cuáles se han celebrado en la familia.","evidencia_foto":"Foto del niño o niña mostrando el trabajo de los 7 sacramentos junto a quien le ayudó."},{"id":25,"tema":"EL BAUTISMO","tarea":"Busquen una foto o recuerdo del Bautismo del niño o niña (o usen un recipiente con agua limpia) y recuerden su nombre y compromiso cristiano.","evidencia_foto":"Foto del niño o niña y sus padres o acompañantes junto al recuerdo, foto o agua del Bautismo."},{"id":26,"tema":"EL SACRAMENTO DE LA RECONCILIACIÓN","tarea":"Conversen en familia sobre el perdón y dense un abrazo sincero de reconciliación si hubo algún malentendido en casa.","evidencia_foto":"Foto del niño o niña y el familiar con quien vivió el gesto de reconciliación."},{"id":27,"tema":"LA COMUNIÓN","tarea":"Preparen juntos la mesa familiar con cariño y conversen sobre la alegría de unirnos como familia y recibir a Jesús.","evidencia_foto":"Foto de la familia reunida alrededor de la mesa dispuesta para compartir."},{"id":28,"tema":"LA CONFIRMACIÓN","tarea":"Conversen sobre cómo el Espíritu Santo da fuerza para ser valientes en la fe y escriban un ánimo para vivir como testigos de Jesús.","evidencia_foto":"Foto del niño o niña y su acompañante sosteniendo o compartiendo su mensaje de fe."},{"id":29,"tema":"LA UNCION DE LOS ENFERMOS","tarea":"Hagan una oración en familia por los abuelos, enfermos o quienes sufren y preparen un dibujo o tarjeta de cariño para ellos.","evidencia_foto":"Foto del niño o niña y su familia sosteniendo el dibujo o mensaje de oración por los enfermos."},{"id":30,"tema":"ORDENN SACERDOTAL","tarea":"Oren en familia por el párroco y los sacerdotes y elaboren un pequeño mensaje de agradecimiento por su servicio.","evidencia_foto":"Foto del niño o niña y su familia mostrando el mensaje o tarjeta de oración por los sacerdotes."},{"id":31,"tema":"MATRIMONIO","tarea":"Pregunten a los padres o familiares casados qué valoran más de amarse, respetarse y cuidarse cada día en el hogar.","evidencia_foto":"Foto de los padres o pareja junto al niño o niña compartiendo un momento familiar."},{"id":32,"tema":"QUE ES UN VALOR CRISTIANO","tarea":"Elijan un valor cristiano (respeto, bondad, honestidad o generosidad) y realicen una acción en casa que lo demuestre.","evidencia_foto":"Foto del niño o niña realizando la acción del valor elegido junto a un familiar."},{"id":33,"tema":"Las virtudes","tarea":"Practiquen en familia una virtud (paciencia, templanza, prudencia o fortaleza) ante una situación cotidiana de la casa.","evidencia_foto":"Foto del niño o niña y el familiar que participó practicando esa virtud."},{"id":34,"tema":"LOS DONES","tarea":"Conversen sobre los dones del Espíritu Santo y elijan uno para pedirle a Dios en familia esta semana.","evidencia_foto":"Foto de la familia reunida orando o mostrando el don elegido."},{"id":35,"tema":"LOS 10 MANDAMIENTOS","tarea":"Elijan un mandamiento para trabajar en casa y anoten un compromiso sencillo para cumplirlo durante la semana.","evidencia_foto":"Foto del niño o niña y su familia mostrando el compromiso del mandamiento elegido."},{"id":36,"tema":"LOS MANDAMIENTOS DE LA IGLESIA","tarea":"Revisen juntos los mandamientos de la Iglesia y organicen en familia cómo cumplir el participar en Misa y orar.","evidencia_foto":"Foto de la familia reunida planificando o viviendo este compromiso."},{"id":37,"tema":"LOS PECADOS","tarea":"Conversen con sencillez sobre qué es el pecado como aquello que nos aleja de Dios y de los demás, y cómo volver a acercarnos a Él.","evidencia_foto":"Foto del niño o niña y su acompañante conversando o haciendo una oración breve."},{"id":38,"tema":"LOS 7 PECADOS CAPITALES","tarea":"Identifiquen en familia una actitud que afecta la convivencia (como pereza, ira o egoísmo) y cámbienla por un buen hábito en casa.","evidencia_foto":"Foto del niño o niña y su familiar realizando el buen hábito que reemplaza esa actitud."},{"id":39,"tema":"EL PERDON","tarea":"Practiquen decir 'perdón' y 'te perdono' en casa cuando haya algún error o molestia entre los miembros de la familia.","evidencia_foto":"Foto del niño o niña y el familiar compartiendo un gesto de perdón y paz."},{"id":40,"tema":"EXAMEN DE CONCIENCIA","tarea":"Hagan al final del día un examen de conciencia breve en familia: ¿qué hice bien?, ¿en qué fallé?, ¿qué puedo mejorar mañana?","evidencia_foto":"Foto del niño o niña y su familia reunidos en este momento de revisión y oración."},{"id":41,"tema":"BIENAVENTURANZAS","tarea":"Elijan una bienaventuranza (como ser pacificadores o misericordiosos) y realicen una acción de paz o ayuda en casa o el entorno.","evidencia_foto":"Foto del niño o niña y su familia haciendo un gesto de paz o ayuda mutua."},{"id":42,"tema":"OBRA DE MISERICORDIA","tarea":"Realicen en familia una obra de misericordia corporal o espiritual (compartir comida, acompañar a alguien o dar un buen consejo).","evidencia_foto":"Foto del niño o niña y su familia realizando la obra de misericordia elegida."},{"id":43,"tema":"QUE ES LA EUCARISTIA","tarea":"Conversen en familia sobre la Eucaristía como acción de gracias y alimento de Jesús, y hagan una oración agradeciendo por la vida.","evidencia_foto":"Foto del niño o niña y su familia orando juntos o con un dibujo eucarístico (pan o cáliz)."},{"id":44,"tema":"LA SANTA MISA","tarea":"Lean o comenten en familia la importancia de participar en la Santa Misa y preparen una intención familiar para llevar a la próxima Misa.","evidencia_foto":"Foto del niño o niña y su familia anotando o compartiendo su intención para la Misa."},{"id":45,"tema":"LOS RITOS INICIALES","tarea":"Practiquen en casa el saludo inicial y el pedido de perdón como al comienzo de la Misa, disponiendo el corazón para escuchar a Dios.","evidencia_foto":"Foto del niño o niña y su familia reunidos al inicio de su momento de oración."},{"id":46,"tema":"LA LITURGIA DE LA PALABRA","tarea":"Lean juntos en familia un pasaje breve del Evangelio o de la Biblia y comenten qué mensaje les deja para hoy.","evidencia_foto":"Foto del niño o niña y su familia leyendo la Biblia o comentando el pasaje juntos."},{"id":47,"tema":"LA LITURGIA DE LA EUCARISTIA","tarea":"Conversen en familia sobre lo que ofrecemos a Dios (nuestro trabajo, alegrías y esfuerzos) al presentar el pan y el vino.","evidencia_foto":"Foto del niño o niña y su familia reunidos en oración de ofrenda en casa."},{"id":48,"tema":"LOS RITOS FINALES","tarea":"Al terminar su oración familiar, pidan juntos la bendición de Dios y asuman el envío de llevar paz y alegría a los demás.","evidencia_foto":"Foto de la familia reunida haciendo la señal de la cruz al recibir la bendición."},{"id":49,"tema":"PARTES DE LA SANTA MISA","tarea":"Elaboren un esquema o dibujo sencillo con las partes de la Santa Misa y expliquen con sus palabras qué ocurre en cada momento.","evidencia_foto":"Foto del niño o niña mostrando el dibujo o esquema de las partes de la Misa junto a su acompañante."},{"id":50,"tema":"VESTIDURA DE LOS SACERDOTES","tarea":"Dibujen o armen una vestidura sacerdotal sencilla (como la casulla o el alba) y comenten qué simboliza el servicio a Dios.","evidencia_foto":"Foto del niño o niña mostrando su dibujo o manualidad junto a quien le ayudó."},{"id":51,"tema":"OBJETOS LITURGICOS","tarea":"Dibujen o identifiquen en imágenes un objeto litúrgico (cáliz, patena, copón o custodia) y conversen sobre su uso con respeto.","evidencia_foto":"Foto del niño o niña mostrando el objeto litúrgico dibujado junto a su acompañante."},{"id":52,"tema":"COLORES LITURGICOS","tarea":"Coloreen o armen los colores litúrgicos (blanco, verde, rojo, morado) y comenten en qué tiempos o fiestas se usa cada color.","evidencia_foto":"Foto del niño o niña mostrando los colores litúrgicos trabajados junto a quien participó."},{"id":53,"tema":"LOS SANTOS","tarea":"Conozcan en familia la historia breve de un santo o santa (o el santo del nombre del niño) y elijan una virtud suya para imitar.","evidencia_foto":"Foto del niño o niña y su familia sosteniendo el nombre o imagen del santo elegido."},{"id":54,"tema":"LA ULTIMA CENA","tarea":"Recuerden en familia la Última Cena de Jesús con sus discípulos y compartan un momento de mesa y servicio en casa.","evidencia_foto":"Foto de la familia compartiendo en la mesa o conversando sobre la Última Cena."},{"id":55,"tema":"LA INSTITUCION DE LA EUCARISTIA","tarea":"Lean juntos cómo Jesús instituyó la Eucaristía ('Hagan esto en memoria mía') y agradezcan por quedarse con nosotros en el pan consagrado.","evidencia_foto":"Foto del niño o niña y su familia leyendo el pasaje o haciendo una oración de gratitud."},{"id":56,"tema":"LA CONSAGRACION","tarea":"Conversen en familia sobre el momento de la consagración en la Misa y hagan una breve oración de reverencia a Jesús.","evidencia_foto":"Foto del niño o niña y los familiares participantes en actitud respetuosa de oración."},{"id":57,"tema":"LA PRESENCIA REAL DE JESUSEN LA EUCARISTIA","tarea":"Reflexionen en familia sobre la presencia real de Jesús en la Eucaristía y expresen con palabras sencillas qué significa tenerlo cerca.","evidencia_foto":"Foto del niño o niña y su familia en oración o sosteniendo un símbolo de luz/pan."},{"id":58,"tema":"LA SAGRADA COMUNION","tarea":"Conversen en familia sobre la alegría de recibir a Jesús en la Sagrada Comunión y cómo prepararnos con un corazón limpio.","evidencia_foto":"Foto del niño o niña y su acompañante conversando o haciendo una oración preparatoria."},{"id":59,"tema":"EL SAGRARIO","tarea":"Dibujen o representen un Sagrario y conversen sobre que allí está Jesús esperándonos con amor.","evidencia_foto":"Foto del niño o niña mostrando su dibujo del Sagrario junto a su familia."},{"id":60,"tema":"EL SAGRARIO","tarea":"Hagan una breve visita espiritual o de oración en familia pensando en Jesús presente en el Sagrario, pidiendo por su catequesis.","evidencia_foto":"Foto del niño o niña y su familia en actitud de oración."},{"id":61,"tema":"LA PREPARACION PARA LA PRIMERA COMUNION","tarea":"Conversen en familia sobre qué significa prepararse de corazón para la Primera Comunión y anoten un deseo o propósito del niño.","evidencia_foto":"Foto del niño o niña y su familia mostrando o compartiendo su propósito de preparación."},{"id":62,"tema":"PREPARACION ESPIRITUAL","tarea":"Hagan un momento de oración y perdón en familia para disponer el alma con paz y alegría antes de recibir a Jesús.","evidencia_foto":"Foto del niño o niña y su familia en un momento de oración y reconciliación en casa."},{"id":63,"tema":"ORACIONES QUE DEBEN CONOCER","tarea":"Repasen en familia las oraciones que el niño o niña debe conocer para su catequesis y Primera Comunión.","evidencia_foto":"Foto del niño o niña repasando las oraciones junto a quien lo acompaña."},{"id":64,"tema":"PREPARACION PARA LA SANTA MISA","tarea":"Alisten con anticipación en familia el ánimo, el respeto y la puntualidad para participar con alegría en la Santa Misa.","evidencia_foto":"Foto del niño o niña y su familia preparándose juntos para la Misa."},{"id":65,"tema":"EL MOMENTO DE COMUNION","tarea":"Practiquen en casa cómo acercarse con respeto y conversar sobre qué decirle a Jesús en el momento de recibirlo.","evidencia_foto":"Foto del niño o niña y su acompañante conversando o ensayando con actitud de respeto."},{"id":66,"tema":"DESPUES DE RECIBIR A JESUS","tarea":"Conversen sobre qué hacer después de comulgar: darle gracias en silencio y vivir lo que Él nos pide en la vida diaria.","evidencia_foto":"Foto del niño o niña y su familia en un momento de oración de acción de gracias."},{"id":67,"tema":"PREPARACION PERSONAL Y CEREMONIAL","tarea":"Revisen juntos en familia los detalles personales y de respeto necesarios para la celebración, cuidando el orden y la alegría.","evidencia_foto":"Foto del niño o niña y su familia revisando o preparando juntos los detalles acordados."},{"id":68,"tema":"PREPÁRACION","tarea":"Hagan una oración final en familia pidiendo que el Señor acompañe este camino de preparación con fe, cariño y unión.","evidencia_foto":"Foto de toda la familia participante reunida en oración."}];
const HOJA_ENTREGAS_TAREAS_V7 = 'ENTREGAS_TAREAS';
const PROP_CARPETA_EVIDENCIAS_V7 = 'CAMINO_HJ_EVIDENCIAS_TAREAS_FOLDER_ID';
const ENCABEZADOS_ENTREGAS_TAREAS_V7 = [
  'ID_ENTREGA','ID_TAREA','ID_SESION','ID_NINO','NOMBRE_CATEQUIZANDO',
  'FECHA_ENVIO','EVIDENCIA_FILE_ID','EVIDENCIA_URL','ESTADO_REVISION',
  'OBSERVACION_CATEQUISTA','FECHA_REVISION','ID_CATEQUISTA_REVISA',
  'NOMBRE_ARCHIVO','MIME_TYPE','TAMANO_BYTES'
];

function _tareasCrearHojaEntregasV7_() {
  const ss = getSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_ENTREGAS_TAREAS_V7);
  if (!hoja) hoja = ss.insertSheet(HOJA_ENTREGAS_TAREAS_V7);
  const ultimaCol = Math.max(hoja.getLastColumn(), 1);
  let encabezados = hoja.getRange(1,1,1,ultimaCol).getDisplayValues()[0].map(x=>String(x||'').trim());
  if (hoja.getLastRow() === 0 || !encabezados.some(Boolean)) {
    hoja.getRange(1,1,1,ENCABEZADOS_ENTREGAS_TAREAS_V7.length).setValues([ENCABEZADOS_ENTREGAS_TAREAS_V7]);
    encabezados = ENCABEZADOS_ENTREGAS_TAREAS_V7.slice();
  } else {
    const normalizados = encabezados.map(_normalizarEncabezadoPrograma_);
    const faltantes = ENCABEZADOS_ENTREGAS_TAREAS_V7.filter(h=>normalizados.indexOf(_normalizarEncabezadoPrograma_(h))<0);
    if (faltantes.length) {
      const inicio = hoja.getLastColumn()+1;
      hoja.getRange(1,inicio,1,faltantes.length).setValues([faltantes]);
      encabezados = encabezados.concat(faltantes);
    }
  }
  if (hoja.getFrozenRows() < 1) hoja.setFrozenRows(1);
  return hoja;
}

function _tareasObtenerCarpetaEvidenciasV7_() {
  const props = PropertiesService.getScriptProperties();
  const existente = String(props.getProperty(PROP_CARPETA_EVIDENCIAS_V7) || '').trim();
  let carpeta;
  if (existente) {
    try { carpeta = DriveApp.getFolderById(existente); carpeta.getName(); }
    catch (e) { throw new Error('La carpeta de evidencias configurada ya no está disponible. Ejecuta prepararModuloTareasCatequesis para revisar su configuración.'); }
  } else {
    carpeta = DriveApp.createFolder('CAMINO HACIA JESÚS 2026 - EVIDENCIAS DE TAREAS');
    props.setProperty(PROP_CARPETA_EVIDENCIAS_V7, carpeta.getId());
  }
  return carpeta;
}

function _tareasCompartirCarpetaConCatequistasV7_(carpeta) {
  const advertencias = [];
  try {
    const catequistas = getSheetData(CONFIG.SHEET_CATEQUISTAS);
    const correos = catequistas.filter(c => {
      const activo = String(c.ACTIVO || '').trim().toUpperCase();
      return ['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'].indexOf(activo)>=0;
    }).map(c=>String(c.CORREO || '').trim()).filter(c=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
    if (correos.length) carpeta.addEditors(correos);
    else advertencias.push('No se encontraron correos de catequistas activas en CATEQUISTAS. Comparte la carpeta manualmente con las responsables.');
  } catch (e) {
    advertencias.push('No se pudo compartir automáticamente la carpeta con las catequistas: '+(e.message||e));
  }
  return advertencias;
}

/**
 * Ejecutar UNA SOLA VEZ desde Apps Script después de pegar este GS V7.
 * Completa únicamente celdas vacías de las 68 filas reservadas de TAREAS,
 * conserva RESPONSABLE, enlaces y cualquier dato ya escrito, y crea
 * ENTREGAS_TAREAS y la carpeta privada de evidencias en Drive.
 */
function prepararModuloTareasCatequesis() {
  const ss = getSpreadsheet();
  const hoja = ss.getSheetByName(CONFIG.SHEET_TAREAS);
  if (!hoja) throw new Error('No existe la hoja TAREAS. No se creó otra hoja para sustituirla.');
  _asegurarColumnasEnHoja_(hoja, [
    'ID_TAREA','ID_CLASE','FECHA_ASIGNACION','FECHA_ENTREGA','TITULO','DESCRIPCION',
    'RESPONSABLE','ESTADO','EVIDENCIA_LINK','OBSERVACION','ID_SESION'
  ]);
  const lastCol = hoja.getLastColumn();
  let encabezados = hoja.getRange(1,1,1,lastCol).getDisplayValues()[0].map(x=>String(x||'').trim());
  let indices = {};
  encabezados.forEach((h,i)=>{indices[_normalizarEncabezadoPrograma_(h)]=i;});
  const requeridos = ['IDTAREA','IDSESION','TITULO','DESCRIPCION','ESTADO','OBSERVACION'];
  const faltan = requeridos.filter(k=>indices[k]===undefined);
  if (faltan.length) throw new Error('No se pudieron preparar las columnas de TAREAS: '+faltan.join(', '));

  const lastRow = hoja.getLastRow();
  let valores = lastRow>=2 ? hoja.getRange(2,1,lastRow-1,lastCol).getValues() : [];
  let preparadas=0, existentes=0, filasAgregadas=0, avisos=[];
  const normalizarId = v => _quizNormalizarIdSesion_(v);

  TAREAS_CATEQUESIS_V7.forEach((t,idx)=>{
    const idTarea = 'TAR-'+String(t.id).padStart(3,'0');
    const idSesion = 'CJ-'+String(t.id).padStart(3,'0');
    let pos = valores.findIndex(row=>String(row[indices.IDTAREA]||'').trim()===idTarea || normalizarId(row[indices.IDSESION])===normalizarId(idSesion));
    if (pos<0) {
      const preferida = idx;
      const filaPreferida = valores[preferida];
      const puedeUsarse = filaPreferida &&
        !String(filaPreferida[indices.IDTAREA]||'').trim() &&
        !String(filaPreferida[indices.IDSESION]||'').trim() &&
        !String(filaPreferida[indices.TITULO]||'').trim() &&
        !String(filaPreferida[indices.DESCRIPCION]||'').trim();
      if (puedeUsarse) pos=preferida;
      else {
        pos=valores.findIndex(row=>
          !String(row[indices.IDTAREA]||'').trim() &&
          !String(row[indices.IDSESION]||'').trim() &&
          !String(row[indices.TITULO]||'').trim() &&
          !String(row[indices.DESCRIPCION]||'').trim()
        );
      }
    }
    if (pos<0) {
      valores.push(new Array(lastCol).fill(''));
      pos=valores.length-1;
      filasAgregadas++;
    }
    const row=valores[pos];
    const antes = JSON.stringify(row);
    const llenar=(clave,valor)=>{
      const col=indices[clave];
      if (col===undefined) return;
      const actual=row[col];
      if (actual===null || actual===undefined || String(actual).trim()==='') row[col]=valor;
    };
    llenar('IDTAREA',idTarea);
    llenar('IDSESION',idSesion);
    llenar('TITULO',t.tema);
    llenar('DESCRIPCION',t.tarea);
    llenar('ESTADO','ACTIVA');
    llenar('OBSERVACION','EVIDENCIA FOTOGRÁFICA OBLIGATORIA: '+t.evidencia_foto);
    if (JSON.stringify(row)!==antes) preparadas++; else existentes++;
  });

  // Escribir únicamente las seis columnas del catálogo que prepara este módulo.
  // Así se conservan literalmente RESPONSABLE, enlaces, fórmulas y cualquier otra columna.
  if (valores.length) {
    ['IDTAREA','IDSESION','TITULO','DESCRIPCION','ESTADO','OBSERVACION'].forEach(clave => {
      const col = indices[clave];
      const columnaValores = valores.map(row => [row[col] === undefined ? '' : row[col]]);
      hoja.getRange(2, col + 1, columnaValores.length, 1).setValues(columnaValores);
    });
  }
  const hojaEntregas = _tareasCrearHojaEntregasV7_();
  const carpeta = _tareasObtenerCarpetaEvidenciasV7_();
  const advertenciasDrive = _tareasCompartirCarpetaConCatequistasV7_(carpeta);
  SpreadsheetApp.flush();
  return {
    exito:true,
    tareasCatalogadas:TAREAS_CATEQUESIS_V7.length,
    filasActualizadas:preparadas,
    filasSinCambios:existentes,
    filasAgregadas:filasAgregadas,
    hojaCatalogo:'TAREAS',
    hojaEntregas:hojaEntregas.getName(),
    carpetaEvidencias:carpeta.getName(),
    carpetaEvidenciasUrl:carpeta.getUrl(),
    advertencias:advertenciasDrive,
    mensaje:'Módulo de tareas preparado. Se conservaron las columnas RESPONSABLE y los datos preexistentes.'
  };
}

function _tareasObtenerDatosEntregaV7_(idNino) {
  const hoja = getSpreadsheet().getSheetByName(HOJA_ENTREGAS_TAREAS_V7);
  if (!hoja || hoja.getLastRow()<2) return {};
  const filas = getSheetData(HOJA_ENTREGAS_TAREAS_V7).filter(x=>String(x.ID_NINO||'').trim().toUpperCase()===String(idNino||'').trim().toUpperCase());
  filas.sort((a,b)=>new Date(b.FECHA_ENVIO||0).getTime()-new Date(a.FECHA_ENVIO||0).getTime());
  const mapa={};
  filas.forEach(f=>{const k=String(f.ID_TAREA||'').trim();if(k&&!mapa[k])mapa[k]=f;});
  return mapa;
}

function _tareasUltimasEntregasPorAlumno_(idNino) {
  return _tareasObtenerDatosEntregaV7_(idNino);
}

function _tareasBuscarPorId_(idTarea) {
  const id=String(idTarea||'').trim().toUpperCase();
  if(!id) return null;
  return getSheetData(CONFIG.SHEET_TAREAS).find(t=>String(t.ID_TAREA||'').trim().toUpperCase()===id) || null;
}

function _tareasEsAsignadaAlAlumnoV7_(tarea,idNino) {
  const asignado=String(tarea.ID_NINO||tarea.ID_CATEQUIZANDO||'').trim().toUpperCase();
  return !asignado || asignado===String(idNino||'').trim().toUpperCase();
}

/** Recibe una foto comprimida, la guarda en Drive y registra la entrega en Sheets. */
function enviarEvidenciaTarea_(data,idNinoAutorizado) {
  const idNino=String(idNinoAutorizado||'').trim().toUpperCase();
  const idTarea=String(data.idTarea||'').trim().toUpperCase();
  const base64=String(data.base64||'').replace(/^data:[^,]+,/,'').trim();
  const mime=String(data.mimeType||'').trim().toLowerCase();
  const nombreArchivo=String(data.fileName||'evidencia.jpg').replace(/[\\/:*?"<>|\r\n]/g,'_').slice(0,120);
  if(!idTarea || !base64) throw new Error('Selecciona una fotografía antes de enviarla.');
  if(['image/jpeg','image/png','image/webp'].indexOf(mime)<0) throw new Error('La evidencia debe ser una imagen JPG, PNG o WEBP.');
  const bytesEstimados=Math.floor(base64.length*3/4);
  if(bytesEstimados>1800000) throw new Error('La fotografía sigue siendo muy pesada. El portal debe comprimirla antes de enviarla (máximo 1.8 MB).');
  const tarea=_tareasBuscarPorId_(idTarea);
  if(!tarea) throw new Error('No se encontró la tarea seleccionada en Google Sheets.');
  const estadoCatalogo=String(tarea.ESTADO||'').trim().toUpperCase();
  if(['INACTIVA','INACTIVO','CANCELADA','CANCELADO','BORRADOR'].indexOf(estadoCatalogo)>=0) throw new Error('Esta tarea no está habilitada para recibir evidencias.');
  if(!_tareasEsAsignadaAlAlumnoV7_(tarea,idNino)) throw new Error('Esta tarea no está asignada a tu cuenta.');

  const hoja=getSpreadsheet().getSheetByName(HOJA_ENTREGAS_TAREAS_V7);
  if(!hoja) throw new Error('Todavía no está preparada ENTREGAS_TAREAS. Ejecuta prepararModuloTareasCatequesis desde Apps Script.');
  const ultimas=_tareasUltimasEntregasPorAlumno_(idNino);
  const previa=ultimas[idTarea]||null;
  const estadoPrevio=String(previa && previa.ESTADO_REVISION || '').trim().toUpperCase();
  if(estadoPrevio==='ENVIADA') throw new Error('Tu evidencia ya fue enviada y está pendiente de revisión.');
  if(estadoPrevio==='REVISADA') throw new Error('Esta tarea ya fue revisada y registrada.');

  const alumno=_obtenerAlumnoActivoPorId_(idNino);
  if(!alumno) throw new Error('No se encontró el perfil activo del catequizando.');
  const nombreAlumno=[alumno.NOMBRES,alumno.APELLIDOS].filter(Boolean).join(' ').trim();
  const lock=LockService.getScriptLock();
  lock.waitLock(15000);
  let archivo=null;
  try {
    const carpeta=_tareasObtenerCarpetaEvidenciasV7_();
    const prefijo='TAR-'+idTarea.replace(/[^A-Z0-9-]/g,'')+'_'+idNino+'_'+Utilities.formatDate(new Date(),ZONA_HORARIA_CAMINO,'yyyyMMdd_HHmmss');
    const nombreFinal=prefijo+'_'+nombreArchivo;
    const blob=Utilities.newBlob(Utilities.base64Decode(base64),mime,nombreFinal);
    archivo=carpeta.createFile(blob);
    archivo.setDescription('Evidencia de tarea familiar. Alumno: '+nombreAlumno+' ('+idNino+'). Tarea: '+idTarea+'. Sesión: '+String(tarea.ID_SESION||'')+'.');

    const encabezados=hoja.getRange(1,1,1,hoja.getLastColumn()).getDisplayValues()[0].map(h=>String(h||'').trim());
    const registro={
      ID_ENTREGA:'ENT-TAR-'+Utilities.getUuid().replace(/-/g,'').slice(0,18).toUpperCase(),
      ID_TAREA:idTarea,
      ID_SESION:String(tarea.ID_SESION||''),
      ID_NINO:idNino,
      NOMBRE_CATEQUIZANDO:nombreAlumno,
      FECHA_ENVIO:new Date(),
      EVIDENCIA_FILE_ID:archivo.getId(),
      EVIDENCIA_URL:archivo.getUrl(),
      ESTADO_REVISION:'ENVIADA',
      OBSERVACION_CATEQUISTA:'',
      FECHA_REVISION:'',
      ID_CATEQUISTA_REVISA:'',
      NOMBRE_ARCHIVO:nombreFinal,
      MIME_TYPE:mime,
      TAMANO_BYTES:bytesEstimados
    };
    hoja.appendRow(encabezados.map(h=>Object.prototype.hasOwnProperty.call(registro,h)?registro[h]:''));
    SpreadsheetApp.flush();
    return {
      exito:true,
      idEntrega:registro.ID_ENTREGA,
      idTarea:idTarea,
      idSesion:registro.ID_SESION,
      estado:'ENVIADA',
      fechaEnvio:registro.FECHA_ENVIO,
      mensaje:'La fotografía se guardó en Google Drive y la entrega quedó registrada en Google Sheets.'
    };
  } catch(e) {
    if(archivo) { try { archivo.setTrashed(true); } catch(_e) {} }
    throw new Error('No se pudo guardar la evidencia. No se registró como entregada. '+(e.message||e));
  } finally {
    lock.releaseLock();
  }
}

/** Devuelve entregas para la bandeja privada del Portal de Catequistas. */
function getEntregasTareasCatequista_(idCatequista,estadoFiltro) {
  const idCat=String(idCatequista||'').trim().toUpperCase();
  const perfil=getPerfilCatequista_(idCat);
  if(!perfil||!perfil.exito) throw new Error('La cuenta de catequista no está activa.');
  const hoja=getSpreadsheet().getSheetByName(HOJA_ENTREGAS_TAREAS_V7);
  if(!hoja||hoja.getLastRow()<2) return {exito:true,total:0,datos:[]};
  const alumnos=getSheetData(CONFIG.SHEET_CATEQUIZANDOS);
  const sesiones=getSheetData(CONFIG.SHEET_SESIONES);
  const tareas=getSheetData(CONFIG.SHEET_TAREAS);
  const alumnoPorId={},sesionPorId={},tareaPorId={};
  alumnos.forEach(a=>{alumnoPorId[String(a.ID_NINO||'').trim()] = a;});
  sesiones.forEach(s=>{sesionPorId[_quizNormalizarIdSesion_(s.ID_SESION)] = s;});
  tareas.forEach(t=>{tareaPorId[String(t.ID_TAREA||'').trim().toUpperCase()] = t;});
  const filtro=String(estadoFiltro||'').trim().toUpperCase();
  const datos=getSheetData(HOJA_ENTREGAS_TAREAS_V7).map(e=>{
    const alumno=alumnoPorId[String(e.ID_NINO||'').trim()]||{};
    const tarea=tareaPorId[String(e.ID_TAREA||'').trim().toUpperCase()]||{};
    const sesion=sesionPorId[_quizNormalizarIdSesion_(e.ID_SESION)]||{};
    return Object.assign({},e,{
      TEMA:String(tarea.TITULO||sesion.TEMA||e.ID_TAREA||''),
      NOMBRE_CATEQUIZANDO:String(e.NOMBRE_CATEQUIZANDO||[alumno.NOMBRES,alumno.APELLIDOS].filter(Boolean).join(' ')),
      GRADO:String(alumno.GRADO||''),
      BLOQUE:String(sesion.BLOQUE||''),
      ESTADO_REVISION:String(e.ESTADO_REVISION||'ENVIADA').toUpperCase()
    });
  }).filter(e=>!filtro || e.ESTADO_REVISION===filtro);
  datos.sort((a,b)=>new Date(b.FECHA_ENVIO||0).getTime()-new Date(a.FECHA_ENVIO||0).getTime());
  return {exito:true,total:datos.length,datos:datos.slice(0,250),catequista:perfil.perfil.nombre};
}

/** Registra revisión u observación de una entrega por una catequista activa. */
function revisarEntregaTarea_(data,idCatequista) {
  const idEntrega=String(data.idEntrega||'').trim();
  const estado=String(data.estado||'').trim().toUpperCase();
  const observacion=String(data.observacion||'').trim().slice(0,1200);
  if(!idEntrega) throw new Error('No se recibió el identificador de la entrega.');
  if(['REVISADA','CORREGIR'].indexOf(estado)<0) throw new Error('El estado debe ser REVISADA o CORREGIR.');
  const perfil=getPerfilCatequista_(idCatequista);
  if(!perfil||!perfil.exito) throw new Error('La cuenta de catequista no está activa.');
  const hoja=getSpreadsheet().getSheetByName(HOJA_ENTREGAS_TAREAS_V7);
  if(!hoja||hoja.getLastRow()<2) throw new Error('No hay entregas para revisar.');
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lastRow=hoja.getLastRow(),lastCol=hoja.getLastColumn();
    const encabezados=hoja.getRange(1,1,1,lastCol).getDisplayValues()[0].map(_normalizarEncabezadoPrograma_);
    const idxId=encabezados.indexOf('IDENTREGA')+1;
    const idxEstado=encabezados.indexOf('ESTADOREVISION')+1;
    const idxObs=encabezados.indexOf('OBSERVACIONCATEQUISTA')+1;
    const idxFecha=encabezados.indexOf('FECHAREVISION')+1;
    const idxCat=encabezados.indexOf('IDCATEQUISTAREVISA')+1;
    if(!idxId||!idxEstado||!idxObs||!idxFecha||!idxCat) throw new Error('La hoja ENTREGAS_TAREAS no tiene todos los encabezados necesarios.');
    const ids=hoja.getRange(2,idxId,lastRow-1,1).getDisplayValues();
    let fila=0;
    for(let i=0;i<ids.length;i++) if(String(ids[i][0]||'').trim()===idEntrega){fila=i+2;break;}
    if(!fila) throw new Error('No se encontró la entrega seleccionada.');
    hoja.getRange(fila,idxEstado).setValue(estado);
    hoja.getRange(fila,idxObs).setValue(observacion);
    hoja.getRange(fila,idxFecha).setValue(new Date());
    hoja.getRange(fila,idxCat).setValue(String(idCatequista||''));
    SpreadsheetApp.flush();
    return {exito:true,idEntrega:idEntrega,estado:estado,mensaje:estado==='REVISADA'?'Evidencia marcada como revisada.':'Se solicitó corregir la evidencia.'};
  } finally {
    lock.releaseLock();
  }
}


function getTareasNino_(idNino, idSesion) {
  const id = String(idNino || '').trim().toUpperCase();
  const sesion = String(idSesion || '').trim();
  const datos = getSheetData(CONFIG.SHEET_TAREAS).filter(x => String(x.ID_TAREA || '').trim());
  const entregas = _tareasUltimasEntregasPorAlumno_(id);
  const filtradas = datos.filter(item => {
    const idAsignado = String(item.ID_NINO || item.ID_CATEQUIZANDO || '').trim().toUpperCase();
    const asignada = !idAsignado || idAsignado === id;
    const estadoCatalogo = String(item.ESTADO || '').trim().toUpperCase();
    const activa = !['INACTIVA', 'INACTIVO', 'CANCELADA', 'CANCELADO', 'BORRADOR'].includes(estadoCatalogo);
    const coincideSesion = !sesion || _quizNormalizarIdSesion_(item.ID_SESION) === _quizNormalizarIdSesion_(sesion);
    return asignada && activa && coincideSesion;
  }).map(item => {
    const clave = String(item.ID_TAREA || '').trim();
    const entrega = entregas[clave] || {};
    return Object.assign({}, item, {
      EVIDENCIA_INSTRUCCION: String(item.OBSERVACION || '').replace(/^EVIDENCIA\s+FOTOGR[AÁ]FICA\s+OBLIGATORIA\s*:\s*/i, '').trim(),
      ESTADO_ENTREGA: String(entrega.ESTADO_REVISION || 'PENDIENTE').trim().toUpperCase(),
      EVIDENCIA_URL_ALUMNO: String(entrega.EVIDENCIA_URL || '').trim(),
      FECHA_ENVIO_EVIDENCIA: entrega.FECHA_ENVIO || '',
      OBSERVACION_CATEQUISTA: String(entrega.OBSERVACION_CATEQUISTA || '').trim(),
      ID_ENTREGA_ACTUAL: String(entrega.ID_ENTREGA || '').trim()
    });
  });
  return { exito: true, total: filtradas.length, datos: filtradas };
}

function getAvisosNino_(idNino) {
  const id = String(idNino || '').trim().toUpperCase();
  const filas = getSheetData(CONFIG.SHEET_AVISOS);
  if (!filas.length) return { exito: true, total: 0, datos: [] };

  const usaEsquemaMensajes = Object.prototype.hasOwnProperty.call(filas[0], 'ID_MENSAJE') ||
    Object.prototype.hasOwnProperty.call(filas[0], 'TIPO_DESTINATARIO');

  if (usaEsquemaMensajes) {
    const grupos = ['CATEQUIZANDO', 'ALUMNO', 'ESTUDIANTE', 'TODOS', 'GENERAL', 'GRUPO', 'TODOS LOS CATEQUIZANDOS'];
    const datos = filas.filter(function(item) {
      const estado = String(item.ESTADO || '').trim().toUpperCase();
      const observaciones = String(item.OBSERVACIONES || '').toUpperCase();
      if (observaciones.indexOf('ELIMINADO') >= 0 || ['ELIMINADO', 'BORRADO', 'CANCELADO', 'BORRADOR'].indexOf(estado) >= 0) return false;
      const tipoDestino = String(item.TIPO_DESTINATARIO || '').trim().toUpperCase();
      const idDestino = String(item.ID_DESTINATARIO || '').trim().toUpperCase();
      const nombreDestino = String(item.DESTINATARIO || '').trim().toUpperCase();
      const paraEsteNino = idDestino === id || grupos.indexOf(tipoDestino) >= 0 && (!idDestino || ['TODOS', 'GENERAL', 'GRUPO', 'TODOS LOS CATEQUIZANDOS'].indexOf(idDestino) >= 0) || nombreDestino === id;
      const esPublicable = ['ENVIADO', 'PUBLICADO', 'RECIBIDO', 'LEIDO', 'LEÍDO', 'ATENDIDO', 'RESPONDIDO'].indexOf(estado) >= 0;
      const tipoRemitente = String(item.TIPO_REMITENTE || '').trim().toUpperCase();
      return paraEsteNino && esPublicable && ['CATEQUIZANDO', 'ALUMNO', 'ESTUDIANTE'].indexOf(tipoRemitente) < 0;
    }).map(function(item) {
      const estado = String(item.ESTADO || '').trim().toUpperCase();
      return {
        ID_AVISO: item.ID_MENSAJE || item.ID_AVISO || '',
        ID_MENSAJE: item.ID_MENSAJE || item.ID_AVISO || '',
        FECHA: item.FECHA_ENVIO || item.FECHA || '',
        TITULO: item.ASUNTO || item.TITULO || 'Comunicado',
        ASUNTO: item.ASUNTO || item.TITULO || 'Comunicado',
        MENSAJE: item.MENSAJE || '',
        REMITENTE: item.REMITENTE || '',
        TIPO_REMITENTE: item.TIPO_REMITENTE || '',
        DIRIGIDO_A: item.DESTINATARIO || item.DIRIGIDO_A || '',
        DESTINATARIO: item.DESTINATARIO || item.DIRIGIDO_A || '',
        TIPO_DESTINATARIO: item.TIPO_DESTINATARIO || '',
        ID_DESTINATARIO: item.ID_DESTINATARIO || '',
        PUBLICADO: ['ENVIADO', 'PUBLICADO'].indexOf(estado) >= 0 ? 'SI' : 'NO',
        ESTADO: item.ESTADO || '',
        WHATSAPP_LINK: item.WHATSAPP_LINK || '',
        ES_NO_LEIDO: !item.FECHA_LECTURA && ['LEIDO', 'LEÍDO', 'ATENDIDO', 'RESPONDIDO'].indexOf(estado) < 0
      };
    });
    datos.sort(function(a, b) { return new Date(b.FECHA || 0).getTime() - new Date(a.FECHA || 0).getTime(); });
    return { exito: true, total: datos.length, datos: datos };
  }

  const datos = filas.filter(function(item) {
    const pub = String(item.PUBLICADO || '').trim().toUpperCase();
    if (['SI', 'SÍ', 'TRUE', '1', 'PUBLICADO'].indexOf(pub) < 0) return false;
    const destino = String(item.DIRIGIDO_A || 'TODOS').trim().toUpperCase();
    return ['TODOS', 'PADRES', 'FAMILIAS', 'GENERAL', 'TODOS LOS CATEQUIZANDOS', ''].indexOf(destino) >= 0 || destino === id;
  }).map(function(item) {
    return {
      ID_AVISO: item.ID_AVISO || '', FECHA: item.FECHA || '', TITULO: item.TITULO || '',
      MENSAJE: item.MENSAJE || '', DIRIGIDO_A: item.DIRIGIDO_A || '',
      TIPO_REMITENTE: item.TIPO_REMITENTE || '', REMITENTE: item.REMITENTE || '',
      WHATSAPP_LINK: item.WHATSAPP_LINK || '', PUBLICADO: item.PUBLICADO || 'SI'
    };
  });
  datos.sort(function(a, b) { return String(b.FECHA).localeCompare(String(a.FECHA)); });
  return { exito: true, total: datos.length, datos: datos };
}

/* =========================================================
   ACCESO INDIVIDUAL DE CATEQUISTAS — PIN EN GOOGLE SHEETS
   Credenciales almacenadas en la pestaña CATEQUISTAS.
   ========================================================= */
function _normalizarPINCatequista_(valor) {
  return String(valor == null ? '' : valor)
    .normalize('NFKC')
    .trim()
    .replace(/[\s\-‐‑‒–—]/g, '')
    .toUpperCase();
}

function _crearTokenCatequistaPortal_(idCatequista) {
  const props = PropertiesService.getScriptProperties();
  let secreto = props.getProperty('CATEQUISTAS_TOKEN_SECRET');
  if (!secreto) {
    secreto = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('CATEQUISTAS_TOKEN_SECRET', secreto);
  }
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    id: String(idCatequista),
    exp: Date.now() + 8 * 60 * 60 * 1000
  }));
  const firma = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, secreto)
  );
  return payload + '.' + firma;
}

function validarTokenCatequistaPortal_(token) {
  try {
    const partes = String(token || '').split('.');
    if (partes.length !== 2) return '';
    const secreto = PropertiesService.getScriptProperties().getProperty('CATEQUISTAS_TOKEN_SECRET');
    if (!secreto) return '';
    const firma = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(partes[0], secreto)
    );
    if (firma !== partes[1]) return '';
    const payload = JSON.parse(
      Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString()
    );
    if (!payload.id || !payload.exp || Date.now() > Number(payload.exp)) return '';

    // La cuenta debe seguir activa en la hoja. Revocar ACTIVO corta el acceso.
    const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUISTAS);
    if (!hoja || hoja.getLastRow() < 2) return '';
    const datos = _leerTablaPrograma_(hoja);
    const cuenta = datos.find(f => String(f.IDCATEQUISTA || '').trim().toUpperCase() === String(payload.id).trim().toUpperCase());
    if (!cuenta) return '';
    const estado = String(cuenta.ACTIVO == null ? 'SI' : cuenta.ACTIVO).trim().toUpperCase();
    if (estado && ['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'].indexOf(estado) < 0) return '';
    return String(payload.id);
  } catch (e) {
    return '';
  }
}

/**
 * Devuelve únicamente los catequistas activos para el selector de acceso.
 * Lee los identificadores y nombres de la hoja CATEQUISTAS.
 * Nunca devuelve DNI, PIN, correo ni otros datos privados.
 */
function listarCatequistasActivas_() {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUISTAS);
  if (!hoja) {
    return { exito:false, mensaje:'No existe la pestaña CATEQUISTAS en Google Sheets.', catequistas:[] };
  }

  const filas = _leerTablaPrograma_(hoja);
  const permitidos = ['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'];
  const catequistas = filas
    .filter(function(fila) {
      const id = String(fila.IDCATEQUISTA || '').trim();
      const activo = String(fila.ACTIVO == null ? '' : fila.ACTIVO).trim().toUpperCase();
      return id && permitidos.indexOf(activo) >= 0;
    })
    .map(function(fila) {
      return {
        id: String(fila.IDCATEQUISTA || '').trim(),
        nombre: [String(fila.NOMBRES || '').trim(), String(fila.APELLIDOS || '').trim()]
          .filter(Boolean).join(' '),
        cargo: String(fila.CARGO || 'Catequista').trim()
      };
    })
    .filter(function(catequista) {
      return catequista.nombre;
    });

  return { exito:true, catequistas:catequistas };
}

function validarLoginCatequista_(idIngresado, pinIngresado) {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUISTAS);
  if (!hoja) return { exito:false, mensaje:'No existe la pestaña CATEQUISTAS en Google Sheets.' };
  if (hoja.getLastRow() < 2) return { exito:false, mensaje:'La pestaña CATEQUISTAS no tiene cuentas registradas.' };

  const filas = _leerTablaPrograma_(hoja);
  const id = String(idIngresado || '').trim().toUpperCase();
  const pin = _normalizarPINCatequista_(pinIngresado);
  if (!id || !pin) return { exito:false, mensaje:'Ingrese su código de catequista y su PIN.' };

  const coincidencias = filas.filter(f => String(f.IDCATEQUISTA || '').trim().toUpperCase() === id);
  if (!coincidencias.length) return { exito:false, mensaje:'Código de catequista no encontrado en la hoja CATEQUISTAS.' };
  if (coincidencias.length > 1) return { exito:false, mensaje:'El ID de catequista está duplicado en CATEQUISTAS. Debe ser único.' };

  const cuenta = coincidencias[0];
  const activo = String(cuenta.ACTIVO == null ? 'SI' : cuenta.ACTIVO).trim().toUpperCase();
  if (activo && ['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'].indexOf(activo) < 0) {
    return { exito:false, mensaje:'Esta cuenta de catequista está desactivada. Consulte con coordinación.' };
  }
  const pinGuardado = _normalizarPINCatequista_(cuenta.PIN);
  if (!pinGuardado) return { exito:false, mensaje:'Esta catequista todavía no tiene PIN. Ejecute configurarCatequistasYPines() o registre uno en la columna PIN.' };
  if (pinGuardado !== pin) return { exito:false, mensaje:'Código o PIN de catequista incorrecto.' };

  const token = _crearTokenCatequistaPortal_(id);
  return {
    exito:true,
    mensaje:'Acceso autorizado.',
    token:token,
    duracionSegundos:28800,
    perfil:(function(){
      const esAdmin = esAdministradoraCatequista_(id);
      return {
        id:id,
        nombre:[String(cuenta.NOMBRES || '').trim(), String(cuenta.APELLIDOS || '').trim()].filter(Boolean).join(' '),
        cargo:String(cuenta.CARGO || 'Catequista').trim(),
        correo:String(cuenta.CORREO || '').trim(),
        administradora:esAdmin,
        rol:esAdmin ? 'ADMINISTRADORA' : 'CATEQUISTA'
      };
    })()
  };
}

/**
 * Compatibilidad con el nombre de la función anterior.
 * Esta versión es SOLO DE LECTURA: no crea cuentas, no cambia códigos
 * y no genera ni reemplaza PIN. Las cuentas se administran en la hoja
 * CATEQUISTAS de Google Sheets.
 */
function configurarCatequistasYPines() {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUISTAS);
  if (!hoja) {
    throw new Error('No existe la pestaña CATEQUISTAS en Google Sheets.');
  }

  const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn())
    .getDisplayValues()[0]
    .map(_normalizarEncabezadoPrograma_);

  const requeridos = ['ID_CATEQUISTA','NOMBRES','APELLIDOS','CARGO','PIN','CORREO','ACTIVO'];
  const faltantes = requeridos.filter(function(nombre) {
    return encabezados.indexOf(_normalizarEncabezadoPrograma_(nombre)) < 0;
  });
  if (faltantes.length) {
    throw new Error('Faltan encabezados en CATEQUISTAS: ' + faltantes.join(', '));
  }

  const datos = _leerTablaPrograma_(hoja);
  const activos = datos.filter(function(fila) {
    const activo = String(fila.ACTIVO == null ? '' : fila.ACTIVO).trim().toUpperCase();
    return String(fila.IDCATEQUISTA || '').trim() &&
      ['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'].indexOf(activo) >= 0;
  });

  return {
    exito: true,
    totalRegistros: datos.length,
    totalActivos: activos.length,
    mensaje: 'Verificación completada. No se crearon registros ni se modificaron códigos o PIN.'
  };
}

/** Confirma la identidad activa y entrega solo el perfil de la sesión. */
function getPerfilCatequista_(idCatequista) {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUISTAS);
  if (!hoja) throw new Error('No existe la pestaña CATEQUISTAS.');
  const f = _leerTablaPrograma_(hoja).find(x => String(x.IDCATEQUISTA || '').trim().toUpperCase() === String(idCatequista || '').trim().toUpperCase());
  if (!f) throw new Error('La cuenta de catequista ya no está registrada.');
  const id = String(f.IDCATEQUISTA || '').trim();
  return {exito:true,perfil:{id:id,nombre:[String(f.NOMBRES || '').trim(),String(f.APELLIDOS || '').trim()].filter(Boolean).join(' '),cargo:String(f.CARGO || 'Catequista'),correo:String(f.CORREO || ''),administradora:esAdministradoraCatequista_(id),rol:esAdministradoraCatequista_(id)?'ADMINISTRADORA':'CATEQUISTA'}};
}

/**
 * Lily y Kiara son administradoras por sus IDs institucionales.
 * No requiere agregar columnas ni alterar la hoja CATEQUISTAS.
 * Además comprueba que el registro exista una sola vez y siga activo.
 */
function esAdministradoraCatequista_(idCatequista) {
  const id = String(idCatequista || '').trim().toUpperCase();
  if (!id || IDS_ADMINISTRADORAS_CATEQUISTAS.indexOf(id) < 0) return false;
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUISTAS);
  if (!hoja || hoja.getLastRow() < 2) return false;
  const filas = _leerTablaPrograma_(hoja);
  const coincidencias = filas.filter(function(f) {
    return String(f.IDCATEQUISTA || '').trim().toUpperCase() === id;
  });
  if (coincidencias.length !== 1) return false;
  const activo = String(coincidencias[0].ACTIVO == null ? '' : coincidencias[0].ACTIVO).trim().toUpperCase();
  return ['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'].indexOf(activo) >= 0;
}

/** Devuelve el directorio administrativo sin exponer DNI, PIN ni correo. */
function getAdminCatequistas_() {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUISTAS);
  if (!hoja) throw new Error('No existe la pestaña CATEQUISTAS en Google Sheets.');
  const filas = _leerTablaPrograma_(hoja);
  const catequistas = filas.map(function(f) {
    const id = String(f.IDCATEQUISTA || '').trim();
    const estado = String(f.ACTIVO == null ? '' : f.ACTIVO).trim().toUpperCase();
    return {
      id:id,
      nombre:[String(f.NOMBRES || '').trim(),String(f.APELLIDOS || '').trim()].filter(Boolean).join(' '),
      cargo:String(f.CARGO || 'Catequista'),
      rol:esAdministradoraCatequista_(id) ? 'ADMINISTRADORA' : 'CATEQUISTA',
      activo:!estado || ['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'].indexOf(estado) >= 0,
      administradora:esAdministradoraCatequista_(id)
    };
  }).filter(function(x){return x.id && x.nombre;});
  return {exito:true,total:catequistas.length,catequistas:catequistas};
}

/** Cambia exclusivamente ACTIVO; nunca modifica identificadores, PIN ni datos personales. */
function actualizarEstadoCatequistaAdmin_(idAdmin, idObjetivo, activo) {
  const objetivo = String(idObjetivo || '').trim().toUpperCase();
  if (!objetivo) throw new Error('Falta el identificador de la catequista.');
  if (esAdministradoraCatequista_(objetivo)) throw new Error('No se puede desactivar ni modificar el estado de una administradora principal.');
  if (typeof activo !== 'boolean') throw new Error('El estado solicitado no es válido.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Hay otra actualización en curso. Intente nuevamente.');
  try {
    const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUISTAS);
    if (!hoja) throw new Error('No existe la pestaña CATEQUISTAS.');
    const lastRow = hoja.getLastRow(), lastCol = hoja.getLastColumn();
    if (lastRow < 2) throw new Error('No hay catequistas registradas.');
    const encabezados = hoja.getRange(1,1,1,lastCol).getDisplayValues()[0].map(_normalizarEncabezadoPrograma_);
    const colId = encabezados.indexOf('IDCATEQUISTA') + 1;
    const colActivo = encabezados.indexOf('ACTIVO') + 1;
    if (!colId || !colActivo) throw new Error('Faltan las columnas ID_CATEQUISTA o ACTIVO en CATEQUISTAS.');
    const ids = hoja.getRange(2,colId,lastRow-1,1).getDisplayValues();
    const coincidencias = [];
    ids.forEach(function(r,i){if(String(r[0] || '').trim().toUpperCase() === objetivo) coincidencias.push(i+2);});
    if (coincidencias.length !== 1) throw new Error(coincidencias.length ? 'El ID está duplicado. No se modificó la hoja.' : 'No se encontró la catequista indicada.');
    hoja.getRange(coincidencias[0],colActivo).setValue(activo ? 'SI' : 'NO');
    SpreadsheetApp.flush();
    return {exito:true,mensaje:'Estado actualizado en Google Sheets.',idCatequista:objetivo,activo:activo};
  } finally { lock.releaseLock(); }
}

/**
 * Lista pública mínima para el selector del Portal de Padres.
 * No devuelve PADRE_ID, PIN, DNI, teléfonos ni correos.
 * Cada opción usa un identificador HMAC opaco que solo el servidor puede resolver.
 */
function listarOpcionesLoginPadres_() {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_PADRES);
  if (!hoja) return { exito:false, mensaje:'No existe la hoja PADRES en Google Sheets.' };
  const ultimaFila = hoja.getLastRow();
  const ultimaColumna = hoja.getLastColumn();
  if (ultimaFila < 2 || ultimaColumna < 1) return { exito:true, total:0, datos:[] };
  const valores = hoja.getRange(1,1,ultimaFila,ultimaColumna).getDisplayValues();
  const encabezados = valores[0].map(_normalizarEncabezadoPrograma_);
  const buscar = aliases => {
    for (const alias of aliases) {
      const i = encabezados.indexOf(_normalizarEncabezadoPrograma_(alias));
      if (i >= 0) return i;
    }
    return -1;
  };
  const cCodigo = buscar(['PADRE_ID','ID_PADRE','CODIGO']);
  const cNombres = buscar(['NOMBRES']);
  const cApellidos = buscar(['APELLIDOS']);
  const cParentesco = buscar(['PARENTESCO']);
  if (cCodigo < 0) return { exito:false, mensaje:'No se encontró PADRE_ID en la hoja PADRES.' };
  const secreto = _secretoPadres_();
  const vistos = Object.create(null);
  const datos = [];
  for (let r=1; r<valores.length; r++) {
    const fila = valores[r];
    const codigo = String(fila[cCodigo] || '').trim();
    if (!codigo) continue;
    const nombre = [cNombres>=0 ? String(fila[cNombres]||'').trim() : '', cApellidos>=0 ? String(fila[cApellidos]||'').trim() : ''].filter(Boolean).join(' ').trim();
    if (!nombre) continue;
    const parentesco = cParentesco>=0 ? String(fila[cParentesco]||'').trim() : '';
    const etiqueta = parentesco ? nombre + ' — ' + parentesco : nombre;
    const selector = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('LOGIN_SELECTOR|' + codigo.toUpperCase(), secreto)).replace(/=+$/,'');
    if (vistos[selector]) continue;
    vistos[selector] = true;
    datos.push({selector:selector, nombre:etiqueta});
  }
  datos.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
  return {exito:true,total:datos.length,datos:datos};
}

/** Resuelve el identificador opaco y valida el PIN existente sin mostrar el código familiar. */
function validarLoginPadreSeleccion_(selector, clave) {
  const buscado = String(selector || '').trim();
  if (!buscado) return {exito:false,mensaje:'Selecciona tu nombre de la lista.'};
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_PADRES);
  if (!hoja) return {exito:false,mensaje:'No existe la hoja PADRES en Google Sheets.'};
  const ultimaFila = hoja.getLastRow(), ultimaColumna = hoja.getLastColumn();
  if (ultimaFila < 2 || ultimaColumna < 1) return {exito:false,mensaje:'No hay familias registradas.'};
  const valores = hoja.getRange(1,1,ultimaFila,ultimaColumna).getDisplayValues();
  const encabezados = valores[0].map(_normalizarEncabezadoPrograma_);
  const cCodigo = ['PADRE_ID','ID_PADRE','CODIGO'].map(_normalizarEncabezadoPrograma_).map(h=>encabezados.indexOf(h)).find(i=>i>=0);
  const indiceCodigo = cCodigo == null ? -1 : cCodigo;
  if (indiceCodigo < 0) return {exito:false,mensaje:'No se encontró PADRE_ID en la hoja PADRES.'};
  const secreto = _secretoPadres_();
  for (let r=1; r<valores.length; r++) {
    const codigo = String(valores[r][indiceCodigo] || '').trim();
    if (!codigo) continue;
    const esperado = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('LOGIN_SELECTOR|' + codigo.toUpperCase(), secreto)).replace(/=+$/,'');
    if (esperado === buscado) return validarLoginPadre(codigo, clave);
  }
  return {exito:false,mensaje:'No se encontró el nombre seleccionado. Actualiza la lista e inténtalo nuevamente.'};
}

function _secretoPadres_() {
  const props = PropertiesService.getScriptProperties();
  let secreto = props.getProperty('PADRES_TOKEN_SECRET');
  if (!secreto) { secreto = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('PADRES_TOKEN_SECRET', secreto); }
  return secreto;
}

function _normalizarPINFamilia_(valor) {
  // Acepta el PIN copiado de Sheets con o sin guiones/espacios.
  return String(valor == null ? '' : valor)
    .normalize('NFKC')
    .trim()
    .replace(/[\s\-‐‑‒–—]/g, '')
    .toUpperCase();
}

function validarLoginPadre(codigo, clave) {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_PADRES);
  if (!hoja) return { exito:false, mensaje:'No existe la hoja PADRES en Google Sheets.' };

  const ultimaFila = hoja.getLastRow();
  const ultimaColumna = hoja.getLastColumn();
  if (ultimaFila < 2 || ultimaColumna < 1) {
    return { exito:false, mensaje:'La hoja PADRES no contiene familias registradas.' };
  }

  // Usar valores visibles es importante: conserva ceros iniciales y PIN de texto.
  const valores = hoja.getRange(1, 1, ultimaFila, ultimaColumna).getDisplayValues();
  const encabezados = valores[0].map(_normalizarEncabezadoPrograma_);
  const buscarColumna = function(alias) {
    for (let i = 0; i < alias.length; i++) {
      const indice = encabezados.indexOf(_normalizarEncabezadoPrograma_(alias[i]));
      if (indice >= 0) return indice;
    }
    return -1;
  };

  const colCodigo = buscarColumna(['PADRE_ID', 'ID_PADRE', 'CODIGO']);
  const colPin = buscarColumna(['PIN FAMILIAR', 'PIN', 'CLAVE', 'PASSWORD', 'CLAVE DE ACCESO']);
  const colNombres = buscarColumna(['NOMBRES']);
  const colApellidos = buscarColumna(['APELLIDOS']);
  const colParentesco = buscarColumna(['PARENTESCO']);

  if (colCodigo < 0) return { exito:false, mensaje:'No se encontró la columna PADRE_ID en la hoja PADRES.' };
  if (colPin < 0) return { exito:false, mensaje:'No se encontró la columna PIN FAMILIAR en la hoja PADRES.' };

  const codigoBuscado = String(codigo || '').trim().toUpperCase();
  const pinIngresado = _normalizarPINFamilia_(clave);
  if (!codigoBuscado || !pinIngresado) {
    return { exito:false, mensaje:'Ingrese su código familiar y el PIN.' };
  }

  let filaPadre = null;
  for (let r = 1; r < valores.length; r++) {
    if (String(valores[r][colCodigo] || '').trim().toUpperCase() === codigoBuscado) {
      filaPadre = valores[r];
      break;
    }
  }

  if (!filaPadre) {
    return { exito:false, mensaje:'Código de padre/madre no encontrado en la hoja PADRES.' };
  }

  const pinGuardado = _normalizarPINFamilia_(filaPadre[colPin]);
  if (!pinGuardado) {
    return { exito:false, mensaje:'Esta familia todavía no tiene PIN registrado en la columna PIN FAMILIAR.' };
  }

  // Se toleran guiones y espacios, pero los números/caracteres del PIN deben coincidir.
  if (pinGuardado !== pinIngresado) {
    return { exito:false, mensaje:'El PIN no coincide con el registrado. Copie el contenido completo de PIN FAMILIAR en PADRES; puede ingresarlo con o sin guion.' };
  }

  const token = crearTokenPadre_(codigoBuscado);
  return {
    exito:true,
    mensaje:'Acceso autorizado',
    token:token,
    perfil:{
      codigo:codigoBuscado,
      nombre:[
        colNombres >= 0 ? String(filaPadre[colNombres] || '').trim() : '',
        colApellidos >= 0 ? String(filaPadre[colApellidos] || '').trim() : ''
      ].filter(Boolean).join(' '),
      parentesco:colParentesco >= 0 ? String(filaPadre[colParentesco] || '').trim() : ''
    }
  };
}

function crearTokenPadre_(codigo) {
  const secreto = _secretoPadres_();
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ c: codigo, exp: Date.now() + 8 * 60 * 60 * 1000 }));
  const firma = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secreto));
  return payload + '.' + firma;
}

function validarTokenPadre_(token) {
  try {
    const partes = String(token || '').split('.');
    if (partes.length !== 2) return '';
    const secreto = PropertiesService.getScriptProperties().getProperty('PADRES_TOKEN_SECRET');
    if (!secreto) return '';
    const firma = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(partes[0], secreto));
    if (firma !== partes[1]) return '';
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString());
    if (!payload.c || !payload.exp || Date.now() > Number(payload.exp)) return '';
    return String(payload.c);
  } catch (e) { return ''; }
}

/** Cumpleaños de los padres de la familia autenticada, leídos de PADRES. */
function getCumpleanosPadres_(codigoPadre) {
  const padres = getPadres().datos.filter(p => String(p.PADRE_ID) === String(codigoPadre));
  const datos = padres.map(p => ({
    PADRE_ID:p.PADRE_ID, NOMBRE_COMPLETO:p.NOMBRE_COMPLETO,
    PARENTESCO:p.PARENTESCO, CUMPLEANOS:p.CUMPLEANOS || ''
  })).filter(p => p.CUMPLEANOS);
  return {exito:true,total:datos.length,datos:datos};
}

/**
 * Ejecutar UNA VEZ desde el editor de Apps Script para asignar PIN de seis
 * dígitos a las familias que aún no tengan uno. Reutiliza/crea el encabezado
 * PIN FAMILIAR en PADRES y no modifica los PIN existentes.
 */
function configurarPinesFamiliares() {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_PADRES);
  if (!hoja) throw new Error('No existe la hoja PADRES.');
  const ultimaCol = Math.max(1, hoja.getLastColumn());
  const encabezados = hoja.getRange(1,1,1,ultimaCol).getDisplayValues()[0].map(v=>String(v).trim());
  let col = encabezados.findIndex(h=>['PINFAMILIAR','PIN','CLAVE','PASSWORD'].includes(_normalizarEncabezadoPrograma_(h))) + 1;
  if (!col) { col = ultimaCol + 1; hoja.getRange(1,col).setValue('PIN FAMILIAR'); }
  const valores = hoja.getDataRange().getDisplayValues();
  const colCodigo = encabezados.findIndex(h=>['PADREID','IDPADRE','CODIGO'].includes(_normalizarEncabezadoPrograma_(h)));
  if (colCodigo < 0) throw new Error('No se encontró la columna PADRE_ID en PADRES.');
  const salida=[];
  for (let r=1;r<valores.length;r++) {
    const codigo=String(valores[r][colCodigo]||'').trim();
    if (!codigo) continue;
    let pin=String(hoja.getRange(r+1,col).getDisplayValue()||'').trim();
    if (!pin) {
      pin=String(Math.floor(100000+Math.random()*900000));
      hoja.getRange(r+1,col).setNumberFormat('@').setValue(pin);
    }
    salida.push({codigo:codigo,pin:pin});
  }
  SpreadsheetApp.flush();
  return {exito:true,total:salida.length,credenciales:salida,mensaje:'PIN familiar configurado. Entregue cada PIN únicamente a su familia.'};
}

/**
 * VIDEOS POR TEMA — biblioteca liviana de enlaces externos.
 * La hoja se crea al primer guardado desde el panel de administradoras.
 * El catálogo admite hasta seis videos activos por ID_SESION.
 */
function _videosObtenerHojaV8_(crear) {
  const ss = getSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_VIDEOS_TEMAS_V8);
  const encabezados = ['ID_VIDEO','ID_SESION','TITULO_VIDEO','DESCRIPCION','VIDEO_URL','ORDEN','ACTIVO','FECHA_REGISTRO','REGISTRADO_POR'];
  if (!hoja && crear) {
    hoja = ss.insertSheet(HOJA_VIDEOS_TEMAS_V8);
    hoja.getRange(1,1,1,encabezados.length).setValues([encabezados]);
    hoja.setFrozenRows(1);
    hoja.getRange(1,1,1,encabezados.length).setFontWeight('bold');
  }
  if (!hoja) return null;
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1,1,1,encabezados.length).setValues([encabezados]);
    hoja.setFrozenRows(1);
  } else {
    _asegurarColumnasEnHoja_(hoja, encabezados);
  }
  return hoja;
}

function _videosUrlValidaV8_(url) {
  const valor = String(url || '').trim();
  if (valor.length > 1000) return false;
  return /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|drive\.google\.com|vimeo\.com)\//i.test(valor);
}

function guardarVideoTemaV8_(data, idAdministradora) {
  if (!esAdministradoraCatequista_(idAdministradora)) {
    throw new Error('Solo las administradoras principales pueden registrar videos.');
  }
  const idSesion = String(data.idSesion || '').trim();
  const titulo = String(data.titulo || '').trim();
  const descripcion = String(data.descripcion || '').trim();
  const url = String(data.url || '').trim();
  if (!idSesion || !titulo || !url) throw new Error('Selecciona el tema y escribe el título y enlace del video.');
  if (titulo.length > 120) throw new Error('El título del video no debe superar 120 caracteres.');
  if (descripcion.length > 350) throw new Error('La descripción no debe superar 350 caracteres.');
  if (!_videosUrlValidaV8_(url)) throw new Error('Usa un enlace HTTPS de YouTube, Vimeo o Google Drive compartido para visualizar.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const hojaSesiones = getSpreadsheet().getSheetByName(CONFIG.SHEET_SESIONES);
    if (!hojaSesiones) throw new Error('No existe la hoja SESIONES.');
    const sesiones = _leerTablaPrograma_(hojaSesiones);
    const sesion = sesiones.find(f => _quizNormalizarIdSesion_(f.IDSESION) === _quizNormalizarIdSesion_(idSesion));
    if (!sesion) throw new Error('El tema seleccionado no existe en SESIONES.');

    const hoja = _videosObtenerHojaV8_(true);
    const videos = _leerTablaPrograma_(hoja).filter(f =>
      _quizNormalizarIdSesion_(f.IDSESION) === _quizNormalizarIdSesion_(idSesion) &&
      ['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'].indexOf(String(f.ACTIVO || '').trim().toUpperCase()) >= 0
    );
    if (videos.length >= MAX_VIDEOS_POR_TEMA_V8) {
      throw new Error('Este tema ya tiene seis videos activos. Desactiva uno antes de agregar otro.');
    }
    if (videos.some(f => String(f.VIDEOURL || '').trim().toLowerCase() === url.toLowerCase())) {
      throw new Error('Este enlace ya está registrado para el tema seleccionado.');
    }
    const maxOrden = videos.reduce((max, f) => Math.max(max, Number(f.ORDEN) || 0), 0);
    const idVideo = 'VID-' + Utilities.getUuid().replace(/-/g,'').substring(0,12).toUpperCase();
    hoja.appendRow([idVideo, idSesion, titulo, descripcion, url, maxOrden + 1, 'SI', new Date(), String(idAdministradora)]);
    SpreadsheetApp.flush();
    return {
      exito:true, idVideo:idVideo, idSesion:idSesion, titulo:titulo,
      totalVideos:videos.length + 1, maximo:MAX_VIDEOS_POR_TEMA_V8,
      mensaje:'Video registrado correctamente en VIDEOS_TEMAS.'
    };
  } finally {
    lock.releaseLock();
  }
}

function desactivarVideoTemaV8_(data, idAdministradora) {
  if (!esAdministradoraCatequista_(idAdministradora)) {
    throw new Error('Solo las administradoras principales pueden modificar la biblioteca de videos.');
  }
  const idVideo = String(data.idVideo || '').trim().toUpperCase();
  if (!idVideo) throw new Error('No se recibió el identificador del video.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const hoja = _videosObtenerHojaV8_(false);
    if (!hoja || hoja.getLastRow() < 2) throw new Error('No hay videos registrados.');
    const encabezados = hoja.getRange(1,1,1,hoja.getLastColumn()).getDisplayValues()[0].map(_normalizarEncabezadoPrograma_);
    const colId = encabezados.indexOf('IDVIDEO');
    const colActivo = encabezados.indexOf('ACTIVO');
    if (colId < 0 || colActivo < 0) throw new Error('La hoja VIDEOS_TEMAS no tiene las columnas necesarias.');
    const filas = hoja.getRange(2,1,hoja.getLastRow()-1,hoja.getLastColumn()).getDisplayValues();
    const indice = filas.findIndex(f => String(f[colId] || '').trim().toUpperCase() === idVideo);
    if (indice < 0) throw new Error('No se encontró el video solicitado.');
    hoja.getRange(indice + 2, colActivo + 1).setValue('NO');
    SpreadsheetApp.flush();
    return {exito:true,idVideo:idVideo,mensaje:'El video se retiró de la lista visible para los alumnos.'};
  } finally {
    lock.releaseLock();
  }
}

/**
 * PROGRAMACIÓN — fuente académica: SESIONES.
 * Calendario y asignación: CLASES.
 * Conserva la estructura de respuesta que ya consumía el HTML:
 * { exito, total, bloques: [{ title, subtitle, icon, sessions: [] }] }
 */
function getSesiones() {
  try {
    const ss = getSpreadsheet();
    const hojaSesiones = ss.getSheetByName(CONFIG.SHEET_SESIONES);
    const hojaClases = ss.getSheetByName(CONFIG.SHEET_CLASES);
    if (!hojaSesiones) throw new Error('No existe la hoja SESIONES.');
    if (!hojaClases) throw new Error('No existe la hoja CLASES.');

    // Recursos del portal: columnas nuevas al final de SESIONES, sin mover las existentes.
    _asegurarColumnasEnHoja_(hojaSesiones, [
      'FICHA_URL', 'VIDEO_URL', 'CUESTIONARIO_URL', 'CANCION_URL', 'RECURSOS_NOTAS'
    ]);

    const hojaTareas = ss.getSheetByName(CONFIG.SHEET_TAREAS);
    if (hojaTareas) _asegurarColumnasEnHoja_(hojaTareas, ['ID_SESION']);

    const hojaVideosTemas = ss.getSheetByName(HOJA_VIDEOS_TEMAS_V8);
    const datosVideosTemas = hojaVideosTemas ? _leerTablaPrograma_(hojaVideosTemas) : [];
    const videosPorSesion = {};
    datosVideosTemas.forEach(function(video) {
      const estadoVideo = String(video.ACTIVO || '').trim().toUpperCase();
      if (['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'].indexOf(estadoVideo) < 0) return;
      const claveSesion = _quizNormalizarIdSesion_(video.IDSESION);
      if (!claveSesion) return;
      if (!videosPorSesion[claveSesion]) videosPorSesion[claveSesion] = [];
      videosPorSesion[claveSesion].push({
        id: String(video.IDVIDEO || '').trim(),
        titulo: String(video.TITULOVIDEO || '').trim(),
        descripcion: String(video.DESCRIPCION || '').trim(),
        url: String(video.VIDEOURL || '').trim(),
        orden: Number(video.ORDEN) || 0
      });
    });
    Object.keys(videosPorSesion).forEach(function(clave) {
      videosPorSesion[clave].sort(function(a,b) { return a.orden - b.orden; });
    });

    const datosSesiones = _leerTablaPrograma_(hojaSesiones);
    const datosClases = _leerTablaPrograma_(hojaClases);
    const datosTareas = hojaTareas ? _leerTablaPrograma_(hojaTareas) : [];
    if (!datosSesiones.length) throw new Error('SESIONES no contiene temas.');
    if (!datosClases.length) throw new Error('CLASES no contiene clases.');

    const sesionesPorId = {};
    const ordenIds = [];
    datosSesiones.forEach(function(fila, indice) {
      const id = String(fila.IDSESION || '').trim();
      if (!id) return;
      if (sesionesPorId[id]) throw new Error('ID_SESION duplicado en SESIONES: ' + id);
      const numero = fila.NDESESION || indice + 1;
      const bloque = String(fila.BLOQUE || '').trim();
      sesionesPorId[id] = {
        n: numero,
        numeroSesion: numero,
        id: id,
        bloque: bloque,
        tema: String(fila.TEMA || '').trim(),
        subtema: String(fila.SUBTEMA || '').trim(),
        desc: String(fila.SUBTEMA || '').trim(),
        objetivo: String(fila.OBJETIVO || '').trim(),
        val: String(fila.VALOR || '').trim(),
        valor: String(fila.VALOR || '').trim(),
        cita: String(fila.CITABIBLICA || '').trim(),
        cita_biblica: String(fila.CITABIBLICA || '').trim(),
        actividad: String(fila.ACTIVIDAD || '').trim(),
        fichaUrl: String(fila.FICHAURL || '').trim(),
        videoUrl: String(fila.VIDEOURL || '').trim(),
        videos: (function() {
          const lista = (videosPorSesion[_quizNormalizarIdSesion_(id)] || []).slice(0, MAX_VIDEOS_POR_TEMA_V8);
          const legado = String(fila.VIDEOURL || '').trim();
          if (legado && !lista.some(v => v.url === legado) && lista.length < MAX_VIDEOS_POR_TEMA_V8) {
            lista.unshift({ id:'VIDEO-LEGADO-' + id, titulo:'Video del tema', descripcion:'Recurso registrado anteriormente.', url:legado, orden:0 });
          }
          return lista;
        })(),
        cuestionarioUrl: String(fila.CUESTIONARIOURL || '').trim(),
        cancionUrl: String(fila.CANCIONURL || '').trim(),
        recursosNotas: String(fila.RECURSOSNOTAS || '').trim(),
        estado: String(fila.ESTADO || '').trim(),
        observaciones: String(fila.OBSERVACIONES || '').trim(),
        fecha: '', fechaProgramada: '', dia: '', horaInicio: '', horaFin: '',
        numeroClase: '', catequista: '', estadoClase: '', fechaRealizacion: '',
        estadoSupervision: ''
      };
      ordenIds.push(id);
    });
    if (!ordenIds.length) throw new Error('No se encontraron ID_SESION válidos en SESIONES.');

    const asignadas = {};
    const clases = [];
    datosClases.forEach(function(clase) {
      const id1 = String(clase.IDSESION1 || '').trim();
      const id2 = String(clase.IDSESION2 || '').trim();
      const ids = [id1, id2].filter(Boolean);
      if (!ids.length) return;

      const fechaISO = _fechaISOPrograma_(clase.FECHAPROGRAMADA);
      if (!fechaISO) throw new Error('La clase ' + (clase.NCLASE || '') + ' tiene una fecha inválida.');
      const temas = [];
      ids.forEach(function(id) {
        if (!sesionesPorId[id]) throw new Error('El ID ' + id + ' está en CLASES, pero no existe en SESIONES.');
        if (asignadas[id]) throw new Error('La sesión ' + id + ' está asignada más de una vez.');
        const sesion = sesionesPorId[id];
        sesion.fecha = fechaISO;
        sesion.fechaProgramada = fechaISO;
        sesion.diaRegistrado = String(clase.DIA || '').trim();
        sesion.dia = _diaSemanaDesdeISOPrograma_(fechaISO);
        sesion.horaInicio = _horaTextoPrograma_(clase.HORAINICIO);
        sesion.horaFin = _horaTextoPrograma_(clase.HORAFIN);
        sesion.numeroClase = clase.NCLASE || '';
        sesion.catequista = String(clase.CATEQUISTA || '').trim();
        sesion.estadoClase = String(clase.ESTADOCLASE || '').trim();
        sesion.fechaRealizacion = _fechaISOPrograma_(clase.FECHAREALIZACION);
        sesion.estadoSupervision = String(clase.ESTADOSUPERVISION || '').trim();
        if (!sesion.bloque && clase.BLOQUE) sesion.bloque = String(clase.BLOQUE).trim();
        asignadas[id] = true;

        const tareasTema = datosTareas.filter(function(tarea) {
          return String(tarea.IDSESION || '').trim().toUpperCase() === id.toUpperCase();
        }).map(_normalizarTareaCalendario_);

        temas.push({
          id: id,
          numeroSesion: sesion.numeroSesion,
          tema: sesion.tema,
          subtema: sesion.subtema,
          objetivo: sesion.objetivo,
          valor: sesion.valor,
          cita: sesion.cita,
          actividad: sesion.actividad,
          fichaUrl: sesion.fichaUrl,
          videoUrl: sesion.videoUrl,
          videos: sesion.videos || [],
          cuestionarioUrl: sesion.cuestionarioUrl,
          cancionUrl: sesion.cancionUrl,
          recursosNotas: sesion.recursosNotas,
          tareas: tareasTema
        });
      });

      const numeroClaseTexto = String(clase.NCLASE || '').trim();
      const claveClaseActual = _claveClasePrograma_(numeroClaseTexto);
      const tareasClase = datosTareas.filter(function(tarea) {
        const claseTarea = String(tarea.IDCLASE || '').trim();
        const sesionTarea = String(tarea.IDSESION || '').trim().toUpperCase();
        const coincideClase = claseTarea && (
          claseTarea.toUpperCase() === numeroClaseTexto.toUpperCase() ||
          _claveClasePrograma_(claseTarea) === claveClaseActual
        );
        const coincideTema = sesionTarea && ids.some(function(id) { return id.toUpperCase() === sesionTarea; });
        return coincideClase || coincideTema;
      }).map(_normalizarTareaCalendario_);

      clases.push({
        numeroClase: Number(clase.NCLASE) || clase.NCLASE || clases.length + 1,
        dia: _diaSemanaDesdeISOPrograma_(fechaISO),
        diaRegistrado: String(clase.DIA || '').trim(),
        fechaProgramada: fechaISO,
        horaInicio: _horaTextoPrograma_(clase.HORAINICIO),
        horaFin: _horaTextoPrograma_(clase.HORAFIN),
        bloque: String(clase.BLOQUE || '').trim(),
        catequista: String(clase.CATEQUISTA || '').trim(),
        estadoClase: String(clase.ESTADOCLASE || '').trim(),
        fechaRealizacion: _fechaISOPrograma_(clase.FECHAREALIZACION),
        observaciones: String(clase.OBSERVACIONES || '').trim(),
        estadoSupervision: String(clase.ESTADOSUPERVISION || '').trim(),
        idsSesiones: ids,
        totalTemas: temas.length,
        temas: temas,
        tareas: tareasClase
      });
    });

    const sinAsignar = ordenIds.filter(function(id) { return !asignadas[id]; });
    if (sinAsignar.length) throw new Error('Hay sesiones sin asignación en CLASES: ' + sinAsignar.join(', '));

    clases.sort(function(a, b) { return Number(a.numeroClase) - Number(b.numeroClase); });
    const bloquesMap = {};
    ordenIds.forEach(function(id) {
      const sesion = sesionesPorId[id];
      const nombreBloque = sesion.bloque || 'BLOQUE GENERAL';
      if (!bloquesMap[nombreBloque]) {
        bloquesMap[nombreBloque] = {
          title: nombreBloque,
          subtitle: 'Itinerario oficial de clases y sesiones',
          icon: obtenerIconoBloque_(nombreBloque),
          sessions: []
        };
      }
      bloquesMap[nombreBloque].sessions.push(sesion);
    });

    return {
      exito: true,
      total: ordenIds.length,
      totalTemas: ordenIds.length,
      totalClases: clases.length,
      totalAsignadas: Object.keys(asignadas).length,
      temasAsignados: Object.keys(asignadas).length,
      resumen: {
        clasesConUnTema: clases.filter(function(c) { return c.temas.length === 1; }).length,
        clasesConDosTemas: clases.filter(function(c) { return c.temas.length === 2; }).length,
        clasesSinCatequista: clases.filter(function(c) { return !String(c.catequista || '').trim(); }).length,
        temasVinculados: clases.reduce(function(total, c) { return total + c.temas.length; }, 0)
      },
      bloques: Object.keys(bloquesMap).map(function(nombre) { return bloquesMap[nombre]; }),
      clases: clases,
      mensaje: 'Programación sincronizada correctamente desde Google Sheets.'
    };
  } catch (error) {
    return {
      exito: false, total: 0, totalClases: 0, totalAsignadas: 0,
      bloques: [], clases: [], mensaje: error && error.message ? error.message : String(error)
    };
  }
}

function _leerTablaPrograma_(hoja) {
  const ultimaFila = hoja.getLastRow();
  const ultimaColumna = hoja.getLastColumn();

  if (ultimaFila < 2 || ultimaColumna < 1) return [];

  const rango = hoja.getRange(1, 1, ultimaFila, ultimaColumna);
  const valores = rango.getValues();
  const valoresVisibles = rango.getDisplayValues();
  const enlacesRich = rango.getRichTextValues();
  const formulas = rango.getFormulas();
  const encabezados = valores[0].map(function(valor) {
    return _normalizarEncabezadoPrograma_(valor);
  });

  return valores.slice(1)
    .map(function(fila, indiceFila) {
      const objeto = {};
      encabezados.forEach(function(encabezado, indice) {
        if (!encabezado) return;
        const esHora = encabezado === 'HORAINICIO' || encabezado === 'HORAFIN';
        const valorVisible = valoresVisibles[indiceFila + 1] ? valoresVisibles[indiceFila + 1][indice] : '';
        const valorCelda = _esColumnaDeEnlace_(encabezado)
          ? _obtenerEnlaceCelda_(fila[indice], enlacesRich[indiceFila + 1] && enlacesRich[indiceFila + 1][indice], formulas[indiceFila + 1] && formulas[indiceFila + 1][indice])
          : fila[indice];
        objeto[encabezado] = esHora && String(valorVisible || '').trim()
          ? String(valorVisible).trim()
          : valorCelda;
      });
      return objeto;
    })
    .filter(function(objeto) {
      return Object.keys(objeto).some(function(clave) {
        return objeto[clave] !== '' && objeto[clave] !== null && objeto[clave] !== undefined;
      });
    });
}


function _normalizarEncabezadoPrograma_(valor) {
  return String(valor == null ? '' : valor)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Añade únicamente encabezados faltantes a una hoja existente.
 * No crea pestañas, no mueve columnas y no modifica datos anteriores.
 */
function _asegurarColumnasEnHoja_(hoja, encabezadosRequeridos) {
  if (!hoja) throw new Error('No se puede agregar encabezados: la hoja no existe.');
  const ultimaColumna = Math.max(hoja.getLastColumn(), 1);
  const encabezadosActuales = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0]
    .map(_normalizarEncabezadoPrograma_);
  const faltantes = encabezadosRequeridos.filter(function(encabezado) {
    return encabezadosActuales.indexOf(_normalizarEncabezadoPrograma_(encabezado)) === -1;
  });
  if (faltantes.length) {
    const columnaInicio = hoja.getLastColumn() + 1;
    hoja.getRange(1, columnaInicio, 1, faltantes.length).setValues([faltantes]);
    SpreadsheetApp.flush();
  }
}


/**
 * Convierte fecha de hoja a yyyy-MM-dd sin depender del formato visual.
 */
function _diaSemanaDesdeISOPrograma_(fechaISO) {
  const coincidencia = String(fechaISO || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!coincidencia) return '';
  const fechaUTC = new Date(Date.UTC(Number(coincidencia[1]), Number(coincidencia[2]) - 1, Number(coincidencia[3])));
  const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  return dias[fechaUTC.getUTCDay()];
}

function _fechaISOPrograma_(valor) {
  if (valor === '' || valor === null || valor === undefined) return '';

  // Las fechas reales de Sheets llegan como Date.
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(
      valor,
      ZONA_HORARIA_CAMINO,
      'yyyy-MM-dd'
    );
  }

  // Algunas importaciones exponen las fechas como número serial de Excel/Sheets,
  // ya sea como número o como texto (por ejemplo, "46189.0").
  const texto = String(valor).trim();
  const posibleSerial = (typeof valor === 'number') ? valor : (/^\d+(?:[.,]\d+)?$/.test(texto) ? Number(texto.replace(',', '.')) : NaN);
  if (isFinite(posibleSerial) && posibleSerial > 20000 && posibleSerial < 100000) {
    const fechaSerial = new Date(Date.UTC(1899, 11, 30) + Math.round(posibleSerial) * 86400000);
    return Utilities.formatDate(fechaSerial, 'GMT', 'yyyy-MM-dd');
  }

  // Si ya viene como yyyy-MM-dd, conservar el día sin conversión UTC.
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];

  const fecha = new Date(valor);
  if (isNaN(fecha.getTime())) return '';
  return Utilities.formatDate(
    fecha,
    ZONA_HORARIA_CAMINO,
    'yyyy-MM-dd'
  );
}


/**
 * Convierte horas de hoja a HH:mm.
 */
function _horaTextoPrograma_(valor) {
  if (valor === '' || valor === null || valor === undefined) return '';

  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, ZONA_HORARIA_CAMINO, 'HH:mm');
  }

  if (typeof valor === 'number' && isFinite(valor)) {
    let minutos = null;
    if (valor >= 0 && valor < 1) minutos = Math.round(valor * 24 * 60);
    else if (valor >= 0 && valor <= 24) minutos = Math.round(valor * 60);
    if (minutos !== null) {
      minutos = minutos % (24 * 60);
      return String(Math.floor(minutos / 60)).padStart(2, '0') + ':' +
        String(minutos % 60).padStart(2, '0');
    }
  }

  // Convierte tanto 14:00 como 2:00 p. m. / 4:00 PM a formato 24 horas.
  const texto = String(valor).trim().toLowerCase();
  const compacto = texto.replace(/\./g, '').replace(/\s+/g, '');
  const coincidencia = compacto.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(am|pm)?$/);
  if (coincidencia) {
    let hora = Number(coincidencia[1]);
    const minuto = Number(coincidencia[2]);
    const periodo = coincidencia[3] || '';
    if (minuto > 59 || hora > 23 || (periodo && hora > 12)) return texto;
    if (periodo === 'pm' && hora < 12) hora += 12;
    if (periodo === 'am' && hora === 12) hora = 0;
    return String(hora).padStart(2, '0') + ':' + String(minuto).padStart(2, '0');
  }

  // Acepta valores numéricos guardados como texto (fracción de día).
  if (/^\d+(?:[.,]\d+)?$/.test(texto)) {
    const numero = Number(texto.replace(',', '.'));
    if (numero >= 0 && numero < 1) {
      const minutos = Math.round(numero * 24 * 60) % (24 * 60);
      return String(Math.floor(minutos / 60)).padStart(2, '0') + ':' +
        String(minutos % 60).padStart(2, '0');
    }
  }
  return texto;
}

function _claveClasePrograma_(valor) {
  const texto = String(valor == null ? '' : valor).trim().toUpperCase();
  if (!texto) return '';
  const digitos = texto.match(/\d+/g);
  if (digitos && digitos.length) return String(Number(digitos.join('')));
  return texto;
}

function _normalizarTareaCalendario_(tarea) {
  return {
    idTarea: String(tarea.IDTAREA || '').trim(),
    idClase: String(tarea.IDCLASE || '').trim(),
    idSesion: String(tarea.IDSESION || '').trim(),
    titulo: String(tarea.TITULO || '').trim(),
    descripcion: String(tarea.DESCRIPCION || '').trim(),
    fechaAsignacion: _fechaISOPrograma_(tarea.FECHAASIGNACION),
    fechaEntrega: _fechaISOPrograma_(tarea.FECHAENTREGA),
    responsable: String(tarea.RESPONSABLE || '').trim(),
    estado: String(tarea.ESTADO || '').trim(),
    evidenciaLink: String(tarea.EVIDENCIALINK || '').trim(),
    observacion: String(tarea.OBSERVACION || '').trim()
  };
}

function obtenerIconoBloque_(nombre) {
  const n = nombre.toUpperCase();
  if (n.includes('CONOCIENDO')) return '✝️';
  if (n.includes('ORAR')) return '🙏';
  if (n.includes('SACRAMENTOS')) return '🕊️';
  if (n.includes('EUCARISTÍA') || n.includes('EUCARISTIA')) return '🍞';
  if (n.includes('VALORES') || n.includes('VIDA')) return '💖';
  if (n.includes('COMUNIÓN') || n.includes('COMUNION') || n.includes('COMPARTIMOS') || n.includes('PREPARACION')) return '👨‍👩‍👧‍👦';
  return '✨';
}

/** Lee el historial general de CALIFICACIONES para el módulo Catequistas. */
function getCalificaciones() {
  const hoja = getSpreadsheet().getSheetByName('CALIFICACIONES');
  if (!hoja) throw new Error('No existe la hoja CALIFICACIONES.');
  const ultimaFila = hoja.getLastRow();
  const ultimaCol = hoja.getLastColumn();
  if (ultimaFila < 2 || ultimaCol < 1) return { exito: true, total: 0, datos: [] };
  const valores = hoja.getRange(1, 1, ultimaFila, ultimaCol).getValues();
  const encabezados = valores[0].map(function(v) { return String(v || '').trim(); });
  const datos = valores.slice(1).filter(function(f) { return String(f[0] || '').trim() !== ''; }).map(function(f) {
    const obj = {};
    encabezados.forEach(function(h, i) { if (h) obj[h] = normalizarValor_(f[i]); });
    return obj;
  });
  return { exito: true, total: datos.length, datos: datos };
}

/** Registra una calificación en la hoja existente, sin alterar sus encabezados. */
function guardarCalificacion_(data) {
  const hoja = getSpreadsheet().getSheetByName('CALIFICACIONES');
  if (!hoja) throw new Error('No existe la hoja CALIFICACIONES.');
  const idNino = String(data.idNino || '').trim();
  const idSesion = String(data.idSesion || '').trim();
  const nota = Number(data.notaNumerica);
  if (!idNino || !idSesion || !String(data.tipoActividad || '').trim()) throw new Error('Faltan el catequizando, el tema o el tipo de actividad.');
  if (!Number.isFinite(nota) || nota < 0 || nota > 20) throw new Error('La nota debe estar entre 0 y 20.');
  const ultimaCol = hoja.getLastColumn();
  if (!ultimaCol) throw new Error('La hoja CALIFICACIONES no tiene encabezados.');
  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0].map(function(h) { return String(h || '').trim(); });
  const registro = {
    ID_CALIFICACION: String(data.idCalificacion || ('CAL-' + Date.now())),
    FECHA_REGISTRO: new Date(),
    ID_NINO: idNino,
    NOMBRE_CATEQUIZANDO: String(data.nombreCatequizando || '').trim(),
    ID_SESION: idSesion,
    TEMA: String(data.tema || '').trim(),
    TIPO_ACTIVIDAD: String(data.tipoActividad || '').trim(),
    DESCRIPCION: String(data.descripcion || '').trim(),
    NOTA_NUMERICA: nota,
    EQUIVALENCIA: String(data.equivalencia || '').trim(),
    OBSERVACIONES: String(data.observaciones || '').trim(),
    CATEQUISTA: String(data.catequista || '').trim()
  };
  const fila = encabezados.map(function(h) { return Object.prototype.hasOwnProperty.call(registro, h) ? registro[h] : ''; });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    hoja.appendRow(fila);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return { exito: true, mensaje: 'Calificación guardada correctamente.', idCalificacion: registro.ID_CALIFICACION };
}

function getCatequizandos(codigoPadre) {
  const datos = getSheetData(CONFIG.SHEET_CATEQUIZANDOS);
  const codigo = String(codigoPadre || '').trim();

  const activos = datos.filter(function(item) {
    const id = String(item.ID_NINO || '').trim();
    if (!id) return false;

    const vigente = String(item.VIGENTE == null ? '' : item.VIGENTE).trim().toUpperCase();
    // Si VIGENTE está vacío se conserva el registro; SI/TRUE/1 también son activos.
    if (vigente && ['SI', 'SÍ', 'TRUE', '1', 'ACTIVO', 'VIGENTE'].indexOf(vigente) === -1) return false;
    return true;
  });

  const filtrados = codigo ? activos.filter(function(item) {
    return String(item.PADRE_ID || '').trim() === codigo ||
           String(item.MADRE_ID || '').trim() === codigo;
  }) : activos;

  const salida = filtrados.map(function(item) {
    return {
      ID_NINO: String(item.ID_NINO || '').trim(),
      APELLIDOS: String(item.APELLIDOS || '').trim(),
      NOMBRES: String(item.NOMBRES || '').trim(),
      NOMBRE_COMPLETO: [String(item.NOMBRES || '').trim(), String(item.APELLIDOS || '').trim()].filter(Boolean).join(' '),
      FOTO: normalizarUrlFotoPortal_(item.FOTO || ''),
      DNI: String(item.DNI || '').trim(),
      EDAD: item.EDAD || '',
      GRADO: String(item.GRADO || '').trim(),
      PADRE_ID: String(item.PADRE_ID || '').trim(),
      MADRE_ID: String(item.MADRE_ID || '').trim(),
      TELEFONO_FAMILIA: item.TELEFONO_FAMILIA || '',
      BAUTISMO: String(item.BAUTISMO || '').trim(),
      PARROQUIA_BAUTISMO: String(item.PARROQUIA_BAUTISMO || '').trim(),
      OBSERVACIONES: String(item.OBSERVACIONES || '').trim(),
      VIGENTE: String(item.VIGENTE || '').trim()
    };
  });

  return { exito: true, total: salida.length, datos: salida };
}

function normalizarUrlFotoPortal_(url) {
  let texto = String(url || '').trim();
  if (!texto) return '';
  // GitHub: convierte enlaces de vista de archivo en enlaces directos.
  texto = texto.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//i,
    'https://raw.githubusercontent.com/$1/$2/');
  // Google Drive: requiere permiso de lectura para cualquier usuario del portal.
  let match = texto.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*?id=)([A-Za-z0-9_-]+)/i);
  if (match && match[1]) texto = 'https://drive.google.com/uc?export=view&id=' + match[1];
  return texto;
}

function getPadres() {
  const filas = getSheetData(CONFIG.SHEET_PADRES);
  const datos = filas.filter(function(p) { return String(p.PADRE_ID || '').trim() !== ''; })
    .map(function(p) {
      return {
        PADRE_ID: String(p.PADRE_ID || '').trim(),
        FOTO: normalizarUrlFotoPortal_(p.FOTOS || ''),
        APELLIDOS: String(p.APELLIDOS || '').trim(),
        NOMBRES: String(p.NOMBRES || '').trim(),
        NOMBRE_COMPLETO: [String(p.NOMBRES || '').trim(), String(p.APELLIDOS || '').trim()].filter(Boolean).join(' '),
        PARENTESCO: String(p.PARENTESCO || '').trim(),
        CUMPLEANOS: p['CUMPLEAÑOS'] || p.CUMPLEANOS || '',
        DNI: String(p.DNI == null ? '' : p.DNI).trim(),
        TELEFONO: String(p.TELEFONO == null ? '' : p.TELEFONO).trim(),
        WHATSAPP: String(p.WHATSAPP == null ? '' : p.WHATSAPP).trim(),
        CORREO: String(p.CORREO || '').trim(),
        AUTORIZA_AVISOS: String(p.AUTORIZA_AVISOS || '').trim(),
        OBSERVACIONES: String(p.OBSERVACIONES || '').trim()
      };
    });
  return { exito: true, total: datos.length, datos: datos };
}

/** PAGOS tiene sus encabezados en la fila 4; no se lee como una tabla desde A1. */
function getAportes(codigoPadre) {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_PAGOS);
  if (!hoja) throw new Error('No existe la hoja PAGOS.');
  const ultimaFila = hoja.getLastRow();
  const ultimaCol = hoja.getLastColumn();
  if (ultimaFila < 5 || ultimaCol < 1) return { exito:true, total:0, datos:[] };

  // La hoja PAGOS tiene encabezados en la fila 4. Se localizan por nombre,
  // nunca por posiciones fijas, para respetar las columnas ya insertadas.
  const valores = hoja.getRange(4, 1, ultimaFila - 3, ultimaCol).getValues();
  const encabezados = valores[0].map(h => String(h == null ? '' : h).trim());
  const norm = encabezados.map(_normalizarEncabezadoPrograma_);
  function indice(aliases) {
    const opciones = aliases.map(_normalizarEncabezadoPrograma_);
    let i = norm.findIndex(h => opciones.indexOf(h) !== -1);
    if (i >= 0) return i;
    // Acepta encabezados con texto aclaratorio agregado al final.
    return norm.findIndex(h => opciones.some(o => o && h.indexOf(o) === 0));
  }
  function valor(fila, aliases) {
    const i = indice(aliases);
    return i < 0 ? '' : fila[i];
  }

  const alumnos = getCatequizandos('').datos || [];
  const alumnoPorId = {};
  alumnos.forEach(a => { alumnoPorId[String(a.ID_NINO || '').trim()] = a; });
  const idxId = indice(['ID']);
  const idxDni = indice(['DNI', 'DNI ALUMNO']);
  if (idxId < 0) throw new Error('No se encontró la columna ID en la fila 4 de PAGOS.');

  // Completa únicamente los DNI vacíos de PAGOS desde CATEQUIZANDOS.
  // No sobrescribe datos existentes ni modifica otras columnas.
  if (idxDni >= 0) {
    const rangoDni = hoja.getRange(5, idxDni + 1, valores.length - 1, 1);
    const dniActuales = rangoDni.getValues();
    let huboCambiosDni = false;
    for (let i = 1; i < valores.length; i++) {
      const idFila = String(valores[i][idxId] || '').trim();
      const alumnoFila = alumnoPorId[idFila] || {};
      if (!String(dniActuales[i - 1][0] || '').trim() && String(alumnoFila.DNI || '').trim()) {
        dniActuales[i - 1][0] = String(alumnoFila.DNI).trim();
        huboCambiosDni = true;
      }
    }
    if (huboCambiosDni) {
      rangoDni.setValues(dniActuales);
      SpreadsheetApp.flush();
    }
  }

  const datos = valores.slice(1).filter(f => String(f[idxId] || '').trim() !== '').map(fila => {
    const id = String(valor(fila, ['ID']) || '').trim();
    const alumno = alumnoPorId[id] || {};
    const voucher = String(valor(fila, [
      'FOTO / IMAGEN DEL VOUCHER',
      'FOTO / IMAGEN DEL VOUCHER (ESPACIO)',
      'VOUCHER', 'IMAGEN DEL VOUCHER'
    ]) || '').trim();
    const fecha = valor(fila, ['FECHA DE PAGO']);
    return {
      ID:id,
      FOTO_ALUMNO:normalizarUrlFotoPortal_(valor(fila, ['FOTO ALUMNO']) || alumno.FOTO || ''),
      NOMBRE:String(valor(fila, ['APELLIDOS Y NOMBRES']) || [alumno.APELLIDOS, alumno.NOMBRES].filter(Boolean).join(', ')).trim(),
      DNI:String(alumno.DNI || valor(fila, ['DNI', 'DNI ALUMNO']) || '').trim(),
      MONTO:normalizarValor_(valor(fila, ['MONTO ÚNICO (S/.)', 'MONTO UNICO', 'MONTO'])) || 'S/. 40.00',
      ESTADO_PAGO:String(valor(fila, ['ESTADO DE PAGO', 'ESTADO']) || 'Pendiente').trim(),
      FECHA_PAGO:fecha instanceof Date ? Utilities.formatDate(fecha, ZONA_HORARIA_CAMINO, 'dd/MM/yyyy HH:mm') : String(normalizarValor_(fecha) || ''),
      VOUCHER_NUMERO:String(normalizarValor_(valor(fila, ['N.º DE VOUCHER / OPERACIÓN', 'N° DE VOUCHER / OPERACION', 'NUMERO DE OPERACION', 'NRO DE OPERACION'])) || '').trim(),
      MEDIO_PAGO:String(valor(fila, ['MEDIO DE PAGO (YAPE / PLIN / EFECTIVO)', 'MEDIO DE PAGO', 'BANCO / MEDIO DE PAGO']) || '').trim(),
      OBSERVACIONES:String(valor(fila, ['OBSERVACIONES']) || '').trim(),
      VOUCHER_URL:/^https?:\/\//i.test(voucher) ? voucher : ''
    };
  });

  const filtrados = codigoPadre ? datos.filter(pago => {
    const nino = alumnoPorId[pago.ID] || {};
    return String(nino.PADRE_ID || '') === codigoPadre || String(nino.MADRE_ID || '') === codigoPadre;
  }) : datos;
  return { exito:true, total:filtrados.length, datos:filtrados };
}

/**
 * Lee la matriz oficial de ASISTENCIA.
 * Encabezado real: fila con ID | APELLIDOS Y NOMBRES | FOTO | % ASIST. | A | T | F | FJ.
 * Las columnas de sesiones se identifican por la fila superior (SESIÓN 1...46),
 * no por posiciones supuestas.
 */
function getAsistenciaNotasCatequizandos(codigoPadre) {
  const ss = getSpreadsheet();
  const hoja = ss.getSheetByName(CONFIG.SHEET_ASISTENCIA);
  if (!hoja) throw new Error('No existe la hoja ASISTENCIA.');
  const alumnos = getCatequizandos(codigoPadre).datos;
  const valores = hoja.getDataRange().getValues();
  if (!valores.length) return { exito: true, total: alumnos.length, totalSesiones: 0, datos: [], resumen: {} };

  let filaHeader = -1;
  for (let i = 0; i < valores.length; i++) {
    if (_normalizarEncabezadoPrograma_(valores[i][0]) === 'ID' &&
        _normalizarEncabezadoPrograma_(valores[i][1]) === 'APELLIDOSYNOMBRES') {
      filaHeader = i;
      break;
    }
  }
  if (filaHeader < 0) throw new Error('No se encontró la fila de encabezados de ASISTENCIA.');

  const etiquetas = filaHeader > 0 ? valores[filaHeader - 1] : [];
  const fechasFila = valores[filaHeader];
  const columnasSesiones = [];
  const fechasSesiones = [];
  for (let c = 8; c < etiquetas.length; c++) {
    const etiqueta = String(etiquetas[c] || '').trim();
    if (/^SESI[ÓO]N\s*\d+$/i.test(etiqueta)) {
      columnasSesiones.push(c);
      fechasSesiones.push(_fechaISOPrograma_(fechasFila[c]));
    }
  }

  const filasPorId = {};
  let filaResumen = null;
  for (let r = filaHeader + 1; r < valores.length; r++) {
    const fila = valores[r];
    const id = String(fila[0] || '').trim();
    if (/^TOTAL ASISTENTES/i.test(id)) { filaResumen = fila; continue; }
    if (!/^LDS-EST-/i.test(id)) continue;
    const nombre = String(fila[1] || '').trim();
    if (nombre && !/^\d+$/.test(nombre.replace(/\s/g, ''))) filasPorId[id] = fila;
  }

  const datos = alumnos.map(function(alumno) {
    const fila = filasPorId[alumno.ID_NINO] || [];
    let porcentaje = fila[3];
    if (typeof porcentaje === 'number') porcentaje = porcentaje <= 1 ? porcentaje * 100 : porcentaje;
    else {
      const n = parseFloat(String(porcentaje || '').replace('%', '').replace(',', '.'));
      porcentaje = isNaN(n) ? null : n;
    }
    const estados = columnasSesiones.map(function(col) {
      const v = String(fila[col] == null ? '' : fila[col]).trim().toUpperCase();
      return ['A', 'T', 'F', 'FJ'].indexOf(v) !== -1 ? v : '';
    });
    return {
      ID_NINO: alumno.ID_NINO,
      APELLIDOS: alumno.APELLIDOS,
      NOMBRES: alumno.NOMBRES,
      NOMBRE_COMPLETO: alumno.NOMBRE_COMPLETO,
      FOTO: alumno.FOTO,
      GRADO: alumno.GRADO,
      ASISTENCIA_PORCENTAJE: porcentaje,
      TOTAL_PRESENTES: Number(fila[4]) || 0,
      TOTAL_TARDANZAS: Number(fila[5]) || 0,
      TOTAL_FALTAS: Number(fila[6]) || 0,
      TOTAL_JUSTIFICADAS: Number(fila[7]) || 0,
      TOTAL_SESIONES: columnasSesiones.length,
      ESTADOS_SESIONES: estados
    };
  });

  const resumen = filaResumen ? {
    porcentaje: Number(filaResumen[3]) <= 1 ? Number(filaResumen[3]) * 100 : Number(filaResumen[3]),
    presentes: Number(filaResumen[4]) || 0,
    tardanzas: Number(filaResumen[5]) || 0,
    faltas: Number(filaResumen[6]) || 0,
    justificadas: Number(filaResumen[7]) || 0
  } : {};
  const idsFamilia = alumnos.map(function(a) { return a.ID_NINO; });
  const calificaciones = getSheetData('CALIFICACIONES').filter(function(x) { return idsFamilia.indexOf(String(x.ID_NINO || '').trim()) >= 0; });
  return {
    exito: true, total: datos.length, totalSesiones: columnasSesiones.length,
    fechasSesiones: fechasSesiones, resumen: resumen, datos: datos,
    totalCalificaciones: calificaciones.length, calificaciones: calificaciones
  };
}

/**
 * Lista tareas desde la hoja existente TAREAS.
 * Permite filtrar por ID_NINO (cuando se active el acceso individual)
 * y por ID_SESION para asociar el botón Tareas con el tema correspondiente.
 */
function getTareasFamilia_(codigoPadre, idSesion) {
  const ids = getCatequizandos(codigoPadre).datos.map(a => String(a.ID_NINO || '').trim());
  const sesion = String(idSesion || '').trim();
  const datos = [];
  ids.forEach(id => {
    const respuesta = getTareasNino_(id, sesion);
    (respuesta.datos || []).forEach(tarea => datos.push(Object.assign({ ID_NINO: id }, tarea)));
  });
  return { exito: true, total: datos.length, datos: datos };
}

function getAvisosFamilia_(codigoPadre) {
  const ids = getCatequizandos(codigoPadre).datos.map(a => a.ID_NINO.toUpperCase());
  const codigo = String(codigoPadre).toUpperCase();
  const datos = getSheetData(CONFIG.SHEET_AVISOS).filter(item => {
    const pub = String(item.PUBLICADO || '').trim().toUpperCase();
    if (['SI','SÍ','TRUE','1','PUBLICADO'].indexOf(pub) < 0) return false;
    const destino = String(item.DIRIGIDO_A || 'TODOS').trim().toUpperCase();
    return ['TODOS','PADRES','FAMILIAS','GENERAL','TODOS LOS CATEQUIZANDOS',''].indexOf(destino) >= 0 || destino === codigo || ids.indexOf(destino) >= 0;
  }).map(item => ({ID_AVISO:item.ID_AVISO||'',FECHA:item.FECHA||'',TITULO:item.TITULO||'',MENSAJE:item.MENSAJE||'',DIRIGIDO_A:item.DIRIGIDO_A||'',ID_CLASE:item.ID_CLASE||'',WHATSAPP_LINK:item.WHATSAPP_LINK||''}));
  datos.sort((a,b)=>String(a.FECHA).localeCompare(String(b.FECHA)));
  return {exito:true,total:datos.length,datos:datos};
}

function _leerTablaConEncabezado_(nombreHoja, filaEncabezado) {
  const hoja = getSpreadsheet().getSheetByName(nombreHoja);
  if (!hoja) return [];
  const ultimaFila=hoja.getLastRow(), ultimaCol=hoja.getLastColumn();
  if (ultimaFila <= filaEncabezado || !ultimaCol) return [];
  const rango=hoja.getRange(filaEncabezado,1,ultimaFila-filaEncabezado+1,ultimaCol);
  const valores=rango.getValues(), rich=rango.getRichTextValues(), formulas=rango.getFormulas();
  const headers=valores[0].map(h=>String(h==null?'':h).trim());
  return valores.slice(1).map((row,r)=>({row:row,r:r})).filter(item=>item.row.some(v=>v!==''&&v!==null)).map(item=>{
    const row=item.row, r=item.r, obj={};
    headers.forEach((h,i)=>{if(h){const raw=_esColumnaDeEnlace_(h)?_obtenerEnlaceCelda_(row[i],rich[r+1]&&rich[r+1][i],formulas[r+1]&&formulas[r+1][i]):row[i]; obj[h]=normalizarValor_(raw);}}); return obj;
  });
}

function getRequisitosFamilia_(codigoPadre) {
  const ids=getCatequizandos(codigoPadre).datos.map(a=>a.ID_NINO);
  const datos=_leerTablaConEncabezado_(CONFIG.SHEET_REQUISITOS,1).filter(x=>ids.indexOf(String(x.ID||'').trim())>=0);
  const materiales=_leerTablaConEncabezado_(CONFIG.SHEET_MATERIALES,2).filter(x=>ids.indexOf(String(x.ID||'').trim())>=0);
  return {exito:true,total:datos.length,datos:datos,materiales:materiales,totalMateriales:materiales.length};
}

function getMaterialesFamilia_(codigoPadre) {
  const ids=getCatequizandos(codigoPadre).datos.map(a=>a.ID_NINO);
  const datos=_leerTablaConEncabezado_(CONFIG.SHEET_MATERIALES,2).filter(x=>ids.indexOf(String(x.ID||'').trim())>=0);
  return {exito:true,total:datos.length,datos:datos};
}

function getCalificacionesFamilia_(codigoPadre) {
  const ids=getCatequizandos(codigoPadre).datos.map(a=>a.ID_NINO);
  const datos=getSheetData('CALIFICACIONES').filter(x=>ids.indexOf(String(x.ID_NINO||'').trim())>=0);
  return {exito:true,total:datos.length,datos:datos};
}

/** Calendario real: una fila por cada fecha de CLASES (46 fechas), aunque tenga dos temas. */
function getCalendarioPadres_() {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CLASES);
  if (!hoja) throw new Error('No existe la hoja CLASES.');
  // _leerTablaPrograma_ conserva las horas como texto visible (ej. 14:00),
  // evitando que una hora se convierta en una fecha antigua al pasar por Date.
  const filas = _leerTablaPrograma_(hoja);
  const datos = filas.filter(function(x) { return x.FECHAPROGRAMADA; }).map(function(x) {
    return {
      numeroClase: x.NCLASE || '',
      fecha: _fechaISOPrograma_(x.FECHAPROGRAMADA),
      dia: x.DIA || '',
      horaInicio: _horaTextoPrograma_(x.HORAINICIO),
      horaFin: _horaTextoPrograma_(x.HORAFIN),
      bloque: x.BLOQUE || '',
      tema1: x.TEMA1 || '',
      tema2: x.TEMA2 || '',
      idSesion1: x.IDSESION1 || '',
      idSesion2: x.IDSESION2 || '',
      catequista: x.CATEQUISTA || '',
      estado: x.ESTADOCLASE || ''
    };
  });
  datos.sort(function(a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
  return { exito: true, total: datos.length, datos: datos };
}

function getAvisosCatequista_() {
  const filas = getSheetData(CONFIG.SHEET_AVISOS);
  const datos = filas.filter(function(item) {
    return String(item.ID_MENSAJE || item.ID_AVISO || item.TITULO || item.ASUNTO || item.MENSAJE || '').trim() !== '';
  }).map(function(item) {
    const observaciones = String(item.OBSERVACIONES || '').trim();
    const remitenteIdMatch = observaciones.match(/ID_REMITENTE\s*:\s*([^|]+)/i);
    const remitenteMatch = observaciones.match(/REMITENTE\s*:\s*([^|]+)/i);
    const tipoMensaje = String(item.TIPO_MENSAJE || '').trim().toUpperCase();
    const estado = String(item.ESTADO || item.PUBLICADO || '').trim().toUpperCase();
    const esLeido = !!item.FECHA_LECTURA || ['LEIDO', 'LEÍDO', 'ATENDIDO', 'RESPONDIDO', 'CERRADO'].indexOf(estado) >= 0;
    return {
      ID_AVISO: item.ID_AVISO || item.ID_MENSAJE || '',
      ID_MENSAJE: item.ID_MENSAJE || item.ID_AVISO || '',
      FECHA: item.FECHA || item.FECHA_ENVIO || '',
      FECHA_ENVIO: item.FECHA_ENVIO || item.FECHA || '',
      TITULO: item.TITULO || item.ASUNTO || '',
      ASUNTO: item.ASUNTO || item.TITULO || '',
      MENSAJE: item.MENSAJE || '',
      DIRIGIDO_A: item.DIRIGIDO_A || item.DESTINATARIO || '',
      DESTINATARIO: item.DESTINATARIO || item.DIRIGIDO_A || '',
      ID_DESTINATARIO: item.ID_DESTINATARIO || '',
      TIPO_DESTINATARIO: item.TIPO_DESTINATARIO || '',
      REMITENTE: item.REMITENTE || (remitenteMatch ? remitenteMatch[1].trim() : ''),
      TIPO_REMITENTE: item.TIPO_REMITENTE || '',
      REMITENTE_ID: item.REMITENTE_ID || (remitenteIdMatch ? remitenteIdMatch[1].trim() : ''),
      TIPO_INTERNO: /INTERNO_CATEQUISTAS/i.test(observaciones) || tipoMensaje === 'CATEQUISTAS' ? 'CATEQUISTAS' : '',
      PUBLICADO: item.PUBLICADO || (['ENVIADO', 'PUBLICADO'].indexOf(estado) >= 0 && String(item.TIPO_DESTINATARIO || '').toUpperCase() !== 'CATEQUISTA' ? 'SI' : 'NO'),
      ESTADO: item.ESTADO || '',
      FECHA_LECTURA: item.FECHA_LECTURA || '',
      WHATSAPP_LINK: item.WHATSAPP_LINK || '',
      OBSERVACIONES: observaciones,
      ES_NO_LEIDO: !esLeido
    };
  });
  datos.sort(function(a, b) {
    const fechaA = a.FECHA instanceof Date ? a.FECHA.getTime() : new Date(a.FECHA).getTime();
    const fechaB = b.FECHA instanceof Date ? b.FECHA.getTime() : new Date(b.FECHA).getTime();
    return (isNaN(fechaB) ? 0 : fechaB) - (isNaN(fechaA) ? 0 : fechaA);
  });
  return { exito: true, total: datos.length, datos: datos };
}

/** Devuelve exclusivamente avisos oficiales marcados como publicados. */
function getAvisosPublicados() {
  const datos = getSheetData(CONFIG.SHEET_AVISOS);
  const publicados = datos.filter(function(item) {
    const estado = String(item.PUBLICADO == null ? '' : item.PUBLICADO).trim().toUpperCase();
    return ['SI', 'SÍ', 'TRUE', '1', 'PUBLICADO'].indexOf(estado) !== -1;
  }).map(function(item) {
    return {
      ID_AVISO: item.ID_AVISO || '',
      FECHA: item.FECHA || '',
      TITULO: item.TITULO || '',
      MENSAJE: item.MENSAJE || '',
      DIRIGIDO_A: item.DIRIGIDO_A || '',
      ID_CLASE: item.ID_CLASE || '',
      WHATSAPP_LINK: item.WHATSAPP_LINK || ''
    };
  });
  publicados.sort(function(a, b) {
    return String(b.FECHA).localeCompare(String(a.FECHA));
  });
  return { exito: true, total: publicados.length, datos: publicados };
}

/** Diagnóstico de conexión para fase 1. Devuelve conteos, nunca datos personales. */
function getDiagnosticoPadres_(codigoPadre) {
  const programa = getSesiones();
  const calendario = getCalendarioPadres_();
  const asistencia = getAsistenciaNotasCatequizandos(codigoPadre);
  const tareas = getTareasFamilia_(codigoPadre, '');
  const avisos = getAvisosFamilia_(codigoPadre);
  const requisitos = getRequisitosFamilia_(codigoPadre);
  const aportes = getAportes(codigoPadre);
  const calificaciones = getCalificacionesFamilia_(codigoPadre);
  const materiales = getMaterialesFamilia_(codigoPadre);
  return {
    exito: true,
    resumen: {
      temas: Number(programa.totalTemas || programa.total || 0),
      clases: Number(calendario.total || 0),
      catequizandos: Number(asistencia.total || 0),
      tareas: Number(tareas.total || 0),
      avisos: Number(avisos.total || 0),
      requisitos: Number(requisitos.total || 0),
      materiales: Number(materiales.total || 0),
      aportes: Number(aportes.total || 0),
      calificaciones: Number(calificaciones.total || 0),
      asistenciaSesiones: Number(asistencia.totalSesiones || 0)
    },
    mensaje: 'Diagnóstico de lectura completado.'
  };
}

/** Devuelve los parámetros del programa desde CONFIG (CLAVE/VALOR). */
function getConfiguracionPortal() {
  const filas = getSheetData(CONFIG.SHEET_CONFIG);
  const config = {};
  filas.forEach(function(fila) {
    const clave = String(fila.CLAVE || '').trim();
    if (clave) config[clave] = normalizarValor_(fila.VALOR);
  });
  return { exito: true, datos: config };
}

/**
 * Guarda los mensajes entrantes dentro de AVISOS, sin crear otra pestaña.
 * PUBLICADO=RECIBIDO evita mostrarlos como comunicados oficiales.
 */
function guardarMensajeCatequizando_(data) {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_AVISOS);
  if (!hoja) throw new Error('No existe la hoja AVISOS. No se creó ninguna pestaña nueva.');

  const nombre = String(data.nombreAlumno || data.nombre || '').trim().slice(0, 100);
  const idCatequista = String(data.catequista || data.idDestinatario || '').trim().toUpperCase();
  const asunto = String(data.asunto || 'Consulta de catequizando').trim().slice(0, 120);
  const mensaje = String(data.mensaje || '').trim().slice(0, 1500);
  if (!nombre || !idCatequista || !mensaje) throw new Error('Completa la catequista y el mensaje.');
  if (!/^LDS-CAT-\d{3}$/i.test(idCatequista)) throw new Error('Selecciona una catequista válida.');

  const perfilDestino = getPerfilCatequista_(idCatequista);
  if (!perfilDestino || !perfilDestino.exito || !perfilDestino.perfil) throw new Error('La catequista seleccionada no está habilitada.');
  const nombreDestino = String(perfilDestino.perfil.nombre || idCatequista).trim();
  const ultimaColumna = hoja.getLastColumn();
  if (ultimaColumna < 1 || hoja.getLastRow() < 1) throw new Error('La hoja AVISOS no tiene encabezados.');
  const encabezados = hoja.getRange(1, 1, 1, ultimaColumna).getDisplayValues()[0].map(function(h) {
    return String(h || '').trim();
  });
  const claves = encabezados.map(function(h) { return _normalizarEncabezadoPrograma_(h); });
  const esEsquemaAnterior = claves.indexOf('IDMENSAJE') >= 0 || claves.indexOf('TIPODESTINATARIO') >= 0;
  const id = 'MSG-EST-' + Utilities.getUuid().replace(/-/g, '').slice(0, 18).toUpperCase();
  const fecha = new Date();
  let registro;

  if (esEsquemaAnterior) {
    registro = {
      ID_MENSAJE: id,
      FECHA_ENVIO: fecha,
      ASUNTO: asunto,
      MENSAJE: mensaje,
      REMITENTE: nombre,
      TIPO_REMITENTE: 'CATEQUIZANDO',
      DESTINATARIO: nombreDestino,
      TIPO_DESTINATARIO: 'CATEQUISTA',
      ID_DESTINATARIO: idCatequista,
      ID_CLASE: '',
      TIPO_MENSAJE: 'INDIVIDUAL',
      ESTADO: 'ENVIADO',
      FECHA_LECTURA: '',
      ID_MENSAJE_ORIGINAL: '',
      WHATSAPP_LINK: '',
      OBSERVACIONES: 'MENSAJE_CATEQUIZANDO | ID_REMITENTE: ' + String(data.idNino || '').trim()
    };
  } else {
    const requeridos = ['ID_AVISO', 'FECHA', 'TITULO', 'MENSAJE', 'DIRIGIDO_A', 'PUBLICADO', 'OBSERVACIONES'];
    const faltantes = requeridos.filter(function(h) { return encabezados.map(x => x.toUpperCase()).indexOf(h) < 0; });
    if (faltantes.length) throw new Error('Faltan encabezados en AVISOS: ' + faltantes.join(', '));
    registro = {
      ID_AVISO: id,
      FECHA: fecha,
      TITULO: asunto,
      MENSAJE: mensaje,
      DIRIGIDO_A: idCatequista,
      ID_DESTINATARIO: idCatequista,
      DESTINATARIO: nombreDestino,
      TIPO_DESTINATARIO: 'CATEQUISTA',
      TIPO_REMITENTE: 'CATEQUIZANDO',
      REMITENTE: nombre,
      PUBLICADO: 'NO',
      ESTADO: 'ENVIADO',
      WHATSAPP_LINK: '',
      OBSERVACIONES: 'MENSAJE_CATEQUIZANDO | REMITENTE: ' + nombre + ' | ID_REMITENTE: ' + String(data.idNino || '').trim()
    };
  }

  hoja.appendRow(encabezados.map(function(h) {
    return Object.prototype.hasOwnProperty.call(registro, h) ? registro[h] : '';
  }));
  return { exito: true, mensaje: 'Mensaje enviado correctamente a ' + nombreDestino + '.', id: id };
}

/**
 * Registra una asistencia en la matriz existente.
 * Una celda vacía se puede completar una sola vez; un valor ya guardado no se modifica.
 */
function registrarAsistenciaEnMatriz_(data) {
  const ss = getSpreadsheet();
  const hoja = ss.getSheetByName(CONFIG.SHEET_ASISTENCIA);
  if (!hoja) throw new Error('No existe la hoja ASISTENCIA.');
  const idNino = String(data.idEstudiante || data.idNino || '').trim();
  const referencia = String(data.sesion || data.idSesion || '').trim();
  const estado = String(data.estado == null ? '' : data.estado).trim().toUpperCase();
  if (!idNino || !referencia) throw new Error('Faltan el ID del catequizando o el número de clase.');
  if (['', 'A', 'T', 'F', 'FJ'].indexOf(estado) < 0) throw new Error('Estado no válido. Use A, T, FJ, F o vacío.');

  const valores = hoja.getDataRange().getValues();
  let filaHeader = -1;
  for (let i = 0; i < valores.length; i++) {
    if (_normalizarEncabezadoPrograma_(valores[i][0]) === 'ID' &&
        _normalizarEncabezadoPrograma_(valores[i][1]) === 'APELLIDOSYNOMBRES') {
      filaHeader = i;
      break;
    }
  }
  if (filaHeader < 0) throw new Error('No se encontró la matriz de asistencia.');

  const etiquetas = filaHeader > 0 ? valores[filaHeader - 1] : [];
  const columnasSesiones = [];
  for (let c = 8; c < etiquetas.length; c++) {
    if (/^SESI[ÓO]N\s*\d+$/i.test(String(etiquetas[c] || '').trim())) columnasSesiones.push(c);
  }
  if (!columnasSesiones.length) throw new Error('La matriz no contiene columnas de sesiones.');

  let numeroClase = parseInt(referencia, 10);
  if (!/^\d+$/.test(referencia)) {
    const hojaClases = ss.getSheetByName(CONFIG.SHEET_CLASES);
    if (!hojaClases) throw new Error('No existe la hoja CLASES.');
    const clases = _leerTablaPrograma_(hojaClases);
    const clase = clases.find(function(item) {
      return String(item.IDSESION1 || '').trim() === referencia || String(item.IDSESION2 || '').trim() === referencia;
    });
    if (!clase) throw new Error('No se encontró la sesión ' + referencia + ' en CLASES.');
    numeroClase = Number(clase.NCLASE);
  }
  if (!numeroClase || numeroClase < 1 || numeroClase > columnasSesiones.length) {
    throw new Error('Número de clase fuera del rango de la matriz (' + columnasSesiones.length + ').');
  }

  let filaAlumno = -1;
  for (let r = filaHeader + 1; r < valores.length; r++) {
    if (String(valores[r][0] || '').trim() === idNino) { filaAlumno = r + 1; break; }
  }
  if (filaAlumno < 0) throw new Error('No se encontró al catequizando ' + idNino + ' en ASISTENCIA.');

  // El bloqueo de concurrencia evita dos escrituras simultáneas sobre la misma celda.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const celda = hoja.getRange(filaAlumno, columnasSesiones[numeroClase - 1] + 1);
    const estadoExistente = String(celda.getDisplayValue() || '').trim().toUpperCase();

    // La matriz usa cinco opciones: OPCION (pendiente), A, T, F y FJ.
    // OPCION es el marcador inicial del desplegable, no un registro definitivo.
    const estaPendiente = estadoExistente === '' || estadoExistente === 'OPCION';

    if (!estaPendiente) {
      if (estadoExistente === estado) {
        return {
          exito: true,
          bloqueado: true,
          mensaje: 'La asistencia ya estaba guardada y permanece bloqueada.',
          numeroClase: numeroClase,
          estado: estadoExistente
        };
      }
      throw new Error('La asistencia de la clase ' + numeroClase + ' ya está guardada (' + estadoExistente + ') y no se puede modificar.');
    }

    if (!estado) {
      return { exito: true, guardado: false, mensaje: 'No se registró ningún estado vacío.', numeroClase: numeroClase, estado: '' };
    }

    celda.setValue(estado);
    SpreadsheetApp.flush();
    return {
      exito: true,
      bloqueado: true,
      mensaje: 'Asistencia guardada y bloqueada en la clase ' + numeroClase + '.',
      numeroClase: numeroClase,
      estado: estado
    };
  } finally {
    lock.releaseLock();
  }
}

/** Encuentra una columna por encabezado normalizado, incluso si contiene tildes o signos. */
/**
 * Registra varias asistencias de un mismo catequizando.
 * Reutiliza la validación y el bloqueo de registrarAsistenciaEnMatriz_.
 * No crea filas, columnas ni pestañas.
 */
function registrarAsistenciasEnLote_(data) {
  const idNino = String(data && (data.idEstudiante || data.idNino) || '').trim();
  const entradas = data && Array.isArray(data.asistencias) ? data.asistencias : [];
  if (!idNino) throw new Error('Falta el ID del catequizando.');
  if (!entradas.length) throw new Error('No se recibieron asistencias para guardar.');

  const resultados = [];
  entradas.forEach(function(item, indice) {
    try {
      if (!item || item.sesion === undefined || item.sesion === null || String(item.sesion).trim() === '') {
        throw new Error('Falta el número de clase en el registro ' + (indice + 1) + '.');
      }
      const resultado = registrarAsistenciaEnMatriz_({
        idEstudiante: idNino,
        sesion: item.sesion,
        estado: item.estado,
        idCatequistaAutorizado: data.idCatequistaAutorizado
      });
      resultados.push({
        sesion: item.sesion,
        exito: !!(resultado && resultado.exito),
        mensaje: resultado && resultado.mensaje ? resultado.mensaje : ''
      });
    } catch (error) {
      resultados.push({
        sesion: item && item.sesion !== undefined ? item.sesion : '',
        exito: false,
        mensaje: error && error.message ? error.message : String(error)
      });
    }
  });

  const errores = resultados.filter(function(r) { return !r.exito; });
  return {
    exito: errores.length === 0,
    total: resultados.length,
    guardadas: resultados.filter(function(r) { return r.exito; }).length,
    errores: errores.length,
    resultados: resultados,
    mensaje: errores.length
      ? 'Se procesó el lote, pero ' + errores.length + ' registro(s) requieren revisión.'
      : 'Todas las asistencias del lote fueron procesadas correctamente.'
  };
}

function _indiceEncabezadoPrograma_(encabezados, candidatos) {
  const opciones = candidatos.map(_normalizarEncabezadoPrograma_);
  return encabezados.findIndex(function(h) { return opciones.indexOf(_normalizarEncabezadoPrograma_(h)) !== -1; });
}

/** Guarda recursos de cada sesión en columnas al final de SESIONES. */
function guardarMaterialSesion_(data) {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_SESIONES);
  if (!hoja) throw new Error('No existe la hoja SESIONES.');
  const idSesion = String(data.idSesion || '').trim();
  const tipo = String(data.tipo || '').trim().toUpperCase();
  const url = String(data.url || '').trim();
  const notas = String(data.notas || '').trim();
  if (!idSesion) throw new Error('Falta el ID de la sesión.');

  const mapa = {
    'PRACTICAS': 'FICHA_URL',
    'PRÁCTICAS': 'FICHA_URL',
    'EVALUACIONES': 'CUESTIONARIO_URL',
    'CANCIONES': 'CANCION_URL',
    'VIDEOS': 'VIDEO_URL'
  };
  const columnaRecurso = mapa[tipo];
  if (!columnaRecurso) throw new Error('Tipo de recurso no reconocido: ' + tipo);

  _asegurarColumnasEnHoja_(hoja, ['FICHA_URL', 'VIDEO_URL', 'CUESTIONARIO_URL', 'CANCION_URL', 'RECURSOS_NOTAS']);
  let enlace = url;
  if (data.fileBase64) {
    enlace = _subirArchivoPrograma_(data, 'CAMINO HACIA JESUS 2026 - MATERIALES', true);
  }
  if (!enlace) throw new Error('Escribe un enlace o selecciona un archivo antes de guardar.');

  const headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const colId = _indiceEncabezadoPrograma_(headers, ['ID_SESION']);
  const colRecurso = _indiceEncabezadoPrograma_(headers, [columnaRecurso]);
  const colNotas = _indiceEncabezadoPrograma_(headers, ['RECURSOS_NOTAS']);
  if (colId < 0 || colRecurso < 0) throw new Error('No se encontraron las columnas ID_SESION o ' + columnaRecurso + '.');

  const lastRow = hoja.getLastRow();
  const ids = hoja.getRange(2, colId + 1, Math.max(lastRow - 1, 1), 1).getValues();
  let row = -1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === idSesion) { row = i + 2; break; }
  }
  if (row < 0) throw new Error('No se encontró ' + idSesion + ' en SESIONES.');

  hoja.getRange(row, colRecurso + 1).setValue(enlace);
  if (notas && colNotas >= 0) {
    const anterior = String(hoja.getRange(row, colNotas + 1).getValue() || '').trim();
    const marca = Utilities.formatDate(new Date(), ZONA_HORARIA_CAMINO, 'yyyy-MM-dd HH:mm');
    const nueva = '[' + tipo + ' · ' + marca + '] ' + notas;
    hoja.getRange(row, colNotas + 1).setValue(anterior ? anterior + '\n' + nueva : nueva);
  }
  SpreadsheetApp.flush();
  return { exito: true, idSesion: idSesion, campo: columnaRecurso, url: enlace, mensaje: 'Recurso guardado en SESIONES.' };
}

/** Actualiza el registro existente de PAGOS; encabezados reales en la fila 4. */
function guardarPago_(data) {
  const idAdmin = String(data.idCatequistaAutorizado || '').trim().toUpperCase();
  if (!idAdmin || !esAdministradoraCatequista_(idAdmin)) {
    throw new Error('No tienes permisos para modificar Control de Pagos.');
  }
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_PAGOS);
  if (!hoja) throw new Error('No existe la hoja PAGOS.');
  const id = String(data.id || '').trim();
  const estado = String(data.estado || '').trim();
  if (!id) throw new Error('Falta el ID del catequizando.');
  if (['PENDIENTE','PAGADO','OBSERVADO'].indexOf(estado.toUpperCase()) < 0) {
    throw new Error('Estado no válido. Usa Pendiente, Pagado u Observado.');
  }

  const alumno = _obtenerAlumnoActivoPorId_(id);
  if (!alumno) throw new Error('El catequizando no existe o no está activo en CATEQUIZANDOS.');
  const lastCol = hoja.getLastColumn();
  const headers = hoja.getRange(4, 1, 1, lastCol).getValues()[0];
  const idx = {
    id:_indiceEncabezadoPrograma_(headers, ['ID']),
    estado:_indiceEncabezadoPrograma_(headers, ['ESTADO DE PAGO']),
    fecha:_indiceEncabezadoPrograma_(headers, ['FECHA DE PAGO']),
    numero:_indiceEncabezadoPrograma_(headers, ['N.º DE VOUCHER / OPERACIÓN','N° DE VOUCHER / OPERACION','NUMERO DE OPERACION']),
    medio:_indiceEncabezadoPrograma_(headers, ['MEDIO DE PAGO (Yape / Plin / Efectivo)','MEDIO DE PAGO','BANCO / MEDIO DE PAGO']),
    obs:_indiceEncabezadoPrograma_(headers, ['OBSERVACIONES']),
    voucher:_indiceEncabezadoPrograma_(headers, ['FOTO / IMAGEN DEL VOUCHER','FOTO / IMAGEN DEL VOUCHER (Espacio)','VOUCHER'])
  };
  if (idx.id < 0 || idx.estado < 0) throw new Error('La fila 4 de PAGOS debe contener las columnas ID y ESTADO DE PAGO.');
  const lastRow = hoja.getLastRow();
  if (lastRow < 5) throw new Error('La hoja PAGOS no contiene filas de estudiantes.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ids = hoja.getRange(5, idx.id + 1, lastRow - 4, 1).getDisplayValues();
    let row = -1;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').trim() === id) { row = i + 5; break; }
    }
    if (row < 0) throw new Error('No existe una fila de pago para ' + id + '. No se creó una fila nueva para evitar duplicados.');

    const medio = data.medioPago === undefined ? '' : String(data.medioPago || '').trim();
    const mediosValidos = ['BCP','YAPE','PLIN','TRANSFERENCIA','EFECTIVO'];
    if (medio && mediosValidos.indexOf(medio.toUpperCase()) < 0) throw new Error('Medio de pago no válido.');
    if (estado.toUpperCase() === 'PAGADO' && idx.medio >= 0) {
      const medioFinal = medio || String(hoja.getRange(row, idx.medio + 1).getValue() || '').trim();
      if (!medioFinal) throw new Error('Selecciona el banco o medio de pago antes de marcar como Pagado.');
    }

    let voucherUrl = '';
    if (data.fileBase64) {
      if (idx.voucher < 0) throw new Error('No se encontró la columna FOTO / IMAGEN DEL VOUCHER en la fila 4.');
      const mime = String(data.mimeType || '').toLowerCase();
      if (['image/jpeg','image/png','image/webp','application/pdf'].indexOf(mime) < 0) {
        throw new Error('El voucher debe ser una imagen JPG, PNG, WEBP o un PDF.');
      }
      voucherUrl = _subirArchivoPrograma_(data, 'CAMINO HACIA JESUS 2026 - VOUCHERS', false);
      // El archivo sigue privado: se concede solo permiso de lector a las
      // cuentas activas de CATEQUISTAS, para que puedan consultar el voucher.
      compartirVoucherConCatequistasActivos_(voucherUrl);
    }

    hoja.getRange(row, idx.estado + 1).setValue(estado.charAt(0).toUpperCase() + estado.slice(1).toLowerCase());
    if (idx.fecha >= 0) {
      if (estado.toUpperCase() === 'PAGADO') {
        if (!hoja.getRange(row, idx.fecha + 1).getValue()) hoja.getRange(row, idx.fecha + 1).setValue(new Date());
      } else {
        hoja.getRange(row, idx.fecha + 1).clearContent();
      }
    }
    if (idx.numero >= 0 && data.numeroVoucher !== undefined) hoja.getRange(row, idx.numero + 1).setValue(String(data.numeroVoucher || '').trim());
    if (idx.medio >= 0 && data.medioPago !== undefined) hoja.getRange(row, idx.medio + 1).setValue(medio);
    if (idx.obs >= 0 && data.observaciones !== undefined) hoja.getRange(row, idx.obs + 1).setValue(String(data.observaciones || '').trim());
    if (voucherUrl) hoja.getRange(row, idx.voucher + 1).setValue(voucherUrl);
    SpreadsheetApp.flush();

    // Confirma que la fila ya refleja el estado escrito antes de responder.
    const estadoGuardado = String(hoja.getRange(row, idx.estado + 1).getDisplayValue() || '').trim();
    if (estadoGuardado.toUpperCase() !== estado.toUpperCase()) throw new Error('Google Sheets no confirmó la actualización del estado.');
    return {exito:true, mensaje:'Pago actualizado y confirmado en Google Sheets.', id:id, estado:estadoGuardado, voucherUrl:voucherUrl};
  } finally {
    lock.releaseLock();
  }
}

/**
 * Comparte el voucher en modo LECTOR con las cuentas activas de CATEQUISTAS.
 * No activa "cualquier persona con el enlace"; la autorización se limita a
 * los correos institucionales registrados en la hoja.
 */
function compartirVoucherConCatequistasActivos_(urlArchivo) {
  const coincidencia = String(urlArchivo || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!coincidencia) return {compartidos:0};
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUISTAS);
  if (!hoja) return {compartidos:0};
  const filas = _leerTablaPrograma_(hoja);
  const archivo = DriveApp.getFileById(coincidencia[1]);
  const compartidos = {};
  filas.forEach(function(f) {
    const estado = String(f.ACTIVO == null ? '' : f.ACTIVO).trim().toUpperCase();
    const activo = !estado || ['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'].indexOf(estado) >= 0;
    const correo = String(f.CORREO || '').trim();
    if (!activo || !correo || compartidos[correo.toLowerCase()]) return;
    try {
      archivo.addViewer(correo);
      compartidos[correo.toLowerCase()] = true;
    } catch (e) {
      Logger.log('No se pudo compartir el voucher con ' + correo + ': ' + e.message);
    }
  });
  return {compartidos:Object.keys(compartidos).length};
}

/** Guarda un archivo en Drive; los vouchers permanecen privados. */
function _subirArchivoPrograma_(data, nombreCarpeta, compartirEnlace) {
  const base64 = String(data.fileBase64 || '');
  if (!base64) throw new Error('El archivo adjunto está vacío.');
  if (base64.length > 7200000) throw new Error('El archivo supera el límite de 5 MB.');
  const nombre = String(data.fileName || 'archivo-programa').replace(/[\\/:*?"<>|]/g, '_').slice(0, 140);
  const mime = String(data.mimeType || 'application/octet-stream');
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mime, nombre);
  const carpetas = DriveApp.getFoldersByName(nombreCarpeta);
  const carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder(nombreCarpeta);
  const archivo = carpeta.createFile(blob);
  if (compartirEnlace) archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return archivo.getUrl();
}

function sincronizarCumpleanosCalendario() {
  const padres = getSheetData(CONFIG.SHEET_PADRES);
  const calendario = CalendarApp.getDefaultCalendar();
  const anioActual = new Date().getFullYear();

  padres.forEach(p => {
    const cumpleStr = p.CUMPLEAÑOS || p.CUMPLEANOS || p.FECHA_NACIMIENTO;
    const nombres = p.NOMBRES || p.NOMBRE || '';
    const apellidos = p.APELLIDOS || p.APELLIDO || '';
    const parentesco = p.PARENTESCO || p.TIPO || 'Familiar';

    if (cumpleStr && nombres) {
      let mes, dia;
      if (typeof cumpleStr === 'string' && cumpleStr.includes('-')) {
        const partes = cumpleStr.split('T')[0].split('-');
        if (partes.length >= 3) {
          mes = parseInt(partes[1], 10) - 1;
          dia = parseInt(partes[2], 10);
        }
      } else {
        const fechaNac = new Date(cumpleStr);
        if (!isNaN(fechaNac.getTime())) {
          mes = fechaNac.getMonth();
          dia = fechaNac.getDate();
        }
      }

      if (mes !== undefined && dia !== undefined && !isNaN(mes) && !isNaN(dia)) {
        const fechaEvento = new Date(anioActual, mes, dia);
        const titulo = `🎂 Cumpleaños: ${nombres} ${apellidos} (${parentesco}) - Camino hacia Jesús`;
        const inicioBusqueda = new Date(anioActual, mes, dia, 0, 0, 0);
        const finBusqueda = new Date(anioActual, mes, dia, 23, 59, 59);
        const eventosExistentes = calendario.getEvents(inicioBusqueda, finBusqueda);
        const yaExiste = eventosExistentes.some(ev => ev.getTitle().includes(nombres));
        
        if (!yaExiste) {
          calendario.createAllDayEvent(titulo, fechaEvento, {
            description: 'Recordatorio automático del programa de Catequesis - Colegio La Salle del Sur y Parroquia San Pedro de Lurín.'
          });
        }
      }
    }
  });
}

function respuestaJson_(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   AVANCE DE FICHAS INTERACTIVAS — Google Sheets
   Registra únicamente finalización; no guarda respuestas ni notas.
   ========================================================= */
const FICHAS_AVANCE_SHEET = 'FICHAS_AVANCE';
const FICHAS_AVANCE_HEADERS = [
  'ID_REGISTRO','FECHA_COMPLETADA','ID_NINO','NOMBRE_CATEQUIZANDO',
  'ID_SESION','TEMA','BLOQUE','CATEQUISTA_ASIGNADA',
  'RESPUESTAS_CORRECTAS','TOTAL_PREGUNTAS','NOTA_SOBRE_20',
  'EQUIVALENCIA','ESTADO'
];

function prepararHojaAvanceFichas() {
  const hoja = _obtenerOCrearHojaQuiz_(getSpreadsheet(), FICHAS_AVANCE_SHEET, FICHAS_AVANCE_HEADERS);
  return { exito:true, mensaje:'Hoja FICHAS_AVANCE preparada sin modificar las hojas existentes.', hoja:hoja.getName() };
}

function registrarFichaCompletada_(data, idNinoAutorizado) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const alumno = _quizAlumnoActivo_(idNinoAutorizado);
    if (!alumno) throw new Error('El catequizando no está registrado como vigente.');
    const tema = _quizTema_(data.idSesion);
    const ss = getSpreadsheet();
    const hoja = _obtenerOCrearHojaQuiz_(ss, FICHAS_AVANCE_SHEET, FICHAS_AVANCE_HEADERS);
    const filas = hoja.getLastRow() > 1 ? _leerTablaPrograma_(hoja) : [];
    const existente = filas.findIndex(f =>
      String(f.IDNINO || '').trim() === String(idNinoAutorizado).trim() &&
      String(f.IDSESION || '').trim() === String(data.idSesion).trim()
    );
    const clases = getSheetData(CONFIG.SHEET_CLASES);
    const asignados = [];
    clases.forEach(c => {
      const ids = [c.IDSESION1, c.IDSESION2].map(v => String(v || '').trim());
      if (ids.indexOf(String(data.idSesion).trim()) >= 0) {
        const nombre = String(c.CATEQUISTA || '').trim();
        if (nombre && asignados.indexOf(nombre) < 0) asignados.push(nombre);
      }
    });
    const correctas = Number(data.correctas);
    const total = Number(data.total);
    if (!Number.isInteger(correctas) || !Number.isInteger(total) || total < 1 || correctas < 0 || correctas > total || total > 30) {
      throw new Error('El resultado de la ficha no es válido.');
    }
    const nota = Math.round((correctas / total) * 20 * 100) / 100;
    const equivalencia = nota >= 18 ? 'AD' : nota >= 14 ? 'A' : nota >= 11 ? 'B' : 'C';
    const registro = {
      ID_REGISTRO:'FIC-' + String(idNinoAutorizado) + '-' + String(data.idSesion),
      FECHA_COMPLETADA:new Date(),
      ID_NINO:String(idNinoAutorizado),
      NOMBRE_CATEQUIZANDO:[alumno.NOMBRES, alumno.APELLIDOS].filter(Boolean).join(' '),
      ID_SESION:String(data.idSesion),
      TEMA:String(tema.TEMA || ''),
      BLOQUE:String(tema.BLOQUE || ''),
      CATEQUISTA_ASIGNADA:asignados.join(' / ') || 'SIN ASIGNACIÓN EN CLASES',
      RESPUESTAS_CORRECTAS:correctas,
      TOTAL_PREGUNTAS:total,
      NOTA_SOBRE_20:nota,
      EQUIVALENCIA:equivalencia,
      ESTADO:'COMPLETADA'
    };
    const headers = hoja.getRange(1,1,1,hoja.getLastColumn()).getValues()[0].map(v => String(v || '').trim());
    const valores = headers.map(h => Object.prototype.hasOwnProperty.call(registro,h) ? registro[h] : '');
    if (existente >= 0) hoja.getRange(existente + 2,1,1,valores.length).setValues([valores]);
    else hoja.appendRow(valores);
    SpreadsheetApp.flush();
    return { exito:true, mensaje:'Resultado de ficha registrado.', idSesion:String(data.idSesion), correctas:correctas, total:total, nota:nota, equivalencia:equivalencia, estado:'COMPLETADA' };
  } finally {
    lock.releaseLock();
  }
}

function getAvanceFichasNino_(idNino) {
  const ss = getSpreadsheet();
  const hoja = ss.getSheetByName(FICHAS_AVANCE_SHEET);
  if (!hoja || hoja.getLastRow() < 2) return { exito:true, avance:[] };
  const avance = _leerTablaPrograma_(hoja)
    .filter(f => String(f.IDNINO || '').trim() === String(idNino).trim())
    .map(f => ({
      idSesion:String(f.IDSESION || ''),
      tema:String(f.TEMA || ''),
      bloque:String(f.BLOQUE || ''),
      fecha:f.FECHACOMPLETADA || '',
      correctas:Number(f.RESPUESTASCORRECTAS || 0),
      total:Number(f.TOTALPREGUNTAS || 0),
      nota:Number(f.NOTASOBRE20 || 0),
      equivalencia:String(f.EQUIVALENCIA || ''),
      estado:String(f.ESTADO || '')
    }));
  return { exito:true, avance:avance };
}

/* =========================================================
   CUESTIONARIOS POR TEMA — Google Sheets
   Cada tema recorre todas sus preguntas; el bloque avanza por porcentaje hasta completarlas todas.
   La respuesta correcta nunca se envía al navegador.
   ========================================================= */
const QUIZ_SHEET_PREGUNTAS = 'BANCO_PREGUNTAS';
const QUIZ_SHEET_INTENTOS = 'INTENTOS_CUESTIONARIO';
const QUIZ_HEADERS_PREGUNTAS = [
  'ID_PREGUNTA','ID_SESION','BLOQUE','TEMA','PREGUNTA',
  'OPCION_A','OPCION_B','OPCION_C','RESPUESTA_CORRECTA','EXPLICACION','ACTIVO'
];
const QUIZ_HEADERS_INTENTOS = [
  'ID_INTENTO','FECHA_REGISTRO','ID_NINO','NOMBRE_CATEQUIZANDO',
  'ID_SESION','TEMA','CORRECTAS','TOTAL_PREGUNTAS','NOTA_NUMERICA','ESTADO'
];

/** Ejecutar una sola vez para crear las dos hojas técnicas sin tocar las existentes. */
function prepararHojasCuestionarios() {
  const ss = getSpreadsheet();
  const preguntas = _obtenerOCrearHojaQuiz_(ss, QUIZ_SHEET_PREGUNTAS, QUIZ_HEADERS_PREGUNTAS);
  const intentos = _obtenerOCrearHojaQuiz_(ss, QUIZ_SHEET_INTENTOS, QUIZ_HEADERS_INTENTOS);
  return {
    exito: true,
    mensaje: 'Estructura de cuestionarios preparada. No se modificaron las hojas existentes.',
    hojas: [preguntas.getName(), intentos.getName()]
  };
}

function _obtenerOCrearHojaQuiz_(ss, nombre, encabezados) {
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) hoja = ss.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    hoja.setFrozenRows(1);
  } else {
    const actuales = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(v => String(v || '').trim());
    const faltantes = encabezados.filter(h => actuales.indexOf(h) === -1);
    if (faltantes.length) throw new Error('La hoja ' + nombre + ' ya existe con encabezados distintos. No se modificó. Faltan: ' + faltantes.join(', '));
  }
  return hoja;
}

function _quizAlumnoActivo_(idNino) {
  const id = String(idNino || '').trim();
  if (!id) return null;

  // La identidad se consulta muchas veces durante un cuestionario. Mantener
  // una caché corta evita releer CATEQUIZANDOS en cada respuesta, sin dejar
  // cambios de vigencia almacenados durante mucho tiempo.
  const cache = CacheService.getScriptCache();
  const cacheKey = 'lds_quiz_alumno_v9_' + encodeURIComponent(id).slice(0, 120);
  try {
    const almacenado = cache.get(cacheKey);
    if (almacenado) {
      const dato = JSON.parse(almacenado);
      if (dato && dato.ID_NINO === id) return dato.activo ? dato.alumno : null;
    }
  } catch (errorCache) {}

  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_CATEQUIZANDOS);
  if (!hoja) throw new Error('No existe la pestaña CATEQUIZANDOS.');
  const ultimaFila = hoja.getLastRow();
  const ultimaColumna = hoja.getLastColumn();
  if (ultimaFila < 2 || ultimaColumna < 1) return null;

  const encabezados = hoja.getRange(1, 1, 1, ultimaColumna).getDisplayValues()[0]
    .map(_normalizarEncabezadoPrograma_);
  const col = nombre => encabezados.indexOf(_normalizarEncabezadoPrograma_(nombre));
  const cId = col('ID_NINO');
  const cVigente = col('VIGENTE');
  if (cId < 0) throw new Error('Falta el encabezado ID_NINO en CATEQUIZANDOS.');

  const ids = hoja.getRange(2, cId + 1, ultimaFila - 1, 1).getDisplayValues();
  let fila = -1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === id) { fila = i + 2; break; }
  }
  if (fila < 0) {
    try { cache.put(cacheKey, JSON.stringify({ ID_NINO: id, activo: false }), 30); } catch (e) {}
    return null;
  }

  const valores = hoja.getRange(fila, 1, 1, ultimaColumna).getDisplayValues()[0];
  const vigente = cVigente < 0 ? '' : String(valores[cVigente] || '').trim().toUpperCase();
  const activo = !vigente || ['SI','SÍ','TRUE','1','ACTIVO','VIGENTE'].indexOf(vigente) >= 0;
  if (!activo) {
    try { cache.put(cacheKey, JSON.stringify({ ID_NINO: id, activo: false }), 30); } catch (e) {}
    return null;
  }

  const leer = nombre => {
    const indice = col(nombre);
    return indice < 0 ? '' : String(valores[indice] == null ? '' : valores[indice]).trim();
  };
  const alumno = {
    ID_NINO: id,
    NOMBRES: leer('NOMBRES'),
    APELLIDOS: leer('APELLIDOS'),
    GRADO: leer('GRADO'),
    FOTO: leer('FOTO'),
    VIGENTE: vigente
  };
  try { cache.put(cacheKey, JSON.stringify({ ID_NINO: id, activo: true, alumno: alumno }), 30); } catch (e) {}
  return alumno;
}

function _quizNormalizarIdSesion_(valor) {
  return String(valor == null ? '' : valor).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Normaliza títulos para relacionar TEMA aunque cambien tildes, signos o espacios. */
function _quizNormalizarTema_(valor) {
  return String(valor == null ? '' : valor)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function _quizEsActivo_(valor) {
  return ['SI', 'SÍ', 'TRUE', '1', 'ACTIVO'].indexOf(String(valor == null ? '' : valor).trim().toUpperCase()) >= 0;
}

function _quizBloqueNumero_(valor) {
  const texto = String(valor == null ? '' : valor).toUpperCase();
  const match = texto.match(/BLOQUE\s*([1-6])/);
  if (match) return Number(match[1]);
  const solo = texto.match(/^\s*([1-6])\s*$/);
  return solo ? Number(solo[1]) : 0;
}

function _quizTema_(idSesion) {
  const id = String(idSesion == null ? '' : idSesion).trim();
  if (!id) throw new Error('No se recibió el ID_SESION del tema.');
  const norm = _quizNormalizarIdSesion_(id);
  const hoja = getSpreadsheet().getSheetByName(CONFIG.SHEET_SESIONES);
  if (!hoja) throw new Error('No existe la hoja SESIONES.');
  const filas = _leerTablaPrograma_(hoja);
  const coincidencias = filas.filter(f => _quizNormalizarIdSesion_(f.IDSESION) === norm);
  if (!coincidencias.length) throw new Error('El ID_SESION ' + id + ' no existe en SESIONES.');
  if (coincidencias.length > 1) throw new Error('El ID_SESION ' + id + ' está duplicado en SESIONES.');
  return coincidencias[0];
}

/**
 * Construye el catálogo real desde SESIONES + BANCO_PREGUNTAS.
 * SESIONES determina el bloque y el tema oficiales. BANCO_PREGUNTAS.TEMA agrupa
 * las preguntas; BANCO_PREGUNTAS.ID_SESION no se usa porque identifica cada fila
 * de pregunta (CJ001, CJ002...), no la sesión CJ-001, CJ-002...
 * No modifica ninguna celda del libro.
 */
/**
 * Catálogo cacheado por tema. Evita volver a leer y procesar las 2,948 filas
 * del banco en cada respuesta. El caché dura 5 minutos; si falta una pieza,
 * reconstruye desde Google Sheets y renueva el caché sin modificar datos.
 */
function _quizCargarCatalogo_() {
  const cache = CacheService.getScriptCache();
  const metaKey = 'lds_quiz_catalogo_v5_meta';
  try {
    const metaTexto = cache.get(metaKey);
    if (metaTexto) {
      const meta = JSON.parse(metaTexto);
      const keys = (meta.sesiones || []).map(s => _quizClaveCacheTemaV5_(_quizNormalizarIdSesion_(s.IDSESION)));
      const guardadas = keys.length ? cache.getAll(keys) : {};
      const completas = keys.every(k => Object.prototype.hasOwnProperty.call(guardadas, k));
      if (completas) {
        const porSesion = {};
        const sesionesPorId = {};
        const porBloque = {};
        (meta.sesiones || []).forEach(s => {
          const id = _quizNormalizarIdSesion_(s.IDSESION);
          const key = _quizClaveCacheTemaV5_(id);
          const preguntas = JSON.parse(guardadas[key] || '[]');
          porSesion[id] = preguntas;
          sesionesPorId[id] = s;
          preguntas.forEach(p => {
            const bloqueKey = _quizNormalizarTema_(p.QUIZ_BLOQUE || p.BLOQUE);
            if (!porBloque[bloqueKey]) porBloque[bloqueKey] = [];
            porBloque[bloqueKey].push(p);
          });
        });
        Object.keys(porBloque).forEach(k => porBloque[k].sort((a, b) => Number(a.IDPREGUNTA) - Number(b.IDPREGUNTA)));
        return {
          sesiones: meta.sesiones || [],
          sesionesPorId: sesionesPorId,
          porSesion: porSesion,
          porBloque: porBloque,
          // El diagnóstico solo consulta .length de esta colección.
          activasConId: new Array(Number(meta.activasConIdCount) || 0),
          noAsignadas: meta.noAsignadas || [],
          filasIncompletas: meta.filasIncompletas || [],
          bloqueDiscrepante: meta.bloqueDiscrepante || []
        };
      }
    }
  } catch (errorCache) {
    // Si el caché está incompleto o expiró parcialmente, se reconstruye abajo.
  }

  const catalogo = _quizCargarCatalogoDesdeHojas_();
  try {
    const entradas = {};
    let cacheCompleto = true;
    Object.keys(catalogo.porSesion).forEach(id => {
      const compactas = (catalogo.porSesion[id] || []).map(p => ({
        IDPREGUNTA: p.IDPREGUNTA,
        TEMA: p.TEMA,
        BLOQUE: p.BLOQUE,
        PREGUNTA: p.PREGUNTA,
        OPCIONA: p.OPCIONA,
        OPCIONB: p.OPCIONB,
        OPCIONC: p.OPCIONC,
        RESPUESTACORRECTA: p.RESPUESTACORRECTA,
        EXPLICACION: p.EXPLICACION,
        QUIZ_IDSESION: p.QUIZ_IDSESION,
        QUIZ_TEMA: p.QUIZ_TEMA,
        QUIZ_BLOQUE: p.QUIZ_BLOQUE,
        QUIZ_NUMERO_BLOQUE: p.QUIZ_NUMERO_BLOQUE
      }));
      const json = JSON.stringify(compactas);
      if (json.length > 90000) {
        cacheCompleto = false;
        return;
      }
      entradas[_quizClaveCacheTemaV5_(id)] = json;
    });
    if (cacheCompleto) {
      cache.putAll(entradas, 300);
      const meta = {
        sesiones: catalogo.sesiones,
        activasConIdCount: catalogo.activasConId.length,
        noAsignadas: (catalogo.noAsignadas || []).map(f => ({
          IDPREGUNTA: f.IDPREGUNTA, TEMA: f.TEMA, BLOQUE: f.BLOQUE
        })),
        filasIncompletas: catalogo.filasIncompletas || [],
        bloqueDiscrepante: catalogo.bloqueDiscrepante || []
      };
      const verificadas = cache.getAll(Object.keys(entradas));
      if (Object.keys(entradas).every(k => Object.prototype.hasOwnProperty.call(verificadas, k))) {
        cache.put(metaKey, JSON.stringify(meta), 300);
      }
    }
  } catch (errorGuardarCache) {
    // El funcionamiento nunca depende del caché; conserva el catálogo leído.
  }
  return catalogo;
}

function _quizClaveCacheTemaV5_(idNormalizado) {
  return 'lds_quiz_v5_tema_' + String(idNormalizado || '').slice(0, 100);
}

function _quizCargarCatalogoDesdeHojas_() {
  const ss = getSpreadsheet();
  const hojaSesiones = ss.getSheetByName(CONFIG.SHEET_SESIONES);
  const hojaBanco = ss.getSheetByName(QUIZ_SHEET_PREGUNTAS);
  if (!hojaSesiones) throw new Error('No existe la hoja SESIONES.');
  if (!hojaBanco || hojaBanco.getLastRow() < 2) throw new Error('BANCO_PREGUNTAS todavía no está cargado.');

  const sesiones = _leerTablaPrograma_(hojaSesiones).filter(s => String(s.IDSESION || '').trim());
  const banco = _leerTablaPrograma_(hojaBanco);
  const bancoActivoPorTema = {};
  const activos = banco.filter(f => _quizEsActivo_(f.ACTIVO));

  activos.forEach(f => {
    const clave = _quizNormalizarTema_(f.TEMA);
    if (!clave) return;
    if (!bancoActivoPorTema[clave]) bancoActivoPorTema[clave] = [];
    bancoActivoPorTema[clave].push(f);
  });

  const sesionesPorTema = {};
  sesiones.forEach(s => {
    const clave = _quizNormalizarTema_(s.TEMA);
    if (!clave) return;
    if (!sesionesPorTema[clave]) sesionesPorTema[clave] = [];
    sesionesPorTema[clave].push(s);
  });

  const porSesion = {};
  const porBloque = {};
  const sesionesPorId = {};
  const asignadas = {};
  const filasIncompletas = [];
  const bloqueDiscrepante = [];

  sesiones.forEach(s => {
    const idSesion = String(s.IDSESION || '').trim();
    const idNormalizado = _quizNormalizarIdSesion_(idSesion);
    const temaNormalizado = _quizNormalizarTema_(s.TEMA);
    const bloque = String(s.BLOQUE || '').trim();
    const claveBloque = _quizNormalizarTema_(bloque);
    const numeroBloque = _quizBloqueNumero_(bloque);
    if (!temaNormalizado || !claveBloque || !numeroBloque) {
      porSesion[idNormalizado] = [];
      sesionesPorId[idNormalizado] = s;
      return;
    }

    const mismoTema = sesionesPorTema[temaNormalizado] || [];
    const indiceMismoTema = mismoTema.findIndex(x => _quizNormalizarIdSesion_(x.IDSESION) === idNormalizado);
    let candidatas = [];
    if (mismoTema.length <= 1 || indiceMismoTema === 0) {
      candidatas = bancoActivoPorTema[temaNormalizado] || [];
    } else {
      // Cuando SESIONES repite un título (actualmente EL SAGRARIO), el banco
      // distingue la segunda serie mediante el sufijo de TEMA, por ejemplo
      // "El Sagrario (Profundización)".
      candidatas = activos.filter(f => {
        const t = _quizNormalizarTema_(f.TEMA);
        return t !== temaNormalizado && t.indexOf(temaNormalizado) === 0;
      });
    }

    const preguntas = [];
    candidatas.forEach(f => {
      const idPregunta = String(f.IDPREGUNTA == null ? '' : f.IDPREGUNTA).trim();
      const idKey = idPregunta;
      if (!idPregunta) {
        filasIncompletas.push({ idPregunta: '', tema: String(f.TEMA || ''), motivo: 'Falta ID_PREGUNTA' });
        return;
      }
      if (asignadas[idKey]) {
        // No repetir una pregunta en dos temas. Si SESIONES tiene dos títulos
        // iguales, la serie adicional solo puede estar asignada a su sesión específica.
        if (asignadas[idKey] !== idNormalizado) {
          filasIncompletas.push({ idPregunta: idPregunta, tema: String(f.TEMA || ''), motivo: 'Pregunta candidata a más de una sesión' });
        }
        return;
      }

      const correcta = String(f.RESPUESTACORRECTA || '').trim().toUpperCase();
      const faltan = [];
      if (!String(f.PREGUNTA || '').trim()) faltan.push('PREGUNTA');
      if (!String(f.OPCIONA || '').trim()) faltan.push('OPCION_A');
      if (!String(f.OPCIONB || '').trim()) faltan.push('OPCION_B');
      if (!String(f.OPCIONC || '').trim()) faltan.push('OPCION_C');
      if (['A', 'B', 'C'].indexOf(correcta) < 0) faltan.push('RESPUESTA_CORRECTA');
      if (faltan.length) {
        filasIncompletas.push({ idPregunta: idPregunta, tema: String(f.TEMA || ''), motivo: faltan.join(', ') });
        return;
      }

      asignadas[idKey] = idNormalizado;
      const pregunta = Object.assign({}, f, {
        QUIZ_IDSESION: idSesion,
        QUIZ_TEMA: String(s.TEMA || '').trim(),
        QUIZ_BLOQUE: bloque,
        QUIZ_NUMERO_BLOQUE: numeroBloque
      });
      preguntas.push(pregunta);
      if (!porBloque[claveBloque]) porBloque[claveBloque] = [];
      porBloque[claveBloque].push(pregunta);

      const bloqueBanco = _quizNormalizarTema_(f.BLOQUE);
      if (bloqueBanco && bloqueBanco !== claveBloque) {
        bloqueDiscrepante.push({
          idPregunta: idPregunta,
          tema: String(f.TEMA || ''),
          bloqueEnBanco: String(f.BLOQUE || ''),
          bloqueSegunSesiones: bloque
        });
      }
    });

    porSesion[idNormalizado] = preguntas;
    sesionesPorId[idNormalizado] = s;
  });

  Object.keys(porBloque).forEach(k => {
    porBloque[k].sort((a, b) => Number(a.IDPREGUNTA) - Number(b.IDPREGUNTA));
  });
  Object.keys(porSesion).forEach(k => {
    porSesion[k].sort((a, b) => Number(a.IDPREGUNTA) - Number(b.IDPREGUNTA));
  });

  const activasConId = activos.filter(f => String(f.IDPREGUNTA || '').trim());
  const noAsignadas = activasConId.filter(f => !asignadas[String(f.IDPREGUNTA).trim()]);

  return {
    sesiones: sesiones,
    sesionesPorId: sesionesPorId,
    porSesion: porSesion,
    porBloque: porBloque,
    activasConId: activasConId,
    noAsignadas: noAsignadas,
    filasIncompletas: filasIncompletas,
    bloqueDiscrepante: bloqueDiscrepante
  };
}

function _quizIntentos_(idNino, idSesion) {
  const hoja = getSpreadsheet().getSheetByName(QUIZ_SHEET_INTENTOS);
  if (!hoja || hoja.getLastRow() < 2) return [];
  return _leerTablaPrograma_(hoja).filter(f =>
    String(f.IDNINO || '').trim() === String(idNino).trim() &&
    _quizNormalizarIdSesion_(f.IDSESION) === _quizNormalizarIdSesion_(idSesion)
  );
}

function _quizClaveCacheRespondidasV5_(idNino) {
  return 'lds_quiz_v5_resp_' + encodeURIComponent(String(idNino || '').trim()).slice(0, 150);
}

function _quizGuardarCacheRespondidasV5_(idNino, ids) {
  try {
    const json = JSON.stringify(ids || {});
    if (json.length < 90000) CacheService.getScriptCache().put(_quizClaveCacheRespondidasV5_(idNino), json, 600);
  } catch (error) {}
}

function _quizIdsRespondidosAlumno_(idNino) {
  const idAlumno = String(idNino || '').trim();
  const cache = CacheService.getScriptCache();
  const clave = _quizClaveCacheRespondidasV5_(idAlumno);
  try {
    const guardado = cache.get(clave);
    if (guardado) return JSON.parse(guardado);
  } catch (errorCache) {}

  const ids = {};
  const hoja = getSpreadsheet().getSheetByName(QUIZ_SHEET_INTENTOS);
  if (hoja && hoja.getLastRow() >= 2) {
    _leerTablaPrograma_(hoja).forEach(f => {
      if (String(f.IDNINO || '').trim() !== idAlumno) return;
      String(f.IDPREGUNTASREALIZADAS || '').split('|').forEach(id => {
        const limpio = String(id || '').trim();
        if (limpio) ids[limpio] = true;
      });
    });
  }
  _quizGuardarCacheRespondidasV5_(idAlumno, ids);
  return ids;
}

/** Añade el encabezado técnico al final; nunca borra, mueve ni sobreescribe columnas. */
function _quizAsegurarColumnaSeguimiento_(hoja) {
  if (!hoja) throw new Error('No existe INTENTOS_CUESTIONARIO.');
  const ultimaColumna = Math.max(hoja.getLastColumn(), 1);
  const headers = hoja.getRange(1, 1, 1, ultimaColumna).getDisplayValues()[0].map(v => String(v || '').trim());
  if (headers.indexOf('ID_PREGUNTAS_REALIZADAS') < 0) {
    hoja.getRange(1, ultimaColumna + 1).setValue('ID_PREGUNTAS_REALIZADAS');
  }
}

function _quizProgresoBloque_(catalogo, idNino, bloque, respondidasPrecargadas) {
  const claveBloque = _quizNormalizarTema_(bloque);
  const preguntas = catalogo.porBloque[claveBloque] || [];
  const respondidas = respondidasPrecargadas || _quizIdsRespondidosAlumno_(idNino);
  const desarrolladas = preguntas.filter(p => respondidas[String(p.IDPREGUNTA || '').trim()]).length;
  const porcentaje = preguntas.length ? Math.round((desarrolladas / preguntas.length) * 1000) / 10 : 0;
  return {
    porcentajeBloque: porcentaje,
    completadoBloque: preguntas.length > 0 && desarrolladas >= preguntas.length,
    totalInterno: preguntas.length,
    desarrolladasInterno: desarrolladas
  };
}

function obtenerProgresoBloqueCatequizando_(numeroBloque, idNino) {
  try {
    const alumno = _quizAlumnoActivo_(idNino);
    if (!alumno) throw new Error('Selecciona un catequizando vigente.');
    const numero = _quizBloqueNumero_(numeroBloque);
    if (!numero) throw new Error('No se reconoció el bloque solicitado.');
    const catalogo = _quizCargarCatalogo_();
    const sesiones = catalogo.sesiones.filter(s => _quizBloqueNumero_(s.BLOQUE) === numero);
    if (!sesiones.length) throw new Error('No se encontraron temas de ese bloque en SESIONES.');
    const bloqueOficial = String(sesiones[0].BLOQUE || '').trim();
    const avance = _quizProgresoBloque_(catalogo, idNino, bloqueOficial);
    return {
      exito: true,
      bloque: bloqueOficial,
      porcentajeBloque: avance.porcentajeBloque,
      completadoBloque: avance.completadoBloque
    };
  } catch (error) {
    return { exito: false, mensaje: error && error.message ? error.message : String(error) };
  }
}

/**
 * Devuelve la siguiente pregunta pendiente del tema. La aventura del bloque
 * termina cuando el catequizando responde todas las preguntas activas asignadas
 * a todos los temas del bloque. El navegador nunca recibe cantidades totales.
 */
/** Estado de cuestionarios de 10 preguntas derivado de INTENTOS_CUESTIONARIO; no cambia encabezados ni crea hojas. */
function _quizGruposBloqueV10_(numeroBloque,idNino,catalogo){
 const numero=_quizBloqueNumero_(numeroBloque);if(!numero||numero<1||numero>6)throw new Error('El bloque solicitado no es válido.');
 const sesiones=catalogo.sesiones.filter(s=>_quizBloqueNumero_(s.BLOQUE)===numero);if(!sesiones.length)throw new Error('No se encontraron sesiones para el bloque.');
 const bloqueOficial=String(sesiones[0].BLOQUE||'').trim(),claveBloque=_quizNormalizarTema_(bloqueOficial);
 const preguntas=(catalogo.porBloque[claveBloque]||[]).slice().sort((a,b)=>Number(a.IDPREGUNTA)-Number(b.IDPREGUNTA));
 const respondidas=_quizIdsRespondidosAlumno_(idNino),grupos=[];
 for(let i=0;i<preguntas.length;i+=10){const conjunto=preguntas.slice(i,i+10),n=conjunto.filter(p=>respondidas[String(p.IDPREGUNTA||'').trim()]).length;grupos.push({numero:grupos.length+1,estado:n===conjunto.length?'COMPLETADO':n?'INCOMPLETO':'PENDIENTE',primeraPendiente:conjunto.find(p=>!respondidas[String(p.IDPREGUNTA||'').trim()])||null,preguntas:conjunto});}
 const avance=_quizProgresoBloque_(catalogo,idNino,bloqueOficial,respondidas);return {numero,bloqueOficial,preguntas,grupos,respondidas,porcentajeBloque:avance.porcentajeBloque,completadoBloque:avance.completadoBloque};
}
function obtenerCuestionariosBloque_(numeroBloque,idNino){try{const alumno=_quizAlumnoActivo_(idNino);if(!alumno)throw new Error('Selecciona un catequizando vigente.');const c=_quizCargarCatalogo_(),i=_quizGruposBloqueV10_(numeroBloque,idNino,c);return {exito:true,numeroBloque:i.numero,bloque:i.bloqueOficial,porcentajeBloque:i.porcentajeBloque,completadoBloque:i.completadoBloque,cuestionarios:i.grupos.map(g=>({numero:g.numero,estado:g.estado}))};}catch(e){return {exito:false,mensaje:e&&e.message?e.message:String(e)};}}
function obtenerPreguntaQuizBloque_(numeroBloque,numeroCuestionario,idNino){try{const alumno=_quizAlumnoActivo_(idNino);if(!alumno)throw new Error('Selecciona un catequizando vigente.');const c=_quizCargarCatalogo_(),i=_quizGruposBloqueV10_(numeroBloque,idNino,c),n=Number(numeroCuestionario),g=i.grupos[n-1];if(!g)throw new Error('El cuestionario solicitado no existe en este bloque.');if(!g.primeraPendiente)return {exito:true,completadoCuestionario:true,estado:'COMPLETADO',numeroCuestionario:n,porcentajeBloque:i.porcentajeBloque,completadoBloque:i.completadoBloque};const p=g.primeraPendiente,k=_quizNormalizarIdSesion_(p.IDSESION),tema=c.sesionesPorId[k];return {exito:true,completadoCuestionario:false,estado:g.estado,numeroCuestionario:n,porcentajeBloque:i.porcentajeBloque,completadoBloque:i.completadoBloque,pregunta:{idPregunta:String(p.IDPREGUNTA||'').trim(),idSesion:String(tema&&tema.IDSESION||p.IDSESION||''),tema:String(tema&&tema.TEMA||p.TEMA||''),pregunta:String(p.PREGUNTA||'').trim(),opciones:[{valor:'A',texto:String(p.OPCIONA||'').trim()},{valor:'B',texto:String(p.OPCIONB||'').trim()},{valor:'C',texto:String(p.OPCIONC||'').trim()}]}};}catch(e){return {exito:false,mensaje:e&&e.message?e.message:String(e)};}}

function obtenerCuestionario_(idSesion, idNino) {
  try {
    const alumno = _quizAlumnoActivo_(idNino);
    if (!alumno) throw new Error('Selecciona un catequizando vigente.');
    const catalogo = _quizCargarCatalogo_();
    const idNorm = _quizNormalizarIdSesion_(idSesion);
    const tema = catalogo.sesionesPorId[idNorm];
    if (!tema) throw new Error('El ID_SESION ' + idSesion + ' no existe en SESIONES.');
    const preguntasTema = catalogo.porSesion[idNorm] || [];
    if (catalogo.filasIncompletas.length) {
      throw new Error('Hay preguntas activas incompletas en BANCO_PREGUNTAS. Ejecuta diagnosticarBancoCuestionarios para identificar los registros sin modificar la hoja.');
    }
    if (catalogo.noAsignadas.length) {
      throw new Error('Hay preguntas activas cuyo TEMA no coincide con una sesión de SESIONES. Ejecuta diagnosticarBancoCuestionarios para identificarlas.');
    }
    if (!preguntasTema.length) {
      return {
        exito: true,
        sinPreguntas: true,
        completadoTema: false,
        idSesion: String(tema.IDSESION || idSesion),
        tema: String(tema.TEMA || ''),
        bloque: String(tema.BLOQUE || ''),
        porcentajeBloque: _quizProgresoBloque_(catalogo, idNino, tema.BLOQUE).porcentajeBloque,
        mensaje: 'Este tema todavía no tiene preguntas activas asignadas. No se marcará como completado.'
      };
    }

    const respondidas = _quizIdsRespondidosAlumno_(idNino);
    const pendiente = preguntasTema.find(p => !respondidas[String(p.IDPREGUNTA || '').trim()]);
    const avance = _quizProgresoBloque_(catalogo, idNino, tema.BLOQUE, respondidas);
    if (!pendiente) {
      return {
        exito: true,
        completadoTema: true,
        completadoBloque: avance.completadoBloque,
        idSesion: String(tema.IDSESION || idSesion),
        tema: String(tema.TEMA || ''),
        bloque: String(tema.BLOQUE || ''),
        porcentajeBloque: avance.porcentajeBloque
      };
    }

    return {
      exito: true,
      completadoTema: false,
      completadoBloque: avance.completadoBloque,
      idSesion: String(tema.IDSESION || idSesion),
      tema: String(tema.TEMA || ''),
      bloque: String(tema.BLOQUE || ''),
      porcentajeBloque: avance.porcentajeBloque,
      pregunta: {
        idPregunta: String(pendiente.IDPREGUNTA || '').trim(),
        pregunta: String(pendiente.PREGUNTA || '').trim(),
        opciones: [
          { valor: 'A', texto: String(pendiente.OPCIONA || '').trim() },
          { valor: 'B', texto: String(pendiente.OPCIONB || '').trim() },
          { valor: 'C', texto: String(pendiente.OPCIONC || '').trim() }
        ]
      }
    };
  } catch (error) {
    return { exito: false, mensaje: error && error.message ? error.message : String(error) };
  }
}

function _quizGuardarResumenTema_(idNino, alumno, tema, preguntasTema, hojaNotas) {
  const descripcion = 'Aventura completada: ' + String(tema.TEMA || '').trim();
  const registros = hojaNotas.getLastRow() > 1 ? _leerTablaPrograma_(hojaNotas) : [];
  const yaExiste = registros.some(f =>
    String(f.IDNINO || '').trim() === String(idNino).trim() &&
    _quizNormalizarIdSesion_(f.IDSESION) === _quizNormalizarIdSesion_(tema.IDSESION) &&
    String(f.TIPOACTIVIDAD || '').trim().toUpperCase() === 'CUESTIONARIO' &&
    String(f.DESCRIPCION || '').trim() === descripcion
  );
  if (yaExiste) return;

  const intentos = _quizIntentos_(idNino, tema.IDSESION);
  let correctas = 0;
  let respondidas = 0;
  intentos.forEach(f => {
    const ids = String(f.IDPREGUNTASREALIZADAS || '').split('|').map(x => String(x || '').trim()).filter(Boolean);
    if (!ids.length) return;
    correctas += Number(f.CORRECTAS || 0);
    respondidas += Number(f.TOTALPREGUNTAS || ids.length);
  });
  const total = preguntasTema.length;
  const nota20 = total ? Math.round((correctas / total) * 2000) / 100 : 0;
  const nombre = [alumno.NOMBRES, alumno.APELLIDOS].filter(Boolean).join(' ');
  const datos = {
    ID_CALIFICACION: 'CAL-QUIZ-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase(),
    FECHA_REGISTRO: new Date(),
    ID_NINO: idNino,
    NOMBRE_CATEQUIZANDO: nombre,
    ID_SESION: String(tema.IDSESION || ''),
    TEMA: String(tema.TEMA || ''),
    TIPO_ACTIVIDAD: 'CUESTIONARIO',
    DESCRIPCION: descripcion,
    NOTA_NUMERICA: Math.min(20, nota20),
    EQUIVALENCIA: nota20 >= 18 ? 'AD' : nota20 >= 14 ? 'A' : nota20 >= 11 ? 'B' : 'C',
    OBSERVACIONES: correctas + ' respuestas correctas de ' + total + '; 2 puntos por cada respuesta correcta.',
    CATEQUISTA: ''
  };
  const headers = hojaNotas.getRange(1, 1, 1, hojaNotas.getLastColumn()).getDisplayValues()[0].map(h => String(h || '').trim());
  hojaNotas.appendRow(headers.map(h => Object.prototype.hasOwnProperty.call(datos, h) ? datos[h] : ''));
}

/** Registra y califica una pregunta a la vez; cada respuesta vale 2 puntos. */
function enviarCuestionario_(data) {
  const idNino = String(data.idNino || '').trim();
  const idSesion = String(data.idSesion || '').trim();
  const idPregunta = String(data.idPregunta || (data.respuesta && data.respuesta.idPregunta) || '').trim();
  const opcion = String(data.opcion || (data.respuesta && data.respuesta.opcion) || '').trim().toUpperCase();
  if (!idPregunta) throw new Error('No se recibió el identificador de la pregunta.');
  if (['A', 'B', 'C'].indexOf(opcion) < 0) throw new Error('Selecciona una de las tres alternativas.');

  // Las lecturas y validaciones pesadas se hacen antes del bloqueo global.
  // Así otros catequizandos pueden preparar sus respuestas simultáneamente.
  const alumno = _quizAlumnoActivo_(idNino);
  if (!alumno) throw new Error('El catequizando no está registrado como vigente.');
  const catalogo = _quizCargarCatalogo_();
  const idNorm = _quizNormalizarIdSesion_(idSesion);
  const tema = catalogo.sesionesPorId[idNorm];
  if (!tema) throw new Error('El tema seleccionado ya no está disponible en SESIONES.');
  const preguntasTema = catalogo.porSesion[idNorm] || [];
  if (catalogo.filasIncompletas.length || catalogo.noAsignadas.length) {
    throw new Error('El banco contiene preguntas pendientes de revisión. Ejecuta diagnosticarBancoCuestionarios antes de registrar respuestas.');
  }
  const pregunta = preguntasTema.find(p => String(p.IDPREGUNTA || '').trim() === idPregunta);
  if (!pregunta) throw new Error('La pregunta no corresponde al tema seleccionado.');

  const ss = getSpreadsheet();
  const hojaIntentos = ss.getSheetByName(QUIZ_SHEET_INTENTOS);
  const hojaNotas = ss.getSheetByName('CALIFICACIONES');
  if (!hojaIntentos || !hojaNotas) throw new Error('Faltan hojas necesarias: INTENTOS_CUESTIONARIO o CALIFICACIONES.');
  _quizAsegurarColumnaSeguimiento_(hojaIntentos);

  const clave = String(pregunta.RESPUESTACORRECTA || '').trim().toUpperCase();
  const correcta = opcion === clave;
  const puntos = correcta ? 2 : 0;
  const nombre = [alumno.NOMBRES, alumno.APELLIDOS].filter(Boolean).join(' ');
  const idIntento = 'QUIZ-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase();
  const datosIntento = {
    ID_INTENTO: idIntento,
    FECHA_REGISTRO: new Date(),
    ID_NINO: idNino,
    NOMBRE_CATEQUIZANDO: nombre,
    ID_SESION: String(tema.IDSESION || idSesion),
    TEMA: String(tema.TEMA || ''),
    CORRECTAS: correcta ? 1 : 0,
    TOTAL_PREGUNTAS: 1,
    NOTA_NUMERICA: correcta ? 20 : 0,
    ESTADO: 'RESPONDIDA',
    ID_PREGUNTAS_REALIZADAS: idPregunta
  };
  const headersIntentos = hojaIntentos.getRange(1, 1, 1, hojaIntentos.getLastColumn())
    .getDisplayValues()[0].map(h => String(h || '').trim());
  const filaIntento = headersIntentos.map(h => Object.prototype.hasOwnProperty.call(datosIntento, h) ? datosIntento[h] : '');

  // Solo la sección crítica queda serializada: comprobar duplicado y escribir
  // una fila atómica. Se mantiene para que dos clics simultáneos jamás dupliquen nota.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Hay varias respuestas guardándose a la vez. Tu respuesta sigue protegida; pulsa reintentar.');
  let yaRespondidas;
  try {
    yaRespondidas = _quizIdsRespondidosAlumno_(idNino);
    if (yaRespondidas[idPregunta]) throw new Error('Esta pregunta ya fue respondida.');
    const filaDestino = hojaIntentos.getLastRow() + 1;
    hojaIntentos.getRange(filaDestino, 1, 1, filaIntento.length).setValues([filaIntento]);
    yaRespondidas[idPregunta] = true;
    _quizGuardarCacheRespondidasV5_(idNino, yaRespondidas);
  } finally {
    lock.releaseLock();
  }

  // El cálculo del avance y la preparación de la siguiente pregunta no necesitan
  // mantener bloqueados los guardados de los demás estudiantes.
  const siguientePendiente = preguntasTema.find(p => !yaRespondidas[String(p.IDPREGUNTA || '').trim()]);
  const temaCompletado = !siguientePendiente;
  if (temaCompletado) {
    // Solo al completar el tema se fuerza la sincronización antes de leer los
    // registros para crear la nota final. No se hace flush por cada respuesta.
    SpreadsheetApp.flush();
    _quizGuardarResumenTema_(idNino, alumno, tema, preguntasTema, hojaNotas);
  }

  const avanceBloque = _quizProgresoBloque_(catalogo, idNino, tema.BLOQUE, yaRespondidas);
  const textoCorrecto = String(pregunta['OPCION' + clave] || '');
  const siguientePregunta = siguientePendiente ? {
    idPregunta: String(siguientePendiente.IDPREGUNTA || '').trim(),
    pregunta: String(siguientePendiente.PREGUNTA || '').trim(),
    opciones: [
      { valor: 'A', texto: String(siguientePendiente.OPCIONA || '').trim() },
      { valor: 'B', texto: String(siguientePendiente.OPCIONB || '').trim() },
      { valor: 'C', texto: String(siguientePendiente.OPCIONC || '').trim() }
    ]
  } : null;
  return {
    exito: true,
    correcta: correcta,
    puntos: puntos,
    mensaje: correcta ? '¡Excelente! Has ganado 2 puntos.' : '¡Buen intento! Cada respuesta nos ayuda a aprender.',
    respuestaCorrecta: clave,
    textoRespuestaCorrecta: textoCorrecto,
    explicacion: String(pregunta.EXPLICACION || ''),
    porcentajeBloque: avanceBloque.porcentajeBloque,
    completadoBloque: avanceBloque.completadoBloque,
    completadoTema: temaCompletado,
    siguientePregunta: siguientePregunta,
    tema: String(tema.TEMA || ''),
    bloque: String(tema.BLOQUE || '')
  };
}

/**
 * Diagnóstico de solo lectura: verifica asignación de preguntas y distribución
 * por bloque según SESIONES. No crea columnas, no agrega filas ni altera datos.
 */
function diagnosticarBancoCuestionarios() {
  const catalogo = _quizCargarCatalogo_();
  const resumenSesiones = catalogo.sesiones.map(s => {
    const id = _quizNormalizarIdSesion_(s.IDSESION);
    return {
      idSesion: String(s.IDSESION || ''),
      bloque: String(s.BLOQUE || ''),
      tema: String(s.TEMA || ''),
      preguntasActivasCompletas: (catalogo.porSesion[id] || []).length
    };
  });
  const resumenBloques = {};
  catalogo.sesiones.forEach(s => {
    const clave = _quizNormalizarTema_(s.BLOQUE);
    if (!resumenBloques[clave]) resumenBloques[clave] = { bloque: String(s.BLOQUE || ''), preguntasActivasCompletas: (catalogo.porBloque[clave] || []).length };
    else resumenBloques[clave].preguntasActivasCompletas = (catalogo.porBloque[clave] || []).length;
  });
  const resultado = {
    exito: true,
    totalSesiones: catalogo.sesiones.length,
    preguntasActivasConId: catalogo.activasConId.length,
    preguntasAsignadasUnaVez: Object.keys(catalogo.porSesion).reduce((n, k) => n + (catalogo.porSesion[k] || []).length, 0),
    preguntasActivasSinAsignar: catalogo.noAsignadas.map(f => ({ idPregunta: String(f.IDPREGUNTA || ''), tema: String(f.TEMA || ''), bloqueBanco: String(f.BLOQUE || '') })),
    preguntasActivasIncompletas: catalogo.filasIncompletas,
    bloques: Object.keys(resumenBloques).map(k => resumenBloques[k]),
    discrepanciasBloqueBancoVsSesiones: catalogo.bloqueDiscrepante,
    temasSinPreguntas: resumenSesiones.filter(s => s.preguntasActivasCompletas === 0).map(s => s.idSesion + ' — ' + s.tema),
    resumen: resumenSesiones
  };
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/** Diagnóstico de zonas horarias sin modificar datos ni configuración. */
function diagnosticarZonaHorariaCamino() {
  const ss = getSpreadsheet();
  return {
    zonaHorariaScriptActual: Session.getScriptTimeZone(),
    zonaHorariaHojaActual: ss.getSpreadsheetTimeZone(),
    zonaHorariaAplicacion: ZONA_HORARIA_CAMINO,
    mensaje: 'Las fechas y horas formateadas por el backend usan America/Lima. La zona de la hoja se muestra por separado.'
  };
}

/**
 * Ejecutar manualmente UNA VEZ desde Apps Script para que Google Sheets
 * también muestre las fechas/horas en hora de Lima. No edita ni elimina filas.
 */
function configurarZonaHorariaCaminoLima() {
  const ss = getSpreadsheet();
  const anterior = ss.getSpreadsheetTimeZone();
  ss.setSpreadsheetTimeZone(ZONA_HORARIA_CAMINO);
  return {
    exito: true,
    zonaHorariaAnterior: anterior,
    zonaHorariaNueva: ss.getSpreadsheetTimeZone(),
    mensaje: 'La hoja CAMINO HACIA JESUS 2026 quedó configurada para America/Lima. No se modificaron los registros.'
  };
}
