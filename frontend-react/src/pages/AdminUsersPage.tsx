import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import type { User } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Card, CardHeader, CardTitle, Button, Badge, LoadingSpinner, EmptyState } from '../components/ui';
import { Users, Search, UserCheck, UserX, Shield, ChevronLeft, Plus, X, Mail } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function AdminUsersPage() {
    const navigate = useNavigate();
    const { isAdmin, isLoading: authLoading, isAuthenticated } = useAuth();

    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [saving, setSaving] = useState(false);

    // Invite State
    const [invites, setInvites] = useState<any[]>([]);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteForm, setInviteForm] = useState({ emails: '', role: 'volunteer' });
    const [isInviting, setIsInviting] = useState(false);

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !isAdmin)) {
            navigate('/dashboard');
        }
    }, [authLoading, isAuthenticated, isAdmin, navigate]);

    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            loadUsers();
            loadInvites();
        }
    }, [isAuthenticated, isAdmin]);

    const loadUsers = async () => {
        try {
            setIsLoading(true);
            const params: Record<string, string | boolean | undefined> = {};
            if (roleFilter) params.role = roleFilter as any;
            if (statusFilter) params.is_active = statusFilter === 'active';

            const data = await api.getAllUsers(params);
            setUsers(data);
        } catch (err) {
            console.error('Failed to load users:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const loadInvites = async () => {
        try {
            const data = await api.getInvites();
            setInvites(data);
        } catch (err) {
            console.error('Failed to load invites:', err);
        }
    };

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

    // ... (rest of the file)

    {/* Invite Modal */ }
    {
        showInviteModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">Invite New Users</h2>
                        <button onClick={() => setShowInviteModal(false)} className="text-gray-400 hover:text-gray-600">
                            <X size={24} />
                        </button>
                    </div>
                    <form onSubmit={handleInviteUser}>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email Addresses</label>
                                <p className="text-xs text-gray-500 mb-2">Enter multiple emails separated by commas or new lines.</p>
                                <textarea
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gold-500 min-h-[100px]"
                                    value={inviteForm.emails}
                                    onChange={(e) => setInviteForm({ ...inviteForm, emails: e.target.value })}
                                    placeholder="volunteer1@example.com&#10;volunteer2@example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gold-500"
                                    value={inviteForm.role}
                                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                                >
                                    <option value="volunteer">Volunteer</option>
                                    <option value="team_lead">Team Lead</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <Button type="button" variant="ghost" onClick={() => setShowInviteModal(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" isLoading={isInviting}>
                                    Send Invites
                                </Button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

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
            setEditingUser(null);
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

    // Filter users by search term
    const filteredUsers = users.filter(user => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            user.name.toLowerCase().includes(term) ||
            user.email.toLowerCase().includes(term) ||
            (user.team && user.team.toLowerCase().includes(term))
        );
    });

    if (authLoading || !isAuthenticated || !isAdmin) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LoadingSpinner size={50} />
            </div>
        );
    }

    return (
        <div className="page-wrapper">
            <Navbar />
            <main className="main-content">
                <div className="container">
                    {/* Header */}
                    <div style={{ marginBottom: '2rem' }}>
                        <Button variant="ghost" onClick={() => navigate('/dashboard')} style={{ marginBottom: '1rem' }}>
                            <ChevronLeft size={18} />
                            Back to Dashboard
                        </Button>
                        <h1 style={{ marginBottom: '0.5rem' }}>
                            <Users size={32} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                            Manage Users
                        </h1>
                        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
                            View all volunteers, change roles, and manage access
                        </p>
                    </div>

                    {/* Filters */}
                    <Card style={{ marginBottom: '1.5rem' }}>
                        <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
                            {/* Search */}
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <label className="form-label">Search</label>
                                <div style={{ position: 'relative' }}>
                                    <Search size={18} style={{
                                        position: 'absolute',
                                        left: '0.75rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: 'var(--color-text-muted)'
                                    }} />
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Search by name, email, or team..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ paddingLeft: '2.5rem' }}
                                    />
                                </div>
                            </div>

                            {/* Role Filter */}
                            <div style={{ minWidth: '150px' }}>
                                <label className="form-label">Role</label>
                                <select
                                    className="form-select"
                                    value={roleFilter}
                                    onChange={(e) => {
                                        setRoleFilter(e.target.value);
                                        setTimeout(loadUsers, 0);
                                    }}
                                >
                                    <option value="">All Roles</option>
                                    <option value="volunteer">Volunteer</option>
                                    <option value="team_lead">Team Lead</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            {/* Status Filter */}
                            <div style={{ minWidth: '150px' }}>
                                <label className="form-label">Status</label>
                                <select
                                    className="form-select"
                                    value={statusFilter}
                                    onChange={(e) => {
                                        setStatusFilter(e.target.value);
                                        setTimeout(loadUsers, 0);
                                    }}
                                >
                                    <option value="">All Status</option>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                        </div>
                    </Card>

                    {/* Users Table */}
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>All Users ({filteredUsers.length})</CardTitle>
                                <Button variant="ghost" size="sm" onClick={loadUsers}>
                                    Refresh
                                </Button>
                            </div>
                        </CardHeader>

                        {isLoading ? (
                            <LoadingSpinner size={40} />
                        ) : filteredUsers.length > 0 ? (
                            <div className="table-wrapper">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Team</th>
                                            <th>Stats</th>
                                            <th>Last Login</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map((user) => (
                                            <tr key={user.id}>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        {user.picture ? (
                                                            <img
                                                                src={user.picture}
                                                                alt={user.name}
                                                                style={{
                                                                    width: 32,
                                                                    height: 32,
                                                                    borderRadius: '50%'
                                                                }}
                                                            />
                                                        ) : (
                                                            <div style={{
                                                                width: 32,
                                                                height: 32,
                                                                borderRadius: '50%',
                                                                background: 'var(--color-primary-gold)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: 'white',
                                                                fontWeight: 600,
                                                                fontSize: '0.875rem'
                                                            }}>
                                                                {user.name.charAt(0)}
                                                            </div>
                                                        )}
                                                        <strong>{user.name}</strong>
                                                    </div>
                                                </td>
                                                <td style={{ fontSize: '0.875rem' }}>{user.email}</td>
                                                <td>
                                                    {editingUser?.id === user.id ? (
                                                        <select
                                                            className="form-select"
                                                            value={editingUser.role}
                                                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                            disabled={saving}
                                                            style={{ minWidth: '120px' }}
                                                        >
                                                            <option value="volunteer">Volunteer</option>
                                                            <option value="team_lead">Team Lead</option>
                                                            <option value="admin">Admin</option>
                                                        </select>
                                                    ) : (
                                                        <Badge variant={user.role === 'admin' ? 'reviewed' : 'submitted'}>
                                                            {user.role === 'admin' && <Shield size={12} style={{ marginRight: '0.25rem' }} />}
                                                            {user.role}
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td>{user.team || '—'}</td>
                                                <td style={{ fontSize: '0.875rem' }}>
                                                    {user.total_submissions} subs · {user.total_hours.toFixed(1)}h
                                                </td>
                                                <td style={{ fontSize: '0.875rem' }}>
                                                    {format(parseISO(user.last_login), 'MMM d, yyyy')}
                                                </td>
                                                <td>
                                                    {user.is_active ? (
                                                        <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <UserCheck size={16} /> Active
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <UserX size={16} /> Inactive
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="flex gap-2">
                                                        {editingUser?.id === user.id ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setEditingUser(null)}
                                                            >
                                                                Cancel
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setEditingUser(user)}
                                                            >
                                                                Edit Role
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleStatusChange(user.id, !user.is_active)}
                                                            disabled={saving}
                                                            style={{
                                                                color: user.is_active ? 'var(--color-error)' : 'var(--color-success)'
                                                            }}
                                                        >
                                                            {user.is_active ? 'Deactivate' : 'Activate'}
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState
                                icon={<Users size={48} />}
                                title="No Users Found"
                                description="No users match your current filters."
                            />
                        )}
                    </Card>

                    {/* Pending Invites */}
                    <Card style={{ marginTop: '2rem' }}>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Pending Invites ({invites.length})</CardTitle>
                                <Button size="sm" onClick={() => setShowInviteModal(true)}>
                                    <Plus size={16} className="mr-1" />
                                    Invite User
                                </Button>
                            </div>
                        </CardHeader>
                        {invites.length > 0 ? (
                            <div className="table-wrapper">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Invited By</th>
                                            <th>Date</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invites.map((invite) => (
                                            <tr key={invite._id || invite.id}>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <Mail size={16} style={{ color: '#9ca3af' }} />
                                                        {invite.email}
                                                    </div>
                                                </td>
                                                <td>
                                                    <Badge variant="default">{invite.role}</Badge>
                                                </td>
                                                <td style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                                                    {invite.invited_by || 'System'}
                                                </td>
                                                <td style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                                                    {format(parseISO(invite.created_at), 'MMM d, yyyy')}
                                                </td>
                                                <td>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleResendInvite(invite.email)}
                                                        >
                                                            Resend
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            style={{ color: '#dc2626' }}
                                                            onClick={() => handleRevokeInvite(invite.email)}
                                                        >
                                                            Revoke
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-8 text-center text-gray-500">
                                No pending invitations.
                            </div>
                        )}
                    </Card>
                </div>
            </main >
            <Footer />

            {/* Invite Modal */}
            {
                showInviteModal && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '1rem'
                    }}>
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: 'var(--radius-lg)',
                            padding: '1.5rem',
                            width: '100%',
                            maxWidth: '500px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Invite New Users</h2>
                                <button
                                    onClick={() => setShowInviteModal(false)}
                                    style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                >
                                    <X size={24} />
                                </button>
                            </div>
                            <form onSubmit={handleInviteUser}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div>
                                        <label className="form-label">Email Addresses</label>
                                        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                                            Enter multiple emails separated by commas or new lines.
                                        </p>
                                        <textarea
                                            required
                                            className="form-textarea"
                                            style={{ minHeight: '100px', resize: 'vertical' }}
                                            value={inviteForm.emails}
                                            onChange={(e) => setInviteForm({ ...inviteForm, emails: e.target.value })}
                                            placeholder="volunteer1@example.com&#10;volunteer2@example.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">Role</label>
                                        <select
                                            className="form-input"
                                            value={inviteForm.role}
                                            onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                                        >
                                            <option value="volunteer">Volunteer</option>
                                            <option value="team_lead">Team Lead</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                                        <Button type="button" variant="ghost" onClick={() => setShowInviteModal(false)}>
                                            Cancel
                                        </Button>
                                        <Button type="submit" isLoading={isInviting}>
                                            Send Invites
                                        </Button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div>
    );
}
