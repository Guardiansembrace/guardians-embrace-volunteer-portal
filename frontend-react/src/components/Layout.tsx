import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { LogOut, LayoutDashboard, FileText, Users, ClipboardList } from 'lucide-react';

export function Navbar() {
    const { user, isAdmin, logout } = useAuth();
    const location = useLocation();

    const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

    return (
        <nav className="navbar">
            <div className="container">
                <div className="flex items-center justify-between">
                    {/* Logo */}
                    <Link to="/dashboard" className="navbar-brand">
                        <span style={{ fontSize: '1.5rem' }}>🛡️</span>
                        <span>Guardian's Embrace</span>
                    </Link>

                    {/* Navigation Links */}
                    <div className="navbar-nav">
                        <Link to="/dashboard" className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}>
                            <LayoutDashboard size={18} />
                            Dashboard
                        </Link>
                        <Link to="/submissions" className={`nav-link ${isActive('/submissions') ? 'active' : ''}`}>
                            <FileText size={18} />
                            Submissions
                        </Link>

                        {/* Admin Links */}
                        {isAdmin && (
                            <>
                                <div style={{
                                    width: '1px',
                                    height: '24px',
                                    background: 'var(--color-dark-border)',
                                    margin: '0 0.5rem'
                                }} />
                                <Link to="/admin/users" className={`nav-link ${location.pathname === '/admin/users' ? 'active' : ''}`}>
                                    <Users size={18} />
                                    Users
                                </Link>
                                <Link to="/admin/submissions" className={`nav-link ${location.pathname === '/admin/submissions' ? 'active' : ''}`}>
                                    <ClipboardList size={18} />
                                    All Submissions
                                </Link>
                            </>
                        )}
                    </div>

                    {/* User Menu */}
                    <div className="flex items-center gap-3">
                        {user && (
                            <>
                                <div className="flex items-center gap-2">
                                    {user.picture && (
                                        <img
                                            src={user.picture}
                                            alt={user.name}
                                            style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: '50%',
                                                border: '2px solid var(--color-primary-gold)',
                                            }}
                                        />
                                    )}
                                    <span style={{ color: 'var(--color-text-on-dark)', fontSize: '0.875rem' }}>
                                        {user.name}
                                    </span>
                                    {isAdmin && (
                                        <span className="badge badge-admin" style={{ marginLeft: '0.25rem' }}>
                                            Admin
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={logout}
                                    className="btn btn-ghost"
                                    style={{ color: 'var(--color-text-on-dark)', padding: '0.5rem' }}
                                    title="Logout"
                                >
                                    <LogOut size={20} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}

export function Footer() {
    return (
        <footer style={{
            background: 'var(--color-dark-bg)',
            color: 'var(--color-text-on-dark)',
            padding: '2rem 0',
            marginTop: 'auto',
        }}>
            <div className="container">
                <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        © 2026 Guardian's Embrace. All Rights Reserved.
                    </p>
                    <div className="flex gap-4">
                        <a
                            href="https://guardiansembrace.org"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--color-primary-gold)', fontSize: '0.875rem' }}
                        >
                            Main Website
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
