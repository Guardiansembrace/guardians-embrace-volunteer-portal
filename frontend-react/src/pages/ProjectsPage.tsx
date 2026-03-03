import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Project, User, ProjectCreate } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Button, LoadingSpinner, EmptyState, Input, Textarea } from '../components/ui';
import { Logo } from '../components/Logo';
import { useAuth } from '../lib/AuthContext';
import { Search, Mail, Plus, Users, X, Filter, Edit2, Trash2, Upload, Image as ImageIcon } from 'lucide-react';

export default function ProjectsPage() {
    const { isAdmin } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Create/Edit Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [projectForm, setProjectForm] = useState<Partial<ProjectCreate>>({ name: '', description: '', status: 'planned', member_ids: [] });
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [projectsData, usersData] = await Promise.all([
                api.getProjects(),
                api.getAllUsers()
            ]);
            setProjects(projectsData);
            setUsers(usersData);
        } catch (error) {
            console.error('Failed to load data', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const result = await api.uploadProjectImage(file);
            setProjectForm(prev => ({ ...prev, banner_image: result.url }));
        } catch (error) {
            console.error('Failed to upload image', error);
            alert('Failed to upload image');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveProject = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const payload = {
                ...projectForm,
                // Ensure empty strings are undefined for optional fields
                lead_id: projectForm.lead_id || undefined
            };

            if (editingProject) {
                await api.updateProject(editingProject.id, payload as Partial<ProjectCreate>);
            } else {
                await api.createProject(payload as ProjectCreate);
            }
            closeModal();
            loadData();
        } catch (error) {
            console.error('Failed to save project', error);
            alert('Failed to save project. Please check your inputs.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;
        try {
            await api.deleteProject(projectId);
            loadData();
        } catch (error) {
            console.error('Failed to delete project', error);
            alert('Failed to delete project.');
        }
    };

    const openCreateModal = () => {
        setEditingProject(null);
        setProjectForm({ name: '', description: '', status: 'planned', member_ids: [] });
        setShowCreateModal(true);
    };

    const openEditModal = (project: Project) => {
        setEditingProject(project);
        setProjectForm({
            name: project.name,
            description: project.description,
            status: project.status,
            banner_image: project.banner_image,
            lead_id: project.lead?.id,
            member_ids: project.members.map(m => m.id)
        });
        setShowCreateModal(true);
    };

    const closeModal = () => {
        setShowCreateModal(false);
        setEditingProject(null);
        setProjectForm({ name: '', description: '', status: 'planned', member_ids: [] });
    };

    const filteredProjects = projects.filter(p => {
        const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    return (
        <div className="page-wrapper">
            <Navbar />
            <main className="main-content">
                <div className="container">
                    <div className="flex-between" style={{ marginBottom: '2rem' }}>
                        <div>
                            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>Our Projects</h1>
                            <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '1.1rem' }}>Explore the initiatives our team is working on to make a difference.</p>
                        </div>
                        {isAdmin && (
                            <Button onClick={openCreateModal}>
                                <Plus size={18} style={{ marginRight: '0.5rem' }} />
                                New Project
                            </Button>
                        )}
                    </div>

                    {/* Filters */}
                    <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem', padding: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
                            <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} size={18} />
                            <input
                                type="text"
                                placeholder="Search projects..."
                                style={{ width: '100%', padding: '0.5rem 1rem 0.5rem 2.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {['all', 'active', 'completed', 'on_hold', 'planned'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: '999px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        backgroundColor: filterStatus === status ? 'var(--color-dark-bg)' : 'transparent',
                                        color: filterStatus === status ? 'var(--color-primary-gold)' : 'var(--color-text-secondary)',
                                        boxShadow: filterStatus === status ? 'var(--shadow-sm)' : 'none',
                                    }}
                                >
                                    {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center py-20">
                            <LoadingSpinner size={40} />
                        </div>
                    ) : filteredProjects.length > 0 ? (
                        <div className="projects-grid">
                            {filteredProjects.map(project => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    isAdmin={isAdmin}
                                    onEdit={() => openEditModal(project)}
                                    onDelete={() => handleDeleteProject(project.id)}
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            icon={<Filter size={48} />}
                            title="No projects found"
                            description="Try adjusting your search or filters."
                        />
                    )}
                </div>
            </main>
            <Footer />

            {/* Create Project Modal - (Keep existing modal code essentially same but check if it uses broken tailwind) */}
            {/* The modal uses style={{...}} mostly, so it should be fine. */}
            {/* I will only replace the ProjectCard component below. */}

            {showCreateModal && (
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
                        borderRadius: '0.5rem',
                        padding: '1.5rem',
                        width: '100%',
                        maxWidth: '28rem',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{editingProject ? 'Edit Project' : 'Create New Project'}</h2>
                            <button onClick={closeModal} style={{ color: '#9ca3af', cursor: 'pointer', border: 'none', background: 'none' }}>
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveProject}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Image Upload */}
                                <div style={{ marginBottom: '0.5rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>Project Banner</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        {projectForm.banner_image ? (
                                            <div style={{ position: 'relative', width: '6rem', height: '4rem', borderRadius: '0.375rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                                                <img src={projectForm.banner_image} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                <button
                                                    type="button"
                                                    onClick={() => setProjectForm({ ...projectForm, banner_image: undefined })}
                                                    style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', cursor: 'pointer', padding: '0.125rem' }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ width: '6rem', height: '4rem', borderRadius: '0.375rem', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #d1d5db' }}>
                                                <ImageIcon size={20} className="text-gray-400" />
                                            </div>
                                        )}

                                        <div style={{ flex: 1 }}>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                id="banner-upload"
                                                style={{ display: 'none' }}
                                                onChange={handleImageUpload}
                                                disabled={isUploading}
                                            />
                                            <label
                                                htmlFor="banner-upload"
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    padding: '0.5rem 1rem',
                                                    backgroundColor: 'white',
                                                    border: '1px solid #d1d5db',
                                                    borderRadius: '0.375rem',
                                                    fontSize: '0.875rem',
                                                    fontWeight: 500,
                                                    color: '#374151',
                                                    cursor: isUploading ? 'not-allowed' : 'pointer',
                                                    opacity: isUploading ? 0.7 : 1
                                                }}
                                            >
                                                {isUploading ? <LoadingSpinner size={16} /> : <Upload size={16} />}
                                                <span style={{ marginLeft: '0.5rem' }}>{isUploading ? 'Uploading...' : 'Upload Image'}</span>
                                            </label>
                                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>JPG, PNG up to 5MB</p>
                                        </div>
                                    </div>
                                </div>

                                <Input
                                    label="Project Name"
                                    value={projectForm.name || ''}
                                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                                    required
                                />

                                {editingProject && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>Status</label>
                                        <select
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                border: '1px solid #d1d5db',
                                                borderRadius: '0.375rem',
                                                outline: 'none'
                                            }}
                                            value={projectForm.status}
                                            onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value as any })}
                                        >
                                            <option value="planned">Planned</option>
                                            <option value="active">Active</option>
                                            <option value="on_hold">On Hold</option>
                                            <option value="completed">Completed</option>
                                        </select>
                                    </div>
                                )}

                                {/* Project Lead */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>Project Lead</label>
                                    <select
                                        style={{
                                            width: '100%',
                                            padding: '0.5rem 0.75rem',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '0.375rem',
                                            outline: 'none'
                                        }}
                                        value={projectForm.lead_id || ''}
                                        onChange={(e) => setProjectForm({ ...projectForm, lead_id: e.target.value || undefined })}
                                    >
                                        <option value="">Select a lead...</option>
                                        {users.map(user => (
                                            <option key={user.id} value={user.id}>{user.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Team Members */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>Team Members</label>
                                    <div style={{
                                        maxHeight: '150px',
                                        overflowY: 'auto',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '0.375rem',
                                        padding: '0.5rem',
                                        backgroundColor: '#f9fafb'
                                    }}>
                                        {users.length > 0 ? users.map(user => (
                                            <div key={user.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <input
                                                    type="checkbox"
                                                    id={`member-${user.id}`}
                                                    checked={(projectForm.member_ids || []).includes(user.id)}
                                                    onChange={(e) => {
                                                        const currentMembers = projectForm.member_ids || [];
                                                        const newMembers = e.target.checked
                                                            ? [...currentMembers, user.id]
                                                            : currentMembers.filter(id => id !== user.id);
                                                        setProjectForm({ ...projectForm, member_ids: newMembers });
                                                    }}
                                                    style={{ marginRight: '0.5rem', width: '16px', height: '16px' }}
                                                />
                                                <label htmlFor={`member-${user.id}`} style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                                                    {user.name} <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>({user.email})</span>
                                                </label>
                                            </div>
                                        )) : (
                                            <div style={{ color: '#6b7280', fontSize: '0.875rem', fontStyle: 'italic' }}>No users found</div>
                                        )}
                                    </div>
                                </div>


                                <Textarea
                                    label="Description"
                                    value={projectForm.description || ''}
                                    onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                                    required
                                    rows={4}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                                    <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
                                    <Button type="submit" isLoading={isSaving}>
                                        {editingProject ? 'Save Changes' : 'Create Project'}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

interface ProjectCardProps {
    project: Project;
    isAdmin: boolean;
    onEdit: () => void;
    onDelete: () => void;
}

function ProjectCard({ project, isAdmin, onEdit, onDelete }: ProjectCardProps) {
    return (
        <div className="project-card">
            <div className="project-header">
                {project.banner_image ? (
                    <img src={project.banner_image} alt={project.name} className="project-image" />
                ) : (
                    <div className="project-placeholder">
                        <Logo size={60} style={{ opacity: 0.5, filter: 'grayscale(100%)' }} />
                    </div>
                )}

                <div className="project-status">
                    <StatusBadge status={project.status} />
                </div>

                {isAdmin && (
                    <div className="project-actions">
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="action-btn"
                            title="Edit Project"
                        >
                            <Edit2 size={16} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="action-btn delete"
                            title="Delete Project"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                )}
            </div>

            <div className="project-body">
                <h3 className="project-title">{project.name}</h3>
                <p className="project-description">{project.description}</p>

                <div className="project-footer">
                    <div className="team-header">
                        <span className="team-label">Team</span>
                        {project.lead && (
                            <span className="team-lead">Lead: {project.lead.name}</span>
                        )}
                    </div>

                    <div className="avatar-stack">
                        {project.members.length > 0 ? (
                            project.members.slice(0, 5).map((member) => (
                                <div key={member.id} className="avatar-stack-item">
                                    <UserAvatar user={member} />
                                </div>
                            ))
                        ) : (
                            <span className="text-sm text-gray-400 italic">No members yet</span>
                        )}
                        {project.members.length > 5 && (
                            <div className="avatar-more">
                                +{project.members.length - 5}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    // Note: Reusing Tailwind classes for Badge for now since they might be supported or I need to fix them too.
    // Actually common color util classes like bg-green-100 are likely NOT in index.css.
    // I should convert this to inline styles or custom classes.

    const colors: Record<string, { bg: string, text: string, border: string }> = {
        active: { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0' },
        completed: { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
        on_hold: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
        planned: { bg: '#f3f4f6', text: '#1f2937', border: '#e5e7eb' },
    };

    const style = colors[status] || colors.planned;
    const label = status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    return (
        <span
            className="badge"
            style={{
                backgroundColor: style.bg,
                color: style.text,
                borderColor: style.border,
                borderWidth: '1px',
                borderStyle: 'solid'
            }}
        >
            {label}
        </span>
    );
}

function UserAvatar({ user }: { user: User }) {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            {user.picture ? (
                <img
                    src={user.picture}
                    alt={user.name}
                    style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        cursor: 'pointer'
                    }}
                />
            ) : (
                <div style={{
                    width: '2rem',
                    height: '2rem',
                    borderRadius: '50%',
                    backgroundColor: '#e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: '#4b5563',
                    cursor: 'pointer'
                }}>
                    {user.name.charAt(0)}
                </div>
            )}

            {/* Hover Card */}
            {showTooltip && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: '0.5rem',
                    width: '16rem',
                    backgroundColor: 'white',
                    borderRadius: '0.5rem',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: '1px solid #e5e7eb',
                    padding: '1rem',
                    zIndex: 50
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
                            {user.picture ? (
                                <img src={user.picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', color: '#9ca3af' }}>
                                    {user.name.charAt(0)}
                                </div>
                            )}
                        </div>
                        <div>
                            <h4 style={{ fontWeight: 700, color: '#111827' }}>{user.name}</h4>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'capitalize' }}>{user.role?.replace('_', ' ') || 'Volunteer'}</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
                            <Mail size={14} />
                            <a href={`mailto:${user.email}`} style={{ textDecoration: 'none', color: 'inherit' }}>{user.email}</a>
                        </div>
                        {user.team && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
                                <Users size={14} />
                                <span>{user.team}</span>
                            </div>
                        )}

                        <a
                            href={`mailto:${user.email}`}
                            style={{
                                display: 'block',
                                marginTop: '0.75rem',
                                width: '100%',
                                textAlign: 'center',
                                backgroundColor: '#111827',
                                color: 'white',
                                padding: '0.375rem 0',
                                borderRadius: '0.25rem',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                textDecoration: 'none'
                            }}
                        >
                            Contact
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
