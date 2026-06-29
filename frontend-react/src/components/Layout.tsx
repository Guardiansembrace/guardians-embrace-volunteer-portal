import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { LogOut, LayoutDashboard, FileText, Briefcase, Shield, ChevronDown, User as UserIcon, ContactRound, BookOpen } from 'lucide-react';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';

export function Navbar() {
    const { user, isAdmin, isTeamLead, canAccessAdminPortal, isDelegatedAdmin, hasAdminScope, logout, setName } = useAuth();
    const location = useLocation();
    const canAccessCrm = hasAdminScope('manage_crm');

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
        <header className="navbar-wrapper" style={{ background: 'var(--color-dark-bg)', borderBottom: '1px solid #333' }}>
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <div className="container flex items-center justify-between" style={{ padding: '0' }}>
                <div className="flex items-center gap-4">
                    <Link to="/dashboard" className="flex items-center gap-2 decoration-none" aria-label="Go to dashboard" style={{ padding: '0.5rem 0' }}>
                        <Logo size={24} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }} />
                        <h1 style={{
                            fontSize: '1rem',
                            margin: 0,
                            lineHeight: 1,
                            fontFamily: 'var(--font-heading)',
                            fontWeight: 700,
                            color: 'var(--color-primary-gold)',
                            letterSpacing: '0.02em'
                        }}>
                            Guardian's Embrace
                        </h1>
                    </Link>

                    <nav aria-label="Primary" className="flex items-center hidden-mobile" style={{ marginLeft: '1rem' }}>
                        <NavLink to="/dashboard" icon={<LayoutDashboard size={14} />} label="Dashboard" active={isActive('/dashboard')} />
                        <NavLink to="/projects" icon={<Briefcase size={14} />} label="Projects" active={isActive('/projects')} />
                        {canAccessCrm && <NavLink to="/crm" icon={<ContactRound size={14} />} label="CRM" active={isActive('/crm')} />}
                        <NavLink to="/submissions" icon={<FileText size={14} />} label="Submissions" active={isActive('/submissions')} />
                        {canAccessAdminPortal && (
                            <>
                                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }}></div>
                                <NavLink to="/admin" icon={<Shield size={14} />} label="Admin" active={location.pathname.startsWith('/admin')} />
                            </>
                        )}
                    </nav>
                </div>

                <div className="flex items-center gap-2">
                    <NotificationBell />
                    
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
                                    gap: '0.5rem',
                                    background: isDropdownOpen ? 'rgba(255,255,255,0.05)' : 'transparent',
                                    border: 'none',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {user.picture && !imageError ? (
                                    <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" onError={() => setImageError(true)} style={{ width: 24, height: 24, borderRadius: '4px', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ width: 24, height: 24, borderRadius: '4px', background: 'var(--color-primary-gold)', color: 'var(--color-dark-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="text-left hidden-mobile" style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#fff' }}>{user.name.split(' ')[0]}</span>
                                </div>
                                <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.6)', transition: 'transform 0.2s', transform: isDropdownOpen ? 'rotate(180deg)' : 'none' }} />
                            </button>

                            {/* Dropdown Menu */}
                            {isDropdownOpen && (
                                <div
                                    id="user-menu"
                                    role="menu"
                                    style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 0.5rem)',
                                    right: 0,
                                    width: '240px',
                                    background: 'var(--color-surface-bg)',
                                    borderRadius: 'var(--radius-md)',
                                    boxShadow: 'var(--shadow-lg)',
                                    border: '1px solid var(--color-border)',
                                    zIndex: 50
                                    }}
                                >
                                    <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-background)' }}>
                                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem' }}>{user.email}</p>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                            {isAdmin ? 'Administrator' : isDelegatedAdmin ? 'Delegated Admin' : isTeamLead ? 'Team Lead' : 'Volunteer'}
                                        </p>
                                    </div>

                                    <div style={{ padding: '0.5rem' }}>
                                        {isEditingName ? (
                                            <div style={{ padding: '0.5rem' }}>
                                                <input
                                                    id={editNameInputId}
                                                    value={editNameValue}
                                                    onChange={(e) => setEditNameValue(e.target.value)}
                                                    autoFocus
                                                    style={{ width: '100%', padding: '0.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: '0.5rem', boxSizing: 'border-box', outline: 'none', fontSize: '0.8rem' }}
                                                />
                                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                    <button type="button" onClick={handleSaveName} disabled={isSavingName} style={{ flex: 1, padding: '0.25rem', background: 'var(--color-primary-gold)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', cursor: 'pointer' }}>Save</button>
                                                    <button type="button" onClick={() => setIsEditingName(false)} style={{ flex: 1, padding: '0.25rem', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <Link to="/guide" role="menuitem" onClick={() => setIsDropdownOpen(false)} style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'transparent', border: 'none', color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}>
                                                    <BookOpen size={14} /> Guide &amp; Updates
                                                </Link>
                                                <button type="button" onClick={() => { setIsEditingName(true); setEditNameValue(user.name); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'transparent', border: 'none', color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}>
                                                    <UserIcon size={14} /> Edit Name
                                                </button>
                                                <button type="button" onClick={logout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'transparent', border: 'none', color: 'var(--color-error)', textAlign: 'left', cursor: 'pointer', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}>
                                                    <LogOut size={14} /> Sign Out
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
            
            {/* Mobile Nav */}
            <nav aria-label="Mobile Navigation" className="mobile-only-nav" style={{ background: 'var(--color-dark-bg)', padding: '0', borderTop: '1px solid #333' }}>
                <div className="container flex items-center justify-between" style={{ overflowX: 'auto' }}>
                    <NavLink to="/dashboard" icon={<LayoutDashboard size={14} />} label="Dashboard" active={isActive('/dashboard')} />
                    <NavLink to="/projects" icon={<Briefcase size={14} />} label="Projects" active={isActive('/projects')} />
                    {canAccessCrm && <NavLink to="/crm" icon={<ContactRound size={14} />} label="CRM" active={isActive('/crm')} />}
                    <NavLink to="/submissions" icon={<FileText size={14} />} label="Submissions" active={isActive('/submissions')} />
                    {canAccessAdminPortal && (
                        <NavLink to="/admin" icon={<Shield size={14} />} label="Admin" active={location.pathname.startsWith('/admin')} />
                    )}
                </div>
            </nav>
            <style>{`
                @media (min-width: 768px) {
                    .mobile-only-nav { display: none; }
                }
            `}</style>
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
