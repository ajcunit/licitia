import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api, Empleado } from '../api/client';
import {
    LayoutDashboard,
    FileText,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Search,
    Settings,
    Globe,
    Star,
    LogOut,
    Building2,
    Flag,
    Moon,
    Sun,
    User,
    ChevronUp,
    Shield,
    Layers,
} from 'lucide-react';

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const [pendientes, setPendientes] = useState(0);
    const [user, setUser] = useState<Empleado | null>(null);
    const [isDark, setIsDark] = useState(() => {
        return localStorage.getItem('theme') === 'dark' || 
               (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    });
    const [viewMode, setViewMode] = useState(() => {
        return localStorage.getItem('viewMode') || 'user';
    });
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDark]);

    useEffect(() => {
        api.getMe().then(setUser).catch(() => {});
    }, []);

    const handleLogout = async () => {
        await api.logout();
        window.location.href = '/login';
    };

    const toggleViewMode = () => {
        const newMode = viewMode === 'admin' ? 'user' : 'admin';
        setViewMode(newMode);
        localStorage.setItem('viewMode', newMode);
        window.location.reload(); 
    };

    useEffect(() => {
        api.getDuplicadosCount().then((data) => setPendientes(data.pendientes)).catch(() => { });
    }, []);

    const navItems = [
        { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/contratacion', icon: FileText, label: 'Contractació' },
        ...(user?.rol === 'admin' || user?.rol === 'responsable_contratacion' 
            ? (pendientes > 0 ? [{ path: '/duplicados', icon: AlertTriangle, label: 'Duplicats', badge: pendientes }] : []) 
            : []),
        { path: '/adjudicatarios', icon: Building2, label: 'Adjudicataris' },
        { path: '/cpv', icon: Search, label: 'Buscador CPV' },
        { path: '/superbuscador', icon: Globe, label: 'SuperBuscador' },
        { path: '/generador-ppt', icon: Layers, label: 'Generador PPT' },
        { path: '/favoritos', icon: Star, label: 'Favorits' },
        ...(user?.permiso_auditoria || user?.rol === 'admin' 
            ? [{ path: '/auditoria', icon: Flag, label: 'Auditoria/Alertes' }] 
            : []),
    ];

    return (
        <aside
            className={`${collapsed ? 'w-20' : 'w-64'
                } bg-white border-r border-slate-200 transition-all duration-300 flex flex-col`}
        >
            {/* Logo */}
            <div className="h-16 flex items-center justify-center border-b border-slate-100 px-4">
                {!collapsed && (
                    <div className="flex flex-col items-center w-full">
                        <h1 className="font-bold text-slate-800 tracking-tight text-2xl">Licit<span className="text-primary-600">IA</span></h1>
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-1">Gestió Intel·ligent</p>
                    </div>
                )}
                {collapsed && (
                    <div className="font-bold text-primary-600 text-xl">L</div>
                )}
            </div>

            {/* Navigation */}
            <nav className={`flex-1 p-4 space-y-1 custom-scrollbar ${collapsed ? 'overflow-visible' : 'overflow-y-auto'}`}>
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `sidebar-link relative group has-tooltip ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-2' : ''}`
                        }
                    >
                        <item.icon size={20} />
                        
                        {collapsed && (
                            <div className="invisible group-hover:visible absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-white text-primary-700 text-xs font-bold rounded-lg shadow-xl border border-primary-100 whitespace-nowrap z-50 pointer-events-none animate-in fade-in slide-in-from-left-1 duration-200">
                                {item.label}
                                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-white border-l border-b border-primary-100 rotate-45" />
                            </div>
                        )}

                        {!collapsed && (
                            <>
                                <span className="flex-1">{item.label}</span>
                                {item.badge !== undefined && item.badge > 0 && (
                                    <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
                                        {item.badge}
                                    </span>
                                )}
                            </>
                        )}
                        {collapsed && item.badge !== undefined && item.badge > 0 && (
                            <span className="absolute right-2 top-1 w-2 h-2 bg-orange-500 rounded-full" />
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* Bottom Section - User Menu */}
            <div className="p-4 border-t border-slate-100 relative">
                {userMenuOpen && !collapsed && (
                    <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200">
                        <div className="p-2 space-y-1">
                            <button
                                onClick={() => {
                                    setIsDark(!isDark);
                                    setUserMenuOpen(false);
                                }}
                                className="sidebar-link w-full text-left"
                            >
                                {isDark ? <Sun size={18} /> : <Moon size={18} />}
                                <span className="flex-1">Mode {isDark ? 'Clar' : 'Fosc'}</span>
                            </button>
                            
                            {user?.rol === 'admin' && (
                                <>
                                    <NavLink
                                        to="/configuracion"
                                        onClick={() => setUserMenuOpen(false)}
                                        className={({ isActive }) =>
                                            `sidebar-link ${isActive ? 'active' : ''}`
                                        }
                                    >
                                        <Settings size={18} />
                                        <span className="flex-1">Configuració</span>
                                    </NavLink>
                                </>
                            )}

                            {(user?.rol === 'admin' || user?.rol === 'responsable_contratacion') && (
                                <button
                                    onClick={toggleViewMode}
                                    className="sidebar-link w-full text-left"
                                    title={viewMode === 'admin' ? "Canvia a vista limitada al teu departament." : "Canvia a vista d'administrador (tots els departaments)."}
                                >
                                    <Shield size={18} className={viewMode === 'admin' ? 'text-primary-600' : 'text-slate-400'} />
                                    <span className="flex-1">
                                        {viewMode === 'admin' ? 'Vista Usuari' : 'Vista Admin'}
                                    </span>
                                </button>
                            )}
                            
                            <div className="h-px bg-slate-100 my-1"></div>
                            
                            <button
                                onClick={handleLogout}
                                className="sidebar-link w-full text-left text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                                <LogOut size={18} />
                                <span className="flex-1">Tancar Sessió</span>
                            </button>
                        </div>
                    </div>
                )}

                <button
                    onClick={() => !collapsed && setUserMenuOpen(!userMenuOpen)}
                    className={`flex items-center gap-3 p-2 rounded-xl transition-all duration-200 w-full hover:bg-slate-50 group ${userMenuOpen ? 'bg-slate-50' : ''}`}
                    title={collapsed ? user?.nombre : ''}
                >
                    <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center shrink-0 border border-primary-200 overflow-hidden">
                        {user?.nombre ? (
                            <span className="font-bold text-sm">{user.nombre.charAt(0).toUpperCase()}</span>
                        ) : (
                            <User size={20} />
                        )}
                    </div>
                    
                    {!collapsed && (
                        <>
                            <div className="flex-1 text-left overflow-hidden">
                                <p className="text-sm font-bold text-slate-800 truncate">{user?.nombre || 'Usuari'}</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] text-slate-500 truncate uppercase tracking-wider font-semibold">
                                        {user?.rol === 'admin' ? 'Administrador' : user?.rol === 'responsable_contratacion' ? 'Resp. Contractació' : 'Empleat'}
                                    </p>
                                    {(user?.rol === 'admin' || user?.rol === 'responsable_contratacion') && (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter ${viewMode === 'admin' ? 'bg-primary-100 text-primary-700 border border-primary-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                                            {viewMode === 'admin' ? 'Admin' : 'Usuari'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <ChevronUp size={16} className={`text-slate-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                        </>
                    )}
                </button>
                                {collapsed && (
                    <div className="mt-2 flex flex-col gap-2">
                         <button
                            onClick={() => setIsDark(!isDark)}
                            className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-primary-600 transition-all mx-auto relative group"
                        >
                            {isDark ? <Sun size={20} /> : <Moon size={20} />}
                             <div className="invisible group-hover:visible absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-white text-slate-700 text-xs font-bold rounded-lg shadow-xl border border-slate-200 whitespace-nowrap z-50 pointer-events-none">
                                Mode {isDark ? 'Clar' : 'Fosc'}
                                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-white border-l border-b border-slate-200 rotate-45" />
                            </div>
                        </button>
                        <button
                            onClick={handleLogout}
                            className="w-10 h-10 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-all mx-auto relative group"
                        >
                            <LogOut size={20} />
                            <div className="invisible group-hover:visible absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-white text-red-600 text-xs font-bold rounded-lg shadow-xl border border-red-100 whitespace-nowrap z-50 pointer-events-none">
                                Tancar Sessió
                                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-white border-l border-b border-red-100 rotate-45" />
                            </div>
                        </button>
                    </div>
                )}
            </div>

            {/* Collapse button */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="h-12 flex items-center justify-center border-t border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            >
                {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
        </aside>
    );
}
