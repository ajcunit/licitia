from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal


# Departamento Schemas
class DepartamentoBase(BaseModel):
    codigo: str
    nombre: str
    descripcion: Optional[str] = None


class DepartamentoCreate(DepartamentoBase):
    pass


class DepartamentoUpdate(BaseModel):
    codigo: Optional[str] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activo: Optional[bool] = None


class Departamento(DepartamentoBase):
    id: int
    activo: bool
    fecha_creacion: datetime

    class Config:
        from_attributes = True


# Empleado Schemas
class EmpleadoBase(BaseModel):
    nombre: str
    email: str
    rol: str = "empleado"
    permiso_auditoria: Optional[bool] = False
    permiso_pla_contractacio: Optional[bool] = False


class EmpleadoCreate(EmpleadoBase):
    departamento_id: Optional[int] = None
    password: Optional[str] = None


class EmpleadoUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    departamento_id: Optional[int] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None
    permiso_auditoria: Optional[bool] = None
    permiso_pla_contractacio: Optional[bool] = None
    password: Optional[str] = None


class Empleado(EmpleadoBase):
    id: int
    departamento_id: Optional[int]
    activo: bool
    fecha_creacion: datetime

    class Config:
        from_attributes = True


class EmpleadoConDepartamento(Empleado):
    departamento: Optional[Departamento] = None


# Contrato Schemas
class ContratoBase(BaseModel):
    codi_expedient: str
    codi_ine10: Optional[str] = None
    codi_dir3: Optional[str] = None
    objecte_contracte: Optional[str] = None
    tipus_contracte: Optional[str] = None
    procediment: Optional[str] = None
    estat_actual: Optional[str] = None
    adjudicatari_nom: Optional[str] = None
    adjudicatari_nif: Optional[str] = None
    adjudicatari_nacionalitat: Optional[str] = None
    organisme_adjudicador: Optional[str] = None
    departament_adjudicador: Optional[str] = None
    preu_licitar: Optional[float] = None
    preu_adjudicar: Optional[float] = None
    import_adjudicacio_amb_iva: Optional[float] = None
    import_licitar_sense_iva: Optional[float] = None
    data_publicacio: Optional[date] = None
    data_actualitzacio: Optional[datetime] = None
    data_inici: Optional[date] = None
    data_final: Optional[date] = None
    data_formalitzacio: Optional[date] = None
    data_anunci_previ: Optional[date] = None
    data_anunci_licitacio: Optional[date] = None
    data_anunci_adjudicacio: Optional[date] = None
    data_anunci_formalitzacio: Optional[date] = None
    cpv_principal_codi: Optional[str] = None
    cpv_principal_descripcio: Optional[str] = None
    enllac_anunci_previ: Optional[str] = None
    enllac_licitacio: Optional[str] = None
    enllac_adjudicacio: Optional[str] = None
    enllac_formalitzacio: Optional[str] = None
    enllac_perfil_contractant: Optional[str] = None
    enllac_publicacio: Optional[str] = None
    url_plataforma_contractacio: Optional[str] = None
    lots: Optional[str] = None
    tipus_tramitacio: Optional[str] = None
    codi_nuts: Optional[str] = None
    descripcio_nuts: Optional[str] = None
    forma_financament: Optional[str] = None
    data_anulacio: Optional[date] = None
    pressupost_licitacio_sense_iva: Optional[float] = None
    pressupost_licitacio_sense_iva_expedient: Optional[float] = None
    pressupost_licitacio_amb_iva: Optional[float] = None
    pressupost_licitacio_amb_iva_expedient: Optional[float] = None
    valor_estimat_expedient: Optional[float] = None
    url_json_futura: Optional[str] = None
    url_json_agregada: Optional[str] = None
    url_json_cpm: Optional[str] = None
    url_json_previ: Optional[str] = None
    url_json_licitacio: Optional[str] = None
    url_json_avaluacio: Optional[str] = None
    url_json_adjudicacio: Optional[str] = None
    url_json_formalitzacio: Optional[str] = None
    url_json_anulacio: Optional[str] = None
    data_finalitzacio_calculada: Optional[date] = None
    alerta_finalitzacio: Optional[bool] = False
    possiblement_finalitzat: Optional[bool] = False


