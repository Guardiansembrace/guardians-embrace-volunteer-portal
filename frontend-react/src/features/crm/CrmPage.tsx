import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
    Activity,
    Building2,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    Circle,
    Clock3,
    ContactRound,
    Mail,
    MessageSquareText,
    Phone,
    Plus,
    RefreshCw,
    Search,
    Sparkles,
    Tag,
    Workflow,
    Users,
    X,
} from 'lucide-react';
import { Navbar, Footer } from '../../components/Layout';
import { Button, LoadingSpinner } from '../../components/ui';
import { api } from '../../lib/api';
import type {
    CRMContact,
    CRMContactCreate,
    CRMContactDetail,
    CRMDashboard,
    CRMNote,
    CRMOrganization,
    CRMOrganizationCreate,
    CRMPipelineItem,
    CRMTask,
} from '../../lib/api';
import './crm.css';

type CrmView = 'contacts' | 'organizations' | 'tasks';
type RecordTab = 'overview' | 'activity';

const DEFAULT_DASHBOARD: CRMDashboard = {
    status: {
        configured: false,
        provider: 'espocrm',
        message: 'Set ESPOCRM_SITE_URL and ESPOCRM_API_KEY to connect the open-source CRM backend.',
    },
    contacts: [],
    organizations: [],
    tasks: [],
    pipeline: [],
    totals: {},
};

