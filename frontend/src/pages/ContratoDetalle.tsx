import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, Contrato, Prorroga, Empleado, CriteriAdjudicacio, MembreMesa, DocumentFase } from '../api/client';
import {
    ArrowLeft,
    Building2,
    User,
    Calendar,
    DollarSign,
    MapPin,
    ExternalLink,
    FileText,
    Edit,
    X,
    Check,
    Clock,
    AlertCircle,
    ChevronDown,
    Download,
    Users,
    Layers,
    Plus,
} from 'lucide-react';
import { usePPTCart } from '../context/PPTContext';


export default function ContratoDetalle() {
    const { addDocument } = usePPTCart();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [contrato, setContrato] = useState<Contrato | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<Partial<Contrato & { departamentos_ids: number[], responsables_ids: number[] }>>({});
    const [saving, setSaving] = useState(false);
    const [prorrogues, setProrrogues] = useState<Prorroga[]>([]);
    const [modificacions, setModificacions] = useState<any[]>([]);
    const [departamentos, setDepartamentos] = useState<any[]>([]);
    const [empleados, setEmpleados] = useState<Empleado[]>([]);
    const [enriching, setEnriching] = useState(false);
    const [activeFaseTab, setActiveFaseTab] = useState<string>('licitacio');
    
    const [cpvDescriptions, setCpvDescriptions] = useState<Record<string, string>>({});
    const [lots, setLots] = useState<Contrato[]>([]);
    const [expandedLots, setExpandedLots] = useState<Set<number>>(new Set());

    const [user, setUser] = useState<Empleado | null>(null);

    useEffect(() => {
        const loadAllData = async () => {
            if (id) {
                await loadContrato(parseInt(id));
                await loadProrrogues(parseInt(id));
                await loadModificacions(parseInt(id));
                await loadLots(parseInt(id));
            }
            try {
                const [depts, emps] = await Promise.all([
                    api.getDepartamentos(),
                    api.getEmpleados()
                ]);
                setDepartamentos(depts);
                setEmpleados(emps);
            } catch (err) {
                console.error("Error loading common data:", err);
            }
        };
        loadAllData();
        api.getMe().then(setUser).catch(() => {});
    }, [id]);

    const loadContrato = async (contratoId: number) => {
        try {
            setLoading(true);
            const data = await api.getContrato(contratoId);
            setContrato(data);
            setError(null);
        } catch (err) {
            setError('Error al carregar el contracte');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadProrrogues = async (contratoId: number) => {
        try {
            const data = await api.getProrrogues(contratoId);
            setProrrogues(data);
        } catch (err) {
            console.error('Error loading prorrogues:', err);
        }
    };

    const loadModificacions = async (contratoId: number) => {
        try {
            const data = await api.getModificacions(contratoId);
            setModificacions(data);
        } catch (err) {
            console.error('Error loading modificacions:', err);
        }
    };

    useEffect(() => {
        if (contrato?.cpv_principal_codi) {
            const codes = Array.from(new Set(contrato.cpv_principal_codi.split('||'))).filter(Boolean);
            if (codes.length > 0) {
                api.getCpvInfo(codes).then(setCpvDescriptions).catch(console.error);
            }
        }
    }, [contrato?.cpv_principal_codi]);

    const loadLots = async (contratoId: number) => {
        try {
            const data = await api.getContratoLots(contratoId);
            setLots(data);
        } catch (err) {
            console.error('Error loading lots:', err);
        }
    };

    const toggleLot = (lotId: number) => {
        setExpandedLots(prev => {
            const next = new Set(prev);
            if (next.has(lotId)) {
                next.delete(lotId);
            } else {
                next.add(lotId);
            }
            return next;
        });
    };

    const handleOpenEdit = () => {
        if (contrato) {
            const dept_ids = contrato.departamentos?.map((d) => d.id) || [];
            const resp_ids = contrato.responsables?.map((r) => r.id) || [];

            setEditData({ 
                ...contrato, 
                responsables_ids: resp_ids,
                departamentos_ids: dept_ids
            });
            setIsEditing(true);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditData({});
    };

    const handleSave = async () => {
        console.log("Handle Save triggered", { editData });
        if (!contrato || !id) {
            console.error("No contract or ID found", { contrato, id });
            return;
        }
        try {
            setSaving(true);
            const isResponsable = user?.rol === 'responsable';
            const isAdmin = user?.rol === 'admin' || user?.rol === 'responsable_contratacion';
            
            console.log("User role:", user?.rol);

            // Només enviem els camps que el backend permet actualitzar
            let dataToSend: any = {};
            
            if (isAdmin) {
                // Camps que un admin pot tocar
                const allowedFields = [
                    'codi_expedient', 'objecte_contracte', 'tipus_contracte', 'procediment',
                    'estat_actual', 'adjudicatari_nom', 'adjudicatari_nif', 'adjudicatari_nacionalitat',
                    'import_adjudicacio_amb_iva', 'data_inici', 'data_final', 'data_formalitzacio', 
                    'estado_interno', 'departamentos_ids', 'responsables_ids', 'meses_aviso_vencimiento',
                    'organisme_adjudicador', 'departament_adjudicador', 'tipus_tramitacio',
                    'cpv_principal_codi', 'cpv_principal_descripcio', 'codi_nuts', 'lots', 
                    'forma_financament', 'preu_licitar', 'preu_adjudicar', 'import_licitar_sense_iva',
                    'pressupost_licitacio_sense_iva', 'pressupost_licitacio_amb_iva'
                ];
                
                allowedFields.forEach(field => {
                    let value = editData[field as keyof typeof editData];
                    
                    // Convertir strings buits a null per a camps de data o números
                    const numericFields = [
                        'import_adjudicacio_amb_iva', 'preu_licitar', 'preu_adjudicar', 
                        'import_licitar_sense_iva', 'pressupost_licitacio_sense_iva', 
                        'pressupost_licitacio_amb_iva', 'meses_aviso_vencimiento'
                    ];
                    const dateFields = ['data_inici', 'data_final', 'data_formalitzacio'];
                    
                    if ((numericFields.includes(field) || dateFields.includes(field)) && value === "") {
                        value = undefined;
                    }
                    
                    if (value !== undefined) {
                        // Si és un array d'IDs, filtrem valors no vàlids (com nulls)
                        if (Array.isArray(value) && (field === 'departamentos_ids' || field === 'responsables_ids')) {
                            const filtered = value.filter(id => id !== null && id !== undefined);
                            dataToSend[field] = Array.from(new Set(filtered));
                        } else {
                            dataToSend[field] = value;
                        }
                    }
                });
            } else if (isResponsable) {
                // Un responsable només pot tocar els mesos d'avís
                dataToSend = { 
                    meses_aviso_vencimiento: editData.meses_aviso_vencimiento 
                };
            }
            
            console.log("Data to send:", dataToSend);
            
            await api.updateContrato(parseInt(id), dataToSend);
            console.log("Update successful");
            await loadContrato(parseInt(id));
            setIsEditing(false);
        } catch (err: any) {
            console.error('Error saving contract:', err);
            const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
            alert("Error al desar: " + errorMsg);
        } finally {
            setSaving(false);
        }
    };

    const handleEnrich = async () => {
        if (!id) return;
        try {
            setEnriching(true);
            await api.enrichContrato(parseInt(id));
            await loadContrato(parseInt(id));
        } catch (err) {
            console.error('Error enriching:', err);
        } finally {
            setEnriching(false);
        }
    };

    const formatCurrency = (value?: number) => {
        if (value === undefined || value === null) return '-';
        return new Intl.NumberFormat('ca-ES', {
            style: 'currency',
            currency: 'EUR',
        }).format(value);
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('ca-ES', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });
    };

    const getEstadoInternoBadge = (estado: string) => {
        switch (estado) {
            case 'pendiente_aprobacion':
                return <span className="badge badge-pending">Pendent d'Aprovació</span>;
            case 'aprobado':
                return <span className="badge badge-success">Aprovat</span>;
            case 'rechazado':
                return <span className="badge badge-error">Rebutjat</span>;
            default:
                return <span className="badge badge-info">Normal</span>;
        }
    };

    const getExpirationAlert = () => {
        if (!contrato) return null;
        if (contrato.possiblement_finalitzat) {
            return (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
                    <AlertCircle className="text-red-600" size={24} />
                    <div>
                        <p className="font-medium text-red-800">Possiblement Finalitzat</p>
                        <p className="text-sm text-red-600">La data de finalització calculada ha passat.</p>
                    </div>
                </div>
            );
        }
        if (contrato.alerta_finalitzacio) {
            return (
                <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 flex items-center gap-3">
                    <Clock className="text-yellow-600" size={24} />
                    <div>
                        <p className="font-medium text-yellow-800">Pròxim a Finalitzar</p>
                        <p className="text-sm text-yellow-600">Aquest contracte finalitza en els pròxims 6 mesos.</p>
                    </div>
                </div>
            );
        }
        return null;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="loading-spinner w-12 h-12"></div>
            </div>
        );
    }

    if (error || !contrato) {
        return (
            <div className="glass-card p-6 text-center">
                <p className="text-red-500 mb-4">{error || 'Contracte no trobat'}</p>
                <button onClick={() => navigate(-1)} className="btn btn-primary">
                    Tornar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="btn btn-secondary p-2">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        {isEditing ? (
                            <input 
                                type="text" 
                                className="input input-bordered text-2xl font-bold h-12 w-full max-w-md" 
                                value={editData.codi_expedient || ""} 
                                onChange={(e) => setEditData({ ...editData, codi_expedient: e.target.value })} 
                            />
                        ) : (
                            <h1 className="text-2xl font-bold text-slate-800">{contrato.codi_expedient}</h1>
                        )}
                        {getEstadoInternoBadge(contrato.estado_interno)}
                        {isEditing ? (
                            <input 
                                type="text" 
                                className="input input-bordered h-10 w-48 text-sm" 
                                placeholder="Estat Actual"
                                value={editData.estat_actual || ""} 
                                onChange={(e) => setEditData({ ...editData, estat_actual: e.target.value })} 
                            />
                        ) : (
                            <span className="badge badge-info">{contrato.estat_actual}</span>
                        )}
                    </div>
                    {isEditing ? (
                        <input 
                            type="text" 
                            className="input input-bordered h-10 w-full max-w-md text-sm mt-2" 
                            placeholder="Tipus de Contracte"
                            value={editData.tipus_contracte || ""} 
                            onChange={(e) => setEditData({ ...editData, tipus_contracte: e.target.value })} 
                        />
                    ) : (
                        <p className="text-slate-500 mt-1">{contrato.tipus_contracte}</p>
                    )}
                </div>
                <div className="flex gap-2">
                    {contrato.enllac_publicacio && (
                        <a
                            href={contrato.enllac_publicacio}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary gap-2"
                        >
                            <ExternalLink size={18} />
                            Veure Publicació
                        </a>
                    )}
                {(user?.rol === 'admin' || user?.rol === 'responsable_contratacion' || user?.rol === 'responsable') && (
                    /* Header Actions */
                    <div className="flex items-center gap-3">
                        {!contrato.fecha_enriquiment && (user?.rol === 'admin' || user?.rol === 'responsable_contratacion') && (
                            <button onClick={handleEnrich} disabled={enriching} className="btn btn-secondary gap-2" title="Descarrega dades detallades de les fases">
                                {enriching ? <div className="loading-spinner w-4 h-4"></div> : <Download size={18} />}
                                {enriching ? 'Enriquint...' : 'Enriquir'}
                            </button>
                        )}
                        {isEditing ? (
                            <>
                                <button
                                    onClick={handleCancel}
                                    disabled={saving}
                                    className="btn bg-white border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                >
                                    <X size={18} />
                                    <span className="hidden sm:inline">Cancel·lar</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        console.log("Save button DOM click");
                                        handleSave();
                                    }}
                                    disabled={saving}
                                    className="btn btn-primary flex items-center gap-2 shadow-lg shadow-primary-200"
                                >
                                    {saving ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Check size={18} />
                                    )}
                                    <span>{saving ? 'Desant...' : 'Desar Canvis'}</span>
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleOpenEdit}
                                className="btn bg-white border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                            >
                                <Edit size={18} />
                                <span>Editar</span>
                            </button>
                        )}
                    </div>
                )}
                </div>
            </div>

            {/* Expiration Alert */}
            {getExpirationAlert()}

            {/* Object Card */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <FileText size={20} className="text-primary-600" />
                    Objecte del Contracte
                </h3>
                {isEditing ? (
                    <textarea
                        className="input input-bordered w-full"
                        rows={3}
                        value={editData.objecte_contracte || ""}
                        onChange={(e) => setEditData({ ...editData, objecte_contracte: e.target.value })}
                    />
                ) : (
                    <p className="text-slate-700 leading-relaxed">{contrato.objecte_contracte || '-'}</p>
                )}
            </div>

            {/* Gestió del Contracte (Inline) */}
            <div className="glass-card p-6 border-l-4 border-l-primary-500">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Users size={20} className="text-primary-600" />
                    Gestió del Contracte
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Departaments */}
                    <div className="md:col-span-2">
                        <label className="text-sm font-semibold text-slate-500 mb-2 block tracking-wider uppercase text-[10px]">
                            Departaments Assignats
                        </label>
                        {isEditing ? (
                            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto p-3 bg-white border border-slate-200 rounded-xl">
                                {departamentos.map(d => {
                                    const isChecked = editData.departamentos_ids?.some(id => Number(id) === Number(d.id)) || false;
                                    return (
                                        <label key={d.id} className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg transition-colors">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                                                checked={isChecked}
                                                onChange={(e) => {
                                                    const currentIds = editData.departamentos_ids || [];
                                                    if (e.target.checked) {
                                                        setEditData({ ...editData, departamentos_ids: [...currentIds, d.id] });
                                                    } else {
                                                        setEditData({ ...editData, departamentos_ids: currentIds.filter((id: number) => id !== d.id) });
                                                    }
                                                }}
                                            />
                                            <span className="text-sm font-medium text-slate-700">{d.nombre}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {contrato.departamentos && contrato.departamentos.length > 0 ? (
                                    contrato.departamentos.map(d => (
                                        <span key={d.id} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-primary-50 text-primary-700 border border-primary-100">
                                            {d.nombre}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-slate-400 italic text-sm">Sense departaments assignats</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Responsables */}
                    <div className="md:col-span-2">
                        <label className="text-sm font-semibold text-slate-500 mb-2 block tracking-wider uppercase text-[10px]">
                            Responsables
                        </label>
                        {isEditing ? (
                            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto p-3 bg-white border border-slate-200 rounded-xl">
                                {empleados
                                    .filter(emp => {
                                        if (!['responsable', 'admin', 'responsable_contratacion'].includes(emp.rol)) return false;
                                        const selectedDeptIds = editData.departamentos_ids || [];
                                        if (selectedDeptIds.length === 0) return false;
                                        return emp.departamentos?.some(d => 
                                            selectedDeptIds.some(sId => Number(sId) === Number(d.id))
                                        );
                                    })
                                    .map(emp => (
                                        <label key={emp.id} className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg transition-colors">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                                                checked={editData.responsables_ids?.some(id => Number(id) === Number(emp.id)) || false}
                                                onChange={(e) => {
                                                    const currentIds = editData.responsables_ids || [];
                                                    if (e.target.checked) {
                                                        setEditData({ ...editData, responsables_ids: [...currentIds, emp.id] });
                                                    } else {
                                                        setEditData({ ...editData, responsables_ids: currentIds.filter((id: number) => id !== emp.id) });
                                                    }
                                                }}
                                            />
                                            <span className="text-sm font-medium text-slate-700">{emp.nombre}</span>
                                        </label>
                                    ))
                                }
                                {(editData.departamentos_ids?.length || 0) === 0 && (
                                    <span className="text-xs text-amber-600 italic p-2 bg-amber-50 rounded-lg font-medium">
                                        Selecciona un departament per veure els responsables disponibles
                                    </span>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {contrato.responsables && contrato.responsables.length > 0 ? (
                                    contrato.responsables.map(r => (
                                        <span key={r.id} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-secondary-50 text-secondary-700 border border-secondary-100">
                                            <User size={12} className="mr-1" />
                                            {r.nombre}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-slate-400 italic text-sm">Sense responsables assignats</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Estats i Avisos */}
                    <div className="lg:col-span-2">
                        <label className="text-sm font-semibold text-slate-500 mb-2 block tracking-wider uppercase text-[10px]">
                            Estat Intern
                        </label>
                        {isEditing ? (
                            <select 
                                className="input input-bordered w-full" 
                                value={editData.estado_interno || ""} 
                                onChange={(e) => setEditData({ ...editData, estado_interno: e.target.value })}
                            >
                                <option value="normal">Normal</option>
                                <option value="pendiente_aprobacion">Pendent d'aprovació</option>
                                <option value="aprobado">Aprovat</option>
                                <option value="rechazado">Rebutjat</option>
                            </select>
                        ) : (
                            <div>{getEstadoInternoBadge(contrato.estado_interno)}</div>
                        )}
                    </div>

                    <div className="lg:col-span-2">
                        <label className="text-sm font-semibold text-slate-500 mb-2 block tracking-wider uppercase text-[10px]">
                            Mesos d'Avís Venciment
                        </label>
                        {isEditing ? (
                            <input 
                                type="number" 
                                className="input input-bordered w-full" 
                                value={editData.meses_aviso_vencimiento || ""} 
                                onChange={(e) => setEditData({ ...editData, meses_aviso_vencimiento: parseInt(e.target.value) || 0 })} 
                            />
                        ) : (
                            <p className="font-bold text-slate-700">{contrato.meses_aviso_vencimiento || 6} mesos</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Adjudicación */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <User size={20} className="text-primary-600" />
                        Dades de l'Adjudicatari
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-slate-500">Adjudicatari</label>
                            {isEditing ? (
                                <input type="text" className="input input-bordered w-full mt-1" value={editData.adjudicatari_nom || ""} onChange={(e) => setEditData({ ...editData, adjudicatari_nom: e.target.value })} />
                            ) : (
                                <p className="font-medium text-slate-800">{contrato.adjudicatari_nom || '-'}</p>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm text-slate-500">NIF</label>
                                {isEditing ? (
                                    <input type="text" className="input input-bordered w-full mt-1" value={editData.adjudicatari_nif || ""} onChange={(e) => setEditData({ ...editData, adjudicatari_nif: e.target.value })} />
                                ) : (
                                    <p className="text-slate-700">{contrato.adjudicatari_nif || '-'}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm text-slate-500">Nacionalitat</label>
                                {isEditing ? (
                                    <input type="text" className="input input-bordered w-full mt-1" value={editData.adjudicatari_nacionalitat || ""} onChange={(e) => setEditData({ ...editData, adjudicatari_nacionalitat: e.target.value })} />
                                ) : (
                                    <p className="text-slate-700">{contrato.adjudicatari_nacionalitat || '-'}</p>
                                )}
                            </div>
                        </div>
                        {(contrato.adjudicatari_tipus_empresa || contrato.adjudicatari_telefon || contrato.adjudicatari_email) && (
                            <div className="pt-2 border-t border-slate-100 space-y-3">
                                {contrato.adjudicatari_tipus_empresa && (
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm text-slate-500">Tipus Empresa</label>
                                        <span className="badge badge-info">{contrato.adjudicatari_tipus_empresa}</span>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                    {contrato.adjudicatari_telefon && (
                                        <div>
                                            <label className="text-xs text-slate-500">Telèfon</label>
                                            <p className="text-sm text-primary-600 font-medium">
                                                <a href={`tel:${contrato.adjudicatari_telefon}`}>{contrato.adjudicatari_telefon}</a>
                                            </p>
                                        </div>
                                    )}
                                    {contrato.adjudicatari_email && (
                                        <div>
                                            <label className="text-xs text-slate-500">Email</label>
                                            <p className="text-sm text-primary-600 font-medium truncate">
                                                <a href={`mailto:${contrato.adjudicatari_email}`} title={contrato.adjudicatari_email}>{contrato.adjudicatari_email}</a>
                                            </p>
                                        </div>
                                    )}
                                </div>
                                {contrato.adjudicatari_tercer_sector && contrato.adjudicatari_tercer_sector !== 'No tercer sector' && (
                                    <div className="p-2 rounded-lg bg-green-50 text-green-700 text-xs font-medium">
                                        Tercer Sector: {contrato.adjudicatari_tercer_sector}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Importes */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <DollarSign size={20} className="text-primary-600" />
                        Imports
                    </h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-slate-50">
                                <label className="text-sm text-slate-500">Preu Licitar</label>
                                {isEditing ? (
                                    <input type="number" step="0.01" className="input input-bordered w-full mt-1" value={editData.preu_licitar || ""} onChange={(e) => setEditData({ ...editData, preu_licitar: parseFloat(e.target.value) || undefined })} />
                                ) : (
                                    <p className="text-xl font-bold text-slate-800 number-display">
                                        {formatCurrency(contrato.preu_licitar)}
                                    </p>
                                )}
                            </div>
                            <div className="p-4 rounded-xl bg-green-50">
                                <label className="text-sm text-slate-500">Preu Adjudicar</label>
                                {isEditing ? (
                                    <input type="number" step="0.01" className="input input-bordered w-full mt-1" value={editData.preu_adjudicar || ""} onChange={(e) => setEditData({ ...editData, preu_adjudicar: parseFloat(e.target.value) || undefined })} />
                                ) : (
                                    <p className="text-xl font-bold text-green-700 number-display">
                                        {formatCurrency(contrato.preu_adjudicar)}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm text-slate-500">Import amb IVA</label>
                                {isEditing ? (
                                    <input type="number" step="0.01" className="input input-bordered w-full mt-1" value={editData.import_adjudicacio_amb_iva || ""} onChange={(e) => setEditData({ ...editData, import_adjudicacio_amb_iva: parseFloat(e.target.value) || undefined })} />
                                ) : (
                                    <p className="font-medium text-slate-800">
                                        {formatCurrency(contrato.import_adjudicacio_amb_iva)}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm text-slate-500">Import sense IVA</label>
                                {isEditing ? (
                                    <input type="number" step="0.01" className="input input-bordered w-full mt-1" value={editData.import_licitar_sense_iva || ""} onChange={(e) => setEditData({ ...editData, import_licitar_sense_iva: parseFloat(e.target.value) || undefined })} />
                                ) : (
                                    <p className="font-medium text-slate-800">
                                        {formatCurrency(contrato.import_licitar_sense_iva)}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm text-slate-500">Pressupost Licitació (sense IVA)</label>
                                {isEditing ? (
                                    <input type="number" step="0.01" className="input input-bordered w-full mt-1" value={editData.pressupost_licitacio_sense_iva || ""} onChange={(e) => setEditData({ ...editData, pressupost_licitacio_sense_iva: parseFloat(e.target.value) || undefined })} />
                                ) : (
                                    <p className="text-slate-700">{formatCurrency(contrato.pressupost_licitacio_sense_iva)}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm text-slate-500">Pressupost Licitació (amb IVA)</label>
                                {isEditing ? (
                                    <input type="number" step="0.01" className="input input-bordered w-full mt-1" value={editData.pressupost_licitacio_amb_iva || ""} onChange={(e) => setEditData({ ...editData, pressupost_licitacio_amb_iva: parseFloat(e.target.value) || undefined })} />
                                ) : (
                                    <p className="text-slate-700">{formatCurrency(contrato.pressupost_licitacio_amb_iva)}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Organismo */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <Building2 size={20} className="text-primary-600" />
                        Organisme
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-slate-500">Organisme Adjudicador</label>
                            {isEditing ? (
                                <input type="text" className="input input-bordered w-full mt-1" value={editData.organisme_adjudicador || ""} onChange={(e) => setEditData({ ...editData, organisme_adjudicador: e.target.value })} />
                            ) : (
                                <p className="text-slate-700">{contrato.organisme_adjudicador || '-'}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">Departament Adjudicador</label>
                            {isEditing ? (
                                <input type="text" className="input input-bordered w-full mt-1" value={editData.departament_adjudicador || ""} onChange={(e) => setEditData({ ...editData, departament_adjudicador: e.target.value })} />
                            ) : (
                                <p className="text-slate-700">{contrato.departament_adjudicador || '-'}</p>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm text-slate-500">Procediment</label>
                                {isEditing ? (
                                    <input type="text" className="input input-bordered w-full mt-1" value={editData.procediment || ""} onChange={(e) => setEditData({ ...editData, procediment: e.target.value })} />
                                ) : (
                                    <p className="text-slate-700">{contrato.procediment || '-'}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm text-slate-500">Tipus Tramitació</label>
                                {isEditing ? (
                                    <input type="text" className="input input-bordered w-full mt-1" value={editData.tipus_tramitacio || ""} onChange={(e) => setEditData({ ...editData, tipus_tramitacio: e.target.value })} />
                                ) : (
                                    <p className="text-slate-700">{contrato.tipus_tramitacio || '-'}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Fechas y Duración */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <Calendar size={20} className="text-primary-600" />
                        Dates i Durada
                    </h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm text-slate-500">Data Formalització</label>
                                {isEditing ? (
                                    <input type="date" className="input input-bordered w-full mt-1" value={editData.data_formalitzacio?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_formalitzacio: e.target.value })} />
                                ) : (
                                    <p className="text-slate-700">{formatDate(contrato.data_formalitzacio)}</p>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 rounded-xl bg-green-50">
                                <label className="text-sm text-green-600">Data Inici</label>
                                {isEditing ? (
                                    <input type="date" className="input input-bordered w-full mt-1" value={editData.data_inici?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_inici: e.target.value })} />
                                ) : (
                                    <p className="font-medium text-green-800">{formatDate(contrato.data_inici_execucio || contrato.data_inici)}</p>
                                )}
                            </div>
                            <div className={`p-3 rounded-xl ${contrato.possiblement_finalitzat ? 'bg-red-50' : contrato.alerta_finalitzacio ? 'bg-yellow-50' : 'bg-slate-50'}`}>
                                <label className={`text-sm ${contrato.possiblement_finalitzat ? 'text-red-600' : contrato.alerta_finalitzacio ? 'text-yellow-600' : 'text-slate-500'}`}>
                                    Data Final
                                </label>
                                {isEditing ? (
                                    <input type="date" className="input input-bordered w-full mt-1" value={editData.data_final?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_final: e.target.value })} />
                                ) : (
                                    <p className={`font-medium ${contrato.possiblement_finalitzat ? 'text-red-800' : contrato.alerta_finalitzacio ? 'text-yellow-800' : 'text-slate-700'}`}>
                                        {formatDate(contrato.data_fi_execucio || contrato.data_final)}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 rounded-xl bg-blue-50">
                                <label className="text-sm text-blue-600">Durada del Contracte</label>
                                <p className="text-lg font-bold text-blue-800">
                                    {contrato.durada_anys !== null && contrato.durada_anys !== undefined ? (
                                        [contrato.durada_anys > 0 ? `${contrato.durada_anys}a` : null,
                                         contrato.durada_mesos && contrato.durada_mesos > 0 ? `${contrato.durada_mesos}m` : null,
                                         contrato.durada_dies && contrato.durada_dies > 0 ? `${contrato.durada_dies}d` : null
                                        ].filter(Boolean).join(' ') || '-'
                                    ) : (
                                        contrato.durada_contracte ? `${contrato.durada_contracte} mesos` : '-'
                                    )}
                                </p>
                            </div>
                            <div>
                                <label className="text-sm text-slate-500">Data Formalització</label>
                                <p className="text-slate-700">{formatDate(contrato.data_formalitzacio)}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm text-slate-500">Publicació</label>
                                <p className="text-slate-700">{formatDate(contrato.data_publicacio)}</p>
                            </div>
                            <div>
                                <label className="text-sm text-slate-500">Anunci Adjudicació</label>
                                <p className="text-slate-700">{formatDate(contrato.data_anunci_adjudicacio)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Clasificación */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <MapPin size={20} className="text-primary-600" />
                    Classificació
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="text-sm text-slate-500 block mb-2">CPV Principal</label>
                        {isEditing ? (
                            <div className="space-y-2">
                                <input type="text" className="input input-bordered w-full mt-1" placeholder="Codi CPV (ex: 79000000-4)" value={editData.cpv_principal_codi || ""} onChange={(e) => setEditData({ ...editData, cpv_principal_codi: e.target.value })} />
                                <textarea className="input input-bordered w-full mt-1 text-sm" placeholder="Descripció CPV" rows={2} value={editData.cpv_principal_descripcio || ""} onChange={(e) => setEditData({ ...editData, cpv_principal_descripcio: e.target.value })} />
                            </div>
                        ) : (
                            <>
                                {contrato.cpv_principal_codi ? (
                                    <div className="flex flex-col gap-3 mb-2">
                                        {Array.from(new Set(contrato.cpv_principal_codi.split('||'))).filter(Boolean).map((cpv, index) => (
                                            <div key={index} className="flex flex-col p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-primary-200 transition-colors">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="bg-primary-600 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                                                        CPV
                                                    </span>
                                                    <span className="font-mono text-sm font-bold text-slate-700">
                                                        {cpv}
                                                    </span>
                                                </div>
                                                {cpvDescriptions[cpv] && (
                                                    <p className="text-sm text-slate-600 leading-snug font-medium">
                                                        {cpvDescriptions[cpv]}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-slate-700">-</p>
                                )}
                                {contrato.cpv_principal_descripcio && (
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        <label className="text-xs text-slate-400 block mb-1">Descripció original de l'expedient</label>
                                        <p className="text-sm text-slate-500 italic">{contrato.cpv_principal_descripcio}</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div>
                        <label className="text-sm text-slate-500">NUTS</label>
                        {isEditing ? (
                            <input type="text" className="input input-bordered w-full mt-1" value={editData.codi_nuts || ""} onChange={(e) => setEditData({ ...editData, codi_nuts: e.target.value })} />
                        ) : (
                            <p className="text-slate-700">{contrato.codi_nuts || '-'}</p>
                        )}
                    </div>
                    <div>
                        <label className="text-sm text-slate-500">Lot</label>
                        {isEditing ? (
                            <input type="text" className="input input-bordered w-full mt-1" value={editData.lots || ""} onChange={(e) => setEditData({ ...editData, lots: e.target.value })} />
                        ) : (
                            <p className="text-slate-700">{contrato.lots || '-'}</p>
                        )}
                    </div>
                    <div>
                        <label className="text-sm text-slate-500">Forma de Finançament</label>
                        {isEditing ? (
                            <input type="text" className="input input-bordered w-full mt-1" value={editData.forma_financament || ""} onChange={(e) => setEditData({ ...editData, forma_financament: e.target.value })} />
                        ) : (
                            <p className="text-slate-700">{contrato.forma_financament || '-'}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Lots de l'expedient */}
            {lots.length > 0 && (
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <Layers size={20} className="text-primary-600" />
                        Lots de l'Expedient
                        <span className="bg-primary-100 text-primary-700 text-sm px-2 py-0.5 rounded-full">
                            {lots.length + 1} lots
                        </span>
                    </h3>
                    <div className="mb-3 p-3 rounded-xl bg-primary-50 border border-primary-200">
                        <div className="flex items-center gap-2">
                            <span className="bg-primary-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                                Lot {contrato.lots || '-'}
                            </span>
                            <span className="text-sm font-medium text-primary-800">Lot actual (estàs aquí)</span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {lots.map((lot) => (
                            <div key={lot.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => toggleLot(lot.id)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap">
                                            Lot {lot.lots || '-'}
                                        </span>
                                        <span className="text-sm text-slate-700 truncate">
                                            {lot.adjudicatari_nom || 'Sense adjudicatari'}
                                        </span>
                                        {lot.estat_actual && (
                                            <span className="badge badge-info text-xs whitespace-nowrap">{lot.estat_actual}</span>
                                        )}
                                        {lot.import_adjudicacio_amb_iva !== undefined && lot.import_adjudicacio_amb_iva !== null && (
                                            <span className="text-sm font-semibold text-green-700 whitespace-nowrap ml-auto mr-2">
                                                {formatCurrency(lot.import_adjudicacio_amb_iva)}
                                            </span>
                                        )}
                                    </div>
                                    <ChevronDown
                                        size={18}
                                        className={`text-slate-400 transition-transform flex-shrink-0 ${expandedLots.has(lot.id) ? 'rotate-180' : ''}`}
                                    />
                                </button>
                                {expandedLots.has(lot.id) && (
                                    <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-4">
                                        {lot.objecte_contracte && (
                                            <div>
                                                <label className="text-xs text-slate-500 uppercase tracking-wider">Objecte</label>
                                                <p className="text-sm text-slate-700 mt-0.5">{lot.objecte_contracte}</p>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div>
                                                <label className="text-xs text-slate-500">Adjudicatari</label>
                                                <p className="text-sm font-medium text-slate-800">{lot.adjudicatari_nom || '-'}</p>
                                                {lot.adjudicatari_nif && <p className="text-xs text-slate-500">{lot.adjudicatari_nif}</p>}
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-500">Import amb IVA</label>
                                                <p className="text-sm font-medium text-green-700">{formatCurrency(lot.import_adjudicacio_amb_iva)}</p>
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-500">Data Formalització</label>
                                                <p className="text-sm text-slate-700">{formatDate(lot.data_formalitzacio)}</p>
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-500">Data Final</label>
                                                <p className="text-sm text-slate-700">{formatDate(lot.data_final)}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div>
                                                <label className="text-xs text-slate-500">Durada</label>
                                                <p className="text-sm text-slate-700">{lot.durada_contracte ? `${lot.durada_contracte} mesos` : '-'}</p>
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-500">Procediment</label>
                                                <p className="text-sm text-slate-700">{lot.procediment || '-'}</p>
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-500">CPV</label>
                                                {lot.cpv_principal_codi ? (
                                                    <div className="flex flex-col gap-1.5 mt-1">
                                                        {Array.from(new Set(lot.cpv_principal_codi.split('||'))).filter(Boolean).map((cpv, index) => (
                                                            <div key={index} className="flex items-start gap-2">
                                                                <span className="bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-bold whitespace-nowrap">
                                                                    {cpv}
                                                                </span>
                                                                {cpvDescriptions[cpv] && (
                                                                    <span className="text-[11px] text-slate-500 leading-tight flex-1">{cpvDescriptions[cpv]}</span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-slate-700">{lot.cpv_principal_codi || '-'}</p>
                                                )}
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-500">Estat</label>
                                                <p className="text-sm text-slate-700">{lot.estat_actual || '-'}</p>
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-slate-200">
                                            <Link
                                                to={`/contratos/${lot.id}`}
                                                className="text-sm text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-1"
                                            >
                                                Veure detall complet d'aquest lot
                                                <ExternalLink size={14} />
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pròrrogues */}
            {prorrogues.length > 0 && (
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <Calendar size={20} className="text-primary-600" />
                        Pròrrogues
                        <span className="bg-primary-100 text-primary-700 text-sm px-2 py-0.5 rounded-full">
                            {prorrogues.length}
                        </span>
                    </h3>
                    <div className="space-y-4">
                        {prorrogues.map((p) => (
                            <div
                                key={p.id}
                                className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-blue-100 text-blue-700 text-sm font-medium px-2.5 py-0.5 rounded-full">
                                            Pròrroga {p.numero_prorroga}
                                        </span>
                                        {p.exercici && (
                                            <span className="text-sm text-slate-500">Exercici {p.exercici}</span>
                                        )}
                                    </div>
                                    {p.import_adjudicacio !== undefined && p.import_adjudicacio !== null && p.import_adjudicacio > 0 && (
                                        <span className="font-semibold text-green-700">
                                            {formatCurrency(p.import_adjudicacio)}
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm text-slate-500">Data Inici</label>
                                        <p className="text-slate-700 font-medium">{formatDate(p.data_inici_prorroga)}</p>
                                    </div>
                                    <div>
                                        <label className="text-sm text-slate-500">Data Fi</label>
                                        <p className="text-slate-700 font-medium">{formatDate(p.data_fi_prorroga)}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modificacions */}
            {modificacions.length > 0 && (
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <Edit size={20} className="text-primary-600" />
                        Modificacions
                        <span className="bg-primary-100 text-primary-700 text-sm px-2 py-0.5 rounded-full">
                            {modificacions.length}
                        </span>
                    </h3>
                    <div className="space-y-4">
                        {modificacions.map((m) => (
                            <div
                                key={m.id}
                                className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-amber-100 text-amber-700 text-sm font-medium px-2.5 py-0.5 rounded-full">
                                            Modificació {m.numero_modificacio}
                                        </span>
                                        <span className="text-sm text-slate-500">{formatDate(m.data_aprovacio_modificacio)}</span>
                                    </div>
                                    {m.import_modificacio !== undefined && m.import_modificacio !== null && (
                                        <span className="font-semibold text-green-700">
                                            {formatCurrency(m.import_modificacio)}
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs text-slate-500 uppercase tracking-wider">Tipus de Modificació</label>
                                        <p className="text-sm text-slate-700 mt-0.5">{m.tipus_modificacio || '-'}</p>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
                                        <div>
                                            <label className="text-xs text-slate-500">Import</label>
                                            <p className="text-sm font-medium text-slate-700">{formatCurrency(m.import_modificacio)}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-500">Ampliació Termini</label>
                                            <p className="text-sm font-medium text-slate-700">
                                                {[
                                                    m.anys_termini_modificacio > 0 ? `${m.anys_termini_modificacio}a` : null,
                                                    m.mesos_termini_modificacio > 0 ? `${m.mesos_termini_modificacio}m` : null,
                                                    m.dies_termini_modificacio > 0 ? `${m.dies_termini_modificacio}d` : null
                                                ].filter(Boolean).join(' ') || 'Cap'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* === SECCIONS ENRIQUIDES === */}

            {/* Criteris d'Adjudicació */}
            {contrato.criteris_adjudicacio && contrato.criteris_adjudicacio.length > 0 && (
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <Layers size={20} className="text-primary-600" />
                        Criteris d'Adjudicació
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-3 px-4 text-slate-500 font-medium">Criteri</th>
                                    <th className="text-right py-3 px-4 text-slate-500 font-medium">Ponderació</th>
                                    <th className="text-left py-3 px-4 text-slate-500 font-medium">Detall</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contrato.criteris_adjudicacio.map((c: CriteriAdjudicacio) => (
                                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                        <td className="py-3 px-4 font-medium text-slate-800">{c.criteri_nom || '-'}</td>
                                        <td className="py-3 px-4 text-right">
                                            {c.ponderacio !== null && c.ponderacio !== undefined ? (
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="w-24 bg-slate-200 rounded-full h-2">
                                                        <div 
                                                            className="bg-primary-600 h-2 rounded-full transition-all" 
                                                            style={{ width: `${Math.min(c.ponderacio, 100)}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="font-bold text-primary-700 min-w-[40px] text-right">{c.ponderacio}%</span>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="py-3 px-4 text-slate-600">
                                            {c.desglossament_json && c.desglossament_json.length > 0 ? (
                                                <div className="space-y-1">
                                                    {c.desglossament_json.map((d: any, i: number) => (
                                                        <div key={i} className="text-xs">
                                                            <span className="font-medium">{d.tipusCriteri?.ca || d.tipusCriteri?.es || ''}</span>
                                                            {d.descripcioCriteri?.ca && (
                                                                <span className="text-slate-500 ml-1">— {d.descripcioCriteri.ca.substring(0, 80)}{d.descripcioCriteri.ca.length > 80 ? '...' : ''}</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Mesa de Contractació */}
            {contrato.membres_mesa && contrato.membres_mesa.length > 0 && (
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <Users size={20} className="text-primary-600" />
                        Mesa de Contractació
                        <span className="bg-primary-100 text-primary-700 text-sm px-2 py-0.5 rounded-full">
                            {contrato.membres_mesa.length}
                        </span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {contrato.membres_mesa.map((m: MembreMesa) => (
                            <div key={m.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                                <p className="font-medium text-slate-800">{m.nom} {m.cognoms}</p>
                                <p className="text-sm text-slate-500 mt-0.5">{m.carrec || '-'}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Documents de l'Expedient */}
            {contrato.documents_fase && contrato.documents_fase.length > 0 && (
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <FileText size={20} className="text-primary-600" />
                        Documents de l'Expedient
                        <span className="bg-primary-100 text-primary-700 text-sm px-2 py-0.5 rounded-full">
                            {contrato.documents_fase.length}
                        </span>
                    </h3>
                    <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-6">
                        {['licitacio', 'avaluacio', 'adjudicacio', 'formalitzacio'].map(fase => {
                            const hasDocs = contrato.documents_fase!.some((d: DocumentFase) => d.fase === fase);
                            if (!hasDocs) return null;
                            
                            const faseLabels: Record<string, string> = {
                                licitacio: 'Licitació',
                                avaluacio: 'Avaluació',
                                adjudicacio: 'Adjudicació',
                                formalitzacio: 'Formalització'
                            };

                            return (
                                <button
                                    key={fase}
                                    onClick={() => setActiveFaseTab(fase)}
                                    className={`px-5 py-3 text-sm font-bold transition-all relative rounded-t-xl ${
                                        activeFaseTab === fase
                                            ? 'text-primary-600 bg-primary-50/30'
                                            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                    }`}
                                >
                                    {faseLabels[fase] || fase}
                                    {activeFaseTab === fase && (
                                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-full" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="space-y-2">
                        {contrato.documents_fase!
                            .filter((d: DocumentFase) => d.fase === activeFaseTab)
                            .map((d: DocumentFase) => (
                                <div key={d.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:border-primary-200 transition-all hover:shadow-md">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 flex-shrink-0">
                                            <FileText size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-700 truncate">{d.titol}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {d.tipus_document && d.tipus_document !== 'document' && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{d.tipus_document}</span>
                                                )}
                                                {d.mida && (
                                                    <span className="text-[10px] font-medium text-slate-400">
                                                        {(d.mida / 1024).toFixed(0)} KB
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                                        {d.url_descarrega && (
                                            <>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        addDocument({
                                                            id: `${contrato?.codi_expedient}-${d.id}`,
                                                            url: d.url_descarrega!,
                                                            titol: d.titol || 'Document',
                                                            expedient: contrato?.codi_expedient || 'Desconegut',
                                                            origen: 'Licitia'
                                                        });
                                                    }}
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors text-xs font-black uppercase tracking-wider"
                                                    title="Usar com a plantilla pel generador"
                                                >
                                                    <Plus size={14} />
                                                    Plantilla
                                                </button>
                                                <a
                                                    href={d.url_descarrega}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-all border border-transparent hover:border-primary-100"
                                                    title="Descarregar document"
                                                >
                                                    <Download size={18} />
                                                </a>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Detall Econòmic Ampliat (si enriquit) */}
            {contrato.fecha_enriquiment && (
                <div className="grid grid-cols-1 gap-6">
                    {/* Info Legal i Contractual */}
                    <div className="glass-card p-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <FileText size={20} className="text-primary-600" />
                            Informació Contractual
                        </h3>
                        <div className="space-y-3">
                            {contrato.normativa_aplicable && (
                                <div>
                                    <label className="text-sm text-slate-500">Normativa</label>
                                    <p className="text-slate-700">{contrato.normativa_aplicable}</p>
                                </div>
                            )}
                            {contrato.procediment_adjudicacio && (
                                <div>
                                    <label className="text-sm text-slate-500">Procediment d'Adjudicació</label>
                                    <p className="text-slate-700">{contrato.procediment_adjudicacio}</p>
                                </div>
                            )}
                            {contrato.causa_habilitant && (
                                <div>
                                    <label className="text-sm text-slate-500">Causa Habilitant</label>
                                    <p className="text-sm text-slate-700">{contrato.causa_habilitant}</p>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                {contrato.total_ofertes_rebudes !== null && contrato.total_ofertes_rebudes !== undefined && (
                                    <div className="p-3 rounded-xl bg-blue-50">
                                        <label className="text-xs text-blue-600">Ofertes Rebudes</label>
                                        <p className="text-lg font-bold text-blue-800">{contrato.total_ofertes_rebudes}</p>
                                    </div>
                                )}
                                {contrato.iva_percentatge !== null && contrato.iva_percentatge !== undefined && (
                                    <div className="p-3 rounded-xl bg-slate-50">
                                        <label className="text-xs text-slate-500">IVA</label>
                                        <p className="text-lg font-bold text-slate-800">{contrato.iva_percentatge}%</p>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 pt-2">
                                {contrato.garantia_definitiva && (
                                    <span className="badge badge-info">Garantia Definitiva{contrato.percentatge_garantia_definitiva ? ` (${contrato.percentatge_garantia_definitiva}%)` : ''}</span>
                                )}
                                {contrato.garantia_provisional && <span className="badge badge-info">Garantia Provisional</span>}
                                {contrato.reserva_social && <span className="badge badge-success">Reserva Social</span>}
                                {contrato.contracte_harmonitzat && <span className="badge badge-info">Harmonitzat</span>}
                                {contrato.subcontractacio_permesa === true && <span className="badge badge-info">Subcontractació Permesa</span>}
                                {contrato.subcontractacio_permesa === false && <span className="badge badge-pending">Sense Subcontractació</span>}
                                {contrato.preveuen_modificacions && <span className="badge badge-info">Modificacions Previstes</span>}
                                {contrato.preveuen_prorrogues && <span className="badge badge-info">Pròrrogues Previstes</span>}
                            </div>
                            {contrato.revisio_preus && (
                                <div className="pt-2">
                                    <label className="text-sm text-slate-500">Revisió de Preus</label>
                                    <p className="text-sm text-slate-700">{contrato.revisio_preus}</p>
                                </div>
                            )}

                        </div>
                    </div>

                </div>
            )}



            {/* Peu de Recurs */}
            {contrato.peu_recurs && (
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
                        <AlertCircle size={20} className="text-primary-600" />
                        Peu de Recurs
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{contrato.peu_recurs}</p>
                </div>
            )}

            {/* Enrichment timestamp */}
            {contrato.fecha_enriquiment && (
                <div className="text-xs text-slate-400 text-right">
                    Dades enriquides el {formatDate(contrato.fecha_enriquiment)}
                </div>
            )}


            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="glass-card p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold text-slate-800">Editar Contracte</h3>
                            <button
                                className="p-2 hover:bg-slate-100 rounded-lg"
                                onClick={() => setShowEditModal(false)}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <h4 className="font-medium text-slate-700 mb-3">Informació Bàsica</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Codi Expedient</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.codi_expedient || ""} onChange={(e) => setEditData({ ...editData, codi_expedient: e.target.value })} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm text-slate-600 mb-1">Objecte Contracte</label>
                                        <textarea className="input input-bordered w-full" rows={3} value={editData.objecte_contracte || ""} onChange={(e) => setEditData({ ...editData, objecte_contracte: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Tipus Contracte</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.tipus_contracte || ""} onChange={(e) => setEditData({ ...editData, tipus_contracte: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Estat Actual</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.estat_actual || ""} onChange={(e) => setEditData({ ...editData, estat_actual: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Estado Interno</label>
                                        <select className="input input-bordered w-full" value={editData.estado_interno || ""} onChange={(e) => setEditData({ ...editData, estado_interno: e.target.value })}>
                                            <option value="normal">Normal</option>
                                            <option value="pendiente_aprobacion">Pendent d'aprovació</option>
                                            <option value="aprobado">Aprovat</option>
                                            <option value="rechazado">Rebutjat</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Departament Asignat</label>
                                        <select 
                                            className="input input-bordered w-full" 
                                            value={editData.departamento_id || ""} 
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setEditData({ ...editData, departamento_id: val ? parseInt(val) : undefined });
                                            }}
                                        >
                                            <option value="">-- Sense Departament --</option>
                                            {departamentos.map(d => (
                                                <option key={d.id} value={d.id}>{d.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Lots</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.lots || ""} onChange={(e) => setEditData({ ...editData, lots: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-medium text-slate-700 mb-3">Organisme</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Organisme Adjudicador</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.organisme_adjudicador || ""} onChange={(e) => setEditData({ ...editData, organisme_adjudicador: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Departament Adjudicador</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.departament_adjudicador || ""} onChange={(e) => setEditData({ ...editData, departament_adjudicador: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Procediment</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.procediment || ""} onChange={(e) => setEditData({ ...editData, procediment: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Tipus Tramitacio</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.tipus_tramitacio || ""} onChange={(e) => setEditData({ ...editData, tipus_tramitacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Codi Ine10</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.codi_ine10 || ""} onChange={(e) => setEditData({ ...editData, codi_ine10: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Codi Dir3</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.codi_dir3 || ""} onChange={(e) => setEditData({ ...editData, codi_dir3: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-medium text-slate-700 mb-3">Adjudicatari</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Adjudicatari Nom</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.adjudicatari_nom || ""} onChange={(e) => setEditData({ ...editData, adjudicatari_nom: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Adjudicatari Nif</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.adjudicatari_nif || ""} onChange={(e) => setEditData({ ...editData, adjudicatari_nif: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Adjudicatari Nacionalitat</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.adjudicatari_nacionalitat || ""} onChange={(e) => setEditData({ ...editData, adjudicatari_nacionalitat: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-medium text-slate-700 mb-3">Imports</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Preu Licitar</label>
                                        <input type="number" step="0.01" className="input input-bordered w-full" value={editData.preu_licitar || ""} onChange={(e) => setEditData({ ...editData, preu_licitar: parseFloat(e.target.value) || undefined })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Preu Adjudicar</label>
                                        <input type="number" step="0.01" className="input input-bordered w-full" value={editData.preu_adjudicar || ""} onChange={(e) => setEditData({ ...editData, preu_adjudicar: parseFloat(e.target.value) || undefined })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Import Adjudicacio Amb Iva</label>
                                        <input type="number" step="0.01" className="input input-bordered w-full" value={editData.import_adjudicacio_amb_iva || ""} onChange={(e) => setEditData({ ...editData, import_adjudicacio_amb_iva: parseFloat(e.target.value) || undefined })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Import Licitar Sense Iva</label>
                                        <input type="number" step="0.01" className="input input-bordered w-full" value={editData.import_licitar_sense_iva || ""} onChange={(e) => setEditData({ ...editData, import_licitar_sense_iva: parseFloat(e.target.value) || undefined })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Pressupost Licitacio Sense Iva</label>
                                        <input type="number" step="0.01" className="input input-bordered w-full" value={editData.pressupost_licitacio_sense_iva || ""} onChange={(e) => setEditData({ ...editData, pressupost_licitacio_sense_iva: parseFloat(e.target.value) || undefined })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Pressupost Licitacio Sense Iva Expedient</label>
                                        <input type="number" step="0.01" className="input input-bordered w-full" value={editData.pressupost_licitacio_sense_iva_expedient || ""} onChange={(e) => setEditData({ ...editData, pressupost_licitacio_sense_iva_expedient: parseFloat(e.target.value) || undefined })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Pressupost Licitacio Amb Iva</label>
                                        <input type="number" step="0.01" className="input input-bordered w-full" value={editData.pressupost_licitacio_amb_iva || ""} onChange={(e) => setEditData({ ...editData, pressupost_licitacio_amb_iva: parseFloat(e.target.value) || undefined })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Pressupost Licitacio Amb Iva Expedient</label>
                                        <input type="number" step="0.01" className="input input-bordered w-full" value={editData.pressupost_licitacio_amb_iva_expedient || ""} onChange={(e) => setEditData({ ...editData, pressupost_licitacio_amb_iva_expedient: parseFloat(e.target.value) || undefined })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Valor Estimat Expedient</label>
                                        <input type="number" step="0.01" className="input input-bordered w-full" value={editData.valor_estimat_expedient || ""} onChange={(e) => setEditData({ ...editData, valor_estimat_expedient: parseFloat(e.target.value) || undefined })} />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-medium text-slate-700 mb-3">Dates</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Data Publicacio</label>
                                        <input type="date" className="input input-bordered w-full" value={editData.data_publicacio?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_publicacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Data Actualitzacio</label>
                                        <input type="date" className="input input-bordered w-full" value={editData.data_actualitzacio?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_actualitzacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Data Inici</label>
                                        <input type="date" className="input input-bordered w-full" value={editData.data_inici?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_inici: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Data Final</label>
                                        <input type="date" className="input input-bordered w-full" value={editData.data_final?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_final: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Data Formalitzacio</label>
                                        <input type="date" className="input input-bordered w-full" value={editData.data_formalitzacio?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_formalitzacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Data Anunci Previ</label>
                                        <input type="date" className="input input-bordered w-full" value={editData.data_anunci_previ?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_anunci_previ: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Data Anunci Licitacio</label>
                                        <input type="date" className="input input-bordered w-full" value={editData.data_anunci_licitacio?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_anunci_licitacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Data Anunci Adjudicacio</label>
                                        <input type="date" className="input input-bordered w-full" value={editData.data_anunci_adjudicacio?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_anunci_adjudicacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Data Anunci Formalitzacio</label>
                                        <input type="date" className="input input-bordered w-full" value={editData.data_anunci_formalitzacio?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_anunci_formalitzacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Data Anulacio</label>
                                        <input type="date" className="input input-bordered w-full" value={editData.data_anulacio?.split("T")[0] || ""} onChange={(e) => setEditData({ ...editData, data_anulacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Durada Contracte</label>
                                        <input type="number" step="0.01" className="input input-bordered w-full" value={editData.durada_contracte || ""} onChange={(e) => setEditData({ ...editData, durada_contracte: parseFloat(e.target.value) || undefined })} />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-medium text-slate-700 mb-3">Classificació</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Cpv Principal Codi</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.cpv_principal_codi || ""} onChange={(e) => setEditData({ ...editData, cpv_principal_codi: e.target.value })} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm text-slate-600 mb-1">Cpv Principal Descripcio</label>
                                        <textarea className="input input-bordered w-full" rows={3} value={editData.cpv_principal_descripcio || ""} onChange={(e) => setEditData({ ...editData, cpv_principal_descripcio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Codi Nuts</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.codi_nuts || ""} onChange={(e) => setEditData({ ...editData, codi_nuts: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Descripcio Nuts</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.descripcio_nuts || ""} onChange={(e) => setEditData({ ...editData, descripcio_nuts: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Forma Financament</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.forma_financament || ""} onChange={(e) => setEditData({ ...editData, forma_financament: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-medium text-slate-700 mb-3">Enllaços</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Enllac Anunci Previ</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.enllac_anunci_previ || ""} onChange={(e) => setEditData({ ...editData, enllac_anunci_previ: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Enllac Licitacio</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.enllac_licitacio || ""} onChange={(e) => setEditData({ ...editData, enllac_licitacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Enllac Adjudicacio</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.enllac_adjudicacio || ""} onChange={(e) => setEditData({ ...editData, enllac_adjudicacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Enllac Formalitzacio</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.enllac_formalitzacio || ""} onChange={(e) => setEditData({ ...editData, enllac_formalitzacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Enllac Perfil Contractant</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.enllac_perfil_contractant || ""} onChange={(e) => setEditData({ ...editData, enllac_perfil_contractant: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Enllac Publicacio</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.enllac_publicacio || ""} onChange={(e) => setEditData({ ...editData, enllac_publicacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">Url Plataforma Contractacio</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.url_plataforma_contractacio || ""} onChange={(e) => setEditData({ ...editData, url_plataforma_contractacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">URL JSON Futura</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.url_json_futura || ""} onChange={(e) => setEditData({ ...editData, url_json_futura: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">URL JSON Agregada</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.url_json_agregada || ""} onChange={(e) => setEditData({ ...editData, url_json_agregada: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">URL JSON CPM</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.url_json_cpm || ""} onChange={(e) => setEditData({ ...editData, url_json_cpm: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">URL JSON Previ</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.url_json_previ || ""} onChange={(e) => setEditData({ ...editData, url_json_previ: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">URL JSON Licitació</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.url_json_licitacio || ""} onChange={(e) => setEditData({ ...editData, url_json_licitacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">URL JSON Avaluació</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.url_json_avaluacio || ""} onChange={(e) => setEditData({ ...editData, url_json_avaluacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">URL JSON Adjudicació</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.url_json_adjudicacio || ""} onChange={(e) => setEditData({ ...editData, url_json_adjudicacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">URL JSON Formalització</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.url_json_formalitzacio || ""} onChange={(e) => setEditData({ ...editData, url_json_formalitzacio: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">URL JSON Anul·lació</label>
                                        <input type="text" className="input input-bordered w-full" value={editData.url_json_anulacio || ""} onChange={(e) => setEditData({ ...editData, url_json_anulacio: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-6 mt-6 border-t border-slate-100">
                            <button
                                type="button"
                                className="btn btn-secondary flex-1"
                                onClick={() => setShowEditModal(false)}
                            >
                                Cancel·lar
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary flex-1 gap-2"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <>
                                        <div className="loading-spinner w-4 h-4"></div>
                                        Guardant...
                                    </>
                                ) : (
                                    <>
                                        <Check size={18} />
                                        Guardar Canvis
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