class ContratoCreate(ContratoBase):
    departamento_id: Optional[int] = None
    estado_interno: str = "normal"


class ContratoUpdate(ContratoBase):
    codi_expedient: Optional[str] = None
    estado_interno: Optional[str] = None
    departamento_id: Optional[int] = None

class ContratoMassAssign(BaseModel):
    contrato_ids: List[int]
    departamento_id: Optional[int] = None

class Contrato(ContratoBase):
    id: int
    departamento_id: Optional[int]
    estado_interno: str
    hash_contenido: Optional[str]
    fecha_primera_sincronizacion: Optional[datetime]
    fecha_ultima_sincronizacion: Optional[datetime]

    class Config:
        from_attributes = True


class ContratoListItem(BaseModel):
    id: int
    codi_expedient: str
    objecte_contracte: Optional[str]
    adjudicatari_nom: Optional[str]
    import_adjudicacio_amb_iva: Optional[float]
    data_inici: Optional[date]
    estat_actual: Optional[str]
    estado_interno: str
    departamento_id: Optional[int]
    data_finalitzacio_calculada: Optional[date] = None
    alerta_finalitzacio: Optional[bool] = False
    possiblement_finalitzat: Optional[bool] = False
    durada_contracte: Optional[int] = None
    num_prorrogues: int = 0
    num_modificacions: int = 0
    num_lots: int = 1

    class Config:
        from_attributes = True


# Contratos Menores Schemas
class ContratoMenorBase(BaseModel):
    codi_expedient: str
    tipus_contracte: Optional[str] = None
    descripcio_expedient: Optional[str] = None
    adjudicatari: Optional[str] = None
    import_adjudicacio: Optional[float] = None
    data_adjudicacio: Optional[date] = None
    exercici: Optional[int] = None
    dies_durada: Optional[int] = None
    mesos_durada: Optional[int] = None
    anys_durada: Optional[int] = None
    tipus_liquidacio: Optional[str] = None
    data_liquidacio: Optional[date] = None
    import_liquidacio: Optional[float] = None

class ContratoMenorUpdate(BaseModel):
    codi_expedient: Optional[str] = None
    departamento_id: Optional[int] = None
    estado_interno: Optional[str] = None

class ContratoMenor(ContratoMenorBase):
    id: int
    departamento_id: Optional[int] = None
    estado_interno: str = 'normal'
    fecha_ultima_sincronizacion: Optional[datetime]
    datos_json_menor: Optional[dict] = None
    datos_json_liquidacio: Optional[dict] = None

    class Config:
        from_attributes = True


# Sincronizacion Schemas
class SincronizacionBase(BaseModel):
    url_endpoint: Optional[str] = None


class SincronizacionCreate(SincronizacionBase):
    pass


class Sincronizacion(BaseModel):
    id: int
    fecha_hora_inicio: datetime
    fecha_hora_fin: Optional[datetime]
    registros_nuevos: int
    registros_actualizados: int
    registros_sin_cambios: int
    estado: str
    log_errores: Optional[str]
    url_endpoint: Optional[str]
    total_registros_api: Optional[int]

    class Config:
        from_attributes = True


# Duplicado Schemas
class DuplicadoBase(BaseModel):
    contrato_id_1: int
    contrato_id_2: int
    campo_duplicado: str
    valor_duplicado: str
    motivo_duplicado: Optional[str] = None


class DuplicadoCreate(DuplicadoBase):
    pass


class DuplicadoValidacion(BaseModel):
    accion_tomada: str  # 'aprobar_1', 'aprobar_2', 'fusionar', 'rechazar_ambos'
    observaciones: Optional[str] = None