function getStageClass(stage: string) {
    return stage.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    return parts.map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function formatRelativeDate(value: string) {
    if (!value) return 'No activity';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function CrmPage() {
    const [query, setQuery] = useState('');
    const [activeView, setActiveView] = useState<CrmView>('contacts');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [dashboard, setDashboard] = useState<CRMDashboard>(DEFAULT_DASHBOARD);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [recordTab, setRecordTab] = useState<RecordTab>('overview');
    const [contactDetail, setContactDetail] = useState<CRMContactDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [modal, setModal] = useState<null | 'contact' | 'organization' | 'task'>(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const [newContact, setNewContact] = useState({ first_name: '', last_name: '', email: '', phone: '', role: '' });
    const [newOrg, setNewOrg] = useState({ name: '', type: '', email: '', phone: '' });
    const [newTask, setNewTask] = useState({ title: '', due: '' });
    const [noteText, setNoteText] = useState('');

    const configured = dashboard.status.configured;

    const loadDashboard = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await api.getCRMDashboard();
            setDashboard(result);
            setSelectedId((currentId) => {
                if (currentId && result.contacts.some((contact) => contact.id === currentId)) {
                    return currentId;
                }
                return result.contacts[0]?.id ?? null;
            });
        } catch (err) {
            setDashboard(DEFAULT_DASHBOARD);
            setError(err instanceof Error ? err.message : 'Could not load CRM data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadDashboard();
    }, [loadDashboard]);

    // Load the selected contact's activity stream.
    useEffect(() => {
        if (!selectedId || !configured) {
            setContactDetail(null);
            return;
        }
        let cancelled = false;
        setDetailLoading(true);
        api.getCRMContactDetail(selectedId)
            .then((detail) => { if (!cancelled) setContactDetail(detail); })
            .catch(() => { if (!cancelled) setContactDetail(null); })
            .finally(() => { if (!cancelled) setDetailLoading(false); });
        return () => { cancelled = true; };
    }, [selectedId, configured]);

    const refreshDetail = useCallback(async () => {
        if (!selectedId) return;
        try {
            setContactDetail(await api.getCRMContactDetail(selectedId));
        } catch {
            /* keep prior detail */
        }
    }, [selectedId]);

    const openModal = (which: 'contact' | 'organization' | 'task') => {
        setActionError(null);
        if (which === 'contact') setNewContact({ first_name: '', last_name: '', email: '', phone: '', role: '' });
        if (which === 'organization') setNewOrg({ name: '', type: '', email: '', phone: '' });
        if (which === 'task') setNewTask({ title: '', due: '' });
        setModal(which);
    };

    const handleCreateContact = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setActionError(null);
        try {
            const payload: CRMContactCreate = {
                first_name: newContact.first_name.trim(),
                last_name: newContact.last_name.trim(),
                email: newContact.email.trim() || undefined,
                phone: newContact.phone.trim() || undefined,
                role: newContact.role.trim() || undefined,
            };
            const created = await api.createCRMContact(payload);
            setModal(null);
            await loadDashboard();
            setActiveView('contacts');
            setSelectedId(created.id);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not create contact');
        } finally {
            setBusy(false);
        }
    };

    const handleCreateOrganization = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setActionError(null);
        try {
            const payload: CRMOrganizationCreate = {
                name: newOrg.name.trim(),
                type: newOrg.type.trim() || undefined,
                email: newOrg.email.trim() || undefined,
                phone: newOrg.phone.trim() || undefined,
            };
            await api.createCRMOrganization(payload);
            setModal(null);
            await loadDashboard();
            setActiveView('organizations');
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not create organization');
        } finally {
            setBusy(false);
        }
    };

    const handleCreateTask = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setActionError(null);
        try {
            await api.createCRMTask({
                title: newTask.title.trim(),
                due: newTask.due || undefined,
                contact_id: selectedId ?? undefined,
            });
            setModal(null);
            await loadDashboard();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not create task');
        } finally {
            setBusy(false);
        }
    };

    const handleAddNote = async () => {
        if (!selectedId || !noteText.trim()) return;
        setBusy(true);
        try {
            await api.addCRMContactNote(selectedId, noteText.trim());
            setNoteText('');
            await refreshDetail();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not add note');
        } finally {
            setBusy(false);
        }
    };

    const handleToggleTask = async (task: CRMTask) => {
        try {
            await api.updateCRMTask(task.id, { done: !task.done });
            await loadDashboard();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not update task');
        }
    };

    const filteredContacts = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return dashboard.contacts;
        return dashboard.contacts.filter((contact) => [
            contact.name, contact.role, contact.organization, contact.email, contact.stage, contact.owner, ...contact.tags,
        ].join(' ').toLowerCase().includes(normalizedQuery));
    }, [dashboard.contacts, query]);

    const filteredOrganizations = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return dashboard.organizations;
        return dashboard.organizations.filter((org) => [
            org.name, org.type, org.email, org.owner,
        ].join(' ').toLowerCase().includes(normalizedQuery));
    }, [dashboard.organizations, query]);

    const filteredTasks = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return dashboard.tasks;
        return dashboard.tasks.filter((task) => [
            task.title, task.status, task.owner, task.related_name,
        ].join(' ').toLowerCase().includes(normalizedQuery));
    }, [dashboard.tasks, query]);

    const selectedContact = dashboard.contacts.find((contact) => contact.id === selectedId) ?? filteredContacts[0] ?? null;
    const pipeline = dashboard.pipeline.length > 0 ? dashboard.pipeline : buildPipelineFromContacts(dashboard.contacts);
    const contactTasks = selectedContact
        ? dashboard.tasks.filter((task) => task.related_name && selectedContact.name && task.related_name === selectedContact.name)
        : [];
    const todayTasks = (contactTasks.length > 0 ? contactTasks : dashboard.tasks).slice(0, 5);
    const followUps = dashboard.totals.follow_ups ?? dashboard.tasks.filter((task) => !task.done).length;

    const navItems: { view: CrmView; icon: ReactNode; label: string; count: number }[] = [
        { view: 'contacts', icon: <Users size={16} />, label: 'Contacts', count: dashboard.contacts.length },
        { view: 'organizations', icon: <Building2 size={16} />, label: 'Organizations', count: dashboard.organizations.length },
        { view: 'tasks', icon: <CheckCircle2 size={16} />, label: 'Tasks', count: dashboard.tasks.length },
    ];

    const primaryAction = activeView === 'organizations'
        ? { label: 'New organization', onClick: () => openModal('organization') }
        : activeView === 'tasks'
            ? { label: 'New task', onClick: () => openModal('task') }
            : { label: 'New contact', onClick: () => openModal('contact') };

    return (
        <div className="page-wrapper crm-page">
            <Navbar />
            <main id="main-content" className="main-content crm-main">
                <div className="crm-shell">
                    <aside className="crm-sidebar" aria-label="CRM objects">
                        <div className="crm-product-mark">
                            <div className="crm-product-icon"><ContactRound size={18} /></div>
                            <div>
                                <h1>Relationships</h1>
                                <p>EspoCRM open-source backend</p>
                            </div>
                        </div>

                        <nav className="crm-object-nav" aria-label="CRM navigation">
                            {navItems.map((item) => (
                                <button
                                    key={item.view}
                                    type="button"
                                    className={`crm-object-link ${activeView === item.view ? 'active' : ''}`}
                                    aria-current={activeView === item.view ? 'page' : undefined}
                                    onClick={() => { setActiveView(item.view); setQuery(''); }}
                                >
                                    {item.icon} {item.label}
                                    {item.count > 0 && <span className="crm-object-count">{item.count}</span>}
                                </button>
                            ))}
                        </nav>

                        <div className={`crm-sync-card ${configured ? '' : 'needs-setup'}`}>
                            <div className="crm-sync-row">
                                <span className="crm-sync-dot" />
                                <span>{configured ? 'EspoCRM connected' : 'EspoCRM setup needed'}</span>
                            </div>
                            <p>{dashboard.status.message}</p>
                        </div>
                    </aside>

                    <section className="crm-workspace" aria-label="CRM workspace">
                        <div className="crm-toolbar">
                            <div>
                                <p className="crm-eyebrow">EspoCRM powered</p>
                                <h2>{activeView === 'contacts' ? 'Relationship workspace' : activeView === 'organizations' ? 'Organizations' : 'Tasks &amp; follow-ups'}</h2>
                            </div>
                            <div className="crm-toolbar-actions">
                                <div className="crm-source-pill">
                                    <Workflow size={15} />
                                    Open-source CRM
                                </div>
                                <button className="crm-icon-button" type="button" aria-label="Refresh CRM data" title="Refresh CRM data" onClick={loadDashboard}>
                                    <RefreshCw size={17} />
                                </button>
                                <Button variant="primary" disabled={!configured} onClick={primaryAction.onClick}>
                                    <Plus size={16} />
                                    {primaryAction.label}
                                </Button>
                            </div>
                        </div>

                        {!configured && !isLoading && (
                            <div className="crm-setup-banner">
                                <div>
                                    <strong>Connect EspoCRM to turn this workspace on</strong>
                                    <p>Run EspoCRM separately, create an API user, then set `ESPOCRM_SITE_URL` and `ESPOCRM_API_KEY` in the backend environment.</p>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="crm-error-banner">
                                <strong>CRM sync failed</strong>
                                <p>{error}</p>
                            </div>
                        )}

                        <div className="crm-summary-grid">
                            <MetricCard label="Relationships" value={dashboard.totals.relationships ?? dashboard.contacts.length} helper={configured ? 'From EspoCRM Contacts' : 'Awaiting connection'} />
                            <MetricCard label="Follow-ups" value={followUps} helper={configured ? 'Open EspoCRM Tasks' : 'No CRM tasks loaded'} tone="warning" />
                            <MetricCard label="Partners" value={dashboard.totals.partners ?? dashboard.organizations.length} helper={configured ? 'From EspoCRM Accounts' : 'Awaiting connection'} tone="success" />
                        </div>

                        {isLoading ? (
                            <div className="crm-loading-panel">
                                <LoadingSpinner size={34} />
                            </div>
                        ) : activeView === 'contacts' ? (
                            <div className="crm-content-grid">
                                <section className="crm-list-panel" aria-label="Contacts">
                                    <div className="crm-search-row">
                                        <div className="crm-search">
                                            <Search size={16} />
                                            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts" aria-label="Search contacts" />
                                        </div>
                                        <button type="button" className="crm-view-tab active">People</button>
                                        <button type="button" className="crm-view-tab" onClick={() => { setActiveView('organizations'); setQuery(''); }}>Companies</button>
                                    </div>

                                    <div className="crm-contact-list">
                                        {filteredContacts.length > 0 ? (
                                            filteredContacts.map((contact) => (
                                                <ContactRow
                                                    key={contact.id}
                                                    contact={contact}
                                                    active={selectedContact?.id === contact.id}
                                                    onSelect={() => { setSelectedId(contact.id); setRecordTab('overview'); }}
                                                />
                                            ))
                                        ) : (
                                            <EmptyPanel icon={<ContactRound size={28} />} title="No contacts found" body={configured ? 'Try a different search or add a contact.' : 'CRM records will appear here after EspoCRM is connected.'} />
                                        )}
                                    </div>
                                </section>

                                {selectedContact ? (
                                    <ContactDetail
                                        contact={selectedContact}
                                        pipeline={pipeline}
                                        tasks={todayTasks}
                                        activity={contactDetail?.activity ?? []}
                                        detailLoading={detailLoading}
                                        recordTab={recordTab}
                                        onRecordTab={setRecordTab}
                                        noteText={noteText}
                                        onNoteText={setNoteText}
                                        onAddNote={handleAddNote}
                                        onNewTask={() => openModal('task')}
                                        onToggleTask={handleToggleTask}
                                        busy={busy}
                                    />
                                ) : (
                                    <section className="crm-detail-panel crm-detail-empty" aria-label="Selected contact">
                                        <Sparkles size={28} />
                                        <strong>Ready for real CRM records</strong>
                                        <p>Once EspoCRM is configured, contacts, organizations, and follow-up tasks will flow into this workspace.</p>
                                    </section>
                                )}
                            </div>
                        ) : activeView === 'organizations' ? (
                            <OrganizationsView
                                organizations={filteredOrganizations}
                                query={query}
                                onQuery={setQuery}
                                configured={configured}
                            />
                        ) : (
                            <TasksView
                                tasks={filteredTasks}
                                query={query}
                                onQuery={setQuery}
                                configured={configured}
                                onToggle={handleToggleTask}
                            />
                        )}
                    </section>
                </div>
            </main>
            <Footer />

            {modal === 'contact' && (
                <Modal title="New contact" subtitle="Creates a Contact in EspoCRM." onClose={() => setModal(null)} busy={busy}>
                    <form onSubmit={handleCreateContact} style={{ display: 'grid', gap: '0.85rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <Field label="First name" required value={newContact.first_name} onChange={(v) => setNewContact((c) => ({ ...c, first_name: v }))} autoFocus />
                            <Field label="Last name" required value={newContact.last_name} onChange={(v) => setNewContact((c) => ({ ...c, last_name: v }))} />
                        </div>
                        <Field label="Email" type="email" value={newContact.email} onChange={(v) => setNewContact((c) => ({ ...c, email: v }))} />
                        <Field label="Phone" value={newContact.phone} onChange={(v) => setNewContact((c) => ({ ...c, phone: v }))} />
                        <Field label="Role / title" value={newContact.role} onChange={(v) => setNewContact((c) => ({ ...c, role: v }))} />
                        <ModalError message={actionError} />
                        <ModalFooter busy={busy} submitLabel="Create contact" disabled={!newContact.first_name.trim() || !newContact.last_name.trim()} onCancel={() => setModal(null)} />
                    </form>
                </Modal>
            )}

            {modal === 'organization' && (
                <Modal title="New organization" subtitle="Creates an Account in EspoCRM." onClose={() => setModal(null)} busy={busy}>
                    <form onSubmit={handleCreateOrganization} style={{ display: 'grid', gap: '0.85rem' }}>
                        <Field label="Name" required value={newOrg.name} onChange={(v) => setNewOrg((o) => ({ ...o, name: v }))} autoFocus />
                        <Field label="Type" value={newOrg.type} onChange={(v) => setNewOrg((o) => ({ ...o, type: v }))} placeholder="Donor, Partner, Vendor…" />
                        <Field label="Email" type="email" value={newOrg.email} onChange={(v) => setNewOrg((o) => ({ ...o, email: v }))} />
                        <Field label="Phone" value={newOrg.phone} onChange={(v) => setNewOrg((o) => ({ ...o, phone: v }))} />
                        <ModalError message={actionError} />
                        <ModalFooter busy={busy} submitLabel="Create organization" disabled={!newOrg.name.trim()} onCancel={() => setModal(null)} />
                    </form>
                </Modal>
            )}

            {modal === 'task' && (
                <Modal title="New task" subtitle={selectedContact && activeView === 'contacts' ? `Follow-up for ${selectedContact.name}` : 'Creates a Task in EspoCRM.'} onClose={() => setModal(null)} busy={busy}>
                    <form onSubmit={handleCreateTask} style={{ display: 'grid', gap: '0.85rem' }}>
                        <Field label="Title" required value={newTask.title} onChange={(v) => setNewTask((t) => ({ ...t, title: v }))} autoFocus />
                        <Field label="Due date" type="date" value={newTask.due} onChange={(v) => setNewTask((t) => ({ ...t, due: v }))} />
                        <ModalError message={actionError} />
                        <ModalFooter busy={busy} submitLabel="Create task" disabled={!newTask.title.trim()} onCancel={() => setModal(null)} />
                    </form>
                </Modal>
            )}
        </div>
    );
}

function OrganizationsView({ organizations, query, onQuery, configured }: {
    organizations: CRMOrganization[];
    query: string;
    onQuery: (value: string) => void;
    configured: boolean;
}) {
    return (
        <section className="crm-list-panel crm-list-panel-wide" aria-label="Organizations">
            <div className="crm-search-row">
                <div className="crm-search">
                    <Search size={16} />
                    <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search organizations" aria-label="Search organizations" />
                </div>
            </div>
            <div className="crm-contact-list">
                {organizations.length > 0 ? organizations.map((org) => (
                    <div key={org.id} className="crm-contact-row" style={{ cursor: 'default' }}>
                        <div className="crm-avatar" aria-hidden="true"><Building2 size={16} /></div>
                        <div className="crm-contact-copy">
                            <div className="crm-contact-title-row">
                                <strong>{org.name}</strong>
                                {org.type && <span className="crm-stage active">{org.type}</span>}
                            </div>
                            <p>{org.email || 'No email'}{org.phone ? ` · ${org.phone}` : ''}</p>
                            <div className="crm-contact-meta">
                                <span><Clock3 size={13} /> {formatRelativeDate(org.last_touch)}</span>
                                {org.owner && <span><Users size={13} /> {org.owner}</span>}
                            </div>
                        </div>
                    </div>
                )) : (
                    <EmptyPanel icon={<Building2 size={28} />} title="No organizations found" body={configured ? 'Add an organization to start tracking partners and donors.' : 'Accounts will appear here after EspoCRM is connected.'} />
                )}
            </div>
        </section>
    );
}

function TasksView({ tasks, query, onQuery, configured, onToggle }: {
    tasks: CRMTask[];
    query: string;
    onQuery: (value: string) => void;
    configured: boolean;
    onToggle: (task: CRMTask) => void;
}) {
    return (
        <section className="crm-list-panel crm-list-panel-wide" aria-label="Tasks">
            <div className="crm-search-row">
                <div className="crm-search">
                    <Search size={16} />
                    <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
                </div>
            </div>
            <div className="crm-task-list crm-task-list-roomy">
                {tasks.length > 0 ? tasks.map((task) => (
                    <div key={task.id} className="crm-task-item">
                        <button type="button" className="crm-task-toggle" onClick={() => onToggle(task)} aria-pressed={task.done} title={task.done ? 'Mark not done' : 'Mark done'}>
                            {task.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? 0.6 : 1 }}>{task.title}</strong>
                            <span>
                                {task.related_name ? `${task.related_name} · ` : ''}
                                {task.due || task.status || 'No due date'}
                                {task.owner ? ` · ${task.owner}` : ''}
                            </span>
                        </div>
                    </div>
                )) : (
                    <EmptyPanel icon={<CheckCircle2 size={28} />} title="No tasks found" body={configured ? 'Create a task or follow-up to see it here.' : 'Tasks will appear here after EspoCRM is connected.'} />
                )}
            </div>
        </section>
    );
}

