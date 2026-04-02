import { useCallback, useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import type { AdminAccessGrant, AdminAccessScope, AllowedEmail, User } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Button, Badge, LoadingSpinner, EmptyState } from '../components/ui';
import { Users, Search, UserCheck, UserX, Shield, ChevronLeft, Plus, X, Mail, ListFilter, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const ADMIN_SCOPE_OPTIONS: Array<{ scope: AdminAccessScope; label: string; description: string }> = [
    { scope: 'view_users', label: 'View users', description: 'Open the user directory and inspect accounts.' },
    { scope: 'edit_users', label: 'Edit user profiles', description: 'Update user names and team assignments without changing access.' },
    { scope: 'manage_user_status', label: 'Manage account status', description: 'Activate or deactivate user accounts.' },
    { scope: 'manage_user_roles', label: 'Manage user roles', description: 'Promote or demote volunteers and team leads.' },
    { scope: 'review_submissions', label: 'Review submissions', description: 'Open the submission queue and mark reports reviewed.' },
    { scope: 'send_reminders', label: 'Send reminders', description: 'Check email status and send reminder emails.' },
    { scope: 'manage_invites', label: 'Manage invites', description: 'Create, resend, and revoke invitations.' },
    { scope: 'manage_projects', label: 'Manage projects', description: 'Create project boards, manage team assignments, and review join requests.' },
    { scope: 'manage_settings', label: 'Forms & settings', description: 'Edit submission forms, weekly schedule, and global app settings.' },
    { scope: 'view_audit_logs', label: 'View audit logs', description: 'Inspect tracked admin and security activity.' },
    { scope: 'view_admin_access', label: 'View delegated access', description: 'See who currently has delegated admin access and when it expires.' },
    { scope: 'manage_admin_access', label: 'Manage delegated access', description: 'Create, update, and revoke delegated admin grants.' },
];

function formatAdminScopeLabel(scope: AdminAccessScope) {
    return ADMIN_SCOPE_OPTIONS.find((option) => option.scope === scope)?.label ?? scope;
}

function getUserInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
}