class Duplicado(DuplicadoBase):
    id: int
    fecha_deteccion: datetime
    estado_validacion: str
    usuario_validador_id: Optional[int]
    fecha_validacion: Optional[datetime]
    accion_tomada: Optional[str]
    observaciones: Optional[str]

    class Config:
        from_attributes = True


class DuplicadoAdjudicatario(BaseModel):
    id: int
    nombre_1: str
    nombre_2: str
    nif: Optional[str]
    motivo: Optional[str]
    estado: str
    fecha_deteccion: datetime

    class Config:
        from_attributes = True


class DuplicadoAdjudicatarioGestion(BaseModel):
    accion: str  # 'fusionar_1', 'fusionar_2', 'rechazar'


class DuplicadoConContratos(Duplicado):
    contrato_1: Optional[Contrato] = None
    contrato_2: Optional[Contrato] = None


# Regla Asociacion Schemas
class ReglaAsociacionBase(BaseModel):
    departamento_id: int
    tipo_regla: str
    campo_origen: str
    valor_buscar: str
    operador: str = "contiene"
    prioridad: int = 0


class ReglaAsociacionCreate(ReglaAsociacionBase):
    pass


class ReglaAsociacionUpdate(BaseModel):
    tipo_regla: Optional[str] = None
    campo_origen: Optional[str] = None
    valor_buscar: Optional[str] = None
    operador: Optional[str] = None
    prioridad: Optional[int] = None
    activa: Optional[bool] = None


class ReglaAsociacion(ReglaAsociacionBase):
    id: int
    activa: bool
    fecha_creacion: datetime

    class Config:
        from_attributes = True


# Prorroga Schemas
class ProrrogaBase(BaseModel):
    numero_prorroga: Optional[int] = None
    data_inici_prorroga: Optional[date] = None
    data_fi_prorroga: Optional[date] = None
    import_adjudicacio: Optional[float] = None
    exercici: Optional[int] = None
    situaci_contractual: Optional[str] = None


class Prorroga(ProrrogaBase):
    id: int
    contrato_id: int
    fecha_sincronizacion: Optional[datetime] = None

    class Config:
        from_attributes = True


# Modificacion Schemas
class ModificacionBase(BaseModel):
    numero_modificacio: Optional[int] = None
    data_aprovacio_modificacio: Optional[date] = None
    tipus_modificacio: Optional[str] = None
    import_modificacio: Optional[float] = None
    anys_termini_modificacio: Optional[int] = None
    mesos_termini_modificacio: Optional[int] = None
    dies_termini_modificacio: Optional[int] = None


class Modificacion(ModificacionBase):
    id: int
    contrato_id: int
    fecha_sincronizacion: Optional[datetime] = None

    class Config:
        from_attributes = True


# Dashboard Stats
class DashboardStats(BaseModel):
    total_contratos: int
    contratos_por_estado: dict
    pendientes_aprobacion: int
    total_importe: float
    ultima_sincronizacion: Optional[datetime]
    contratos_este_mes: int
    top_adjudicatarios: List[dict]
    contratos_proximos_finalizar: int  # Contractes que acaben en 6 mesos
    contratos_posiblemente_finalizados: int  # Contractes possiblement finalitzats
    total_contratos_menores: int = 0
    total_importe_menores: float = 0.0
    contratos_por_departamento: List[dict] = []
    temps_mitja_tramitacio_dies: Optional[float] = None
    licitadors_unics: int = 0
    renovacions_critiques: List[dict] = []



