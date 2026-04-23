import React, { useState, useEffect } from 'react';
import { api, Sincronizacion as SincronizacionType, Empleado } from '../api/client';
import {
    RefreshCw,
    Check,
    X,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Clock,
    ArrowUpCircle,
    ArrowDownCircle,
    Minus,
} from 'lucide-react';
import { useSortableData, SortableTh } from '../components/SortableTable';

export default function Sincronizacion() {
    const [sincronizacionesRaw, setSincronizacionesRaw] = useState<SincronizacionType[]>([]);
    const [loading, setLoading] = useState(true);
    const { sortedItems: sincronizaciones, sortConfig, requestSort } = useSortableData(sincronizacionesRaw, { key: 'fecha_hora_inicio', direction: 'desc' });
    const [syncing, setSyncing] = useState(false);
    const [currentSync, setCurrentSync] = useState<SincronizacionType | null>(null);
    const [codiIne10, setCodiIne10] = useState('');
    const [progress, setProgress] = useState(0);
    const [syncMessage, setSyncMessage] = useState('');
    const [expandedSyncs, setExpandedSyncs] = useState<Set<number>>(new Set());
    const [syncingMenors, setSyncingMenors] = useState(false);
    const [syncingCpvs, setSyncingCpvs] = useState(false);
    const [cpvProgress, setCpvProgress] = useState(0);
    const [cpvMessage, setCpvMessage] = useState('');

    const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
    const [autoSyncTime, setAutoSyncTime] = useState('03:00');
    const [autoSyncTimezone, setAutoSyncTimezone] = useState('Europe/Madrid');
    const [autoSyncDays, setAutoSyncDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    const [savingAutoSync, setSavingAutoSync] = useState(false);
    const [user, setUser] = useState<Empleado | null>(null);

    const [enriching, setEnriching] = useState(false);
    const [enrichProgress, setEnrichProgress] = useState(0);
    const [enrichMessage, setEnrichMessage] = useState('');

    const canSync = user?.rol === 'admin' || user?.rol === 'responsable_contratacion';

    const handleEnrichBatch = () => {
        if (!confirm('Això enriquirà tots els contractes històrics de la base de dades. El procés pot trigar una bona estona. Vols continuar?')) return;
        
        setEnriching(true);
        setEnrichProgress(0);
        setEnrichMessage('Iniciant enriquiment històric...');

        api.startEnrichBatchStream(
            (msg, pct) => {
                setEnrichMessage(msg);
                setEnrichProgress(pct);
            },
            (err) => {
                console.error('Error starting enrich:', err);
                setEnrichMessage('Error: ' + (err.message || 'Error desconegut'));
                setEnriching(false);
            },
            () => {
                setEnriching(false);
                setEnrichMessage('Enriquiment completat amb èxit.');
            }
        );
    };

    const toggleDay = (day: string) => {
        setAutoSyncDays(prev => 
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const daysOfWeek = [
        { id: 'mon', label: 'Dl' },
        { id: 'tue', label: 'Dt' },
        { id: 'wed', label: 'Dc' },
        { id: 'thu', label: 'Dj' },
        { id: 'fri', label: 'Dv' },
        { id: 'sat', label: 'Ds' },
        { id: 'sun', label: 'Dg' }
    ];

    const [menoresProgress, setMenoresProgress] = useState(0);
    const [menoresMessage, setMenoresMessage] = useState('');

    const handleSyncMenors = () => {
        if (!codiIne10) {
            alert('Error: Codi INE10 no configurat');
            return;
        }
        setSyncingMenors(true);
        setMenoresProgress(0);
        setMenoresMessage('Connectant...');

        api.startMenoresSyncStream(
            codiIne10,
            (msg, pct) => {
                setMenoresMessage(msg);
                setMenoresProgress(pct);
            },
            (err) => {
                console.error('Error sincronitzant menors:', err);
                setMenoresMessage('Error: ' + (err.message || 'Error desconegut'));
                setSyncingMenors(false);
            },
            (stats) => {
                setSyncingMenors(false);
                alert(`Sincronització de contractes menors completada amb èxit.\nNous: ${stats.nous}\nActualitzats: ${stats.actualitzats}`);
            }
        );
    };

    const handleSyncCpvs = () => {
        setSyncingCpvs(true);
        setCpvProgress(0);
        setCpvMessage('Connectant...');

        api.startCpvsSyncStream(
            (msg, pct) => {
                setCpvMessage(msg);
                setCpvProgress(pct);
            },
            (err) => {
                console.error('Error sincronitzant CPVs:', err);
                setCpvMessage('Error: ' + (err.message || 'Error desconegut'));
                setSyncingCpvs(false);
            },
            (stats) => {
                setSyncingCpvs(false);
                alert(`Sincronització de CPVs completada amb èxit.\nNous: ${stats.nuevos}\nActualitzats: ${stats.actualizados}`);
            }
        );
    };

    useEffect(() => {
        loadSincronizaciones();
        fetchConfig();
        api.getMe().then(setUser).catch(() => {});
    }, []);

    const fetchConfig = async () => {
        try {
            const [cfgIne, cfgAuto, cfgTime, cfgDays, cfgTz] = await Promise.all([
                api.getConfig('ine10_code').catch(() => null),
                api.getConfig('sync_auto_enabled').catch(() => null),
                api.getConfig('sync_cron_hora').catch(() => null),
                api.getConfig('sync_cron_days').catch(() => null),
                api.getConfig('sync_cron_timezone').catch(() => null)
            ]);
            
            if (cfgIne && cfgIne.valor) setCodiIne10(cfgIne.valor);
            if (cfgAuto && cfgAuto.valor) setAutoSyncEnabled(cfgAuto.valor.toLowerCase() === 'true');
            if (cfgTime && cfgTime.valor) setAutoSyncTime(cfgTime.valor);
            if (cfgTz && cfgTz.valor) setAutoSyncTimezone(cfgTz.valor);
            if (cfgDays && cfgDays.valor) {
                if (cfgDays.valor === '*') {
                    setAutoSyncDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
                } else {
                    setAutoSyncDays(cfgDays.valor.split(',').filter(Boolean));
                }
            }
        } catch (err) {
            console.error('Error fetching config:', err);
        }
    };

    const handleSaveAutoSync = async () => {
        if (autoSyncDays.length === 0) {
            alert('Has de seleccionar com a mínim un dia de la setmana per poder programar la sincronització automàtica.');
            return;
        }
        setSavingAutoSync(true);
        try {
            const daysToSave = autoSyncDays.length === 7 ? '*' : autoSyncDays.join(',');
            await api.updateConfig('sync_auto_enabled', autoSyncEnabled ? 'true' : 'false');
            await api.updateConfig('sync_cron_hora', autoSyncTime);
            await api.updateConfig('sync_cron_timezone', autoSyncTimezone);
            await api.updateConfig('sync_cron_days', daysToSave);
            await api.reloadScheduler();
            alert('Configuració de sincronització automàtica guardada correctament.');
        } catch (err) {
            console.error('Error saving auto sync config:', err);
            alert('Hi ha hagut un error en guardar la configuració. Revisa els logs.');
        } finally {
            setSavingAutoSync(false);
        }
    };

    const toggleExpand = (id: number) => {
        const newSet = new Set(expandedSyncs);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedSyncs(newSet);
    };

    const loadSincronizaciones = async () => {
        try {
            setLoading(true);
            const data = await api.getSincronizaciones();
            setSincronizacionesRaw(data);
        } catch (err) {
            console.error('Error loading sincronizaciones:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = () => {
        if (!codiIne10) {
            setSyncMessage('Error: Codi INE10 no configurat a la pestanya General');
            return;
        }
        setSyncing(true);
        setProgress(0);
        setSyncMessage('Connectant...');
        setCurrentSync(null);

        api.startSyncStream(
            codiIne10,
            (msg, pct) => {
                setSyncMessage(msg);
                setProgress(pct);
            },
            (err) => {
                console.error('Error starting sync:', err);
                setSyncMessage('Error en la sincronització: ' + (err.message || 'Error desconegut'));
                setSyncing(false);
            },
            async () => {
                setSyncing(false);
                loadSincronizaciones();
                try {
                    const ult = await api.getUltimaSincronizacion();
                    if (ult) setCurrentSync(ult);
                } catch (e) {
                    console.error('Failed fetching latest sync');
                }
            }
        );
    };

    
    const renderLogDetalles = (logErrores?: string) => {
        if (!logErrores) return null;
        
        try {
            // Intentar parsejar com a JSON (format nou amb detalls i errors)
            const parsed = JSON.parse(logErrores);
            const hasDetalles = Array.isArray(parsed.detalles) && parsed.detalles.length > 0;
            const hasErrores = Array.isArray(parsed.errores) && parsed.errores.length > 0;
            
            if (!hasDetalles && !hasErrores) {
                // Si és un JSON però no té el format esperat, el mostrem com a JSON bonic
                return (
                    <div className="p-4 bg-slate-50 text-left overflow-x-auto">
                        <pre className="text-xs font-mono text-slate-600">{JSON.stringify(parsed, null, 2)}</pre>
                    </div>
                );
            }
            
            return (
                <div className="p-6 bg-white border-t border-slate-100 text-left space-y-6">
                    {/* Secció d'Errors */}
                    {hasErrores && (
                        <div>
                            <h4 className="text-xs font-black text-red-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <AlertCircle size={14} />
                                Errors detectats ({parsed.errores.length})
                            </h4>
                            <ul className="space-y-2">
                                {parsed.errores.map((err: string, i: number) => (
                                    <li key={i} className="text-sm p-3 rounded-lg bg-red-50 text-red-800 border border-red-100 flex items-start gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                                        <span className="font-medium">{err}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Secció de Detalls */}
                    {hasDetalles && (
                        <div>
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Clock size={14} />
                                Detalls de l'execució ({parsed.detalles.length})
                            </h4>
                            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-100 shadow-inner bg-slate-50/30">
                                <ul className="divide-y divide-slate-100">
                                    {parsed.detalles.map((det: any, i: number) => (
                                        <li key={i} className="p-3 text-sm flex items-center gap-4 hover:bg-white transition-colors">
                                            <div className="w-24 flex-shrink-0">
                                                {det.tipo === 'nou' && (
                                                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider">Nou</span>
                                                )}
                                                {det.tipo === 'actualitzat' && (
                                                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">Actualitzat</span>
                                                )}
                                                {det.tipo === 'duplicat' && (
                                                    <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold uppercase tracking-wider">Duplicat</span>
                                                )}
                                            </div>
                                            <span className="font-bold text-slate-700 w-32 flex-shrink-0 font-mono text-xs">{det.expedient}</span>
                                            <span className="text-slate-600 truncate flex-1">{det.missatge}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            );
        } catch {
            // Si no és JSON, és text pla (error crític o format antic)
            return (
                <div className="p-6 bg-red-50 text-red-900 text-left border-t border-red-100">
                    <h4 className="text-xs font-black text-red-500 uppercase tracking-widest mb-2">Logs del sistema</h4>
                    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{logErrores}</pre>
                </div>
            );
        }
    };

    const formatDateTime = (dateStr?: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('ca-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    };

    const getEstadoIcon = (estado: string) => {
        switch (estado) {
            case 'exitosa':
                return <Check className="text-green-600" size={18} />;
            case 'fallida':
                return <X className="text-red-600" size={18} />;
            case 'parcial':
                return <AlertCircle className="text-yellow-600" size={18} />;
            case 'en_proceso':
                return <RefreshCw className="text-primary-600 animate-spin" size={18} />;
            default:
                return <Clock className="text-slate-400" size={18} />;
        }
    };

    const getEstadoBadge = (estado: string) => {
        switch (estado) {
            case 'exitosa':
                return <span className="badge badge-success">Exitosa</span>;
            case 'fallida':
                return <span className="badge badge-error">Fallida</span>;
            case 'parcial':
                return <span className="badge badge-warning">Parcial</span>;
            case 'en_proceso':
                return <span className="badge badge-info">En procés</span>;
            default:
                return <span className="badge">{estado}</span>;
        }
    };

    return (
        <div className="space-y-6 w-full flex-1 overflow-auto pr-1">
            {/* Auto Sync Panel */}
            <div className="glass-card p-6 border-l-4 border-l-primary-500">
                <div className="flex items-start justify-between">
                    <div className="flex-1 mr-6">
                        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Clock className="text-primary-500" size={20} />
                            Sincronització Automàtica (Cronjob)
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                            Configura l'execució diària en rerefons perquè el sistema descarregui les novetats automàticament sense intervenció humana.
                        </p>
                        
                        <div className="mt-6 flex flex-col gap-6">
                            <div className="flex items-center gap-8">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-slate-700">Activar automatització:</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={autoSyncEnabled}
                                            onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                                    </label>
                                </div>
                                
                                <div className={`flex items-center gap-3 transition-opacity ${autoSyncEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                    <span className="text-sm font-medium text-slate-700">Hora d'execució:</span>
                                    <input 
                                        type="time" 
                                        className="input max-w-[120px]" 
                                        value={autoSyncTime}
                                        onChange={(e) => setAutoSyncTime(e.target.value)}
                                        disabled={!autoSyncEnabled}
                                    />
                                </div>

                                <div className={`flex items-center gap-3 transition-opacity ${autoSyncEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                    <span className="text-sm font-medium text-slate-700">Zona horària:</span>
                                    <select 
                                        className="input max-w-[150px]" 
                                        value={autoSyncTimezone}
                                        onChange={(e) => setAutoSyncTimezone(e.target.value)}
                                        disabled={!autoSyncEnabled}
                                    >
                                        <option value="Europe/Madrid">Europa/Madrid</option>
                                        <option value="Atlantic/Canary">Illes Canàries</option>
                                        <option value="UTC">UTC</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className={`flex flex-col gap-2 transition-opacity ${autoSyncEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                <span className="text-sm font-medium text-slate-700">Dies de la setmana:</span>
                                <div className="flex gap-2">
                                    {daysOfWeek.map(d => (
                                        <button
                                            key={d.id}
                                            disabled={!autoSyncEnabled}
                                            onClick={() => toggleDay(d.id)}
                                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors border ${autoSyncDays.includes(d.id) ? 'bg-primary-600 text-white border-primary-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                        >
                                            {d.label}
                                        </button>
                                    ))}
                                </div>
                                {autoSyncDays.length === 0 && <span className="text-xs text-red-500 mt-1">Has de seleccionar com a mínim un dia.</span>}
                            </div>
                        </div>
                    </div>
                    
                    <button
                        className="btn btn-primary"
                        onClick={handleSaveAutoSync}
                        disabled={savingAutoSync || !canSync}
                    >
                        {savingAutoSync ? 'Guardant...' : 'Guardar Configuració'}
                    </button>
                </div>
            </div>

            {/* Sync Panel CPVs */}
            <div className="glass-card p-6 border-l-4 border-l-primary-500">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800">Sincronització dels Codis CPV</h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                            Aquest procés descarrega i actualitza el llistat oficial de Nomenclatures CPV de la Unió Europea segons la font de Dades Obertes.
                        </p>
                    </div>
                    <button
                        className="btn btn-secondary gap-2"
                        onClick={handleSyncCpvs}
                        disabled={syncingCpvs || !canSync}
                    >
                        {syncingCpvs ? (
                            <>
                                <RefreshCw className="animate-spin text-primary-500" size={18} />
                                Sincronitzant...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="text-primary-500" size={18} />
                                Sincronitzar CPVs
                            </>
                        )}
                    </button>
                </div>
                {/* Progress bar for CPVs */}
                {syncingCpvs && (
                    <div className="mt-4 p-4 rounded-xl bg-primary-50 border border-primary-200">
                        <div className="flex items-center gap-3 mb-3">
                            <RefreshCw className="text-primary-600 animate-spin" size={20} />
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <p className="font-medium text-primary-800">Sincronització CPV en procés...</p>
                                    <p className="text-sm font-semibold text-primary-600">{cpvProgress}%</p>
                                </div>
                                <p className="text-sm text-primary-600">{cpvMessage}</p>
                            </div>
                        </div>
                        <div className="w-full bg-primary-200 rounded-full h-2">
                            <div className="bg-primary-600 h-2 rounded-full transition-all duration-300" style={{ width: `${cpvProgress}%` }}></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Sync Panel Menors */}
            <div className="glass-card p-6 border-l-4 border-l-primary-500">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800">Sincronització de Contractes Menors</h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                            Aquest procés descarrega de l'API pública de la Generalitat exclusivament els contractes menors i les seves liquidacions de l'ens actual.
                        </p>
                    </div>
                    <button
                        className="btn btn-secondary gap-2"
                        onClick={handleSyncMenors}
                        disabled={syncingMenors || !canSync}
                    >
                        {syncingMenors ? (
                            <>
                                <RefreshCw className="animate-spin text-primary-500" size={18} />
                                Sincronitzant...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="text-primary-500" size={18} />
                                Sincronitzar Menors
                            </>
                        )}
                    </button>
                </div>
                {/* Progress bar for Menors */}
                {syncingMenors && (
                    <div className="mt-4 p-4 rounded-xl bg-primary-50 border border-primary-200">
                        <div className="flex items-center gap-3 mb-3">
                            <RefreshCw className="text-primary-600 animate-spin" size={20} />
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <p className="font-medium text-primary-800">Sincronització en procés...</p>
                                    <p className="text-sm font-semibold text-primary-600">{menoresProgress}%</p>
                                </div>
                                <p className="text-sm text-primary-600">{menoresMessage}</p>
                            </div>
                        </div>
                        <div className="w-full bg-primary-200 rounded-full h-2">
                            <div className="bg-primary-600 h-2 rounded-full transition-all duration-300" style={{ width: `${menoresProgress}%` }}></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Enriquiment Històric Panel */}
            <div className="glass-card p-6 border-l-4 border-l-green-500">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800">Enriquiment Històric en Batch</h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                            Aquest procés forçarà l'enriquiment de <b>tots</b> els contractes històrics de la base de dades. Baixarà documents, membres de la mesa i criteris d'adjudicació. Atenció: Pot trigar hores i descarregarà moltes dades de la Generalitat.
                        </p>
                    </div>
                    <button
                        className="btn bg-green-600 hover:bg-green-700 text-white gap-2"
                        onClick={handleEnrichBatch}
                        disabled={enriching || !canSync}
                    >
                        {enriching ? (
                            <>
                                <RefreshCw className="animate-spin" size={18} />
                                Enriquint...
                            </>
                        ) : (
                            <>
                                <RefreshCw size={18} />
                                Enriquir Tots
                            </>
                        )}
                    </button>
                </div>
                
                {/* Progress bar for Enrich */}
                {enriching && (
                    <div className="mt-4 p-4 rounded-xl bg-green-50 border border-green-200">
                        <div className="flex items-center gap-3 mb-3">
                            <RefreshCw className="text-green-600 animate-spin" size={20} />
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <p className="font-medium text-green-800">Enriquiment en procés...</p>
                                    <p className="text-sm font-semibold text-green-600">{enrichProgress}%</p>
                                </div>
                                <p className="text-sm text-green-600">{enrichMessage}</p>
                            </div>
                        </div>
                        <div className="w-full bg-green-200 rounded-full h-2">
                            <div className="bg-green-600 h-2 rounded-full transition-all duration-300" style={{ width: `${enrichProgress}%` }}></div>
                        </div>
                    </div>
                )}
            </div>
            {/* Sync Panel */}
            <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-slate-800">Sincronització amb l'API de Transparència</h3>
                    <button
                        className="btn btn-primary gap-2"
                        onClick={handleSync}
                        disabled={syncing || !canSync}
                    >
                        {syncing ? (
                            <>
                                <RefreshCw className="animate-spin" size={18} />
                                Sincronitzant...
                            </>
                        ) : (
                            <>
                                <RefreshCw size={18} />
                                Sincronitzar Ara
                            </>
                        )}
                    </button>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 mb-6">
                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                        <Clock size={16} />
                        <span>S'utilitzarà el codi de l'entitat: </span>
                        <span className="font-mono font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded">{codiIne10 || 'No configurat'}</span>
                    </div>
                </div>

                {/* Current Sync Status */}
                {syncing && (
                    <div className="mt-6 p-4 rounded-xl bg-primary-50 border border-primary-200">
                        <div className="flex items-center gap-3 mb-3">
                            <RefreshCw className="text-primary-600 animate-spin" size={24} />
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <p className="font-medium text-primary-800">Sincronització en procés...</p>
                                    <p className="text-sm font-semibold text-primary-600">{progress}%</p>
                                </div>
                                <p className="text-sm text-primary-600">{syncMessage}</p>
                            </div>
                        </div>
                        <div className="w-full bg-primary-200 rounded-full h-2.5">
                            <div className="bg-primary-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                )}

                {currentSync && !syncing && currentSync.estado !== 'en_proceso' && (
                    <div
                        className={`mt-6 p-4 rounded-xl border ${currentSync.estado === 'exitosa' || currentSync.estado === 'parcial'
                                ? currentSync.estado === 'parcial'
                                    ? 'bg-yellow-50 border-yellow-200'
                                    : 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            {currentSync.estado === 'exitosa' ? (
                                <Check className="text-green-600" size={24} />
                            ) : currentSync.estado === 'parcial' ? (
                                <AlertCircle className="text-yellow-600" size={24} />
                            ) : (
                                <X className="text-red-600" size={24} />
                            )}
                            <div className="flex-1">
                                <p className={`font-medium ${currentSync.estado === 'exitosa' ? 'text-green-800'
                                        : currentSync.estado === 'parcial' ? 'text-yellow-800'
                                            : 'text-red-800'
                                    }`}>
                                    {currentSync.estado === 'exitosa'
                                        ? 'Sincronització completada'
                                        : currentSync.estado === 'parcial'
                                            ? 'Sincronització completada amb avisos'
                                            : 'Sincronització fallida'}
                                </p>
                                {(currentSync.estado === 'exitosa' || currentSync.estado === 'parcial') && (
                                    <div className="flex gap-6 mt-2 text-sm">
                                        <span className="flex items-center gap-1 text-green-600">
                                            <ArrowUpCircle size={16} />
                                            {currentSync.registros_nuevos} nous
                                        </span>
                                        <span className="flex items-center gap-1 text-blue-600">
                                            <ArrowDownCircle size={16} />
                                            {currentSync.registros_actualizados} actualitzats
                                        </span>
                                        <span className="flex items-center gap-1 text-slate-500">
                                            <Minus size={16} />
                                            {currentSync.registros_sin_cambios} sense canvis
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* History Table */}
            <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                    <h3 className="text-lg font-semibold text-slate-800">Historial de Sincronitzacions</h3>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-48">
                        <div className="loading-spinner w-10 h-10"></div>
                    </div>
                ) : sincronizaciones.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-slate-500">No hi ha sincronitzacions registrades</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <SortableTh label="Data" sortKey="fecha_hora_inicio" sortConfig={sortConfig} onSort={requestSort} />
                                    <SortableTh label="Estat" sortKey="estado" sortConfig={sortConfig} onSort={requestSort} />
                                    <SortableTh label="Nous" sortKey="registros_nuevos" sortConfig={sortConfig} onSort={requestSort} />
                                    <SortableTh label="Actualitzats" sortKey="registros_actualizados" sortConfig={sortConfig} onSort={requestSort} />
                                    <SortableTh label="Sense Canvis" sortKey="registros_sin_cambios" sortConfig={sortConfig} onSort={requestSort} />
                                    <SortableTh label="Total API" sortKey="total_registros_api" sortConfig={sortConfig} onSort={requestSort} />
                                    <th>Detalls</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sincronizaciones.map((sync) => (
                                    <React.Fragment key={sync.id}>
                                        <tr className={expandedSyncs.has(sync.id) ? 'bg-slate-50' : ''}>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    {getEstadoIcon(sync.estado)}
                                                    <span>{formatDateTime(sync.fecha_hora_inicio)}</span>
                                                </div>
                                            </td>
                                            <td>{getEstadoBadge(sync.estado)}</td>
                                            <td className="text-green-600 font-medium">{sync.registros_nuevos}</td>
                                            <td className="text-blue-600 font-medium">{sync.registros_actualizados}</td>
                                            <td className="text-slate-500">{sync.registros_sin_cambios}</td>
                                            <td className="text-slate-700">{sync.total_registros_api || '-'}</td>
                                            <td>
                                                {sync.log_errores && (
                                                    <button 
                                                        onClick={() => toggleExpand(sync.id)}
                                                        className="p-1 hover:bg-slate-200 rounded text-slate-500"
                                                        title="Veure detalls"
                                                    >
                                                        {expandedSyncs.has(sync.id) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {expandedSyncs.has(sync.id) && sync.log_errores && (
                                            <tr>
                                                <td colSpan={7} className="p-0 border-t-0 bg-slate-50/50">
                                                    {renderLogDetalles(sync.log_errores)}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
