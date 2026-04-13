from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Numeric, Text, ForeignKey, JSON, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class Departamento(Base):
    __tablename__ = "departamentos"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(50), unique=True, nullable=False)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text)
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, server_default=func.now())

    empleados = relationship("Empleado", back_populates="departamento")
    contratos = relationship("Contrato", back_populates="departamento")
    reglas_asociacion = relationship("ReglaAsociacion", back_populates="departamento")


class Empleado(Base):
    __tablename__ = "empleados"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"))
    rol = Column(String(50))
    activo = Column(Boolean, default=True)
    hashed_password = Column(String(255), nullable=True) # Per autenticació JWT
    permiso_auditoria = Column(Boolean, default=False)
    permiso_pla_contractacio = Column(Boolean, default=False)
    fecha_creacion = Column(DateTime, server_default=func.now())

    __table_args__ = (
        CheckConstraint(rol.in_(['responsable', 'empleado', 'admin', 'responsable_contratacion']), name='check_rol'),
    )

    departamento = relationship("Departamento", back_populates="empleados")
    duplicados_validados = relationship("Duplicado", back_populates="usuario_validador")
    historial_cambios = relationship("HistorialContrato", back_populates="usuario")


class Contrato(Base):
    __tablename__ = "contratos"

    id = Column(Integer, primary_key=True, index=True)
    
    # Identificadores
    codi_expedient = Column(String(255), nullable=False, index=True)
    codi_ine10 = Column(String(50))
    codi_dir3 = Column(String(50))
    
    # Información básica
    objecte_contracte = Column(Text)
    tipus_contracte = Column(Text)
    procediment = Column(Text)
    estat_actual = Column(Text, index=True)
    
    # Adjudicación
    adjudicatari_nom = Column(Text, index=True)
    adjudicatari_nif = Column(Text)
    adjudicatari_nacionalitat = Column(Text)
    
    # Organismo
    organisme_adjudicador = Column(Text)
    departament_adjudicador = Column(Text)
    
    # Importes
    preu_licitar = Column(Numeric(15, 2))
    preu_adjudicar = Column(Numeric(15, 2))
    import_adjudicacio_amb_iva = Column(Numeric(15, 2))
    import_licitar_sense_iva = Column(Numeric(15, 2))
    pressupost_licitacio_sense_iva = Column(Numeric(15, 2))
    pressupost_licitacio_sense_iva_expedient = Column(Numeric(15, 2))
    pressupost_licitacio_amb_iva = Column(Numeric(15, 2))
    pressupost_licitacio_amb_iva_expedient = Column(Numeric(15, 2))
    valor_estimat_expedient = Column(Numeric(15, 2))
    
    # Fechas de tramitación
    data_publicacio = Column(Date)
    data_actualitzacio = Column(DateTime)
    data_inici = Column(Date, index=True)
    data_final = Column(Date)
    data_formalitzacio = Column(Date)
    
    # Duración y finalización
    durada_contracte = Column(Integer)  # Durada en mesos
    data_finalitzacio_calculada = Column(Date, index=True)  # Data formalització + durada
    alerta_finalitzacio = Column(Boolean, default=False)  # True si acaba en 6 mesos
    possiblement_finalitzat = Column(Boolean, default=False)  # True si ja ha passat la data
    
    # Fechas de anuncios
    data_anunci_previ = Column(Date)
    data_anunci_licitacio = Column(Date)
    data_anunci_adjudicacio = Column(Date)
    data_anunci_formalitzacio = Column(Date)
    
    # CPV (Clasificación)
    cpv_principal_codi = Column(Text, index=True)
    cpv_principal_descripcio = Column(Text)
    
    # URLs y documentación
    enllac_anunci_previ = Column(Text)
    enllac_licitacio = Column(Text)
    enllac_adjudicacio = Column(Text)
    enllac_formalitzacio = Column(Text)
    enllac_perfil_contractant = Column(Text)
    enllac_publicacio = Column(Text)  # Enllaç a la publicació
    url_plataforma_contractacio = Column(Text)
    
    # Otros campos
    lots = Column(String(10))
    tipus_tramitacio = Column(String(100))
    codi_nuts = Column(String(50))
    descripcio_nuts = Column(Text)
    forma_financament = Column(String(255))
    data_anulacio = Column(Date)  # Data d'anul·lació del contracte
    
    # Enllaços estructurals JSON Socrata (Fase extracció futura)
    url_json_futura = Column(Text)
    url_json_agregada = Column(Text)
    url_json_cpm = Column(Text)
    url_json_previ = Column(Text)
    url_json_licitacio = Column(Text)
    url_json_avaluacio = Column(Text)
    url_json_adjudicacio = Column(Text)
    url_json_formalitzacio = Column(Text)
    url_json_anulacio = Column(Text)


    # Control interno
    departamento_id = Column(Integer, ForeignKey("departamentos.id"))
    estado_interno = Column(String(50), default='normal', index=True)
    datos_json = Column(JSON)
    hash_contenido = Column(String(32), index=True)
    fecha_primera_sincronizacion = Column(DateTime, server_default=func.now())
    fecha_ultima_sincronizacion = Column(DateTime, server_default=func.now())

    __table_args__ = (
        CheckConstraint(estado_interno.in_(['normal', 'pendiente_aprobacion', 'aprobado', 'rechazado']), name='check_estado_interno'),
        UniqueConstraint('codi_expedient', 'estat_actual', 'lots', name='unique_expediente_estado_lot'),
    )

    departamento = relationship("Departamento", back_populates="contratos")
    duplicados_1 = relationship("Duplicado", foreign_keys="Duplicado.contrato_id_1", back_populates="contrato_1")
    duplicados_2 = relationship("Duplicado", foreign_keys="Duplicado.contrato_id_2", back_populates="contrato_2")
    historial = relationship("HistorialContrato", back_populates="contrato")
    prorrogues = relationship("Prorroga", back_populates="contrato", order_by="Prorroga.numero_prorroga")
    modificacions = relationship("Modificacion", back_populates="contrato", order_by="Modificacion.numero_modificacio")

    @property
    def num_prorrogues(self) -> int:
        return len(self.prorrogues)

    @property
    def num_modificacions(self) -> int:
        return len(self.modificacions)


