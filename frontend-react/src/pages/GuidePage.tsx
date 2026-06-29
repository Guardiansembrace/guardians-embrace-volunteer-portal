import type { ReactNode } from 'react';
import {
    ShieldCheck,
    User as UserIcon,
    Users,
    Crown,
    KeyRound,
    Sparkles,
    Bell,
    LayoutGrid,
    ContactRound,
    Trash2,
} from 'lucide-react';
import { Navbar, Footer } from '../components/Layout';
import { useAuth } from '../lib/useAuth';

type TagTone = 'slate' | 'indigo' | 'green' | 'gold' | 'purple' | 'blue' | 'amber' | 'red' | 'teal';

const TAG_TONES: Record<TagTone, { bg: string; fg: string }> = {
    slate: { bg: '#f1f5f9', fg: '#475569' },
    indigo: { bg: '#eef2ff', fg: '#4338ca' },
    green: { bg: '#ecfdf5', fg: '#047857' },
    gold: { bg: '#fffbeb', fg: '#b45309' },
    purple: { bg: '#f5f3ff', fg: '#6d28d9' },
    blue: { bg: '#eff6ff', fg: '#1d4ed8' },
    amber: { bg: '#fff7ed', fg: '#c2410c' },
    red: { bg: '#fef2f2', fg: '#b91c1c' },
    teal: { bg: '#f0fdfa', fg: '#0f766e' },
};

function Tag({ children, tone = 'slate' }: { children: ReactNode; tone?: TagTone }) {
    const color = TAG_TONES[tone];
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '0.16rem 0.6rem', background: color.bg, color: color.fg, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
            {children}
        </span>
    );
}

