import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import type { AdminSettings, FormSection, WeeklyUpdateSettings } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Button, GuidancePanel, Input, LoadingSpinner } from '../components/ui';
import { Settings, Plus, Trash2, Save, GripVertical, CheckCircle, ChevronLeft } from 'lucide-react';

const DAY_OPTIONS: WeeklyUpdateSettings['deadline_day'][] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
];

export default function AdminSettingsPage() {
    const navigate = useNavigate();
    const { canAccessAdminPortal, hasAdminScope, isDelegatedAdmin, isLoading: authLoading, isAuthenticated } = useAuth();

    const [settings, setSettings] = useState<AdminSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
    };

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !canAccessAdminPortal || !hasAdminScope('manage_settings'))) {
            navigate('/dashboard');
        }
    }, [authLoading, isAuthenticated, canAccessAdminPortal, hasAdminScope, navigate]);

    useEffect(() => {
        if (isAuthenticated && canAccessAdminPortal && hasAdminScope('manage_settings')) {
            loadSettings();
        }
    }, [isAuthenticated, canAccessAdminPortal, hasAdminScope]);

    const loadSettings = async () => {
        try {
            setIsLoading(true);
            const data = await api.getSettings();
            setSettings(data);
        } catch (err) {
            console.error('Failed to load settings:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!settings) return;
        try {
            setIsSaving(true);
            await api.updateSettings(settings);
            showToast("Settings saved successfully!");
        } catch (err) {
            console.error('Failed to save settings:', err);
            showToast("Error: Failed to save settings.");
        } finally {
            setIsSaving(false);
        }
    };

    const addTag = () => {
        if (!settings) return;
        setSettings({ ...settings, tags: [...settings.tags, 'New Tag'] });
    };

    const removeTag = (index: number) => {
        if (!settings) return;
        const newTags = [...settings.tags];
        newTags.splice(index, 1);
        setSettings({ ...settings, tags: newTags });
    };

    const updateTag = (index: number, value: string) => {
        if (!settings) return;
        const newTags = [...settings.tags];
        newTags[index] = value;
        setSettings({ ...settings, tags: newTags });
    };

    const addSection = () => {
        if (!settings) return;
        const newSection: FormSection = {
            id: `custom_${Math.random().toString(36).substr(2, 5)}`,
            title: 'New Section',
            subtitle: 'Description',
            icon: '📋',
            type: 'work_entries',
            showHours: true,
            required: false,
        };
        setSettings({ ...settings, form_sections: [...settings.form_sections, newSection] });
        showToast("New section added! Scroll down to edit.");
    };

    const removeSection = (index: number) => {
        if (!settings) return;
        const newSections = [...settings.form_sections];
        newSections.splice(index, 1);
        setSettings({ ...settings, form_sections: newSections });
    };

    const updateSection = <K extends keyof FormSection>(index: number, field: K, value: FormSection[K]) => {
        if (!settings) return;
        const newSections = [...settings.form_sections];
        newSections[index] = {
            ...newSections[index],
            [field]: value,
        };
        setSettings({ ...settings, form_sections: newSections });
    };

    const updateWeeklySettings = <K extends keyof WeeklyUpdateSettings>(field: K, value: WeeklyUpdateSettings[K]) => {
        if (!settings) return;
        setSettings({
            ...settings,
            weekly_updates: {
                ...settings.weekly_updates,
                [field]: value,
            },
        });
    };

    if (authLoading || !isAuthenticated || !canAccessAdminPortal || !hasAdminScope('manage_settings')) {
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
                <div className="container" style={{ padding: '2.5rem 1rem', maxWidth: '800px', margin: '0 auto' }}>
                    
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2.5rem' }}>
                        <div>
                            <button 
                                onClick={() => navigate('/dashboard')} 
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', padding: 0 }}
                                className="hover-opacity"
                            >
                                <ChevronLeft size={16} /> Back to Dashboard
                            </button>
                            <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ padding: '0.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#334155' }}>
                                    <Settings size={28} />
                                </div>
                                Form Settings
                            </h1>
                            <p style={{ color: '#64748b', margin: 0, fontSize: '1.05rem', maxWidth: '600px' }}>
                                {isDelegatedAdmin
                                    ? 'Manage the settings your admin delegated to you, including schedules, form structure, and organization tags.'
                                    : 'Configure dynamic submission forms, weekly update timing, and global organization tags.'}
                            </p>
                        </div>
                        <div style={{ alignSelf: 'center' }}>
                            <Button variant="primary" onClick={handleSave} disabled={isSaving || isLoading} style={{ boxShadow: '0 4px 12px rgba(212, 175, 55, 0.3)' }}>
                                {isSaving ? (
                                    <span style={{ display: 'inline-flex', marginRight: '0.4rem' }}>
                                        <LoadingSpinner size={16} />
                                    </span>
                                ) : <Save size={16} style={{ marginRight: '0.5rem' }} />}
                                Save Changes
                            </Button>
                        </div>
                    </div>

                    <GuidancePanel
                        title="What To Tune Here"
                        description="Short, action-based configuration copy makes the volunteer experience easier to scan and reduces form confusion."
                        items={[
                            'Keep section titles short and use subtitles as plain-language instructions for what volunteers should enter.',
                            'Reported hours come from Past Work, Present Work, and timed custom sections, while credited hours only come from Past Work.',
                            'Schedule settings control the dashboard deadline card, submission window messaging, and when save/submit actions lock.',
                            'Current system hours validation still allows totals from 0 to 168 per week. This screen does not change that limit yet.',
                        ]}
                        icon={<Settings size={18} />}
                        tone="slate"
                        style={{ marginBottom: '2rem' }}
                    />

                    {isLoading || !settings ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
                            <LoadingSpinner size={40} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            
                            {/* Tags Section */}
                            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)' }}>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#0f172a' }}>Global Categories (Tags)</h2>
                                    <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>These tags are available for volunteers to attach to their work entries.</p>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    {settings.tags.map((tag, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', padding: '0.25rem 0.25rem 0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #e2e8f0', transition: 'border-color 0.2s' }} className="hover:border-slate-300">
                                            <input
                                                value={tag}
                                                onChange={(e) => updateTag(i, e.target.value)}
                                                style={{ background: 'transparent', border: 'none', outline: 'none', width: '90px', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}
                                            />
                                            <button
                                                onClick={() => removeTag(i)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.4rem', borderRadius: '50%', display: 'flex', alignItems: 'center', transition: 'background 0.2s' }}
                                                className="hover:bg-red-50"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    <button 
                                        onClick={addTag} 
                                        style={{ background: 'white', border: '1px dashed #cbd5e1', borderRadius: '999px', padding: '0.4rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', transition: 'all 0.2s' }}
                                        className="hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50"
                                    >
                                        <Plus size={14} /> Add Tag
                                    </button>
                                </div>
                            </div>

                            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)' }}>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#0f172a' }}>Weekly Update Schedule</h2>
                                    <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>
                                        Control when volunteers can submit weekly updates and how the dashboard deadline card behaves.
                                    </p>
                                </div>

                                <div style={{ display: 'grid', gap: '1.25rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>Window Mode</label>
                                            <select
                                                className="form-input"
                                                value={settings.weekly_updates.window_mode}
                                                onChange={(e) => updateWeeklySettings('window_mode', e.target.value as WeeklyUpdateSettings['window_mode'])}
                                            >
                                                <option value="always_open">Always Open</option>
                                                <option value="scheduled">Scheduled Window</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>Timezone</label>
                                            <input
                                                className="form-input"
                                                value={settings.weekly_updates.timezone}
                                                onChange={(e) => updateWeeklySettings('timezone', e.target.value)}
                                                placeholder="America/New_York"
                                            />
                                        </div>
                                    </div>

                                    <div style={{ padding: '1rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.85rem' }}>Window Opens</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>Day</label>
                                                <select
                                                    className="form-input"
                                                    value={settings.weekly_updates.submissions_open_day}
                                                    onChange={(e) => updateWeeklySettings('submissions_open_day', e.target.value as WeeklyUpdateSettings['submissions_open_day'])}
                                                    disabled={settings.weekly_updates.window_mode === 'always_open'}
                                                >
                                                    {DAY_OPTIONS.map((day) => (
                                                        <option key={day} value={day}>
                                                            {day.charAt(0).toUpperCase() + day.slice(1)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <Input
                                                label="Hour"
                                                type="number"
                                                min={0}
                                                max={23}
                                                value={settings.weekly_updates.submissions_open_hour}
                                                onChange={(e) => updateWeeklySettings('submissions_open_hour', Number(e.target.value))}
                                                disabled={settings.weekly_updates.window_mode === 'always_open'}
                                            />

                                            <Input
                                                label="Minute"
                                                type="number"
                                                min={0}
                                                max={59}
                                                value={settings.weekly_updates.submissions_open_minute}
                                                onChange={(e) => updateWeeklySettings('submissions_open_minute', Number(e.target.value))}
                                                disabled={settings.weekly_updates.window_mode === 'always_open'}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ padding: '1rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.85rem' }}>Submission Deadline</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>Day</label>
                                                <select
                                                    className="form-input"
                                                    value={settings.weekly_updates.deadline_day}
                                                    onChange={(e) => updateWeeklySettings('deadline_day', e.target.value as WeeklyUpdateSettings['deadline_day'])}
                                                >
                                                    {DAY_OPTIONS.map((day) => (
                                                        <option key={day} value={day}>
                                                            {day.charAt(0).toUpperCase() + day.slice(1)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <Input
                                                label="Hour"
                                                type="number"
                                                min={0}
                                                max={23}
                                                value={settings.weekly_updates.deadline_hour}
                                                onChange={(e) => updateWeeklySettings('deadline_hour', Number(e.target.value))}
                                            />

                                            <Input
                                                label="Minute"
                                                type="number"
                                                min={0}
                                                max={59}
                                                value={settings.weekly_updates.deadline_minute}
                                                onChange={(e) => updateWeeklySettings('deadline_minute', Number(e.target.value))}
                                            />
                                        </div>
                                    </div>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={settings.weekly_updates.allow_late_submissions}
                                            onChange={(e) => updateWeeklySettings('allow_late_submissions', e.target.checked)}
                                            style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary-gold)' }}
                                        />
                                        Allow late submissions after the deadline
                                    </label>
                                </div>
                            </div>

                            {/* Form Sections */}
                            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#0f172a' }}>Dynamic Form Sections</h2>
                                        <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>Configure the sections volunteers fill out weekly.</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={addSection}>
                                        <Plus size={16} style={{ marginRight: '0.4rem' }} /> Add Section
                                    </Button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {settings.form_sections.map((section, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '1rem', background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', position: 'relative', transition: 'border-color 0.2s' }} className="hover:border-slate-300">
                                            <div style={{ marginTop: '0.25rem', color: '#cbd5e1', cursor: 'grab' }}>
                                                <GripVertical size={20} />
                                            </div>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>Section Title</label>
                                                        <input 
                                                            className="form-input" 
                                                            value={section.title} 
                                                            onChange={(e) => updateSection(i, 'title', e.target.value)} 
                                                            style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>Subtitle / Instruction</label>
                                                        <input 
                                                            className="form-input" 
                                                            value={section.subtitle} 
                                                            onChange={(e) => updateSection(i, 'subtitle', e.target.value)} 
                                                            style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                                        />
                                                    </div>
                                                    <div style={{ maxWidth: '100px' }}>
                                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem', textAlign: 'center' }}>Icon Emoji</label>
                                                        <input 
                                                            className="form-input" 
                                                            value={section.icon} 
                                                            onChange={(e) => updateSection(i, 'icon', e.target.value)} 
                                                            style={{ textAlign: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                                        />
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                                        <input type="checkbox" checked={section.showHours} onChange={(e) => updateSection(i, 'showHours', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary-gold)' }} />
                                                        Requires Time Tracking
                                                    </label>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                                        <input type="checkbox" checked={section.required} onChange={(e) => updateSection(i, 'required', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary-gold)' }} />
                                                        Mandatory Section
                                                    </label>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 'auto', fontFamily: 'monospace' }}>
                                                        ID: {section.id}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => removeSection(i)}
                                                style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'white', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'background 0.2s' }}
                                                className="hover:bg-red-50 hover:border-red-300"
                                                title="Remove Section"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            <Footer />

            {/* Custom Toast Notification Popup */}
            {toastMessage && (
                <div style={{
                    position: 'fixed',
                    bottom: '2rem',
                    right: '2rem',
                    background: toastMessage.includes('Error') ? '#ef4444' : 'var(--color-primary-gold)',
                    color: toastMessage.includes('Error') ? '#fff' : '#0f172a',
                    padding: '1rem 1.5rem',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    fontWeight: 700,
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
                }}>
                    <CheckCircle size={20} />
                    {toastMessage}
                </div>
            )}
        </div>
    );
}