function ContactDetail({ contact, pipeline, tasks, activity, detailLoading, recordTab, onRecordTab, noteText, onNoteText, onAddNote, onNewTask, onToggleTask, busy }: {
    contact: CRMContact;
    pipeline: CRMPipelineItem[];
    tasks: CRMTask[];
    activity: CRMNote[];
    detailLoading: boolean;
    recordTab: RecordTab;
    onRecordTab: (tab: RecordTab) => void;
    noteText: string;
    onNoteText: (value: string) => void;
    onAddNote: () => void;
    onNewTask: () => void;
    onToggleTask: (task: CRMTask) => void;
    busy: boolean;
}) {
    return (
        <section className="crm-detail-panel" aria-label="Selected contact">
            <div className="crm-detail-header">
                <div className="crm-detail-avatar">{initials(contact.name)}</div>
                <div>
                    <span className={`crm-stage ${getStageClass(contact.stage)}`}>{contact.stage}</span>
                    <h2>{contact.name}</h2>
                    <p>{contact.role}{contact.organization ? ` at ${contact.organization}` : ''}</p>
                </div>
            </div>

            <div className="crm-record-tabs" role="tablist" aria-label="Contact record sections">
                <button type="button" className={recordTab === 'overview' ? 'active' : ''} onClick={() => onRecordTab('overview')}>Overview</button>
                <button type="button" className={recordTab === 'activity' ? 'active' : ''} onClick={() => onRecordTab('activity')}>
                    Activity{activity.length > 0 ? ` (${activity.length})` : ''}
                </button>
            </div>

            <div className="crm-quick-actions">
                <a href={contact.email ? `mailto:${contact.email}` : undefined} className={`crm-quick-action ${contact.email ? '' : 'disabled'}`} aria-disabled={!contact.email}><Mail size={16} /> Email</a>
                <a href={contact.phone ? `tel:${contact.phone}` : undefined} className={`crm-quick-action ${contact.phone ? '' : 'disabled'}`} aria-disabled={!contact.phone}><Phone size={16} /> Call</a>
                <button type="button" onClick={() => onRecordTab('activity')}><MessageSquareText size={16} /> Note</button>
                <button type="button" onClick={onNewTask}><CalendarDays size={16} /> Task</button>
            </div>

            {recordTab === 'overview' ? (
                <>
                    <div className="crm-detail-grid">
                        <InfoBlock label="Owner" value={contact.owner || 'Unassigned'} />
                        <InfoBlock label="Stage" value={contact.stage} />
                        <InfoBlock label="Email" value={contact.email || 'No email'} />
                        <InfoBlock label="Phone" value={contact.phone || 'No phone'} />
                    </div>

                    <div className="crm-side-grid">
                        <section className="crm-mini-panel">
                            <div className="crm-panel-head"><h3>Pipeline</h3></div>
                            <div className="crm-pipeline-list">
                                {pipeline.map((item) => (
                                    <div key={item.label} className="crm-pipeline-item">
                                        <div className="crm-pipeline-label">
                                            <span style={{ background: item.color }} />
                                            <strong>{item.label}</strong>
                                            <em>{item.count}</em>
                                        </div>
                                        <div className="crm-progress">
                                            <span style={{ width: `${Math.min(100, item.count * 8)}%`, background: item.color }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="crm-mini-panel">
                            <div className="crm-panel-head"><h3>Tasks</h3></div>
                            <div className="crm-task-list">
                                {tasks.length > 0 ? tasks.map((task) => (
                                    <div key={task.id} className="crm-task-item">
                                        <button type="button" className="crm-task-toggle" onClick={() => onToggleTask(task)} aria-pressed={task.done} title={task.done ? 'Mark not done' : 'Mark done'}>
                                            {task.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                                        </button>
                                        <div>
                                            <strong style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</strong>
                                            <span>{task.due || task.status || 'No due date'}</span>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="crm-empty-compact">No open EspoCRM tasks.</div>
                                )}
                            </div>
                        </section>
                    </div>
                </>
            ) : (
                <div className="crm-activity">
                    <div className="crm-note-composer">
                        <textarea
                            value={noteText}
                            onChange={(event) => onNoteText(event.target.value)}
                            placeholder={`Add a note about ${contact.name}…`}
                            rows={2}
                            aria-label="Add a note"
                        />
                        <Button variant="primary" onClick={onAddNote} disabled={busy || !noteText.trim()}>Post note</Button>
                    </div>

                    {detailLoading ? (
                        <div className="crm-empty-compact">Loading activity…</div>
                    ) : activity.length > 0 ? (
                        <div className="crm-activity-list">
                            {activity.map((note) => (
                                <div key={note.id} className="crm-activity-item">
                                    <div className="crm-activity-dot"><Activity size={13} /></div>
                                    <div>
                                        <p>{note.text}</p>
                                        <span>{note.created_by || 'System'} · {formatRelativeDate(note.created_at)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="crm-empty-compact">No activity yet. Post the first note above.</div>
                    )}
                </div>
            )}
        </section>
    );
}

function ContactRow({ contact, active, onSelect }: { contact: CRMContact; active: boolean; onSelect: () => void }) {
    return (
        <button type="button" className={`crm-contact-row ${active ? 'active' : ''}`} onClick={onSelect}>
            <div className="crm-avatar" aria-hidden="true">{initials(contact.name)}</div>
            <div className="crm-contact-copy">
                <div className="crm-contact-title-row">
                    <strong>{contact.name}</strong>
                    <span className={`crm-stage ${getStageClass(contact.stage)}`}>{contact.stage}</span>
                </div>
                <p>{contact.role}{contact.organization ? ` at ${contact.organization}` : ''}</p>
                <div className="crm-contact-meta">
                    <span><Clock3 size={13} /> {formatRelativeDate(contact.last_touch)}</span>
                    <span><Tag size={13} /> {contact.tags[0] ?? 'Contact'}</span>
                </div>
            </div>
            <ChevronRight size={16} />
        </button>
    );
}

function buildPipelineFromContacts(contacts: CRMContact[]): CRMPipelineItem[] {
    const colors: Record<string, string> = {
        New: '#2563eb',
        'Needs follow-up': '#d97706',
        Active: '#059669',
        Nurture: '#7c3aed',
    };
    const counts = contacts.reduce<Record<string, number>>((acc, contact) => {
        acc[contact.stage] = (acc[contact.stage] ?? 0) + 1;
        return acc;
    }, {});
    return Object.entries(colors).map(([label, color]) => ({ label, color, count: counts[label] ?? 0 }));
}

function MetricCard({ label, value, helper, tone = 'default' }: {
    label: string;
    value: string | number;
    helper: string;
    tone?: 'default' | 'warning' | 'success';
}) {
    return (
        <div className={`crm-metric-card ${tone}`}>
            <span>{label}</span>
            <strong>{value}</strong>
            <p>{helper}</p>
        </div>
    );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
    return (
        <div className="crm-info-block">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function EmptyPanel({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
    return (
        <div className="crm-empty-state">
            {icon}
            <strong>{title}</strong>
            <p>{body}</p>
        </div>
    );
}

function Modal({ title, subtitle, onClose, busy, children }: {
    title: string;
    subtitle?: ReactNode;
    onClose: () => void;
    busy: boolean;
    children: ReactNode;
}) {
    return (
        <div onClick={() => { if (!busy) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div onClick={(event) => event.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '460px', padding: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#101828' }}>{title}</h2>
                        {subtitle && <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: '#98a2b3' }}>{subtitle}</p>}
                    </div>
                    <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.4rem', borderRadius: '50%', display: 'flex' }}>
                        <X size={20} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

function ModalError({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <div style={{ background: '#fef3f2', border: '1px solid #fecdca', color: '#b42318', borderRadius: '8px', padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}>
            {message}
        </div>
    );
}

function ModalFooter({ busy, submitLabel, disabled, onCancel }: {
    busy: boolean;
    submitLabel: string;
    disabled: boolean;
    onCancel: () => void;
}) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={busy} disabled={disabled}>{submitLabel}</Button>
        </div>
    );
}

function Field({ label, value, onChange, type = 'text', required = false, autoFocus = false, placeholder }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    required?: boolean;
    autoFocus?: boolean;
    placeholder?: string;
}) {
    return (
        <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475467' }}>
                {label}{required && <span style={{ color: '#d92d20' }}> *</span>}
            </span>
            <input
                type={type}
                value={value}
                required={required}
                autoFocus={autoFocus}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                style={{ padding: '0.55rem 0.7rem', border: '1px solid #d0d5dd', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }}
            />
        </label>
    );
}