class Sincronizacion(Base):
    __tablename__ = "sincronizaciones"

    id = Column(Integer, primary_key=True, index=True)
    fecha_hora_inicio = Column(DateTime, server_default=func.now())
    fecha_hora_fin = Column(DateTime)
    registros_nuevos = Column(Integer, default=0)
    registros_actualizados = Column(Integer, default=0)
    registros_sin_cambios = Column(Integer, default=0)
    estado = Column(String(50), default='en_proceso')
    log_errores = Column(Text)
    url_endpoint = Column(Text)
    total_registros_api = Column(Integer)

    __table_args__ = (
        CheckConstraint(estado.in_(['en_proceso', 'exitosa', 'fallida', 'parcial']), name='check_estado_sync'),
    )


class Duplicado(Base):
    __tablename__ = "duplicados"

    id = Column(Integer, primary_key=True, index=True)
    contrato_id_1 = Column(Integer, ForeignKey("contratos.id", ondelete="CASCADE"))
    contrato_id_2 = Column(Integer, ForeignKey("contratos.id", ondelete="CASCADE"))
    campo_duplicado = Column(String(100))
    valor_duplicado = Column(String(500))
    motivo_duplicado = Column(Text) # Explicació per a l'usuari
    fecha_deteccion = Column(DateTime, server_default=func.now())
    estado_validacion = Column(String(50), default='pendiente')
    usuario_validador_id = Column(Integer, ForeignKey("empleados.id"))
    fecha_validacion = Column(DateTime)
    accion_tomada = Column(String(50))
    observaciones = Column(Text)

    __table_args__ = (
        CheckConstraint(estado_validacion.in_(['pendiente', 'aprobado', 'rechazado', 'fusionado']), name='check_estado_validacion'),
        UniqueConstraint('contrato_id_1', 'contrato_id_2', name='unique_duplicado'),
    )

    contrato_1 = relationship("Contrato", foreign_keys=[contrato_id_1], back_populates="duplicados_1")
    contrato_2 = relationship("Contrato", foreign_keys=[contrato_id_2], back_populates="duplicados_2")
    usuario_validador = relationship("Empleado", back_populates="duplicados_validados")


