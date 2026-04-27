import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { LogOut, LayoutDashboard, FileText, Briefcase, Shield, ChevronDown, User as UserIcon, Check, X } from 'lucide-react';
import { Logo } from './Logo';

export function Navbar() {
    const { user, isAdmin, isTeamLead, canAccessAdminPortal, isDelegatedAdmin, logout, setName } = useAuth();
    const location = useLocation();

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState(user?.name || '');
    const [isSavingName, setIsSavingName] = useState(false);
    const [imageError, setImageError] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const editNameInputId = 'account-name-input';

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
                setIsEditingName(false);
            }
        }
        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsDropdownOpen(false);
                setIsEditingName(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [dropdownRef]);

    const handleSaveName = async () => {
        if (!editNameValue.trim() || editNameValue.trim() === user?.name) {
            setIsEditingName(false);
            return;
        }
        setIsSavingName(true);
        try {
            await setName(editNameValue.trim());
            setIsEditingName(false);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSavingName(false);
        }
    };

    const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

    return (
        <header className="navbar-wrapper">
            <a href="#main-content" className="skip-link">Skip to main content</a>
            {/* Top Brand Header (Gold) */}
            <div style={{ background: 'var(--color-primary-gold)', padding: '0.75rem 0', color: 'var(--color-text-primary)' }}>
                <div className="container flex items-center justify-between">
                    <Link to="/dashboard" className="flex items-center gap-3 decoration-none" aria-label="Go to dashboard">
                        <Logo size={50} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }} />
                        <div>
                            <h1 style={{
                                fontSize: '1.5rem',
                                margin: 0,
                                lineHeight: 1,
                                fontFamily: 'var(--font-heading)',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }}>
                                Guardian's Embrace
                            </h1>
                            <p style={{
                                margin: 0,
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                opacity: 0.8,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em'
                            }}>
                                Volunteer Portal
                            </p>
                        </div>
                    </Link>

                    {/* User Profile Dropdown */}
                    {user && (
                        <div className="relative" ref={dropdownRef} style={{ position: 'relative' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!isDropdownOpen) setEditNameValue(user.name);
                                    setIsDropdownOpen(!isDropdownOpen);
                                    setIsEditingName(false);
                                }}
                                aria-haspopup="menu"
                                aria-expanded={isDropdownOpen}
                                aria-controls="user-menu"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    background: isDropdownOpen ? 'rgba(0,0,0,0.05)' : 'transparent',
                                    border: 'none',
                                    padding: '0.35rem 0.5rem 0.35rem 1rem',
                                    borderRadius: '50px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <div className="text-right hidden-mobile">
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-dark-bg)', margin: 0, padding: 0 }}>{user.name}</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.8, color: 'var(--color-dark-bg)', marginTop: '-2px' }}>
                                        {isAdmin ? 'Administrator' : isDelegatedAdmin ? 'Delegated Admin' : isTeamLead ? 'Team Lead' : 'Volunteer'}
                                    </div>
                                </div>
                                {user.picture && !imageError ? (
                                    <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" onError={() => setImageError(true)} style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.1)', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-dark-bg)', color: 'var(--color-primary-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', border: '2px solid rgba(0,0,0,0.1)' }}>
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <ChevronDown size={16} style={{ color: 'var(--color-dark-bg)', transition: 'transform 0.2s', transform: isDropdownOpen ? 'rotate(180deg)' : 'none' }} />
                            </button>

                            {/* Dropdown Menu */}
                            {isDropdownOpen && (
                                <div
                                    id="user-menu"
                                    role="menu"
                                    aria-label="Account menu"
                                    style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 0.5rem)',
                                    right: 0,
                                    width: '280px',
                                    background: 'var(--color-bg-primary)',
                                    borderRadius: 'var(--radius-lg)',
                                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                    overflow: 'hidden',
                                    zIndex: 50,
                                    border: '1px solid var(--color-border)',
                                    animation: 'slideUp 0.15s ease-out'
                                    }}
                                >
                                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
                                        <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signed in as</p>
                                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary)' }}>{user.email}</p>
                                    </div>

                                    <div style={{ padding: '0.5rem' }}>
                                        {isEditingName ? (
                                            <div style={{ padding: '0.5rem' }}>
                                                <label htmlFor={editNameInputId} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>Update Full Name</label>
                                                <input
                                                    id={editNameInputId}
                                                    value={editNameValue}
                                                    onChange={(e) => setEditNameValue(e.target.value)}
                                                    autoFocus
                                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '0.75rem', boxSizing: 'border-box', outline: 'none' }}
                                                />
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        type="button"
                                                        role="menuitem"
                                                        onClick={handleSaveName}
                                                        disabled={isSavingName || editNameValue.trim().length < 2}
                                                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', background: 'var(--color-primary-gold)', color: 'var(--color-dark-bg)', border: 'none', padding: '0.5rem', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', opacity: isSavingName || editNameValue.trim().length < 2 ? 0.6 : 1 }}
                                                    >
                                                        {isSavingName ? 'Saving...' : <><Check size={14} /> Save</>}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        role="menuitem"
                                                        onClick={() => { setIsEditingName(false); setEditNameValue(user.name); }}
                                                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', padding: '0.5rem', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }}
                                                    >
                                                        <X size={14} /> Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() => { setIsEditingName(true); setEditNameValue(user.name); }}
                                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'transparent', border: 'none', color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer', borderRadius: 'var(--radius-md)', transition: 'background 0.2s', fontWeight: 500 }}
                                                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-bg-secondary)'}
                                                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <UserIcon size={16} style={{ color: 'var(--color-text-secondary)' }} /> Edit Profile Name
                                                </button>

                                                <div style={{ height: 1, background: 'var(--color-border)', margin: '0.5rem 0' }} />

                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={logout}
                                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'transparent', border: 'none', color: 'var(--color-error)', textAlign: 'left', cursor: 'pointer', borderRadius: 'var(--radius-md)', transition: 'background 0.2s', fontWeight: 500 }}
                                                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-error-bg)'}
                                                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <LogOut size={16} /> Sign Out
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Navigation Bar (Dark) */}
            <nav aria-label="Primary" style={{ background: 'var(--color-dark-bg)', padding: '0' }}>
                <div className="container flex items-center justify-between">
                    <div className="flex items-center">
                        <NavLink to="/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" active={isActive('/dashboard')} />
                        <NavLink to="/projects" icon={<Briefcase size={18} />} label="Projects" active={isActive('/projects')} />
                        <NavLink to="/submissions" icon={<FileText size={18} />} label={<><span className="hidden-mobile">My </span>Submissions</>} active={isActive('/submissions')} />

                        {canAccessAdminPortal && (
                            <>
                                <div className="hidden-mobile" style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }}></div>
                                <NavLink to="/admin" icon={<Shield size={18} />} label={<>Admin<span className="hidden-mobile"> Portal</span></>} active={location.pathname.startsWith('/admin')} />
                            </>
                        )}
                    </div>

                    <div />
                </div>
            </nav>
        </header>
    );
}

function NavLink({ to, icon, label, active }: { to: string; icon: React.ReactNode; label: React.ReactNode; active: boolean }) {
    return (
        <Link
            to={to}
            className={`navbar-link ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
        >
            {icon}
            <span>{label}</span>
        </Link>
    );
}

export function Footer() {
    return (
        <footer style={{
            background: 'var(--color-dark-bg)',
            color: 'var(--color-text-on-dark)',
            padding: '1rem 0',
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
