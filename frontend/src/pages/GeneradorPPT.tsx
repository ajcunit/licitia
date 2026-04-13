import { useState, useEffect } from 'react';
import { usePPTCart } from '../context/PPTContext';
import { FileText, Trash2, ArrowRight, Save, LayoutTemplate, Layers, Plus, BookOpen, FileCheck, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ReactMarkdown from 'react-markdown';

export default function GeneradorPPT() {
    const { documents: cartDocuments, removeDocument: removeCartDocument, clearDocuments: clearCartDocuments } = usePPTCart();
    const navigate = useNavigate();
    
    // Projectes
    const [projects, setProjects] = useState<any[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'PPT' | 'PPA' | 'INFORME'>('PPT');
    const [newProjectName, setNewProjectName] = useState("");
    
    // Editor State (for the currently selected Project and Tab)
    const [localContent, setLocalContent] = useState<any[]>([]);
    const [localRefDocs, setLocalRefDocs] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            const data = await api.getPPTProjects();
            setProjects(data);
        } catch (e) {
            console.error("Error carregant projectes", e);
        }
    };

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) return;
        try {
            const res = await api.createPPTProject({ nombre: newProjectName });
            setNewProjectName("");
            await loadProjects();
            selectProject(res.id);
        } catch (e) {
            console.error(e);
            alert("Error creant el projecte");
        }
    };



    const selectProject = async (id: number) => {
        try {
            const p = await api.getPPTProject(id);
            setActiveProjectId(p.id);
            // Default to PPT tab when selecting a project
            setActiveTab('PPT');
            loadDocumentData(p, 'PPT');
        } catch (e) {
            console.error("Error carregant projecte individual:", e);
        }
    };

    const switchTab = async (tab: 'PPT' | 'PPA' | 'INFORME') => {
        if (!activeProjectId) return;
        try {
            // First save current tab state if we have a project loaded
            await handleSaveDocument();
            
            setActiveTab(tab);
            const p = await api.getPPTProject(activeProjectId);
            loadDocumentData(p, tab);
        } catch(e) {
            console.error(e);
        }
    };

    const loadDocumentData = (projectData: any, tab: 'PPT' | 'PPA' | 'INFORME') => {
        const doc = projectData.documentos?.[tab];
        if (doc) {
            setLocalContent(JSON.parse(doc.contingut_json || "[]"));
            setLocalRefDocs(JSON.parse(doc.documentos_referencia_json || "[]"));
        } else {
            setLocalContent([]);
            setLocalRefDocs([]);
        }
    };

    const deleteProject = async (id: number) => {
        if (!confirm("Segur que vols eliminar aquest projecte amb tots els seus documents?")) return;
        try {
            await api.deletePPTProject(id);
            if (activeProjectId === id) {
                setActiveProjectId(null);
                setLocalContent([]);
                setLocalRefDocs([]);
            }
            loadProjects();
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveDocument = async () => {
        if (!activeProjectId) return;
        setIsSaving(true);
        try {
            await api.updatePPTDocument(activeProjectId, activeTab, {
                contingut_json: JSON.stringify(localContent),
                documentos_referencia_json: JSON.stringify(localRefDocs)
            });
            await loadProjects(); // to update modified date in list
        } catch (e) {
            console.error("Error al guardar document", e);
        } finally {
            setIsSaving(false);
        }
    };

    const assignCartToProject = () => {
        if (!activeProjectId || cartDocuments.length === 0) return;
        // Merge without duplicates (using URL or ID)
        const updatedRefs = [...localRefDocs];
        cartDocuments.forEach(cartDoc => {
            if (!updatedRefs.find(r => r.url === cartDoc.url)) {
                updatedRefs.push(cartDoc);
            }
        });
        setLocalRefDocs(updatedRefs);
        clearCartDocuments();
    };

    const removeRefDoc = (index: number) => {
        const updated = [...localRefDocs];
        updated.splice(index, 1);
        setLocalRefDocs(updated);
    };

    const handleGenerateIndex = async () => {
        if (localRefDocs.length === 0) {
            alert("No hi ha documents assignats a aquest apartat per analitzar.");
            return;
        }
        setIsGenerating(true);
        try {
            const urls = localRefDocs.map(d => d.url);
            const generated = await api.generatePPTIndex(urls);
            setLocalContent(generated.map(g => ({ 
                title: g.title, 
                content: "", 
                processing: false, 
                instructions: `Tipus de document objectiu: ${activeTab}. Redacta aquest contingut de manera rigorosa.`, 
                isPreview: false 
            })));
        } catch (e) {
            console.error(e);
            alert("S'ha produït un error al connectar amb la IA. Revisa l'apartat de Configuració.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateSection = async (idx: number) => {
        const item = localContent[idx];
        if (!item) return;

        const updated = [...localContent];
        updated[idx].processing = true;
        setLocalContent(updated);

        try {
            const urls = localRefDocs.map(d => d.url);
            const ctxText = item.instructions || `Redacta el contingut d'aquest apartat de manera referent a ${activeTab}.`;
            const content = await api.generatePPTSection(item.title, ctxText, urls);
            
            const newIndex = [...localContent];
            newIndex[idx].content = content;
            newIndex[idx].processing = false;
            newIndex[idx].isPreview = true;
            setLocalContent(newIndex);
        } catch (e) {
            console.error(e);
            alert("Error al generar la secció.");
            const resetIndex = [...localContent];
            resetIndex[idx].processing = false;
            setLocalContent(resetIndex);
        }
    };

    const addSection = () => {
        setLocalContent([...localContent, { title: `${localContent.length + 1}. Nova Secció`, content: "", processing: false, instructions: "", isPreview: false }]);
    };

    const removeSection = (idx: number) => {
        if (!confirm("Segur que vols eliminar aquesta secció?")) return;
        const newVal = [...localContent];
        newVal.splice(idx, 1);
        setLocalContent(newVal);
    };

    const handleTitleChange = (idx: number, newTitle: string) => {
        const newVal = [...localContent];
        newVal[idx].title = newTitle;
        setLocalContent(newVal);
    };

    const handleExportWord = () => {
        if (localContent.length === 0) return;
        
        const project = projects.find(p => p.id === activeProjectId);
        const projectName = project ? project.nombre.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'document';
        
        let htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
        <head><meta charset='utf-8'></head><body>
        <h1>${activeTab} - ${project?.nombre || 'Esborrany'}</h1>`;
        
        localContent.forEach((item, idx) => {
            htmlContent += `<h2>${idx + 1}. ${item.title}</h2>`;
            const contentFormatted = (item.content || "").replace(/\\n\\n/g, '<p></p>').replace(/\\n/g, '<br/>');
            htmlContent += `<div>${contentFormatted}</div>`;
        });
        htmlContent += `</body></html>`;
        
        const blob = new Blob([htmlContent], { type: 'application/msword' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${projectName}_${activeTab}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Layers size={24} className="text-primary-600" />
                        Generador de Documents (PPT, PPA...)
                    </h1>
                    <p className="text-slate-500 mt-1">Gestiona els teus projectes i redacta plecs o informes assistits per IA.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                {/* COLUMN LEFT: Projects & Cart */}
                <div className="lg:col-span-1 space-y-6">
                    
                    {/* Projects Panel */}
                    <div className="glass-card p-4">
                        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <BookOpen size={18} className="text-primary-600" />
                            Els meus Projectes
                        </h3>
                        
                        <div className="flex gap-2 mb-4">
                            <input 
                                type="text" 
                                placeholder="Nou projecte..." 
                                className="input input-sm flex-1"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                            />
                            <button onClick={handleCreateProject} disabled={!newProjectName.trim()} className="btn btn-primary btn-sm px-2">
                                <Plus size={16} />
                            </button>
                        </div>

                        {projects.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-4 border border-dashed border-slate-200 rounded-lg">Sense projectes actius.</p>
                        ) : (
                            <ul className="space-y-2">
                                {projects.map(p => (
                                    <li 
                                        key={p.id} 
                                        className={`flex justify-between items-center text-sm p-3 rounded-lg border transition-all cursor-pointer ${activeProjectId === p.id ? 'border-primary-400 bg-primary-50 shadow-sm' : 'border-slate-100 bg-white hover:border-primary-200'}`}
                                    >
                                        <div onClick={() => selectProject(p.id)} className="flex-1 truncate font-medium text-slate-700">
                                            {p.nombre}
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }} className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                            <Trash2 size={14}/>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Cartipàs Global */}
                    <div className="glass-card p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                <FileCheck size={18} className="text-primary-600" />
                                Cartipàs Global ({cartDocuments.length})
                            </h3>
                        </div>
                        {cartDocuments.length === 0 ? (
                            <div className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                                <p>Buit.</p>
                                <button className="text-primary-600 font-medium hover:underline mt-1" onClick={() => navigate('/contratos')}>Cercar referències</button>
                            </div>
                        ) : (
                            <div className="space-y-3 mb-4">
                                {cartDocuments.map(doc => (
                                    <div key={doc.url} className="flex flex-col p-2.5 rounded border border-slate-200 bg-white shadow-sm">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="text-xs font-medium text-slate-700 line-clamp-2">
                                                {doc.titol}
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{doc.expedient}</span>
                                            <button onClick={() => removeCartDocument(doc.url)} className="text-red-400 hover:text-red-600 py-0.5 px-1">
                                                Llevar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        <div className="flex flex-col gap-2">
                            {cartDocuments.length > 0 && activeProjectId && (
                                <button onClick={assignCartToProject} className="btn btn-primary text-xs w-full gap-1">
                                    <ArrowRight size={14} /> Assignar a {activeTab}
                                </button>
                            )}
                            {cartDocuments.length > 0 && (
                                <button onClick={clearCartDocuments} className="btn btn-outline-secondary text-xs w-full text-slate-500">
                                    Buidar Cartipàs
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* COLUMN RIGHT: Document Editor */}
                <div className="lg:col-span-3">
                    {!activeProjectId ? (
                        <div className="glass-card p-6 min-h-[500px] flex flex-col items-center justify-center text-slate-500">
                            <LayoutTemplate size={48} className="mb-4 text-slate-200" />
                            <p className="text-lg font-medium text-slate-600">Cap projecte seleccionat</p>
                            <p className="text-sm text-slate-400 mt-1">Selecciona un projecte de la llista o crea'n un de nou per començar.</p>
                        </div>
                    ) : (
                        <div className="glass-card p-0 flex flex-col min-h-[600px] overflow-hidden">
                            {/* Tabs Area */}
                            <div className="bg-slate-50 border-b border-slate-200 px-6 pt-4 flex gap-6">
                                {['PPT', 'PPA', 'INFORME'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => switchTab(tab as any)}
                                        className={`pb-3 font-medium text-sm transition-colors border-b-2 ${activeTab === tab ? 'text-primary-600 border-primary-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}
                                    >
                                        {tab === 'PPT' ? 'Plec de Prescripcions Tècniques (PPT)' : tab === 'PPA' ? 'Plec Administratiu (PPA)' : 'Informe de Justificació'}
                                    </button>
                                ))}
                            </div>

                            {/* Main Editor Body */}
                            <div className="p-6 flex-1 flex flex-col gap-6">
                                
                                {/* References Bar */}
                                <div className="bg-white border text-sm border-slate-200 rounded-lg p-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <h4 className="font-semibold text-slate-700 flex items-center gap-2">
                                            <FileText size={16} className="text-primary-500" />
                                            Referències assignades per l'IA ({localRefDocs.length})
                                        </h4>
                                    </div>
                                    
                                    {localRefDocs.length === 0 ? (
                                        <p className="text-slate-400 text-sm">No hi ha documents de referència. Pots assignar-ne des del Cartipàs Global a l'esquerra.</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {localRefDocs.map((doc, idx) => (
                                                <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full pl-3 pr-1 py-1 max-w-[250px]">
                                                    <span className="truncate text-xs text-slate-600 flex-1">{doc.expedient || "Referència"}</span>
                                                    <button onClick={() => removeRefDoc(idx)} className="bg-white rounded-full p-1 text-slate-400 hover:text-red-500 border border-slate-200 shadow-sm">
                                                        <Trash2 size={10} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Action Bar */}
                                <div className="flex items-center justify-between flex-wrap gap-4">
                                    <div className="flex gap-2">
                                        <button 
                                            className="btn btn-secondary text-sm gap-2 bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100"
                                            onClick={handleGenerateIndex}
                                            disabled={isGenerating || localRefDocs.length === 0}
                                        >
                                            {isGenerating ? <div className="loading-spinner w-4 h-4 text-primary-600"></div> : <LayoutTemplate size={16} />}
                                            {localContent.length > 0 ? "Regenerar Índex" : "Analitzar i Generar Índex"}
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={handleSaveDocument} 
                                            disabled={isSaving} 
                                            className="btn btn-primary text-sm gap-2"
                                        >
                                            {isSaving ? <div className="loading-spinner w-4 h-4 border-white"></div> : <Save size={16}/>}
                                            Guardar Esborrany
                                        </button>
                                        <button onClick={handleExportWord} className="btn btn-outline-secondary text-sm gap-2">
                                            Exportar a Word
                                        </button>
                                    </div>
                                </div>

                                {/* Content Builder */}
                                {localContent.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center text-slate-400 py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                                        <p className="mb-4">Construeix l'índex amb IA utilitzant les referències, o comença'n un des de zero.</p>
                                        <button onClick={addSection} className="btn bg-white border border-primary-200 text-primary-600 hover:bg-primary-50">
                                            Començar en Blanc
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                         {localContent.map((idxItem, idx) => (
                                             <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 transition-all hover:border-slate-300 shadow-sm focus-within:ring-2 focus-within:ring-primary-100 focus-within:border-primary-300">
                                                 <div className="p-3 bg-white border-b border-slate-200 flex flex-col gap-3">
                                                     <div className="flex justify-between items-center w-full gap-2">
                                                         <input 
                                                             type="text" 
                                                             className="font-bold text-slate-800 text-base bg-transparent border-0 border-b border-dashed border-transparent hover:border-slate-300 focus:border-primary-500 focus:ring-0 px-2 py-1 flex-1 transition-colors"
                                                             value={idxItem.title}
                                                             onChange={(e) => handleTitleChange(idx, e.target.value)}
                                                         />
                                                         <button onClick={() => removeSection(idx)} className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors">
                                                             <Trash2 size={16}/>
                                                         </button>
                                                     </div>
                                                     <div className="flex justify-between items-center flex-wrap gap-2 px-2 pb-1">
                                                         <input 
                                                             type="text" 
                                                             placeholder="Context exclusiu per aquest apartat (ex: Fes èmfasi en el preu)..." 
                                                             className="input input-sm flex-1 lg:max-w-xl font-normal text-slate-600 bg-slate-50 border-slate-200 focus:bg-white"
                                                             value={idxItem.instructions || ""}
                                                             onChange={(e) => {
                                                                 const newVal = [...localContent];
                                                                 newVal[idx].instructions = e.target.value;
                                                                 setLocalContent(newVal);
                                                             }}
                                                         />
                                                         <button 
                                                             onClick={() => handleGenerateSection(idx)}
                                                             disabled={idxItem.processing || localRefDocs.length === 0}
                                                             className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-2 shrink-0 disabled:bg-slate-100 disabled:text-slate-400 border-0"
                                                         >
                                                             {idxItem.processing ? <div className="loading-spinner w-3 h-3 border-current"></div> : <CheckCircle size={14}/> }
                                                             {idxItem.processing ? "Generant..." : "Redactar amb IA"}
                                                         </button>
                                                     </div>
                                                 </div>
                                                 
                                                 <div className="p-4 bg-slate-50/50">
                                                    <div className="flex justify-end gap-2 mb-3">
                                                        <button 
                                                            onClick={() => {
                                                                const newVal = [...localContent];
                                                                newVal[idx].isPreview = false;
                                                                setLocalContent(newVal);
                                                            }} 
                                                            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${!idxItem.isPreview ? 'bg-primary-100 text-primary-700 shadow-sm border border-primary-200' : 'text-slate-500 hover:bg-slate-200 border border-transparent'}`}
                                                        >
                                                            Mode Edició
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                const newVal = [...localContent];
                                                                newVal[idx].isPreview = true;
                                                                setLocalContent(newVal);
                                                            }} 
                                                            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${idxItem.isPreview ? 'bg-primary-100 text-primary-700 shadow-sm border border-primary-200' : 'text-slate-500 hover:bg-slate-200 border border-transparent'}`}
                                                        >
                                                            Previsualitzar
                                                        </button>
                                                    </div>

                                                    {idxItem.isPreview ? (
                                                        <div className="prose prose-sm prose-slate max-w-none p-5 rounded-lg bg-white border border-slate-200 min-h-[8rem] shadow-sm">
                                                            <ReactMarkdown>{idxItem.content || "*Sense contingut. Clica a 'Mode Edició' o genera el text amb la IA.*"}</ReactMarkdown>
                                                        </div>
                                                    ) : (
                                                        <textarea 
                                                            value={idxItem.content || ""}
                                                            onChange={(e) => {
                                                                const newVal = [...localContent];
                                                                newVal[idx].content = e.target.value;
                                                                setLocalContent(newVal);
                                                            }}
                                                            className="w-full bg-white border border-slate-200 rounded-lg text-sm text-slate-700 p-5 min-h-[12rem] focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono resize-y shadow-sm" 
                                                            placeholder="Pots redactar directament en format Markdown..."
                                                        ></textarea>
                                                    )}
                                                 </div>
                                             </div>
                                         ))}
                                         
                                         <button onClick={addSection} className="btn w-full btn-outline-secondary border-dashed border-2 py-4 text-slate-500 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                                             <Plus size={18} className="mr-2" /> Afegir Secció Manualment
                                         </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
