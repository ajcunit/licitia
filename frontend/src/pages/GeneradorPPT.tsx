import { useState } from 'react';
import { usePPTCart } from '../context/PPTContext';
import { FileText, Trash2, ArrowRight, Save, LayoutTemplate, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function GeneradorPPT() {
    const { documents, removeDocument, clearDocuments } = usePPTCart();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [indexGenerated, setIndexGenerated] = useState<any[]>([]);

    const handleGenerateIndex = async () => {
        if (documents.length === 0) return;
        setLoading(true);
        try {
            const urls = documents.map(d => d.url);
            const generated = await api.generatePPTIndex(urls);
            setIndexGenerated(generated.map(g => ({ title: g.title, content: "", processing: false })));
        } catch (e) {
            console.error(e);
            alert("S'ha produït un error al connectar amb la IA. Revisa l'apartat de Configuració.");
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateSection = async (idx: number) => {
        const item = indexGenerated[idx];
        if (!item) return;

        const updated = [...indexGenerated];
        updated[idx].processing = true;
        setIndexGenerated(updated);

        try {
            const urls = documents.map(d => d.url);
            const ctxText = "Informació del departament. (A completar si l'usuari vol)";
            const content = await api.generatePPTSection(item.title, ctxText, urls);
            
            const newIndex = [...indexGenerated];
            newIndex[idx].content = content;
            newIndex[idx].processing = false;
            setIndexGenerated(newIndex);
        } catch (e) {
            console.error(e);
            alert("Error al generar la secció.");
            const resetIndex = [...indexGenerated];
            resetIndex[idx].processing = false;
            setIndexGenerated(resetIndex);
        }
    };

    if (documents.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 glass-card">
                <LayoutTemplate size={48} className="mb-4 text-slate-300" />
                <h2 className="text-xl font-bold text-slate-700">Afegeix Plantilles i Documents</h2>
                <p className="mt-2 text-center max-w-sm">
                    No has afegit cap document. Ves a qualsevol contracte o cerca al superbuscador i clica `Usar de Plantilla` en els PDF.
                </p>
                <button className="btn btn-primary mt-6" onClick={() => navigate('/contratos')}>
                    Anar a Contractes
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Layers size={24} className="text-primary-600" />
                        Generador de PPT / Informes
                    </h1>
                    <p className="text-slate-500 mt-1">Crea nous documents combinant intel·ligència artificial amb els teus referents històrics.</p>
                </div>
                <button 
                    onClick={clearDocuments}
                    className="btn btn-secondary text-red-600 hover:text-red-700"
                >
                    <Trash2 size={16} /> Buidar Llista
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-4">
                    <div className="glass-card p-4">
                        <h3 className="font-semibold text-slate-700 mb-3">Documents Base Seleccionats ({documents.length})</h3>
                        <div className="space-y-3">
                            {documents.map(doc => (
                                <div key={doc.id} className="flex flex-col p-3 rounded-lg border border-slate-200 bg-white shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2 text-sm font-medium text-slate-800 line-clamp-2">
                                            <FileText size={14} className="text-primary-500 shrink-0"/>
                                            {doc.titol}
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{doc.expedient}</span>
                                        <button onClick={() => removeDocument(doc.id)} className="text-red-500 hover:text-red-700 p-1">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button 
                        className={`btn w-full ${indexGenerated.length > 0 ? 'btn-secondary' : 'btn-primary'} gap-2`}
                        onClick={handleGenerateIndex}
                        disabled={loading}
                    >
                        {loading && <div className="loading-spinner w-4 h-4"></div>}
                        {!loading && <ArrowRight size={16} />}
                        {indexGenerated.length > 0 ? "Regenerar Índex de Plantilla" : "Analitzar i Generar Índex"}
                    </button>
                </div>

                <div className="lg:col-span-2">
                    <div className="glass-card p-6 min-h-[400px]">
                         {indexGenerated.length === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                                 <LayoutTemplate size={48} className="mb-4 text-slate-200" />
                                 <p>Construeix l'índex per començar a generar les seccions.</p>
                             </div>
                         ) : (
                             <div className="space-y-6">
                                 <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                                    <h3 className="text-lg font-bold text-slate-800">Estructura del PPT</h3>
                                    <button className="btn btn-secondary text-xs p-2"><Save size={14} className="mr-1"/> Exportar Word</button>
                                 </div>
                                 <div className="space-y-4">
                                     {indexGenerated.map((idxItem, idx) => (
                                         <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                                             <div className="p-3 bg-white border-b border-slate-200 font-semibold text-slate-800 flex justify-between items-center">
                                                <span>{idx + 1}. {idxItem.title}</span>
                                                <button 
                                                    onClick={() => handleGenerateSection(idx)}
                                                    disabled={idxItem.processing}
                                                    className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1"
                                                >
                                                    {idxItem.processing ? <div className="loading-spinner w-3 h-3"></div> : <LayoutTemplate size={12}/> }
                                                    {idxItem.processing ? "Generant..." : "Generar IA"}
                                                </button>
                                             </div>
                                             <div className="p-3">
                                                <textarea 
                                                    value={idxItem.content || ""}
                                                    onChange={(e) => {
                                                        const newVal = [...indexGenerated];
                                                        newVal[idx].content = e.target.value;
                                                        setIndexGenerated(newVal);
                                                    }}
                                                    className="w-full bg-transparent border border-slate-100 rounded-lg text-sm text-slate-600 p-3 h-32 focus:ring-primary-500 focus:border-primary-500" 
                                                    placeholder="Aquest apartat s'omplirà de forma automàtica quan cliquis a 'Generar IA' o bé pots escriure-ho manualment."
                                                ></textarea>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         )}
                    </div>
                </div>
            </div>
        </div>
    );
}
