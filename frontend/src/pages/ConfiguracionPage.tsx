import { useState, useEffect } from 'react';
import { api, Empleado } from '../api/client';
import { 
    Globe, 
    Building2, 
    Save, 
    RefreshCw, 
    Loader2, 
    Settings,
    Users,
    Brain,
    Bot,
    Sparkles,
    MessageSquare,
    Terminal
} from 'lucide-react';

import Sincronizacion from './Sincronizacion';
import Empleados from './Empleados';
import Departamentos from './Departamentos';

export default function ConfiguracionPage() {
    const [activeTab, setActiveTab] = useState<'general' | 'sync' | 'personnel' | 'ai'>('general');
    const [personnelTab, setPersonnelTab] = useState<'employees' | 'departments'>('employees');
    
    const [configs, setConfigs] = useState<Record<string, string>>({
        'ine10_code': '',
        'sync_api_url': '',
        'prorrogues_api_url': '',
        'cpv_api_url': '',
        'ollama_url': '',
        'ollama_model_cpv': '',
        'ollama_model_auditoria': '',
        'ollama_think': 'smart',
        'ia_enabled': 'false',
        'ai_provider': 'disabled',
        'gemini_api_key': '',
        'gemini_model': 'gemini-1.5-flash',
        'prompt_cpv_extract': '',
        'prompt_cpv_rank': '',
        'prompt_auditoria': '',
        'dashboard_mesos_caducitat': '3'
    });
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingModels, setLoadingModels] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
    const [user, setUser] = useState<Empleado | null>(null);

    const isAdmin = user?.rol === 'admin';
    const isResponsable = user?.rol === 'responsable_contratacion';

    useEffect(() => {
        loadAllConfig();
        api.getMe().then(setUser).catch(() => {});
    }, []);

    const loadAllConfig = async () => {
        setLoading(true);
        try {
            const keys = [
                'ine10_code', 'sync_api_url', 'prorrogues_api_url', 'cpv_api_url', 
                'ollama_url', 'ollama_model_cpv', 'ollama_model_auditoria', 'ollama_think', 
                'ia_enabled', 'ai_provider', 'gemini_api_key', 'gemini_model',
                'prompt_cpv_extract', 'prompt_cpv_rank', 'prompt_auditoria', 'dashboard_mesos_caducitat'
            ];
            const newConfigs: Record<string, string> = {};
            
            for (const key of keys) {
                try {
                    const cfg = await api.getConfig(key);
                    newConfigs[key] = cfg.valor;
                } catch (err) {
                    // Fallback defaults
                    if (key === 'ine10_code') newConfigs[key] = '4305160009';
                    else if (key === 'ai_provider') newConfigs[key] = 'disabled';
                    else if (key === 'gemini_model') newConfigs[key] = 'gemini-1.5-flash';
                    else if (key === 'ia_enabled') newConfigs[key] = 'false';
                    else if (key === 'dashboard_mesos_caducitat') newConfigs[key] = '3';
                    else newConfigs[key] = '';
                }
            }
            setConfigs(newConfigs);
            fetchModels();
        } catch (err) {
            console.error('Error loading config:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchModels = async () => {
        setLoadingModels(true);
        try {
            const models = await api.getOllamaModels();
            setAvailableModels(models);
        } catch (err) {
            console.error('Error fetching models:', err);
            setAvailableModels([]);
        } finally {
            setLoadingModels(false);
        }
    };

    const handleChange = (clave: string, valor: string) => {
        setConfigs({ ...configs, [clave]: valor });
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            await Promise.all(
                Object.entries(configs).map(([clave, valor]) => api.updateConfig(clave, valor))
            );
            setMessage({ type: 'success', text: 'Configuració guardada correctament' });
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            console.error('Error saving config:', err);
            setMessage({ type: 'error', text: 'Error al guardar la configuració' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 w-full flex-1 overflow-auto pr-1">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Administració del Sistema</h1>
                <p className="text-slate-500 mt-1">Gestió de paràmetres, sincronització i personal</p>
            </div>

            {/* Main Tabs */}
            <div className="flex p-1 bg-slate-100 rounded-xl w-fit">
                {isAdmin && (
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'general' 
                            ? 'bg-white text-primary-600 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Settings size={16} />
                        Configuració General
                    </button>
                )}
                {(isAdmin || isResponsable) && (
                    <button
                        onClick={() => setActiveTab('sync')}
                        className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'sync' 
                            ? 'bg-white text-primary-600 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <RefreshCw size={16} />
                        Sincronització
                    </button>
                )}
                {(isAdmin || isResponsable) && (
                    <button
                        onClick={() => setActiveTab('personnel')}
                        className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'personnel' 
                            ? 'bg-white text-primary-600 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Users size={16} />
                        Gestió de Personal
                    </button>
                )}
                {isAdmin && (
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                            activeTab === 'ai' 
                            ? 'bg-white text-primary-600 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Brain size={16} />
                        Serveis IA
                    </button>
                )}
            </div>

            <div className="mt-6">
                {activeTab === 'general' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        {loading ? (
                            <div className="flex items-center justify-center h-64">
                                <Loader2 className="animate-spin text-primary-500" size={40} />
                            </div>
                        ) : (
                            <>
                                {/* Organisme */}
                                <div className="glass-card p-6">
                                    <div className="flex items-center gap-2 mb-6 text-slate-800 font-semibold border-b border-slate-100 pb-4">
                                        <Building2 size={20} className="text-primary-500" />
                                        <h2>Dades de l'Organisme</h2>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">Codi INE10</label>
                                            <input 
                                                type="text" 
                                                className="input input-bordered w-full" 
                                                value={configs.ine10_code}
                                                onChange={(e) => handleChange('ine10_code', e.target.value)}
                                                placeholder="ex: 4305160009"
                                            />
                                            <p className="text-xs text-slate-400">Identificador únic de l'ajuntament o ens públic.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Endpoints */}
                                <div className="glass-card p-6">
                                    <div className="flex items-center gap-2 mb-6 text-slate-800 font-semibold border-b border-slate-100 pb-4">
                                        <Globe size={20} className="text-primary-500" />
                                        <h2>Endpoints de Sincronització</h2>
                                    </div>
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">URL Plataforma de Contractació Pública (JSON)</label>
                                            <input 
                                                type="text" 
                                                className="input input-bordered w-full" 
                                                value={configs.sync_api_url}
                                                onChange={(e) => handleChange('sync_api_url', e.target.value)}
                                                placeholder="https://..."
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">URL Registre Públic de Contractes (Prorrogues i Modificacions)</label>
                                            <input 
                                                type="text" 
                                                className="input input-bordered w-full" 
                                                value={configs.prorrogues_api_url}
                                                onChange={(e) => handleChange('prorrogues_api_url', e.target.value)}
                                                placeholder="https://..."
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">URL Nomenclatura CPVs (Open Data)</label>
                                            <input 
                                                type="text" 
                                                className="input input-bordered w-full" 
                                                value={configs.cpv_api_url}
                                                onChange={(e) => handleChange('cpv_api_url', e.target.value)}
                                                placeholder="https://..."
                                            />
                                        </div>
                                    </div>
                                </div>


                                {/* Dashboards i Alertes */}
                                <div className="glass-card p-6 mt-6">
                                    <div className="flex items-center gap-2 mb-6 text-slate-800 font-semibold border-b border-slate-100 pb-4">
                                        <Building2 size={20} className="text-primary-500" />
                                        <h2>Dashboard i Alertes</h2>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">Mesos d'avís de venciment (Global)</label>
                                            <input 
                                                type="number"
                                                min="1"
                                                max="60"
                                                className="input input-bordered w-full" 
                                                value={configs.dashboard_mesos_caducitat}
                                                onChange={(e) => handleChange('dashboard_mesos_caducitat', e.target.value)}
                                                placeholder="ex: 3"
                                            />
                                            <p className="text-xs text-slate-400">Temps en mesos en que un contracte es considera "proper a finalitzar" si no té avís personalitzat.</p>
                                        </div>
                                    </div>
                                </div>


                                {/* Save Button */}
                                <div className="flex flex-col items-end gap-3 mt-6">
                                    {message && (
                                        <div className={`text-sm px-4 py-2 rounded-lg ${
                                            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                                        }`}>
                                            {message.text}
                                        </div>
                                    )}
                                    <button 
                                        onClick={handleSave} 
                                        className="btn btn-primary px-12 gap-2" 
                                        disabled={saving}
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                                        Guardar Configuració
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'sync' && (
                    <div className="animate-in slide-in-from-left-4 duration-300">
                        <Sincronizacion />
                    </div>
                )}

                {activeTab === 'personnel' && (
                    <div className="animate-in slide-in-from-right-4 duration-300">
                        <div className="flex p-1 bg-slate-100 rounded-xl w-fit mb-6">
                            {isAdmin && (
                                <button 
                                    className={`px-8 py-2 rounded-lg text-sm font-medium transition-all ${
                                        personnelTab === 'employees' 
                                        ? 'bg-white text-primary-600 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                    onClick={() => setPersonnelTab('employees')}
                                >
                                    Empleats
                                </button>
                            )}
                            {(isAdmin || isResponsable) && (
                                <button 
                                    className={`px-8 py-2 rounded-lg text-sm font-medium transition-all ${
                                        personnelTab === 'departments' 
                                        ? 'bg-white text-primary-600 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                    onClick={() => setPersonnelTab('departments')}
                                >
                                    Departaments
                                </button>
                            )}
                        </div>
                        
                        {personnelTab === 'employees' ? <Empleados /> : <Departamentos />}
                    </div>
                )}
                {activeTab === 'ai' && isAdmin && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* Selector de Proveïdor */}
                        <div className="glass-card p-6">
                            <div className="flex items-center gap-2 mb-6 text-slate-800 font-semibold border-b border-slate-100 pb-4 justify-between">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={20} className="text-primary-500" />
                                    <h2>Proveïdor d'IA actiu</h2>
                                </div>
                                <label className="flex items-center cursor-pointer">
                                    <div className="relative">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only" 
                                            checked={configs.ia_enabled === 'true'}
                                            onChange={(e) => handleChange('ia_enabled', e.target.checked ? 'true' : 'false')}
                                        />
                                        <div className={`block w-10 h-6 rounded-full transition-colors ${configs.ia_enabled === 'true' ? 'bg-purple-500' : 'bg-slate-300'}`}></div>
                                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${configs.ia_enabled === 'true' ? 'transform translate-x-4' : ''}`}></div>
                                    </div>
                                    <span className="ml-3 text-sm font-medium text-slate-700">Mòduls IA Actius</span>
                                </label>
                            </div>
                            
                            <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 ${configs.ia_enabled !== 'true' ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="space-y-4">
                                    <label className="text-sm font-medium text-slate-700">Selecciona el motor de raonament</label>
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={() => handleChange('ai_provider', 'ollama')}
                                            className={`flex-1 p-4 rounded-xl border-2 transition-all text-center space-y-2 ${
                                                configs.ai_provider === 'ollama' 
                                                ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-md transform scale-[1.02]' 
                                                : 'border-slate-100 hover:border-slate-300 text-slate-500'
                                            }`}
                                        >
                                            <div className="flex justify-center"><Terminal size={32} /></div>
                                            <div className="font-bold">Ollama</div>
                                            <div className="text-xs">Motor Local (Privacitat total)</div>
                                        </button>
                                        <button 
                                            onClick={() => handleChange('ai_provider', 'gemini')}
                                            className={`flex-1 p-4 rounded-xl border-2 transition-all text-center space-y-2 ${
                                                configs.ai_provider === 'gemini' 
                                                ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-md transform scale-[1.02]' 
                                                : 'border-slate-100 hover:border-slate-300 text-slate-500'
                                            }`}
                                        >
                                            <div className="flex justify-center"><Bot size={32} /></div>
                                            <div className="font-bold">Gemini (Google)</div>
                                            <div className="text-xs">Motor Cloud (Màxima potència)</div>
                                        </button>
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3 mt-auto">
                                    <div className="bg-blue-100 p-2 rounded-lg text-blue-600 mt-1"><Sparkles size={18} /></div>
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                        Pots alternar entre proveïdors en qualsevol moment. Ollama s'executa al teu propi servidor, mentre que Gemini requereix una connexió a Internet i una clau API de Google.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Configuració segons proveïdor */}
                        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${configs.ia_enabled !== 'true' ? 'opacity-50 pointer-events-none' : ''}`}>
                            {/* Ollama Section */}
                            <div className={`glass-card p-6 border-l-4 ${configs.ai_provider === 'ollama' ? 'border-l-primary-500 bg-primary-50/10' : 'border-l-slate-200'}`}>
                                <div className="flex items-center gap-2 mb-6">
                                    <Terminal size={18} className="text-primary-500" />
                                    <h3 className="font-bold text-slate-800 uppercase tracking-wider text-sm">Paràmetres Ollama</h3>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500">URL del Servidor</label>
                                        <input 
                                            type="text"
                                            className="input input-sm input-bordered w-full"
                                            value={configs.ollama_url}
                                            onChange={(e) => handleChange('ollama_url', e.target.value)}
                                            placeholder="http://host.docker.internal:11434"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500">Model per Classificació CPV</label>
                                        <div className="flex gap-2">
                                            <select 
                                                className="select select-sm select-bordered w-full"
                                                value={configs.ollama_model_cpv}
                                                onChange={(e) => handleChange('ollama_model_cpv', e.target.value)}
                                            >
                                                {availableModels.map(m => (
                                                    <option key={`cpv-${m}`} value={m}>{m}</option>
                                                ))}
                                                <option value="llama3">llama3 (default)</option>
                                            </select>
                                            <button type="button" onClick={() => fetchModels()} className="btn btn-xs btn-ghost">
                                                <RefreshCw size={14} className={loadingModels ? 'animate-spin' : ''} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500">Nivell de Raonament (Think)</label>
                                        <select 
                                            className="select select-sm select-bordered w-full"
                                            value={configs.ollama_think}
                                            onChange={(e) => handleChange('ollama_think', e.target.value)}
                                        >
                                            <option value="smart">Automàtic (Smart)</option>
                                            <option value="none">Cap</option>
                                            <option value="false">Desactivat</option>
                                            <option value="high">Alt</option>
                                            <option value="medium">Mitjà</option>
                                            <option value="low">Baix</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Gemini Section */}
                            <div className={`glass-card p-6 border-l-4 ${configs.ai_provider === 'gemini' ? 'border-l-purple-500 bg-purple-50/10' : 'border-l-slate-200'}`}>
                                <div className="flex items-center gap-2 mb-6">
                                    <Bot size={18} className="text-purple-500" />
                                    <h3 className="font-bold text-slate-800 uppercase tracking-wider text-sm">Paràmetres Gemini</h3>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500">Google API Key</label>
                                        <input 
                                            type="password"
                                            className="input input-sm input-bordered w-full"
                                            value={configs.gemini_api_key}
                                            onChange={(e) => handleChange('gemini_api_key', e.target.value)}
                                            placeholder="AIza..."
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500">Model Gemini</label>
                                        <select 
                                            className="select select-sm select-bordered w-full"
                                            value={configs.gemini_model}
                                            onChange={(e) => handleChange('gemini_model', e.target.value)}
                                        >
                                            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Ràpid i gratuït)</option>
                                            <option value="gemini-1.5-pro">Gemini 1.5 Pro (Més intel·ligent)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Edició de Prompts */}
                        <div className={`glass-card p-6 ${configs.ia_enabled !== 'true' ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center gap-2 mb-6 text-slate-800 font-semibold border-b border-slate-100 pb-4">
                                <MessageSquare size={20} className="text-primary-500" />
                                <h2>Gestió de Prompts</h2>
                            </div>
                            <div className="grid grid-cols-1 gap-8">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">1</div>
                                            <h3 className="font-medium text-slate-700">Classificació CPV (Objecte → Paraules Clau)</h3>
                                        </div>
                                    </div>
                                    <textarea 
                                        className="textarea textarea-bordered w-full font-mono text-sm leading-relaxed bg-slate-50" 
                                        rows={6}
                                        value={configs.prompt_cpv_extract}
                                        onChange={(e) => handleChange('prompt_cpv_extract', e.target.value)}
                                    ></textarea>
                                    <p className="text-xs text-slate-400">Variable disponible: <code>{'{description}'}</code></p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm">2</div>
                                            <h3 className="font-medium text-slate-700">Classificació CPV (Rànquing de Candidats)</h3>
                                        </div>
                                    </div>
                                    <textarea 
                                        className="textarea textarea-bordered w-full font-mono text-sm leading-relaxed bg-slate-50" 
                                        rows={6}
                                        value={configs.prompt_cpv_rank}
                                        onChange={(e) => handleChange('prompt_cpv_rank', e.target.value)}
                                    ></textarea>
                                    <p className="text-xs text-slate-400">Variables: <code>{'{description}'}</code>, <code>{'{candidates}'}</code></p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-sm">3</div>
                                            <h3 className="font-medium text-slate-700">Anàlisi d'Auditoria (Informe de Risc)</h3>
                                        </div>
                                    </div>
                                    <textarea 
                                        className="textarea textarea-bordered w-full font-mono text-sm leading-relaxed bg-slate-50" 
                                        rows={6}
                                        value={configs.prompt_auditoria}
                                        onChange={(e) => handleChange('prompt_auditoria', e.target.value)}
                                    ></textarea>
                                    <p className="text-xs text-slate-400">Variables: <code>{'{data}'}</code>, <code>{'{custom_prompt}'}</code></p>
                                </div>
                            </div>
                        </div>

                        {/* Save Button IA */}
                        <div className="flex flex-col items-end gap-3 mt-6">
                            {message && (
                                <div className={`text-sm px-4 py-2 rounded-lg ${
                                    message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                                }`}>
                                    {message.text}
                                </div>
                            )}
                            <button 
                                onClick={handleSave} 
                                className="btn btn-primary px-12 gap-2 shadow-lg hover:shadow-primary-200 transition-all font-bold" 
                                disabled={saving}
                            >
                                {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                                Guardar Configuració d'IA
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