class HistorialContrato(Base):
    __tablename__ = "historial_contratos"

    id = Column(Integer, primary_key=True, index=True)
    contrato_id = Column(Integer, ForeignKey("contratos.id", ondelete="CASCADE"))
    campo_modificado = Column(String(100))
    valor_anterior = Column(Text)
    valor_nuevo = Column(Text)
    usuario_id = Column(Integer, ForeignKey("empleados.id"))
    fecha_modificacion = Column(DateTime, server_default=func.now())
    tipo_cambio = Column(String(50))

    __table_args__ = (
        CheckConstraint(tipo_cambio.in_(['sincronizacion', 'manual', 'validacion']), name='check_tipo_cambio'),
    )

    contrato = relationship("Contrato", back_populates="historial")
    usuario = relationship("Empleado", back_populates="historial_cambios")


class ReglaAsociacion(Base):
    __tablename__ = "reglas_asociacion"

    id = Column(Integer, primary_key=True, index=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"))
    tipo_regla = Column(String(50))
    campo_origen = Column(String(100))
    valor_buscar = Column(Text)
    operador = Column(String(20))
    prioridad = Column(Integer, default=0)
    activa = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, server_default=func.now())

    __table_args__ = (
        CheckConstraint(tipo_regla.in_(['departamento', 'organismo', 'palabra_clave', 'cpv', 'importe']), name='check_tipo_regla'),
        CheckConstraint(operador.in_(['igual', 'contiene', 'comienza_con', 'mayor_que', 'menor_que']), name='check_operador'),
    )

    departamento = relationship("Departamento", back_populates="reglas_asociacion")


class Prorroga(Base):
    __tablename__ = "prorrogues"

    id = Column(Integer, primary_key=True, index=True)
    contrato_id = Column(Integer, ForeignKey("contratos.id", ondelete="CASCADE"))
    numero_prorroga = Column(Integer)
    data_inici_prorroga = Column(Date)
    data_fi_prorroga = Column(Date)
    import_adjudicacio = Column(Numeric(15, 2))
    exercici = Column(Integer)
    situaci_contractual = Column(String(100))
    datos_json = Column(JSON)
    fecha_sincronizacion = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint('contrato_id', 'numero_prorroga', name='unique_prorroga'),
    )

    contrato = relationship("Contrato", back_populates="prorrogues")


class Modificacion(Base):
    __tablename__ = "modificacions"

    id = Column(Integer, primary_key=True, index=True)
    contrato_id = Column(Integer, ForeignKey("contratos.id", ondelete="CASCADE"))
    numero_modificacio = Column(Integer)
    data_aprovacio_modificacio = Column(Date)
    tipus_modificacio = Column(String(500))
    import_modificacio = Column(Numeric(15, 2))
    anys_termini_modificacio = Column(Integer)
    mesos_termini_modificacio = Column(Integer)
    dies_termini_modificacio = Column(Integer)
    datos_json = Column(JSON)
    fecha_sincronizacion = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint('contrato_id', 'numero_modificacio', name='unique_modificacion'),
    )

    contrato = relationship("Contrato", back_populates="modificacions")


class ContratoMenor(Base):
    __tablename__ = "contratos_menores"

    id = Column(Integer, primary_key=True, index=True)
    codi_expedient = Column(String(255), nullable=False, index=True, unique=True)
    tipus_contracte = Column(String(255))
    descripcio_expedient = Column(Text)
    adjudicatari = Column(String(500), index=True)
    import_adjudicacio = Column(Numeric(15, 2))
    data_adjudicacio = Column(Date)
    exercici = Column(Integer)
    
    # Duración
    dies_durada = Column(Integer)
    mesos_durada = Column(Integer)
    anys_durada = Column(Integer)
    
    # Liquidacio
    tipus_liquidacio = Column(String(200))
    data_liquidacio = Column(Date)
    import_liquidacio = Column(Numeric(15, 2))
    
    # Control
    fecha_ultima_sincronizacion = Column(DateTime, server_default=func.now(), onupdate=func.now())
    datos_json_menor = Column(JSON)
    datos_json_liquidacio = Column(JSON)
    
    # Control interno
    departamento_id = Column(Integer, ForeignKey("departamentos.id"))
    estado_interno = Column(String(50), default='normal', index=True)
    
    __table_args__ = (
        CheckConstraint(estado_interno.in_(['normal', 'pendiente_aprobacion', 'aprobado', 'rechazado']), name='check_estado_interno_menores'),
    )
    
    departamento = relationship("Departamento")


