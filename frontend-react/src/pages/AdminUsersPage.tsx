import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import type { User } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Card, CardHeader, CardTitle, Button, Badge, LoadingSpinner, EmptyState } from '../components/ui';
import { Users, Search, UserCheck, UserX, Shield, ChevronLeft } from 'lucide-react';
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

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !isAdmin)) {
            navigate('/dashboard');
        }
    }, [authLoading, isAuthenticated, isAdmin, navigate]);

    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            loadUsers();
        }
    }, [isAuthenticated, isAdmin]);

    const loadUsers = async () => {
        try {
            setIsLoading(true);
            const params: Record<string, string | boolean | undefined> = {};
            if (roleFilter) params.role = roleFilter;
            if (statusFilter) params.is_active = statusFilter === 'active';

            const data = await api.getAllUsers(params);
            setUsers(data);
        } catch (err) {
            console.error('Failed to load users:', err);
        } finally {
            setIsLoading(false);
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
                </div>
            </main>
            <Footer />
        </div>
    );
}
