import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
    ArrowLeft,
    Building2,
    User,
    Calendar,
    DollarSign,
    ExternalLink,
    FileText,
    Clock,
    AlertCircle,
    Info,
    Shield,
    Users,
    Download,
    Layers,
    Search as SearchIcon,
    Plus
} from 'lucide-react';
import { usePPTCart } from '../context/PPTContext';

export default function SuperContratoDetalle() {
    const { addDocument } = usePPTCart();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [contrato, setContrato] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // JSON Explorer state
    const [activeJsonId, setActiveJsonId] = useState<string | null>(null);
    const [documentsJson, setDocumentsJson] = useState<{label: string, url: string}[]>([]);
    const [mesaMembers, setMesaMembers] = useState<{name: string, carrec: string}[]>([]);
    const [loadingJson, setLoadingJson] = useState(false);
    const [jsonError, setJsonError] = useState<string | null>(null);

    useEffect(() => {
        if (id) {
            loadContrato(id);
        }
    }, [id]);

    const loadContrato = async (codi_expedient: string) => {
        try {
            setLoading(true);
            const data = await api.getGlobalContractDetail(codi_expedient);
            setContrato(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Error al carregar el contracte de la plataforma');
        } finally {
            setLoading(false);
        }
    };

    const handleExploreJson = async (url: string, jsonId: string) => {
        if (activeJsonId === jsonId && (documentsJson.length > 0 || mesaMembers.length > 0 || jsonError)) {
            setActiveJsonId(null);
            setDocumentsJson([]);
            setMesaMembers([]);
            setJsonError(null);
            return;
        }
        
        setLoadingJson(true);
        setActiveJsonId(jsonId);
        setJsonError(null);
        setDocumentsJson([]);
        setMesaMembers([]);
        
        try {
            const data = await api.getProxyJson(url);
            const foundDocs: {label: string, url: string}[] = [];
            const foundMembers: {name: string, carrec: string}[] = [];
            
            const findContent = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;
                
                if (obj.membresMesa && Array.isArray(obj.membresMesa)) {
                    obj.membresMesa.forEach((m: any) => {
                        const name = `${m.nom || ''} ${m.cognoms || ''}`.trim();
                        if (name) {
                            foundMembers.push({
                                name,
                                carrec: m.carrec?.ca || m.carrec?.es || m.carrec?.en || m.carrec?.oc || '-'
                            });
                        }
                    });
                }

                if (Array.isArray(obj)) {
                    obj.forEach(item => findContent(item));
                } else {
                    if (obj.id && obj.titol && obj.hash) {
                        foundDocs.push({
                            label: obj.titol,
                            url: `https://contractaciopublica.cat/portal-api/descarrega-document/${obj.id}/${obj.hash}`
                        });
                    }
                    Object.values(obj).forEach(val => findContent(val));
                }
            };
            
            findContent(data);
            const uniqueMembers = Array.from(new Map(foundMembers.map(m => [m.name, m])).values());
            
            setDocumentsJson(foundDocs);
            setMesaMembers(uniqueMembers);
            
            if (foundDocs.length === 0 && uniqueMembers.length === 0) {
                setJsonError("No s'ha trobat informació en aquest fitxer.");
            }
        } catch (err: any) {
            console.error("Error explorant JSON:", err);
            setJsonError("Error en carregar les dades de la fase.");
        } finally {
            setLoadingJson(false);
        }
    };

    const formatCurrency = (value: any) => {
        if (value === undefined || value === null) return '-';
        return new Intl.NumberFormat('ca-ES', {
            style: 'currency',
            currency: 'EUR',
        }).format(Number(value));
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('ca-ES', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });
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
            <div className="glass-card p-6 text-center max-w-2xl mx-auto mt-20">
                <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
                <p className="text-red-700 font-medium mb-4">{error || 'Contracte no trobat'}</p>
                <button onClick={() => navigate(-1)} className="btn btn-primary">
                    Tornar al SuperBuscador
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
                        <h1 className="text-2xl font-bold text-slate-800">{contrato.codi_expedient}</h1>
                        <span className="badge badge-info">{contrato.estat_actual}</span>
                        <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                            <Shield size={12} /> Només Lectura
                        </span>
                    </div>
                    <p className="text-slate-500 mt-1">{contrato.tipus_contracte} • {contrato.procediment}</p>
                </div>
                <div>
                    {(contrato.enllac_publicacio?.url || contrato.url_plataforma_contractacio) && (
                        <a
                            href={contrato.enllac_publicacio?.url || contrato.url_plataforma_contractacio}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary gap-2"
                        >
                            <ExternalLink size={18} />
                            Veure Publicació Oficial
                        </a>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column (Main Info) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Object Card */}
                    <div className="glass-card p-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
                            <FileText size={20} className="text-primary-600" />
                            Objecte del Contracte
                        </h3>
                        <p className="text-slate-700 leading-relaxed text-lg">{contrato.objecte_contracte || contrato.denominacio || '-'}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Adjudicación */}
                        <div className="glass-card p-6">
                            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                <User size={20} className="text-primary-600" />
                                Adjudicació
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-slate-500">Adjudicatari</label>
                                    <p className="font-bold text-slate-800">{contrato.denominacio_adjudicatari || '-'}</p>
                                </div>
                                <div>
                                    <label className="text-sm text-slate-500">NIF / Identificació</label>
                                    <p className="text-slate-700 font-mono">{contrato.identificacio_adjudicatari || '-'}</p>
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
                                    <p className="font-medium text-slate-800">{contrato.nom_organ || '-'}</p>
                                </div>
                                <div>
                                    <label className="text-sm text-slate-500">Àmbit</label>
                                    <p className="text-slate-700">{contrato.nom_ambit || '-'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Technical details Grid */}
                    <div className="glass-card p-6 grid grid-cols-2 md:grid-cols-3 gap-6">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">CPV</label>
                            <p className="text-slate-700 font-mono mt-1">{contrato.codi_cpv || '-'}</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">Tipus Tràmit</label>
                            <p className="text-slate-700 mt-1">{contrato.fase_publicacio || '-'}</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase">Es Agregada</label>
                            <p className={`mt-1 font-bold ${contrato.es_agregada === 'SÍ' ? 'text-green-600' : 'text-slate-600'}`}>
                                {contrato.es_agregada || '-'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Column (Sidebar metrics) */}
                <div className="space-y-6">
                    {/* Imports Card */}
                    <div className="glass-card p-6 bg-primary-500 border-none shadow-primary-200 shadow-xl overflow-hidden relative">
                        <div className="absolute top-[-20px] right-[-20px] opacity-10">
                            <DollarSign size={120} className="text-white" />
                        </div>
                        <h3 className="text-white/80 font-medium mb-1">Import Adjudicació</h3>
                        <p className="text-3xl font-bold text-white mb-6">
                            {formatCurrency(contrato.import_adjudicacio_amb_iva)}
                        </p>
                        <div className="pt-4 border-t border-white/20">
                            <label className="text-white/60 text-xs font-bold uppercase">Sense IVA</label>
                            <p className="text-xl font-semibold text-white/90">
                                {formatCurrency(contrato.import_adjudicacio_sense)}
                            </p>
                        </div>
                    </div>

                    {/* Dates Card */}
                    <div className="glass-card p-6 space-y-6">
                        <div className="flex gap-4 items-start">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                <Calendar size={20} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Data Publicació</label>
                                <p className="text-slate-800 font-medium">{formatDate(contrato.data_publicacio_contracte)}</p>
                            </div>
                        </div>
                        <div className="flex gap-4 items-start">
                            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                                <Clock size={20} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Data Adjudicació</label>
                                <p className="text-slate-800 font-medium">{formatDate(contrato.data_adjudicacio_contracte)}</p>
                            </div>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                            <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Període / Durada</label>
                            <p className="text-sm text-slate-700 leading-relaxed font-mono">
                                {contrato.durada_contracte || 'No especificada'}
                            </p>
                        </div>
                    </div>

                    {/* Info Warning */}
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex gap-3 text-amber-800 text-sm">
                        <Info size={18} className="flex-shrink-0" />
                        <p>Aquesta informació prové directament dels sistemes d'Open Data de la Generalitat i no pot ser modificada localment.</p>
                    </div>
                </div>
            </div>

            {/* Phases Tabs */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
                    <Layers size={20} className="text-primary-600" />
                    Fases de l'Expedient (OCDS)
                </h3>
                
                <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-6">
                    {[
                        { id: 'futura', url: contrato.url_json_futura?.url || contrato.url_json_futura, label: 'Futura' },
                        { id: 'agregada', url: contrato.url_json_agregada?.url || contrato.url_json_agregada, label: 'Agregada' },
                        { id: 'cpm', url: contrato.url_json_cpm?.url || contrato.url_json_cpm, label: 'CPM' },
                        { id: 'previ', url: contrato.url_json_previ?.url || contrato.url_json_previ, label: 'Previ' },
                        { id: 'licitacio', url: contrato.url_json_licitacio?.url || contrato.url_json_licitacio, label: 'Licitació' },
                        { id: 'avaluacio', url: contrato.url_json_avaluacio?.url || contrato.url_json_avaluacio, label: 'Avaluació' },
                        { id: 'adjudicacio', url: contrato.url_json_adjudicacio?.url || contrato.url_json_adjudicacio, label: 'Adjudicació' },
                        { id: 'formalitzacio', url: contrato.url_json_formalitzacio?.url || contrato.url_json_formalitzacio, label: 'Formalització' },
                        { id: 'anulacio', url: contrato.url_json_anulacio?.url || contrato.url_json_anulacio, label: 'Anul·lació' }
                    ].filter(f => f.url).map((phase) => (
                        <button
                            key={phase.id}
                            onClick={() => handleExploreJson(phase.url!, phase.id)}
                            className={`px-5 py-3 text-sm font-bold transition-all relative rounded-t-xl ${
                                activeJsonId === phase.id
                                    ? 'text-primary-600 bg-primary-50/30'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                            }`}
                        >
                            {phase.label}
                            {activeJsonId === phase.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-full" />
                            )}
                        </button>
                    ))}
                </div>

                {activeJsonId ? (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300 relative min-h-[200px]">
                        {loadingJson && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex items-center justify-center z-10">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="loading-spinner w-10 h-10"></div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Analitzant...</p>
                                </div>
                            </div>
                        )}

                        {mesaMembers.length > 0 && (
                            <div className="mb-8">
                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Users size={14} className="text-primary-500" />
                                    Mesa de Contractació
                                </h5>
                                <div className="overflow-x-auto rounded-xl border border-slate-100">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 text-slate-500">
                                            <tr>
                                                <th className="px-4 py-2 font-bold uppercase text-[10px]">Nom</th>
                                                <th className="px-4 py-2 font-bold uppercase text-[10px]">Càrrec</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {mesaMembers.map((m, i) => (
                                                <tr key={i} className="hover:bg-slate-50/50">
                                                    <td className="px-4 py-2 font-bold text-slate-700">{m.name}</td>
                                                    <td className="px-4 py-2 text-slate-500 italic">{m.carrec}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {documentsJson.length > 0 && (
                            <div>
                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <FileText size={14} className="text-primary-500" />
                                    Documents de la Fase
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {documentsJson.map((doc, i) => (
                                        <div key={i} className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-primary-300 hover:shadow-lg transition-all group overflow-hidden">
                                            <a 
                                                href={doc.url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="p-4 flex items-center justify-between flex-1"
                                            >
                                                <span className="text-sm font-bold text-slate-700 truncate mr-3 group-hover:text-primary-700">{doc.label}</span>
                                                <Download size={16} className="text-slate-400 group-hover:text-primary-500 flex-shrink-0" />
                                            </a>
                                            <div className="bg-slate-50 border-t border-slate-100 p-2 flex justify-end">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        addDocument({
                                                            id: `${contrato?.codi_expedient}-sbd-${i}`,
                                                            url: doc.url,
                                                            titol: doc.label,
                                                            expedient: contrato?.codi_expedient || 'Desconegut',
                                                            origen: 'SuperBuscador'
                                                        });
                                                    }}
                                                    className="btn btn-primary text-xs py-1 px-3"
                                                >
                                                    <Plus size={14} className="mr-1"/>
                                                    Usar de Plantilla
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {documentsJson.length === 0 && mesaMembers.length === 0 && !loadingJson && (
                            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                                <SearchIcon size={32} className="mb-2 opacity-20" />
                                <p className="text-sm italic">{jsonError || "No hi ha dades disponibles per aquesta fase"}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-20 border-2 border-dashed border-slate-50 rounded-2xl flex flex-col items-center justify-center text-slate-300">
                        <Layers size={48} className="mb-4 opacity-10" />
                        <p className="text-sm font-bold uppercase tracking-widest">Selecciona una fase per explorar</p>
                    </div>
                )}
            </div>
        </div>
    );
}
