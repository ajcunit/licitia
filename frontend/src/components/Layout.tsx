import { Outlet, Link } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                <main className="flex-1 p-8 flex flex-col overflow-y-auto">
                    <Outlet />
                </main>
                <footer className="py-3 text-center text-sm border-t border-slate-200 bg-white">
                    <Link to="/credits" className="text-slate-500 hover:text-primary-600 transition-colors inline-flex items-center gap-1 font-medium">
                        Fet amb ❤️ per l'Ajuntament de Cunit
                    </Link>
                </footer>
            </div>
        </div>
    );
}