export default function AdminUsersPage() {
    const navigate = useNavigate();
    const { isAdmin, canAccessAdminPortal, hasAdminScope, isLoading: authLoading, isAuthenticated } = useAuth();
    const searchInputId = useId();
    const roleFilterId = useId();
    const statusFilterId = useId();
    const inviteEmailsId = useId();
    const inviteRoleId = useId();
    const grantUserId = useId();
    const grantNoteId = useId();
    const grantExpiryId = useId();
    const editUserNameId = useId();
    const editUserTeamId = useId();

    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [roleEditorUser, setRoleEditorUser] = useState<User | null>(null);
    const [profileEditorUser, setProfileEditorUser] = useState<User | null>(null);
    const [saving, setSaving] = useState(false);
    const [profileForm, setProfileForm] = useState({ name: '', team: '' });
    const [showFilters, setShowFilters] = useState(false);

    // Invite State
    const [invites, setInvites] = useState<AllowedEmail[]>([]);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteForm, setInviteForm] = useState({ emails: '', role: 'volunteer' });
    const [isInviting, setIsInviting] = useState(false);
    const [grants, setGrants] = useState<AdminAccessGrant[]>([]);
    const [showGrantModal, setShowGrantModal] = useState(false);
    const [isSavingGrant, setIsSavingGrant] = useState(false);
    const [grantForm, setGrantForm] = useState<{ userId: string; scopes: AdminAccessScope[]; note: string; expiresAt: string }>({
        userId: '',
        scopes: ['view_users'],
        note: '',
        expiresAt: '',
    });
    const canEditUsers = hasAdminScope('edit_users') || hasAdminScope('manage_users');
    const canManageUserStatus = hasAdminScope('manage_user_status') || hasAdminScope('manage_users');
    const canManageUserRoles = hasAdminScope('manage_user_roles');
    const canViewUsers = hasAdminScope('view_users') || canEditUsers || canManageUserStatus || canManageUserRoles;
    const canManageUsers = canEditUsers || canManageUserStatus || canManageUserRoles;
    const canManageInvites = hasAdminScope('manage_invites');
    const canViewAdminAccess = hasAdminScope('view_admin_access') || hasAdminScope('manage_admin_access');
    const canManageAdminAccess = hasAdminScope('manage_admin_access');
    const canLoadUsers = canViewUsers || canManageAdminAccess;
    const grantableScopeOptions = ADMIN_SCOPE_OPTIONS.filter((option) => {
        if (isAdmin) {
            return true;
        }
        if (option.scope === 'manage_admin_access' || option.scope === 'manage_user_roles' || option.scope === 'manage_user_status') {
            return false;
        }
        return hasAdminScope(option.scope);
    });

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !canAccessAdminPortal || (!canViewUsers && !canManageInvites && !canViewAdminAccess))) {
            navigate('/dashboard');
        }
    }, [authLoading, isAuthenticated, canAccessAdminPortal, canManageInvites, canViewAdminAccess, canViewUsers, navigate]);

    const loadUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            const params: Record<string, string | boolean | undefined> = {};
            if (roleFilter) params.role = roleFilter as User['role'];
            if (statusFilter) params.is_active = statusFilter === 'active';

            const data = await api.getAllUsers(params);
            setUsers(data);
        } catch (err) {
            console.error('Failed to load users:', err);
        } finally {
            setIsLoading(false);
        }
    }, [roleFilter, statusFilter]);

    const loadInvites = useCallback(async () => {
        try {
            const data = await api.getInvites();
            setInvites(data);
        } catch (err) {
            console.error('Failed to load invites:', err);
        }
    }, []);

    const loadGrants = useCallback(async () => {
        try {
            const data = await api.getAdminAccessGrants();
            setGrants(data);
        } catch (err) {
            console.error('Failed to load delegated admin access:', err);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated && canAccessAdminPortal) {
            if (canLoadUsers) {
                void loadUsers();
            } else {
                setUsers([]);
            }
            if (canManageInvites) {
                void loadInvites();
            } else {
                setInvites([]);
            }
            if (canViewAdminAccess) {
                void loadGrants();
            } else {
                setGrants([]);
            }
        }
    }, [isAuthenticated, canAccessAdminPortal, canLoadUsers, canManageInvites, canViewAdminAccess, loadUsers, loadInvites, loadGrants]);

    const handleResendInvite = async (email: string) => {
        try {
            await api.resendInvite(email);
            alert(`Invitation resent to ${email}`);
        } catch (err) {
            console.error('Failed to resend invite:', err);
            alert('Failed to resend invitation');
        }
    };

    const handleInviteUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsInviting(true);
        const emailsToInvite = inviteForm.emails.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);

        if (emailsToInvite.length === 0) {
            alert("Please enter at least one email address.");
            setIsInviting(false);
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const email of emailsToInvite) {
            try {
                await api.inviteUser({ email, role: inviteForm.role as 'volunteer' | 'team_lead' | 'admin' });
                successCount++;
            } catch (err) {
                console.error(`Failed to invite ${email}:`, err);
                failCount++;
            }
        }

        setIsInviting(false);
        setInviteForm({ emails: '', role: 'volunteer' });
        loadInvites();

        if (failCount === 0) {
            alert(`Successfully invited ${successCount} user(s).`);
            setShowInviteModal(false);
        } else {
            alert(`Invited ${successCount} users. Failed to invite ${failCount} users. Check console for details.`);
        }
    };

    const handleRevokeInvite = async (email: string) => {
        if (!window.confirm(`Are you sure you want to revoke the invitation for ${email}?`)) return;
        try {
            await api.revokeInvite(email);
            loadInvites();
        } catch (err) {
            console.error('Failed to revoke invite:', err);
            alert('Failed to revoke invitation');
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            setSaving(true);
            await api.updateUser(userId, { role: newRole as 'volunteer' | 'team_lead' | 'admin' });
            await loadUsers();
            setRoleEditorUser(null);
        } catch (err) {
            console.error('Failed to update role:', err);
            alert('Failed to update user role');
        } finally {
            setSaving(false);
        }
    };

    const handleStatusChange = async (userId: string, isActive: boolean) => {
        try {
            setSaving(true);
            await api.updateUser(userId, { is_active: isActive });
            await loadUsers();
        } catch (err) {
            console.error('Failed to update status:', err);
            alert('Failed to update user status');
        } finally {
            setSaving(false);
        }
    };

    const openUserProfileEditor = (user: User) => {
        setProfileEditorUser(user);
        setProfileForm({
            name: user.name,
            team: user.team ?? '',
        });
    };

    const closeUserProfileEditor = () => {
        setProfileEditorUser(null);
        setProfileForm({ name: '', team: '' });
    };

    const handleSaveUserProfile = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!profileEditorUser) return;

        const trimmedName = profileForm.name.trim();
        if (trimmedName.length < 2) {
            alert('Please enter a full name with at least 2 characters.');
            return;
        }

        try {
            setSaving(true);
            await api.updateUser(profileEditorUser.id, {
                name: trimmedName,
                team: profileForm.team.trim(),
            });
            await loadUsers();
            closeUserProfileEditor();
        } catch (err) {
            console.error('Failed to update user profile:', err);
            alert(err instanceof Error ? err.message : 'Failed to update user profile');
        } finally {
            setSaving(false);
        }
    };

    const openGrantModal = () => {
        const defaultUser = users.find((user) => user.role !== 'admin' && user.is_active);
        setGrantForm({
            userId: defaultUser?.id ?? '',
            scopes: grantableScopeOptions[0] ? [grantableScopeOptions[0].scope] : [],
            note: '',
            expiresAt: '',
        });
        setShowGrantModal(true);
    };

    const toggleGrantScope = (scope: AdminAccessScope) => {
        setGrantForm((current) => ({
            ...current,
            scopes: current.scopes.includes(scope)
                ? current.scopes.filter((existingScope) => existingScope !== scope)
                : [...current.scopes, scope],
        }));
    };

    const handleSaveGrant = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!grantForm.userId || grantForm.scopes.length === 0) {
            alert('Choose a user and at least one admin scope.');
            return;
        }

        try {
            setIsSavingGrant(true);
            await api.createAdminAccessGrant({
                user_id: grantForm.userId,
                scopes: grantForm.scopes,
                note: grantForm.note || null,
                expires_at: grantForm.expiresAt ? new Date(grantForm.expiresAt).toISOString() : null,
            });
            setShowGrantModal(false);
            await loadGrants();
            await loadUsers();
        } catch (err) {
            console.error('Failed to save delegated admin access:', err);
            alert(err instanceof Error ? err.message : 'Failed to save delegated admin access');
        } finally {
            setIsSavingGrant(false);
        }
    };

    const handleRevokeGrant = async (grantId: string) => {
        if (!window.confirm('Revoke this delegated admin access grant?')) return;
        try {
            await api.revokeAdminAccessGrant(grantId);
            await loadGrants();
            await loadUsers();
        } catch (err) {
            console.error('Failed to revoke delegated admin access:', err);
            alert(err instanceof Error ? err.message : 'Failed to revoke delegated admin access');
        }
    };

    const filteredUsers = users.filter(user => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            user.name.toLowerCase().includes(term) ||
            user.email.toLowerCase().includes(term) ||
            (user.team && user.team.toLowerCase().includes(term))
        );
    });

    const hasActiveFilters = Boolean(searchTerm || roleFilter || statusFilter);

    if (authLoading || !isAuthenticated || !canAccessAdminPortal || (!canViewUsers && !canManageInvites && !canViewAdminAccess)) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)' }}>
                <LoadingSpinner size={50} />
            </div>
        );
    }

    return (
        <div className="page-wrapper" style={{ background: 'var(--color-bg-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <main id="main-content" className="main-content" style={{ flex: 1 }}>
                <div className="container" style={{ padding: '2.5rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '2.5rem' }}>
                        <button 
                            onClick={() => navigate('/dashboard')} 
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', padding: 0 }}
                            className="hover-opacity"
                        >
                            <ChevronLeft size={16} /> Back to Dashboard
                        </button>
                        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '0.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#334155' }}>
                                <Users size={28} />
                            </div>
                            Manage Users
                        </h1>
                        <p style={{ color: '#64748b', margin: 0, fontSize: '1.05rem', maxWidth: '600px' }}>
                            {isAdmin
                                ? 'View the team directory, delegate admin access, and manage system access.'
                                : canManageAdminAccess
                                    ? 'Review and manage delegated access alongside the admin areas assigned to you.'
                                    : canManageUsers
                                        ? 'Manage user details using the exact admin scopes granted to you.'
                                        : canViewAdminAccess
                                            ? 'Review delegated access grants and the access areas assigned across the portal.'
                                            : 'View the directory and the areas you were delegated to handle.'}
                        </p>
                    </div>

                    {canViewUsers && (
                    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)', padding: '1.5rem', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.01em' }}>All Users ({filteredUsers.length})</h2>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)} style={{ color: showFilters ? 'var(--color-primary-gold)' : '#64748b' }}>
                                    <ListFilter size={16} style={{ marginRight: '0.4rem' }} /> Filters
                                </Button>
                                <Button variant="ghost" size="sm" onClick={loadUsers}>
                                    <RefreshCw size={16} />
                                </Button>
                            </div>
                        </div>

                        {showFilters && (
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '1.25rem', background: '#f8fafc', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #e2e8f0', animation: 'slideDown 0.3s ease-out' }}>
                                <div style={{ flex: '1 1 250px' }}>
                                    <label className="form-label" htmlFor={searchInputId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Search Directory</label>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                        <input
                                            id={searchInputId}
                                            type="text"
                                            className="form-input"
                                            placeholder="Search by name, email, or team..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ paddingLeft: '2.5rem', background: 'white' }}
                                        />
                                    </div>
                                </div>
                                <div style={{ minWidth: '150px' }}>
                                    <label className="form-label" htmlFor={roleFilterId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Role</label>
                                    <select id={roleFilterId} className="form-select" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setTimeout(loadUsers, 0); }} style={{ background: 'white' }}>
                                        <option value="">All Roles</option>
                                        <option value="volunteer">Volunteer</option>
                                        <option value="team_lead">Team Lead</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div style={{ minWidth: '150px' }}>
                                    <label className="form-label" htmlFor={statusFilterId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Account State</label>
                                    <select id={statusFilterId} className="form-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setTimeout(loadUsers, 0); }} style={{ background: 'white' }}>
                                        <option value="">All Accounts</option>
                                        <option value="active">Enabled</option>
                                        <option value="inactive">Disabled</option>
                                    </select>
                                </div>
                                {hasActiveFilters && (
                                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                        <Button variant="ghost" onClick={() => { setSearchTerm(''); setRoleFilter(''); setStatusFilter(''); setTimeout(loadUsers, 0); }}>
                                            Clear Filters
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {isLoading ? (
                            <div style={{ padding: '3rem 0', display: 'flex', justifyContent: 'center' }}>
                                <LoadingSpinner size={32} />
                            </div>
                        ) : filteredUsers.length > 0 ? (
                            <div className="table-wrapper" style={{ margin: '0 -1.5rem -1.5rem', borderRadius: '0 0 16px 16px' }}>
                                <table className="table" style={{ margin: 0 }}>
                                    <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <tr>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>User</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Email</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Role</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Team</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Stats</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Last Login</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Portal Status</th>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map((user) => {
                                            const hasLoggedIn = !user.invited_only && Boolean(user.last_login);
                                            const lastLoginLabel = user.invited_only
                                                ? 'Pending login'
                                                : user.last_login
                                                    ? format(parseISO(user.last_login), 'MMM d, yyyy')
                                                    : 'Never';
                                            const canAdjustUserRole = canManageUserRoles && (isAdmin || user.role !== 'admin');
                                            const canToggleUserStatus = canManageUserStatus && (isAdmin || user.role !== 'admin');
                                            const hasRowActions = canEditUsers || canAdjustUserRole || canToggleUserStatus;

                                            return (
                                            <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} className="hover:bg-slate-50">
                                                <td style={{ padding: '1rem 1.5rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-primary-gold-light, #fef3c7)', color: 'var(--color-primary-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', border: '1px solid rgba(212, 175, 55, 0.2)', flexShrink: 0 }}>
                                                            {getUserInitials(user.name)}
                                                        </div>
                                                        <strong style={{ color: '#0f172a' }}>{user.name}</strong>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem', color: '#475569', fontSize: '0.9rem' }}>{user.email}</td>
                                                <td style={{ padding: '1rem' }}>
                                                    {canAdjustUserRole && roleEditorUser?.id === user.id ? (
                                                        <select className="form-select" value={roleEditorUser.role} onChange={(e) => handleRoleChange(user.id, e.target.value)} disabled={saving} style={{ minWidth: '120px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}>
                                                            <option value="volunteer">Volunteer</option>
                                                            <option value="team_lead">Team Lead</option>
                                                            {isAdmin && <option value="admin">Admin</option>}
                                                        </select>
                                                    ) : (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                            <Badge variant={user.role === 'admin' ? 'reviewed' : 'submitted'}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                                    {user.role === 'admin' && <Shield size={12} style={{ marginRight: '0.25rem' }} />}
                                                                    {user.role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                                                </span>
                                                            </Badge>
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.9rem' }}>{user.team || '—'}</td>
                                                <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
                                                    {user.total_submissions} subs · {user.total_hours.toFixed(1)}h
                                                </td>
                                                <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
                                                    {lastLoginLabel}
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    {!user.is_active ? (
                                                        <span style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                                                            <UserX size={16} /> Inactive
                                                        </span>
                                                    ) : hasLoggedIn ? (
                                                        <span style={{ color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                                                            <UserCheck size={16} /> Active
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                                                            <Mail size={16} /> Pending login
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>
                                                    {hasRowActions ? (
                                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                            {canEditUsers && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => openUserProfileEditor(user)}
                                                                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                                                                >
                                                                    Edit Details
                                                                </Button>
                                                            )}
                                                            {canAdjustUserRole && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => roleEditorUser?.id === user.id ? setRoleEditorUser(null) : setRoleEditorUser(user)}
                                                                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                                                                >
                                                                    {roleEditorUser?.id === user.id ? 'Cancel' : 'Edit Role'}
                                                                </Button>
                                                            )}
                                                            {canToggleUserStatus && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleStatusChange(user.id, !user.is_active)}
                                                                    disabled={saving}
                                                                    style={{ color: user.is_active ? '#dc2626' : '#16a34a', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                                                                >
                                                                    {user.is_active ? 'Deactivate' : 'Activate'}
                                                                </Button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>View only</span>
                                                    )}
                                                </td>
                                            </tr>
                                        )})}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ padding: '2rem' }}>
                                <EmptyState
                                    icon={<Users size={48} />}
                                    title="No Users Found"
                                    description="No users match your current directory filters."
                                />
                            </div>
                        )}
                    </div>
                    )}

                    {canManageInvites && invites.length > 0 && (
                        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)', padding: '1.5rem', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Pending Invites ({invites.length})</h3>
                                <Button size="sm" onClick={() => setShowInviteModal(true)} style={{ boxShadow: '0 2px 8px rgba(212, 175, 55, 0.3)' }}>
                                    <Plus size={16} style={{ marginRight: '0.4rem' }} /> Invite Users
                                </Button>
                            </div>
                            
                            <div className="table-wrapper" style={{ margin: '0 -1.5rem -1.5rem', borderRadius: '0 0 16px 16px' }}>
                                <table className="table" style={{ margin: 0 }}>
                                    <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <tr>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Email</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Role</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Invited By</th>
                                            <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Date</th>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invites.map((invite) => (
                                            <tr key={invite.id || `${invite.email}-${invite.created_at}`} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-slate-50">
                                                <td style={{ padding: '1rem 1.5rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f172a', fontWeight: 600 }}>
                                                        <Mail size={16} style={{ color: '#94a3b8' }} /> {invite.email}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{ display: 'inline-block', padding: '0.35rem 0.65rem', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                        {invite.role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.9rem' }}>{invite.invited_by || 'System'}</td>
                                                <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.9rem' }}>{format(parseISO(invite.created_at), 'MMM d, yyyy')}</td>
                                                <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                        <Button variant="ghost" size="sm" onClick={() => handleResendInvite(invite.email)} style={{ fontSize: '0.8rem' }}>Resend</Button>
                                                        <Button variant="ghost" size="sm" style={{ color: '#dc2626', fontSize: '0.8rem' }} onClick={() => handleRevokeInvite(invite.email)}>Revoke</Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    
                    {canManageInvites && invites.length === 0 && (
                        <div style={{ padding: '2rem', textAlign: 'center', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                            <p style={{ color: '#64748b', margin: '0 0 1rem 0' }}>No pending invitations.</p>
                            <Button onClick={() => setShowInviteModal(true)}>
                                <Plus size={16} style={{ marginRight: '0.4rem' }} /> Invite New Users
                            </Button>
                        </div>
                    )}

                    {canViewAdminAccess && (
                        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)', padding: '1.5rem', marginTop: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#0f172a' }}>Delegated Admin Access</h3>
                                    <p style={{ color: '#64748b', margin: 0, fontSize: '0.9rem' }}>
                                        {canManageAdminAccess
                                            ? 'Grant temporary admin-portal scopes without promoting someone to a full admin role.'
                                            : 'Review current delegated admin grants, scope coverage, and expiry windows.'}
                                    </p>
                                </div>
                                {canManageAdminAccess && (
                                    <Button size="sm" onClick={openGrantModal} disabled={grantableScopeOptions.length === 0}>
                                        <Plus size={16} style={{ marginRight: '0.4rem' }} /> Grant Access
                                    </Button>
                                )}
                            </div>

                            {grants.length > 0 ? (
                                <div className="table-wrapper" style={{ margin: '0 -1.5rem -1.5rem', borderRadius: '0 0 16px 16px' }}>
                                    <table className="table" style={{ margin: 0 }}>
                                        <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <tr>
                                                <th scope="col" style={{ padding: '1rem 1.5rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Delegate</th>
                                                <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Scopes</th>
                                                <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Granted By</th>
                                                <th scope="col" style={{ padding: '1rem', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Expires</th>
                                                <th scope="col" style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {grants.map((grant) => (
                                                <tr key={grant.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-slate-50">
                                                    <td style={{ padding: '1rem 1.5rem' }}>
                                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{grant.user_name}</div>
                                                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{grant.user_email}</div>
                                                    </td>
                                                    <td style={{ padding: '1rem' }}>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                            {grant.scopes.map((scope) => (
                                                                <span key={scope} style={{ display: 'inline-flex', alignItems: 'center', padding: '0.25rem 0.55rem', borderRadius: '999px', background: '#f8fafc', color: '#334155', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #e2e8f0' }}>
                                                                    {formatAdminScopeLabel(scope)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        {grant.note && (
                                                            <div style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>{grant.note}</div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>{grant.granted_by_email}</td>
                                                    <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
                                                        {grant.expires_at ? format(parseISO(grant.expires_at), 'MMM d, yyyy h:mm a') : 'No expiry'}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>
                                                        {canManageAdminAccess ? (
                                                            <Button variant="ghost" size="sm" style={{ color: '#dc2626', fontSize: '0.8rem' }} onClick={() => handleRevokeGrant(grant.id)}>
                                                                Revoke
                                                            </Button>
                                                        ) : (
                                                            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>View only</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div style={{ padding: '1rem 0 0.5rem', color: '#64748b', fontSize: '0.95rem' }}>
                                    No delegated admin access grants are active right now.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
            <Footer />

            {/* Invite Modal */}
            {canManageInvites && showInviteModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', animation: 'fadeIn 0.2s ease-out' }}>
                    <div role="dialog" aria-modal="true" aria-labelledby="invite-users-title" style={{ backgroundColor: 'white', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '500px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 id="invite-users-title" style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Invite New Users</h2>
                            <button type="button" aria-label="Close invite dialog" onClick={() => setShowInviteModal(false)} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex' }} className="hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleInviteUser}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div>
                                    <label className="form-label" htmlFor={inviteEmailsId} style={{ fontWeight: 700, color: '#334155' }}>Email Addresses</label>
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>Enter multiple emails separated by commas or new lines.</p>
                                    <textarea
                                        id={inviteEmailsId}
                                        required
                                        className="form-textarea"
                                        style={{ minHeight: '120px', resize: 'vertical', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1rem' }}
                                        value={inviteForm.emails}
                                        onChange={(e) => setInviteForm({ ...inviteForm, emails: e.target.value })}
                                        placeholder="volunteer@example.com&#10;admin@example.com"
                                    />
                                </div>
                                <div>
                                    <label className="form-label" htmlFor={inviteRoleId} style={{ fontWeight: 700, color: '#334155' }}>Initial Role</label>
                                    <select
                                        id={inviteRoleId}
                                        className="form-input"
                                        style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '0.75rem 1rem' }}
                                        value={inviteForm.role}
                                        onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                                    >
                                        <option value="volunteer">Volunteer</option>
                                        <option value="team_lead">Team Lead</option>
                                        <option value="admin">Administrator</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
                                    <Button type="button" variant="ghost" onClick={() => setShowInviteModal(false)}>Cancel</Button>
                                    <Button type="submit" isLoading={isInviting} style={{ boxShadow: '0 4px 12px rgba(212, 175, 55, 0.3)' }}>Send Invitations</Button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {profileEditorUser && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', animation: 'fadeIn 0.2s ease-out' }}>
                    <div role="dialog" aria-modal="true" aria-labelledby="edit-user-title" style={{ backgroundColor: 'white', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '520px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div>
                                <h2 id="edit-user-title" style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Edit User Details</h2>
                                <p style={{ margin: '0.45rem 0 0', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                    Update the selected user's profile details without changing their access level.
                                </p>
                            </div>
                            <button type="button" aria-label="Close user profile dialog" onClick={closeUserProfileEditor} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex' }} className="hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveUserProfile}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div>
                                    <label className="form-label" htmlFor={editUserNameId} style={{ fontWeight: 700, color: '#334155' }}>Full Name</label>
                                    <input
                                        id={editUserNameId}
                                        className="form-input"
                                        value={profileForm.name}
                                        onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="form-label" htmlFor={editUserTeamId} style={{ fontWeight: 700, color: '#334155' }}>Team</label>
                                    <input
                                        id={editUserTeamId}
                                        className="form-input"
                                        value={profileForm.team}
                                        onChange={(event) => setProfileForm({ ...profileForm, team: event.target.value })}
                                        placeholder="Optional team name"
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
                                    <Button type="button" variant="ghost" onClick={closeUserProfileEditor}>Cancel</Button>
                                    <Button type="submit" isLoading={saving}>Save Details</Button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {canManageAdminAccess && showGrantModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', animation: 'fadeIn 0.2s ease-out' }}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="grant-access-title"
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '20px',
                            width: '100%',
                            maxWidth: '760px',
                            maxHeight: 'min(90vh, 920px)',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', padding: '1.75rem 2rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)' }}>
                            <div>
                                <h2 id="grant-access-title" style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Grant Delegated Admin Access</h2>
                                <p style={{ margin: '0.45rem 0 0', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                    Choose the delegate, select only the admin areas they should handle, and optionally set an expiry.
                                </p>
                            </div>
                            <button type="button" aria-label="Close delegated admin dialog" onClick={() => setShowGrantModal(false)} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex' }} className="hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveGrant} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem 2rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                                <div>
                                    <label className="form-label" htmlFor={grantUserId} style={{ fontWeight: 700, color: '#334155' }}>Delegate User</label>
                                    <select id={grantUserId} className="form-input" value={grantForm.userId} onChange={(event) => setGrantForm({ ...grantForm, userId: event.target.value })}>
                                        <option value="">Select a user...</option>
                                        {users.filter((user) => user.role !== 'admin' && user.is_active).map((user) => (
                                            <option key={user.id} value={user.id}>
                                                {user.name} ({user.email})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label" style={{ fontWeight: 700, color: '#334155' }}>Admin Scopes</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                                        {grantableScopeOptions.map((option) => (
                                            <label key={option.scope} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.9rem', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', minHeight: '100%' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={grantForm.scopes.includes(option.scope)}
                                                    onChange={() => toggleGrantScope(option.scope)}
                                                    style={{ marginTop: '0.2rem', width: '16px', height: '16px', accentColor: 'var(--color-primary-gold)' }}
                                                />
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{option.label}</div>
                                                    <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{option.description}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    {grantableScopeOptions.length === 0 && (
                                        <p style={{ marginTop: '0.75rem', color: '#b45309', fontSize: '0.85rem' }}>
                                            Your current delegated access does not include any grantable scopes.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="form-label" htmlFor={grantExpiryId} style={{ fontWeight: 700, color: '#334155' }}>Expiry</label>
                                    <input
                                        id={grantExpiryId}
                                        type="datetime-local"
                                        className="form-input"
                                        value={grantForm.expiresAt}
                                        onChange={(event) => setGrantForm({ ...grantForm, expiresAt: event.target.value })}
                                    />
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.4rem' }}>Leave empty if this delegated access should stay active until you revoke it.</p>
                                </div>

                                <div>
                                    <label className="form-label" htmlFor={grantNoteId} style={{ fontWeight: 700, color: '#334155' }}>Reason / Note</label>
                                    <textarea
                                        id={grantNoteId}
                                        className="form-textarea"
                                        value={grantForm.note}
                                        onChange={(event) => setGrantForm({ ...grantForm, note: event.target.value })}
                                        rows={3}
                                        placeholder="Example: Covering user support while I am away next week."
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 2rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
                                <Button type="button" variant="ghost" onClick={() => setShowGrantModal(false)}>Cancel</Button>
                                <Button type="submit" isLoading={isSavingGrant} disabled={grantableScopeOptions.length === 0}>Save Access Grant</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