class Configuracion(Base):
    __tablename__ = "configuracion"

    id = Column(Integer, primary_key=True, index=True)
    clave = Column(String(100), unique=True, index=True)
    valor = Column(Text)
    descripcion = Column(Text)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CPV(Base):
    __tablename__ = "cpvs"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), unique=True, index=True)
    descripcion = Column(Text)
    nivel = Column(String(20))  # Divisió, Grup, Classe, Categoria
    padre_codigo = Column(String(20), index=True)
    datos_json = Column(JSON)


class CarpetaFavorita(Base):
    __tablename__ = "carpetas_favoritas"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False, index=True)
    descripcion = Column(String(500))
    color = Column(String(20), default="#0284c7")
    fecha_creacion = Column(DateTime, server_default=func.now())
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False)
    
    contratos = relationship("ContratoFavorito", back_populates="carpeta", cascade="all, delete-orphan")
    empleado = relationship("Empleado")


class ContratoFavorito(Base):
    __tablename__ = "contratos_favoritos"
    
    id = Column(Integer, primary_key=True, index=True)
    carpeta_id = Column(Integer, ForeignKey("carpetas_favoritas.id", ondelete="CASCADE"), nullable=False, index=True)
    contrato_id = Column(Integer, ForeignKey("contratos.id", ondelete="CASCADE"), nullable=False, index=True)
    notas = Column(Text)
    fecha_agregado = Column(DateTime, server_default=func.now())
    
    __table_args__ = (
        UniqueConstraint('carpeta_id', 'contrato_id', name='unique_favorito_carpeta_contrato'),
    )
    
    carpeta = relationship("CarpetaFavorita", back_populates="contratos")
    contrato = relationship("Contrato", backref="favorito_en")


class DuplicadoAdjudicatario(Base):
    __tablename__ = "duplicados_adjudicatarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre_1 = Column(String(255), nullable=False)
    nombre_2 = Column(String(255), nullable=False)
    nif = Column(String(50), index=True)
    motivo = Column(String(255))
    estado = Column(String(50), default='pendiente') # pendiente, fusionado, rechazado
    fecha_deteccion = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint('nombre_1', 'nombre_2', name='unique_duplicado_adj'),
    )


class AliasAdjudicatario(Base):
    __tablename__ = "alias_adjudicatarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre_original = Column(String(255), unique=True, nullable=False, index=True)
    nombre_canonico = Column(String(255), nullable=False)
    fecha_creacion = Column(DateTime, server_default=func.now())


class RefreshToken(Base):
    """Refresh tokens per renovar access tokens JWT de forma segura."""
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token_hash = Column(String(128), unique=True, nullable=False, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    revoked = Column(Boolean, default=False)

    empleado = relationship("Empleado", backref="refresh_tokens")


class AuditLog(Base):
    """Log d'auditoria de seguretat: logins, canvis de configuració, accions admin."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, server_default=func.now(), index=True)
    action = Column(String(100), nullable=False, index=True)
    user_email = Column(String(255), index=True)
    ip_address = Column(String(45))
    details = Column(Text)
    success = Column(String(10))


class PlaContractacioEntrada(Base):
    """Entrada del Pla de Contractació Anual."""
    __tablename__ = "pla_contractacio_entrades"

    id = Column(Integer, primary_key=True, index=True)
    any_exercici = Column(Integer, nullable=False, index=True)
    trimestre = Column(Integer, nullable=False)  # 1, 2, 3 or 4
    objecte = Column(Text, nullable=False)
    tipus_contracte = Column(String(100))
    ambit_responsable = Column(String(255))
    observacions = Column(Text)
    subvencionat = Column(Boolean, default=False)
    import_estimat = Column(Numeric(15, 2), nullable=True)

    # Optional link to an existing registered contract
    contrato_id = Column(Integer, ForeignKey("contratos.id"), nullable=True)
    contrato = relationship("Contrato", foreign_keys=[contrato_id])

    # Audit
    creat_per_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    creat_per = relationship("Empleado", foreign_keys=[creat_per_id])
    creat_at = Column(DateTime, server_default=func.now())
    actualitzat_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