# Filtros de búsqueda
class ContratoFiltros(BaseModel):
    estat_actual: Optional[str] = None
    tipus_contracte: Optional[str] = None
    procediment: Optional[str] = None
    fecha_inicio_desde: Optional[date] = None
    fecha_inicio_hasta: Optional[date] = None
    importe_min: Optional[float] = None
    importe_max: Optional[float] = None
    adjudicatari_nom: Optional[str] = None
    cpv_principal_codi: Optional[str] = None
    departamento_id: Optional[int] = None
    estado_interno: Optional[str] = None
    busqueda: Optional[str] = None
    te_prorroga: Optional[bool] = None
    alerta_finalitzacio: Optional[bool] = None
    possiblement_finalitzat: Optional[bool] = None


# Configuracion Schemas
class ConfiguracionBase(BaseModel):
    clave: str
    valor: str
    descripcion: Optional[str] = None


class ConfiguracionCreate(ConfiguracionBase):
    pass


class ConfiguracionUpdate(BaseModel):
    valor: Optional[str] = None
    descripcion: Optional[str] = None


class Configuracion(ConfiguracionBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True


# CPV Schemas
class CPVBase(BaseModel):
    codigo: str
    descripcion: str
    nivel: str
    padre_codigo: Optional[str] = None


class CPV(CPVBase):
    id: int
    datos_json: Optional[dict] = None

    class Config:
        from_attributes = True


class CPVAIRequest(BaseModel):
    descripcion: str


class CPVAISuggestion(BaseModel):
    codigo: str
    descripcion: str
    score: float
    justificacion: str


class CPVAIResponse(BaseModel):
    suggestions: List[CPVAISuggestion]


# Favoritos Schemas
class CarpetaFavoritaBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    color: Optional[str] = "#0284c7"


class CarpetaFavoritaCreate(CarpetaFavoritaBase):
    pass


class CarpetaFavoritaUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    color: Optional[str] = None


class CarpetaFavoritaResponse(CarpetaFavoritaBase):
    id: int
    fecha_creacion: datetime
    empleado_id: int

    class Config:
        from_attributes = True


class ContratoFavoritoBase(BaseModel):
    contrato_id: int
    notas: Optional[str] = None


class ContratoFavoritoCreate(ContratoFavoritoBase):
    pass


class ContratoFavoritoResponse(BaseModel):
    id: int
    carpeta_id: int
    contrato_id: int
    notas: Optional[str] = None
    fecha_agregado: datetime
    contrato: Optional[Contrato] = None

    class Config:
        from_attributes = True


class ContratoFavoritoByExpedienteCreate(BaseModel):
    codi_expedient: str
    notas: Optional[str] = None


class CarpetaFavoritaConContratos(CarpetaFavoritaResponse):
    contratos: List[ContratoFavoritoResponse] = []


# ── Pla de Contractació ──────────────────────────────────────────────────────

class PlaContractacioEntradaCreate(BaseModel):
    any_exercici: int
    trimestre: int  # 1-4
    objecte: str
    tipus_contracte: Optional[str] = None
    ambit_responsable: Optional[str] = None
    observacions: Optional[str] = None
    subvencionat: bool = False
    import_estimat: Optional[float] = None
    contrato_id: Optional[int] = None


class PlaContractacioEntradaUpdate(BaseModel):
    trimestre: Optional[int] = None
    objecte: Optional[str] = None
    tipus_contracte: Optional[str] = None
    ambit_responsable: Optional[str] = None
    observacions: Optional[str] = None
    subvencionat: Optional[bool] = None
    import_estimat: Optional[float] = None
    contrato_id: Optional[int] = None


class PlaContractacioEntradaRead(BaseModel):
    id: int
    any_exercici: int
    trimestre: int
    objecte: str
    tipus_contracte: Optional[str] = None
    ambit_responsable: Optional[str] = None
    observacions: Optional[str] = None
    subvencionat: bool
    import_estimat: Optional[float] = None
    contrato_id: Optional[int] = None
    codi_expedient: Optional[str] = None   # denormalized from contrato
    creat_per_nom: Optional[str] = None
    creat_at: Optional[datetime] = None

    class Config:
        from_attributes = True