function SectionCard({ children }: { children: ReactNode }) {
    return (
        <div style={{ background: '#ffffff', border: '1px solid #edeff3', borderRadius: '16px', padding: '1.5rem 1.6rem', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
            {children}
        </div>
    );
}

function RoleCard({ icon, title, tone, summary, can }: {
    icon: ReactNode;
    title: string;
    tone: TagTone;
    summary: string;
    can: string[];
}) {
    const color = TAG_TONES[tone];
    return (
        <div style={{ background: '#ffffff', border: '1px solid #edeff3', borderRadius: '14px', padding: '1.1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: color.bg, color: color.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {icon}
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#101828' }}>{title}</h3>
                    <Tag tone={tone}>{title}</Tag>
                </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#667085', lineHeight: 1.5 }}>{summary}</p>
            <ul style={{ margin: '0.1rem 0 0', paddingLeft: '1.1rem', display: 'grid', gap: '0.3rem' }}>
                {can.map((item) => (
                    <li key={item} style={{ fontSize: '0.85rem', color: '#344054', lineHeight: 1.5 }}>{item}</li>
                ))}
            </ul>
        </div>
    );
}

const DELEGATED_SCOPES: { scope: string; label: string }[] = [
    { scope: 'view_users', label: 'View users' },
    { scope: 'edit_users', label: 'Edit user profiles' },
    { scope: 'manage_user_status', label: 'Manage account status' },
    { scope: 'manage_user_roles', label: 'Manage user roles' },
    { scope: 'review_submissions', label: 'Review submissions' },
    { scope: 'send_reminders', label: 'Send reminders' },
    { scope: 'manage_invites', label: 'Manage invites' },
    { scope: 'manage_projects', label: 'Manage projects' },
    { scope: 'manage_crm', label: 'Manage CRM' },
    { scope: 'manage_settings', label: 'Forms & settings' },
    { scope: 'view_audit_logs', label: 'View audit logs' },
    { scope: 'view_admin_access', label: 'View delegated access' },
    { scope: 'manage_admin_access', label: 'Manage delegated access' },
];

const PROJECT_ACTIONS: { action: string; who: string }[] = [
    { action: 'Browse projects & boards', who: 'Everyone' },
    { action: 'Create a project', who: 'Everyone' },
    { action: 'Request access / lead / deletion', who: 'Non-members' },
    { action: 'Contribute to work items', who: 'Project members' },
    { action: 'Approve / decline access & lead requests', who: 'Project lead, operations' },
    { action: 'Approve / decline deletion requests', who: 'Project lead, operations' },
    { action: 'Delete a project directly', who: 'Operations / admin' },
];

const UPDATES: { title: string; body: string; tags: { label: string; tone: TagTone }[] }[] = [
    {
        title: 'Tabbed project boards',
        body: 'Each project now opens on a Board tab, with Team, Files, and (for leads/managers) Requests tabs. The selected tab is saved in the URL, and the header has a compact at-a-glance stats strip.',
        tags: [{ label: 'Jun 2026', tone: 'slate' }, { label: 'Projects', tone: 'blue' }, { label: 'UI', tone: 'teal' }],
    },
    {
        title: 'Project leads can manage deletion requests',
        body: 'A project lead can approve or decline requests to delete their project. Approving permanently deletes it and asks for confirmation first; the requester is notified when a request is declined.',
        tags: [{ label: 'Jun 2026', tone: 'slate' }, { label: 'Permissions', tone: 'purple' }],
    },
    {
        title: 'Projects directory views, sort & grouping',
        body: 'The Projects page offers Grid, Compact, and List views, a Sort control (recently updated, name, status, team size), and Group-by-status in List view. Your preference is remembered.',
        tags: [{ label: 'Jun 2026', tone: 'slate' }, { label: 'Projects', tone: 'blue' }, { label: 'UI', tone: 'teal' }],
    },
    {
        title: 'Notification fixes',
        body: 'Clicking a notification (bell or email) now reliably opens the right page — “new request” notifications open the project’s Requests tab. The bell marks a notification read when you open it, with a “Mark all read” action.',
        tags: [{ label: 'Jun 2026', tone: 'slate' }, { label: 'Notifications', tone: 'amber' }],
    },
    {
        title: 'New CRM workspace',
        body: 'A CRM area for donor, partner, and contact relationships (backed by EspoCRM) is available to admins and anyone granted the new manage_crm scope. The CRM nav link only appears if you have access.',
        tags: [{ label: 'Jun 2026', tone: 'slate' }, { label: 'CRM', tone: 'green' }, { label: 'Permissions', tone: 'purple' }],
    },
];

function currentRoleLabel(flags: { isAdmin: boolean; isDelegatedAdmin: boolean; isTeamLead: boolean }) {
    if (flags.isAdmin) return { label: 'Administrator', tone: 'gold' as TagTone };
    if (flags.isDelegatedAdmin) return { label: 'Delegated Admin', tone: 'purple' as TagTone };
    if (flags.isTeamLead) return { label: 'Team Lead', tone: 'indigo' as TagTone };
    return { label: 'Volunteer', tone: 'slate' as TagTone };
}

export default function GuidePage() {
    const { isAdmin, isDelegatedAdmin, isTeamLead } = useAuth();
    const role = currentRoleLabel({ isAdmin, isDelegatedAdmin, isTeamLead });

    return (
        <div className="page-wrapper" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <main id="main-content" className="main-content" style={{ flex: 1 }}>
                <div className="container" style={{ padding: '2rem 1rem 4rem', maxWidth: '1100px', margin: '0 auto', display: 'grid', gap: '1.5rem' }}>

                    <div>
                        <h1 style={{ margin: '0 0 0.35rem', fontSize: 'clamp(1.5rem, 1.1rem + 1.4vw, 2rem)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                            Guide &amp; Updates
                        </h1>
                        <p style={{ margin: 0, color: '#667085', fontSize: '0.95rem' }}>
                            Who can do what across the portal, and what’s changed recently.
                        </p>
                        <div style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#475467' }}>
                            You’re signed in as <Tag tone={role.tone}>{role.label}</Tag>
                        </div>
                    </div>

                    {/* Roles */}
                    <SectionCard>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <ShieldCheck size={18} style={{ color: '#4f46e5' }} />
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#101828' }}>Roles &amp; access</h2>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.9rem' }}>
                            <RoleCard
                                icon={<UserIcon size={18} />}
                                title="Volunteer"
                                tone="slate"
                                summary="The base role for everyone in the portal."
                                can={[
                                    'Submit weekly updates and track hours',
                                    'Browse all projects and boards',
                                    'Create new projects',
                                    'Request access, leadership, or deletion of a project',
                                    'Contribute to a project after being added',
                                ]}
                            />
                            <RoleCard
                                icon={<Users size={18} />}
                                title="Team Lead"
                                tone="indigo"
                                summary="Everything a volunteer can do, plus project operations."
                                can={[
                                    'Create, update, and delete projects',
                                    'Add and remove project members',
                                    'Manage work items and assignments',
                                    'Approve/decline access, lead & deletion requests',
                                    'Needs delegated scopes for admin screens',
                                ]}
                            />
                            <RoleCard
                                icon={<Crown size={18} />}
                                title="Project Lead"
                                tone="green"
                                summary="The lead of a specific project — even a volunteer — for that project only."
                                can={[
                                    'Review access, leadership & deletion requests',
                                    'Transfer the lead role by approving a lead request',
                                    'Manage that project’s work items, assignees & tags',
                                    'Approving a deletion permanently removes the project',
                                ]}
                            />
                            <RoleCard
                                icon={<ShieldCheck size={18} />}
                                title="Admin"
                                tone="gold"
                                summary="Full control across the entire portal."
                                can={[
                                    'Access every admin section',
                                    'Manage users, roles, status & invites',
                                    'Manage settings, reminders, projects & CRM',
                                    'View audit logs and grant delegated access',
                                ]}
                            />
                        </div>
                    </SectionCard>

                    {/* Delegated scopes */}
                    <SectionCard>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <KeyRound size={18} style={{ color: '#6d28d9' }} />
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#101828' }}>Delegated admin scopes</h2>
                        </div>
                        <p style={{ margin: '0 0 0.9rem', color: '#667085', fontSize: '0.88rem', lineHeight: 1.5 }}>
                            Admins can grant any of these to a volunteer or team lead without making them a full admin. Grants are time-limited and revocable, and give only the scopes granted.
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {DELEGATED_SCOPES.map((s) => (
                                <span key={s.scope} title={s.scope} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', border: '1px solid #e9d5ff', background: '#faf5ff', color: '#6d28d9', borderRadius: '999px', padding: '0.25rem 0.7rem', fontSize: '0.78rem', fontWeight: 600 }}>
                                    {s.label}
                                    <code style={{ fontSize: '0.68rem', opacity: 0.7 }}>{s.scope}</code>
                                </span>
                            ))}
                        </div>
                    </SectionCard>

                    {/* Project action reference */}
                    <SectionCard>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                            <Trash2 size={18} style={{ color: '#b42318' }} />
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#101828' }}>Who can do what — projects</h2>
                        </div>
                        <div style={{ display: 'grid', gap: '0.4rem' }}>
                            {PROJECT_ACTIONS.map((row) => (
                                <div key={row.action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '0.6rem 0.8rem', border: '1px solid #f1f5f9', borderRadius: '10px', background: '#fcfcfd' }}>
                                    <span style={{ fontSize: '0.88rem', color: '#344054', fontWeight: 500 }}>{row.action}</span>
                                    <Tag tone={row.who === 'Everyone' ? 'green' : row.who.includes('admin') ? 'gold' : row.who.includes('lead') ? 'indigo' : 'slate'}>{row.who}</Tag>
                                </div>
                            ))}
                        </div>
                        <p style={{ margin: '0.8rem 0 0', fontSize: '0.8rem', color: '#98a2b3', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Trash2 size={13} /> Approving a deletion request is permanent and removes the project, its work items, and requests.
                        </p>
                    </SectionCard>

                    {/* Recent updates */}
                    <SectionCard>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <Sparkles size={18} style={{ color: '#0f766e' }} />
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#101828' }}>Recent updates</h2>
                        </div>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {UPDATES.map((u) => (
                                <div key={u.title} style={{ border: '1px solid #f1f5f9', borderRadius: '12px', padding: '0.9rem 1rem', background: '#fcfcfd' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#101828' }}>{u.title}</h3>
                                        {u.tags.map((t) => (
                                            <Tag key={t.label} tone={t.tone}>{t.label}</Tag>
                                        ))}
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.86rem', color: '#475467', lineHeight: 1.55 }}>{u.body}</p>
                                </div>
                            ))}
                        </div>
                    </SectionCard>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', color: '#98a2b3', fontSize: '0.82rem' }}>
                        <Bell size={14} /> Looking for the in-app pointers? Each page also has a “How this works” panel.
                        <span style={{ color: '#d0d5dd' }}>•</span>
                        <LayoutGrid size={14} /> Projects
                        <ContactRound size={14} /> CRM
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
