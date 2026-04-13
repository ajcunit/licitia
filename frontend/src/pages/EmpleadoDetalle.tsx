import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, Empleado, Departamento } from '../api/client';
import { 
    ArrowLeft, 
    User, 
    Mail, 
    Building2, 
    Shield, 
    Calendar, 
    Edit2, 
    Trash2, 
    Check, 
    X,
    Loader2,
    AlertCircle,
    Flag,
    ClipboardList
} from 'lucide-react';

export default function EmpleadoDetalle() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    
    const [empleado, setEmpleado] = useState<Empleado | null>(null);
    const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [isEditing, setIsEditing] = useState(false);
    const [isNew, setIsNew] = useState(false);
    const [formData, setFormData] = useState({
        nombre: '',
        email: '',
        departamento_id: '',
        rol: 'empleado',
        password: '',
        activo: true,
        permiso_auditoria: false,
        permiso_pla_contractacio: false
    });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (id === 'nuevo') {
            setIsNew(true);
            setIsEditing(true);
            setLoading(false);
            loadDepartmentsOnly();
        } else if (id) {
            loadData(parseInt(id));
        }
    }, [id]);

    const loadDepartmentsOnly = async () => {
        try {
            const depts = await api.getDepartamentos();
            setDepartamentos(depts);
        } catch (err) {
            console.error(err);
        }
    };

    const loadData = async (empId: number) => {
        try {
            setLoading(true);
            const [emp, depts] = await Promise.all([
                api.getEmpleado(empId),
                api.getDepartamentos()
            ]);
            setEmpleado(emp);
            setDepartamentos(depts);
            setFormData({
                nombre: emp.nombre,
                email: emp.email,
                departamento_id: emp.departamento_id?.toString() || '',
                rol: emp.rol,
                password: '',
                activo: emp.activo,
                permiso_auditoria: emp.permiso_auditoria || false,
                permiso_pla_contractacio: emp.permiso_pla_contractacio || false
            });
            setError(null);
        } catch (err) {
            console.error(err);
            setError('No s\'ha pogut carregar la informació de l\'empleat.');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        
        setSaving(true);
        setSaveError(null);
        try {
            const data = {
                nombre: formData.nombre,
                email: formData.email,
                departamento_id: formData.departamento_id ? parseInt(formData.departamento_id) : undefined,
                rol: formData.rol,
                password: formData.password || undefined,
                activo: formData.activo,
                permiso_auditoria: formData.permiso_auditoria,
                permiso_pla_contractacio: (formData as any).permiso_pla_contractacio
            };

            if (isNew) {
                if (!formData.password) {
                    throw new Error('La contrasenya és obligatòria per a nous usuaris');
                }
                const newEmp = await api.createEmpleado(data as any);
                navigate(`/empleados/${newEmp.id}`, { replace: true });
                setIsNew(false);
                setIsEditing(false);
                loadData(newEmp.id);
            } else if (id) {
                await api.updateEmpleado(parseInt(id), data);
                await loadData(parseInt(id));
                setIsEditing(false);
            }
        } catch (err: any) {
            setSaveError(err.message || 'Error al guardar els canvis');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async () => {
        if (!id || !empleado) return;
        
        const action = empleado.activo ? 'desactivar' : 'reactivar';
        if (!window.confirm(`Estàs segur que vols ${action} aquest empleat?`)) return;
        
        try {
            await api.updateEmpleado(parseInt(id), { activo: !empleado.activo });
            await loadData(parseInt(id));
        } catch (err) {
            console.error(err);
            setSaveError(`Error al ${action} l'empleat`);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-primary-600" size={40} />
            </div>
        );
    }

    if (error || (!empleado && !isNew)) {
        return (
            <div className="glass-card p-12 text-center max-w-2xl mx-auto mt-8">
                <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Error</h2>
                <p className="text-slate-600 mb-6">{error || 'Empleat no trobat'}</p>
                <Link to="/empleados" className="btn btn-primary inline-flex items-center gap-2">
                    <ArrowLeft size={18} />
                    Tornar a la llista
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-auto flex-1 pr-1">
            {/* Header / Nav */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('/empleados')}
                        className="p-2 hover:bg-white rounded-xl transition-colors shadow-sm bg-white/50 text-slate-600 hover:text-primary-600"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                            <Link to="/empleados" className="hover:text-primary-600">Empleats</Link>
                            <span>/</span>
                            <span>Fitxa de l'empleat</span>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800">
                            {isNew ? 'Nou Empleat' : empleado?.nombre}
                        </h1>
                    </div>
                </div>
                {!isEditing && !isNew && (
                    <div className="flex gap-3">
                        <button 
                            onClick={handleToggleActive}
                            className={`btn bg-white border border-slate-200 gap-2 ${
                                empleado?.activo ? 'hover:bg-red-50 text-red-600' : 'hover:bg-green-50 text-green-600'
                            }`}
                        >
                            {empleado?.activo ? <Trash2 size={18} /> : <Check size={18} />}
                            {empleado?.activo ? 'Desactivar' : 'Reactivar'}
                        </button>
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="btn btn-primary gap-2"
                        >
                            <Edit2 size={18} />
                            Editar Perfil
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Card */}
                <div className="lg:col-span-1">
                    <div className="glass-card p-6 flex flex-col items-center text-center">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-3xl font-bold mb-4 shadow-lg ring-4 ring-white">
                            {isNew ? <User size={40} /> : empleado?.nombre.charAt(0).toUpperCase()}
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-1">
                            {isNew ? 'Registre' : empleado?.nombre}
                        </h2>
                        <p className="text-slate-500 mb-4">{isNew ? 'Introdueix les dades' : empleado?.email}</p>
                        
                        <div className="w-full pt-4 border-t border-slate-100 flex flex-col gap-3">
                            {!isNew && empleado && (
                                <>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 capitalize">Rol</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                            empleado.rol === 'admin' ? 'bg-purple-100 text-purple-700' :
                                            empleado.rol === 'responsable_contratacion' ? 'bg-amber-100 text-amber-700' :
                                            empleado.rol === 'responsable' ? 'bg-blue-100 text-blue-700' :
                                            'bg-slate-100 text-slate-700'
                                        }`}>
                                            {empleado.rol}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500">Estat</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                            empleado.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                            {empleado.activo ? 'Actiu' : 'Inactiu'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500">Alta</span>
                                        <span className="text-slate-700">{new Date(empleado.fecha_creacion).toLocaleDateString()}</span>
                                    </div>
                                </>
                            )}
                            {isNew && (
                                <div className="text-xs text-slate-400 py-4 italic">
                                    L'usuari s'activarà automàticament en guardar
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Details / Edit View */}
                <div className="lg:col-span-2">
                    <div className="glass-card p-6 h-full">
                        {isEditing ? (
                            <form onSubmit={handleUpdate} className="space-y-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-slate-800">Modificar Dades</h3>
                                    <button 
                                        type="button" 
                                        onClick={() => setIsEditing(false)}
                                        className="text-slate-400 hover:text-slate-600"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Nom Complet</label>
                                        <input 
                                            type="text" 
                                            className="input"
                                            value={formData.nombre}
                                            onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                        <input 
                                            type="email" 
                                            className="input"
                                            value={formData.email}
                                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Departament</label>
                                        <select 
                                            className="input"
                                            value={formData.departamento_id}
                                            onChange={(e) => setFormData({...formData, departamento_id: e.target.value})}
                                        >
                                            <option value="">Sense asignar</option>
                                            {departamentos.map(d => (
                                                <option key={d.id} value={d.id}>{d.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Rol de l'usuari</label>
                                        <select 
                                            className="input"
                                            value={formData.rol}
                                            onChange={(e) => setFormData({...formData, rol: e.target.value})}
                                        >
                                            <option value="empleado">Empleat</option>
                                            <option value="responsable">Responsable</option>
                                            <option value="responsable_contratacion">Responsable de Contractació</option>
                                            <option value="admin">Administrador</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Nova Contrasenya</label>
                                        <input 
                                            type="password" 
                                            className="input"
                                            placeholder="Deixa-ho en blanc per no canviar"
                                            value={formData.password}
                                            onChange={(e) => setFormData({...formData, password: e.target.value})}
                                        />
                                    </div>
                                    <div className="md:col-span-2 p-4 bg-slate-50 rounded-xl mt-2 border border-slate-100 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col gap-1">
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input 
                                                        type="checkbox" 
                                                        className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                                                        checked={formData.permiso_auditoria}
                                                        onChange={(e) => setFormData({...formData, permiso_auditoria: e.target.checked})}
                                                    />
                                                    <span className="font-semibold text-slate-800 group-hover:text-primary-600 transition-colors flex items-center gap-2">
                                                        <Flag size={16} className="text-red-500" />
                                                        Accés a Mòdul d'Auditoria
                                                    </span>
                                                </label>
                                                <span className="text-xs text-slate-500 ml-6">Permet veure les alertes (red flags) i les anàlisis de dades per a Intervenció.</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-medium text-slate-500">Compte Actiu</span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        className="sr-only peer"
                                                        checked={formData.activo}
                                                        onChange={(e) => setFormData({...formData, activo: e.target.checked})}
                                                    />
                                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                                </label>
                                            </div>
                                        </div>
                                        <div className="border-t border-slate-200 pt-3">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                                    checked={(formData as any).permiso_pla_contractacio || false}
                                                    onChange={(e) => setFormData({...formData, permiso_pla_contractacio: e.target.checked} as any)}
                                                />
                                                <span className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                                                    <ClipboardList size={16} className="text-indigo-500" />
                                                    Accés al Pla de Contractació
                                                </span>
                                            </label>
                                            <span className="text-xs text-slate-500 ml-6">Permet visualitzar i editar el pla de contractació anual per trimestres.</span>
                                        </div>
                                    </div>
                                </div>

                                {saveError && (
                                    <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
                                        <AlertCircle size={16} />
                                        {saveError}
                                    </div>
                                )}

                                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                                    <button 
                                        type="button" 
                                        className="btn btn-secondary" 
                                        onClick={() => setIsEditing(false)}
                                    >
                                        Cancel·lar
                                    </button>
                                    <button 
                                        type="submit" 
                                        className="btn btn-primary gap-2"
                                        disabled={saving}
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                                        Guardar canvis
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="space-y-8">
                                <h3 className="text-lg font-bold text-slate-800 pb-2 border-b border-slate-100">Informació del Compte</h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
                                    <div className="flex gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                                            <User size={20} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Nom Complet</label>
                                            <p className="text-slate-800 font-medium">{empleado?.nombre}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                                            <Mail size={20} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Correu Electrònic</label>
                                            <p className="text-slate-800 font-medium">{empleado?.email}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                                            <Building2 size={20} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Departament</label>
                                            <p className="text-slate-800 font-medium">
                                                {empleado?.departamento?.nombre || 'Sense departament assignat'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                                            <Shield size={20} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Nivell d'Accés</label>
                                            <p className="text-slate-800 font-medium capitalize">
                                                {empleado?.rol === 'responsable_contratacion' ? 'Responsable de Contractació' : empleado?.rol}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                                            <Calendar size={20} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Data de Registre</label>
                                            <p className="text-slate-800 font-medium">
                                                {empleado && new Date(empleado.fecha_creacion).toLocaleDateString(undefined, {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                    </div>

                                    {empleado?.permiso_auditoria && (
                                        <div className="flex gap-4 md:col-span-2 mt-4 p-4 bg-red-50 rounded-xl border border-red-100">
                                            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                                                <Flag size={20} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-red-800 uppercase tracking-wider mb-1">Mòdul d'Auditoria</label>
                                                <p className="text-red-900 font-medium text-sm">
                                                    Aquest usuari té habilitat el permís especial per accedir a les alertes de control i "red flags" d'intervenció.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {empleado?.permiso_pla_contractacio && (
                                        <div className="flex gap-4 md:col-span-2 mt-2 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                                <ClipboardList size={20} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wider mb-1">Pla de Contractació</label>
                                                <p className="text-indigo-900 font-medium text-sm">
                                                    Aquest usuari té habilitat l'accés al mòdul de planificació anual de contractació.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
