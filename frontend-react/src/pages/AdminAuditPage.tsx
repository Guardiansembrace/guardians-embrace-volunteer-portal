import { useEffect, useId, useState } from 'react';
import { ChevronLeft, Filter, History, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { Navbar, Footer } from '../components/Layout';
import { Button, EmptyState, LoadingSpinner } from '../components/ui';
import { api } from '../lib/api';
import type { AuditLogEntry } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import {
    formatAuditAbsoluteTime,
    formatAuditRelativeTime,
    getAuditActorKey,
    getAuditActorLabel,
    getAuditArea,
    getAuditAreaLabel,
    getAuditDescription,
    getAuditHeadline,
    getAuditOutcomeLabel,
    getAuditSearchText,
    matchesAuditTimeFilter,
    type AuditArea,
    type AuditTimeFilter,
} from '../lib/auditTrail';
import { useNavigate } from 'react-router-dom';

const AREA_FILTERS: Array<{ value: 'all' | AuditArea; label: string }> = [
    { value: 'all', label: 'All areas' },
    { value: 'authentication', label: 'Authentication' },
    { value: 'users', label: 'Users' },
    { value: 'invites', label: 'Invites' },
    { value: 'submissions', label: 'Weekly Updates' },
    { value: 'projects', label: 'Projects' },
    { value: 'work_items', label: 'Work Items' },
    { value: 'join_requests', label: 'Join Requests' },
    { value: 'settings', label: 'Settings' },
    { value: 'notifications', label: 'Reminders' },
    { value: 'admin_access', label: 'Delegated Access' },
    { value: 'system', label: 'System' },
];

export default function AdminAuditPage() {
    const navigate = useNavigate();
    const { canAccessAdminPortal, hasAdminScope, isDelegatedAdmin, isLoading: authLoading, isAuthenticated } = useAuth();
    const searchId = useId();
    const actorId = useId();
    const areaId = useId();
    const outcomeId = useId();
    const timeId = useId();
    const eventTypeId = useId();
    const delegatedId = useId();

    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [actorFilter, setActorFilter] = useState('all');
    const [areaFilter, setAreaFilter] = useState<'all' | AuditArea>('all');
    const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'success' | 'failed'>('all');
    const [timeFilter, setTimeFilter] = useState<AuditTimeFilter>('7d');
    const [eventTypeFilter, setEventTypeFilter] = useState<'all' | 'request' | 'security' | 'admin_access'>('all');
    const [delegatedFilter, setDelegatedFilter] = useState<'all' | 'delegated' | 'direct'>('all');

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !canAccessAdminPortal || !hasAdminScope('view_audit_logs'))) {
            navigate('/admin');
        }
    }, [authLoading, isAuthenticated, canAccessAdminPortal, hasAdminScope, navigate]);

    useEffect(() => {
        if (isAuthenticated && canAccessAdminPortal && hasAdminScope('view_audit_logs')) {
            void loadLogs();
        }
    }, [isAuthenticated, canAccessAdminPortal, hasAdminScope]);

    const loadLogs = async () => {
        try {
            setIsLoading(true);
            const data = await api.getAuditLogs({ limit: 250 });
            setLogs(data);
        } catch (err) {
            console.error('Failed to load audit logs:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const actorOptions = Array.from(
        new Map(
            logs
                .filter((log) => log.actor_user_id || log.actor_email || log.actor_name)
                .map((log) => [getAuditActorKey(log), { value: getAuditActorKey(log), label: getAuditActorLabel(log) }]),
        ).values(),
    );

    const filteredLogs = logs.filter((log) => {
        if (searchTerm && !getAuditSearchText(log).includes(searchTerm.toLowerCase())) return false;
        if (actorFilter !== 'all' && getAuditActorKey(log) !== actorFilter) return false;
        if (areaFilter !== 'all' && getAuditArea(log) !== areaFilter) return false;
        if (outcomeFilter === 'success' && !log.success) return false;
        if (outcomeFilter === 'failed' && log.success) return false;
        if (!matchesAuditTimeFilter(log, timeFilter)) return false;
        if (eventTypeFilter !== 'all' && log.event_type !== eventTypeFilter) return false;
        if (delegatedFilter === 'delegated' && !log.is_delegated) return false;
        if (delegatedFilter === 'direct' && log.is_delegated) return false;
        return true;
    });

    const hasFilters =
        Boolean(searchTerm) ||
        actorFilter !== 'all' ||
        areaFilter !== 'all' ||
        outcomeFilter !== 'all' ||
        timeFilter !== '7d' ||
        eventTypeFilter !== 'all' ||
        delegatedFilter !== 'all';

    if (authLoading || !isAuthenticated || !canAccessAdminPortal || !hasAdminScope('view_audit_logs')) {
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
                            onClick={() => navigate('/admin')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', padding: 0 }}
                            className="hover-opacity"
                        >
                            <ChevronLeft size={16} /> Back to Admin Portal
                        </button>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <div>
                                <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ padding: '0.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#334155' }}>
                                        <History size={28} />
                                    </div>
                                    Audit Trail
                                </h1>
                                <p style={{ color: '#64748b', margin: 0, fontSize: '1.05rem', maxWidth: '760px', lineHeight: 1.6 }}>
                                    Review who changed what, when it happened, and whether it worked. The main feed stays readable, and the raw details are there only when you need them.
                                </p>
                                {isDelegatedAdmin && (
                                    <p style={{ color: '#94a3b8', margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
                                        You are viewing audit activity through delegated admin access.
                                    </p>
                                )}
                            </div>
                            <Button variant="ghost" onClick={loadLogs} style={{ border: '1px solid #e2e8f0', background: 'white', color: '#334155' }}>
                                <RefreshCw size={16} /> <span style={{ marginLeft: '0.4rem' }}>Refresh</span>
                            </Button>
                        </div>
                    </div>

                    <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.02)', padding: '1.5rem', marginBottom: '1.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: showFilters ? '1.25rem' : 0 }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>Filters</h2>
                                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                    Narrow the activity feed by person, area, result, delegation, and time.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {hasFilters && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setSearchTerm('');
                                            setActorFilter('all');
                                            setAreaFilter('all');
                                            setOutcomeFilter('all');
                                            setTimeFilter('7d');
                                            setEventTypeFilter('all');
                                            setDelegatedFilter('all');
                                        }}
                                    >
                                        Clear Filters
                                    </Button>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => setShowFilters((current) => !current)}>
                                    <Filter size={16} style={{ marginRight: '0.4rem' }} />
                                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                                </Button>
                            </div>
                        </div>

                        {showFilters && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label" htmlFor={searchId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Search activity</label>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                        <input
                                            id={searchId}
                                            type="text"
                                            className="form-input"
                                            value={searchTerm}
                                            onChange={(event) => setSearchTerm(event.target.value)}
                                            placeholder="Search by person, action, email, note, or area..."
                                            style={{ paddingLeft: '2.5rem', background: 'white' }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="form-label" htmlFor={actorId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Person</label>
                                    <select id={actorId} className="form-select" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} style={{ background: 'white' }}>
                                        <option value="all">Everyone</option>
                                        {actorOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label" htmlFor={areaId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Area</label>
                                    <select id={areaId} className="form-select" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value as 'all' | AuditArea)} style={{ background: 'white' }}>
                                        {AREA_FILTERS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label" htmlFor={outcomeId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Result</label>
                                    <select id={outcomeId} className="form-select" value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value as 'all' | 'success' | 'failed')} style={{ background: 'white' }}>
                                        <option value="all">All results</option>
                                        <option value="success">Success only</option>
                                        <option value="failed">Failed only</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label" htmlFor={timeId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Time range</label>
                                    <select id={timeId} className="form-select" value={timeFilter} onChange={(event) => setTimeFilter(event.target.value as AuditTimeFilter)} style={{ background: 'white' }}>
                                        <option value="24h">Last 24 hours</option>
                                        <option value="7d">Last 7 days</option>
                                        <option value="30d">Last 30 days</option>
                                        <option value="all">All loaded activity</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label" htmlFor={eventTypeId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Event type</label>
                                    <select id={eventTypeId} className="form-select" value={eventTypeFilter} onChange={(event) => setEventTypeFilter(event.target.value as 'all' | 'request' | 'security' | 'admin_access')} style={{ background: 'white' }}>
                                        <option value="all">All event types</option>
                                        <option value="request">Tracked changes</option>
                                        <option value="security">Security events</option>
                                        <option value="admin_access">Delegated admin events</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label" htmlFor={delegatedId} style={{ fontSize: '0.8rem', color: '#64748b' }}>Delegation</label>
                                    <select id={delegatedId} className="form-select" value={delegatedFilter} onChange={(event) => setDelegatedFilter(event.target.value as 'all' | 'delegated' | 'direct')} style={{ background: 'white' }}>
                                        <option value="all">All access types</option>
                                        <option value="delegated">Delegated actions only</option>
                                        <option value="direct">Direct admin actions only</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
                            Activity ({filteredLogs.length})
                        </h2>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                            Showing the latest {logs.length} tracked events loaded from the server.
                        </p>
                    </div>

                    {isLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
                            <LoadingSpinner size={40} />
                        </div>
                    ) : filteredLogs.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {filteredLogs.map((log) => {
                                const area = getAuditArea(log);
                                const actor = getAuditActorLabel(log);

                                return (
                                    <article key={log.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '18px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)', padding: '1.25rem 1.35rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                            <div>
                                                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.35rem' }}>{getAuditHeadline(log)}</div>
                                                <div style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.6 }}>{getAuditDescription(log)}</div>
                                            </div>
                                            <div style={{ textAlign: 'right', minWidth: '190px' }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{formatAuditAbsoluteTime(log.created_at)}</div>
                                                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.2rem' }}>{formatAuditRelativeTime(log.created_at)}</div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.3rem 0.65rem', borderRadius: '999px', background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0', fontSize: '0.78rem', fontWeight: 700 }}>
                                                {getAuditAreaLabel(area)}
                                            </span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.3rem 0.65rem', borderRadius: '999px', background: log.success ? '#ecfdf3' : '#fef2f2', color: log.success ? '#15803d' : '#b91c1c', border: `1px solid ${log.success ? '#bbf7d0' : '#fecaca'}`, fontSize: '0.78rem', fontWeight: 700 }}>
                                                {getAuditOutcomeLabel(log)}
                                            </span>
                                            {log.is_delegated && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.3rem 0.65rem', borderRadius: '999px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '0.78rem', fontWeight: 700 }}>
                                                    Delegated Admin
                                                </span>
                                            )}
                                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.3rem 0.65rem', borderRadius: '999px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', fontSize: '0.78rem', fontWeight: 700 }}>
                                                {actor}
                                            </span>
                                        </div>

                                        <details style={{ marginTop: '0.25rem' }}>
                                            <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: '0.85rem', fontWeight: 700 }}>
                                                View technical details
                                            </summary>
                                            <div style={{ marginTop: '0.9rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'grid', gap: '0.75rem' }}>
                                                <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                    <strong>Raw summary:</strong> {log.summary}
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                    <strong>Action:</strong> {log.action}
                                                </div>
                                                {log.request_id && (
                                                    <>
                                                    <div style={{ display: 'none' }}>
                                                        <strong>Actor:</strong> {log.actor_email || actor}{log.actor_role ? ` · ${log.actor_role}` : ''}
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                        <strong>Request ID:</strong> {log.request_id}
                                                    </div>
                                                    </>
                                                )}
                                                {log.resource_type && (
                                                    <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                        <strong>Resource:</strong> {log.resource_type}{log.resource_id ? ` (${log.resource_id})` : ''}
                                                    </div>
                                                )}
                                                {log.path && (
                                                    <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                        <strong>Path:</strong> {log.path}
                                                    </div>
                                                )}
                                                {(log.actor_email || log.actor_role) && (
                                                    <>
                                                    <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                        <strong>Actor:</strong> {log.actor_email || actor}{log.actor_role ? ` - ${log.actor_role}` : ''}
                                                    </div>
                                                    <div style={{ display: 'none' }}>
                                                        <strong>Actor:</strong> {log.actor_email || actor}{log.actor_role ? ` · ${log.actor_role}` : ''}
                                                    </div>
                                                    </>
                                                )}
                                                {Object.keys(log.metadata).length > 0 && (
                                                    <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                                                        <strong>Metadata:</strong>
                                                        <pre style={{ margin: '0.5rem 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8rem', color: '#475569', background: 'white', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                                            {JSON.stringify(log.metadata, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        </details>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ padding: '1rem 0 0' }}>
                            <EmptyState
                                icon={<ShieldAlert size={48} />}
                                title="No audit activity matches these filters"
                                description="Try clearing a few filters or widen the time range to see more tracked actions."
                                action={
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setSearchTerm('');
                                            setActorFilter('all');
                                            setAreaFilter('all');
                                            setOutcomeFilter('all');
                                            setTimeFilter('7d');
                                            setEventTypeFilter('all');
                                            setDelegatedFilter('all');
                                        }}
                                    >
                                        Reset Filters
                                    </Button>
                                }
                            />
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
}
