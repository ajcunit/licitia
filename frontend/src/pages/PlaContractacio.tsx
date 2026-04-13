import { useState, useEffect, useCallback } from 'react';
import { api, PlaContractacioEntrada, PlaContractacioEntradaCreate, ContracteCaducant, Empleado, ContratoListItem } from '../api/client';
import { Link } from 'react-router-dom';
import {
    ClipboardList, Plus, Pencil, Trash2, ExternalLink,
    ChevronDown, X, Search, CheckCircle2, Circle, FileText, AlertTriangle
} from 'lucide-react';

const TRIMESTRES = [
    { num: 1, label: '1r Trimestre', color: 'border-t-blue-500', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
    { num: 2, label: '2n Trimestre', color: 'border-t-emerald-500', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
    { num: 3, label: '3r Trimestre', color: 'border-t-orange-500', bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
    { num: 4, label: '4t Trimestre', color: 'border-t-purple-500', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
];

const TIPUS_CONTRACTE = ['Serveis', 'Obres', 'Subministrament', 'Concessió', 'Altres'];

const EMPTY_FORM: PlaContractacioEntradaCreate = {
    any_exercici: new Date().getFullYear(),
    trimestre: 1,
    objecte: '',
    tipus_contracte: '',
    ambit_responsable: '',
    observacions: '',
    subvencionat: false,
    import_estimat: undefined,
    contrato_id: undefined,
};

interface ModalState {
    open: boolean;
    mode: 'create' | 'edit';
    entrada?: PlaContractacioEntrada;
    trimestre: number;
}

interface ContratoSearch {
    query: string;
    results: ContratoListItem[];
    loading: boolean;
    selected?: ContratoListItem;
}

export default function PlaContractacio() {
    const [user, setUser] = useState<Empleado | null>(null);
    const [year, setYear] = useState(new Date().getFullYear());
    const [entrades, setEntrades] = useState<PlaContractacioEntrada[]>([]);
    const [caducants, setCaducants] = useState<ContracteCaducant[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<ModalState>({ open: false, mode: 'create', trimestre: 1 });
    const [form, setForm] = useState<PlaContractacioEntradaCreate>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [contratoSearch, setContratoSearch] = useState<ContratoSearch>({ query: '', results: [], loading: false });
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

    const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);

    useEffect(() => {
        api.getMe().then(setUser).catch(console.error);
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, cad] = await Promise.all([
                api.getPlaContractacio(year),
                api.getContractescaducant(year),
            ]);
            setEntrades(data);
            setCaducants(cad);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [year]);

    useEffect(() => { loadData(); }, [loadData]);

    // --- Contract search (debounced) ---
    useEffect(() => {
        if (contratoSearch.query.length < 2) {
            setContratoSearch(s => ({ ...s, results: [] }));
            return;
        }
        const timer = setTimeout(async () => {
            setContratoSearch(s => ({ ...s, loading: true }));
            try {
                const results = await api.getContratos({ busqueda: contratoSearch.query, limit: 10 });
                setContratoSearch(s => ({ ...s, results, loading: false }));
            } catch {
                setContratoSearch(s => ({ ...s, results: [], loading: false }));
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [contratoSearch.query]);

    const openCreate = (trimestre: number) => {
        setForm({ ...EMPTY_FORM, any_exercici: year, trimestre });
        setContratoSearch({ query: '', results: [], loading: false, selected: undefined });
        setModal({ open: true, mode: 'create', trimestre });
    };

    const openEdit = (entrada: PlaContractacioEntrada) => {
        setForm({
            any_exercici: entrada.any_exercici,
            trimestre: entrada.trimestre,
            objecte: entrada.objecte,
            tipus_contracte: entrada.tipus_contracte || '',
            ambit_responsable: entrada.ambit_responsable || '',
            observacions: entrada.observacions || '',
            subvencionat: entrada.subvencionat,
            import_estimat: entrada.import_estimat,
            contrato_id: entrada.contrato_id,
        });
        setContratoSearch({
            query: entrada.codi_expedient || '',
            results: [],
            loading: false,
            selected: entrada.contrato_id ? { id: entrada.contrato_id, codi_expedient: entrada.codi_expedient || '', objecte_contracte: '', adjudicatari_nom: '', estat_actual: '', estado_interno: '' } : undefined,
        });
        setModal({ open: true, mode: 'edit', entrada, trimestre: entrada.trimestre });
    };

    const handleSave = async () => {
        if (!form.objecte.trim()) return;
        setSaving(true);
        try {
            if (modal.mode === 'create') {
                await api.createPlaEntrada(form);
            } else if (modal.entrada) {
                await api.updatePlaEntrada(modal.entrada.id, form);
            }
            setModal(m => ({ ...m, open: false }));
            loadData();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await api.deletePlaEntrada(id);
            setDeleteConfirm(null);
            loadData();
        } catch (err) {
            console.error(err);
        }
    };

    const selectContrato = (c: ContratoListItem) => {
        setForm(f => ({ ...f, contrato_id: c.id }));
        setContratoSearch({ query: c.codi_expedient, results: [], loading: false, selected: c });
    };

    const clearContrato = () => {
        setForm(f => ({ ...f, contrato_id: undefined }));
        setContratoSearch({ query: '', results: [], loading: false, selected: undefined });
    };

    const canEdit = user?.rol === 'admin' || user?.rol === 'responsable_contratacion' || user?.permiso_pla_contractacio;

    const formatCurrency = (v?: number) => v != null
        ? new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
        : '';

    const totalByTrimestre = (t: number) => entrades.filter(e => e.trimestre === t).reduce((s, e) => s + (e.import_estimat || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <ClipboardList size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Pla de Contractació</h1>
                        <p className="text-slate-500">Planificació anual de licitacions per trimestres</p>
                    </div>
                </div>

                {/* Year selector */}
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <select
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                            className="h-10 pl-4 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
                        >
                            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <div className="text-right text-xs text-slate-500 font-medium">
                        <div>{entrades.length} entrades</div>
                        <div className="font-bold text-slate-700">{formatCurrency(entrades.reduce((s, e) => s + (e.import_estimat || 0), 0))}</div>
                    </div>
                </div>
            </div>

            {/* Trimestres */}
            {loading ? (
                <div className="flex justify-center py-24"><div className="loading-spinner" /></div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {TRIMESTRES.map(t => {
                        const rows = entrades.filter(e => e.trimestre === t.num);
                        const total = totalByTrimestre(t.num);
                        return (
                            <div key={t.num} className={`glass-card border-t-4 ${t.color} overflow-hidden flex flex-col`}>
                                {/* Trimestre header */}
                                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
                                        <h2 className="font-bold text-slate-800">{t.label}</h2>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${t.badge}`}>{rows.length}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {total > 0 && <span className="text-sm font-bold text-slate-600">{formatCurrency(total)}</span>}
                                        {canEdit && (
                                            <button
                                                onClick={() => openCreate(t.num)}
                                                className="flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                                            >
                                                <Plus size={14} /> Afegir
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Table — manual entries */}
                                <div className="flex-1 overflow-x-auto">
                                    {rows.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-8 text-slate-300">
                                            <FileText size={28} className="mb-2" />
                                            <p className="text-xs font-medium uppercase tracking-widest">Cap entrada planificada</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50 text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                                                    <th className="px-4 py-2.5 text-left">Objecte</th>
                                                    <th className="px-3 py-2.5 text-left">Tipus</th>
                                                    <th className="px-3 py-2.5 text-left">Àmbit</th>
                                                    <th className="px-3 py-2.5 text-center">Sub.</th>
                                                    <th className="px-3 py-2.5 text-right">Import Est.</th>
                                                    <th className="px-3 py-2.5 text-left">Expedient</th>
                                                    {canEdit && <th className="w-16" />}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {rows.map(row => (
                                                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors group">
                                                        <td className="px-4 py-3">
                                                            <span className="font-medium text-slate-800 line-clamp-2 text-xs" title={row.objecte}>{row.objecte}</span>
                                                            {row.observacions && <p className="text-[10px] text-slate-400 mt-0.5 truncate" title={row.observacions}>{row.observacions}</p>}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            {row.tipus_contracte && (
                                                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold whitespace-nowrap">{row.tipus_contracte}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-xs text-slate-600 max-w-[120px] truncate" title={row.ambit_responsable}>{row.ambit_responsable || '—'}</td>
                                                        <td className="px-3 py-3 text-center">
                                                            {row.subvencionat ? <CheckCircle2 size={16} className="text-emerald-500 mx-auto" /> : <Circle size={16} className="text-slate-200 mx-auto" />}
                                                        </td>
                                                        <td className="px-3 py-3 text-right text-xs font-semibold text-slate-700 whitespace-nowrap tabular-nums">
                                                            {row.import_estimat ? formatCurrency(row.import_estimat) : '—'}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            {row.codi_expedient ? (
                                                                <Link
                                                                    to={`/contratos/${row.contrato_id}`}
                                                                    className="flex items-center gap-1 text-xs font-mono text-indigo-600 hover:text-indigo-800 transition-colors"
                                                                    onClick={e => e.stopPropagation()}
                                                                >
                                                                    {row.codi_expedient}
                                                                    <ExternalLink size={11} />
                                                                </Link>
                                                            ) : <span className="text-slate-300 text-xs">—</span>}
                                                        </td>
                                                        {canEdit && (
                                                            <td className="px-2 py-3">
                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={() => openEdit(row)}
                                                                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 transition-colors"
                                                                    >
                                                                        <Pencil size={13} />
                                                                    </button>
                                                                    {deleteConfirm === row.id ? (
                                                                        <button
                                                                            onClick={() => handleDelete(row.id)}
                                                                            className="h-7 px-2 text-[10px] bg-red-500 text-white rounded-lg font-bold"
                                                                        >
                                                                            Confirmar
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => setDeleteConfirm(row.id)}
                                                                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                                                                        >
                                                                            <Trash2 size={13} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                {/* Caducants section */}
                                {(() => {
                                    const cads = caducants.filter(c => c.trimestre === t.num);
                                    if (cads.length === 0) return null;
                                    return (
                                        <div className="border-t-2 border-dashed border-amber-200 bg-amber-50/60">
                                            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100">
                                                <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                                                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                                                    Contractes que caduquen — {cads.length}
                                                </span>
                                            </div>
                                            <table className="w-full text-sm">
                                                <tbody className="divide-y divide-amber-100/50">
                                                    {cads.map(c => (
                                                        <tr key={c.id} className="hover:bg-amber-100/40 transition-colors">
                                                            <td className="px-4 py-2.5">
                                                                <span className="text-xs font-medium text-slate-700 line-clamp-1" title={c.objecte_contracte}>{c.objecte_contracte || '—'}</span>
                                                                {c.departament && <p className="text-[10px] text-slate-400 truncate">{c.departament}</p>}
                                                            </td>
                                                            <td className="px-3 py-2.5">
                                                                {c.tipus_contracte && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold whitespace-nowrap">{c.tipus_contracte}</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                                                                {c.import_adjudicacio ? formatCurrency(c.import_adjudicacio) : '—'}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-[10px] text-amber-700 font-semibold whitespace-nowrap">
                                                                {c.data_finalitzacio ? new Date(c.data_finalitzacio).toLocaleDateString('ca-ES', { day: '2-digit', month: 'short' }) : ''}
                                                            </td>
                                                            <td className="px-3 py-2.5">
                                                                <Link
                                                                    to={`/contratos/${c.id}`}
                                                                    className="flex items-center gap-1 text-[10px] font-mono text-amber-700 hover:text-amber-900 transition-colors"
                                                                >
                                                                    {c.codi_expedient} <ExternalLink size={10} />
                                                                </Link>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal */}
            {modal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModal(m => ({ ...m, open: false }))} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                        {/* Modal header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                            <div className="flex items-center gap-2">
                                <ClipboardList size={18} className="text-indigo-600" />
                                <h3 className="font-bold text-slate-800">
                                    {modal.mode === 'create' ? `Afegir entrada — ${TRIMESTRES.find(t => t.num === modal.trimestre)?.label}` : 'Editar entrada'}
                                </h3>
                            </div>
                            <button onClick={() => setModal(m => ({ ...m, open: false }))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
                            {/* Trimestre (editable in edit mode) */}
                            {modal.mode === 'edit' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Trimestre</label>
                                    <select
                                        value={form.trimestre}
                                        onChange={e => setForm(f => ({ ...f, trimestre: Number(e.target.value) }))}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                    >
                                        {TRIMESTRES.map(t => <option key={t.num} value={t.num}>{t.label}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* Objecte */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Objecte del Contracte <span className="text-red-500">*</span></label>
                                <textarea
                                    value={form.objecte}
                                    onChange={e => setForm(f => ({ ...f, objecte: e.target.value }))}
                                    rows={2}
                                    placeholder="Descripció de l'objecte del contracte..."
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Tipus */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tipus de Contracte</label>
                                    <select
                                        value={form.tipus_contracte || ''}
                                        onChange={e => setForm(f => ({ ...f, tipus_contracte: e.target.value }))}
                                        className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                    >
                                        <option value="">— Selecciona —</option>
                                        {TIPUS_CONTRACTE.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>

                                {/* Import */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Import Estimat (€)</label>
                                    <input
                                        type="number"
                                        value={form.import_estimat ?? ''}
                                        onChange={e => setForm(f => ({ ...f, import_estimat: e.target.value ? Number(e.target.value) : undefined }))}
                                        placeholder="0"
                                        className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Àmbit */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Àmbit Responsable</label>
                                <input
                                    value={form.ambit_responsable || ''}
                                    onChange={e => setForm(f => ({ ...f, ambit_responsable: e.target.value }))}
                                    placeholder="p.ex. Medi Ambient, Turisme..."
                                    className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                />
                            </div>

                            {/* Observacions */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observacions</label>
                                <input
                                    value={form.observacions || ''}
                                    onChange={e => setForm(f => ({ ...f, observacions: e.target.value }))}
                                    placeholder="Notes addicionals..."
                                    className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                />
                            </div>

                            {/* Subvencionat */}
                            <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={form.subvencionat}
                                    onChange={e => setForm(f => ({ ...f, subvencionat: e.target.checked }))}
                                    className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">Subvencionat</p>
                                    <p className="text-xs text-slate-400">Marca si el contracte compta amb finançament extern</p>
                                </div>
                            </label>

                            {/* Contracte vinculat */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Vincular a Contracte Registrat</label>
                                {contratoSearch.selected ? (
                                    <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                                        <ExternalLink size={14} className="text-indigo-500 shrink-0" />
                                        <span className="text-sm font-mono font-semibold text-indigo-700 flex-1">{contratoSearch.selected.codi_expedient}</span>
                                        <button onClick={clearContrato} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-indigo-200 text-indigo-400 transition-colors">
                                            <X size={12} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <div className="flex items-center gap-2 h-10 px-3 border border-slate-200 rounded-xl bg-slate-50 focus-within:bg-white focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                                            <Search size={14} className="text-slate-400 shrink-0" />
                                            <input
                                                value={contratoSearch.query}
                                                onChange={e => setContratoSearch(s => ({ ...s, query: e.target.value }))}
                                                placeholder="Cercar per expedient o paraula clau..."
                                                className="flex-1 bg-transparent border-none focus:ring-0 text-sm outline-none text-slate-700 placeholder:text-slate-400"
                                            />
                                        </div>
                                        {(contratoSearch.results.length > 0 || contratoSearch.loading) && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-10 overflow-hidden max-h-48 overflow-y-auto">
                                                {contratoSearch.loading ? (
                                                    <div className="p-3 text-center text-xs text-slate-400">Cercant...</div>
                                                ) : (
                                                    contratoSearch.results.map(c => (
                                                        <button
                                                            key={c.id}
                                                            onClick={() => selectContrato(c)}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-none"
                                                        >
                                                            <p className="text-xs font-mono font-bold text-indigo-600">{c.codi_expedient}</p>
                                                            <p className="text-xs text-slate-500 truncate">{c.objecte_contracte}</p>
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
                            <button onClick={() => setModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
                                Cancel·lar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.objecte.trim()}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                            >
                                {saving ? 'Desant...' : modal.mode === 'create' ? 'Afegir entrada' : 'Desar canvis'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
