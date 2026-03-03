import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import type { AdminSettings, FormSection } from '../lib/api';
import { Navbar, Footer } from '../components/Layout';
import { Card, CardHeader, CardTitle, Button, Input, LoadingSpinner } from '../components/ui';
import { Settings, Plus, Trash2, Save, GripVertical, CheckCircle } from 'lucide-react';

export default function AdminSettingsPage() {
    const navigate = useNavigate();
    const { isAdmin, isLoading: authLoading, isAuthenticated } = useAuth();

    const [settings, setSettings] = useState<AdminSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
    };

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !isAdmin)) {
            navigate('/dashboard');
        }
    }, [authLoading, isAuthenticated, isAdmin, navigate]);

    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            loadSettings();
        }
    }, [isAuthenticated, isAdmin]);

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

    const updateSection = (index: number, field: keyof FormSection, value: any) => {
        if (!settings) return;
        const newSections = [...settings.form_sections];
        (newSections[index] as any)[field] = value;
        setSettings({ ...settings, form_sections: newSections });
    };

    if (authLoading || !isAuthenticated || !isAdmin) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <LoadingSpinner size={50} />
            </div>
        );
    }

    return (
        <div className="page-wrapper">
            <Navbar />
            <main className="main-content">
                <div className="container" style={{ maxWidth: '800px' }}>
                    <div className="flex-between" style={{ marginBottom: '2rem' }}>
                        <div>
                            <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Settings size={32} style={{ color: 'var(--color-primary-gold)' }} />
                                Form Settings
                            </h1>
                            <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Configure dynamic submission forms and global tags.</p>
                        </div>
                        <Button variant="primary" onClick={handleSave} disabled={isSaving || isLoading}>
                            {isSaving ? <LoadingSpinner size={16} /> : <Save size={16} style={{ marginRight: '0.5rem' }} />}
                            Save Changes
                        </Button>
                    </div>

                    {isLoading || !settings ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
                            <LoadingSpinner size={40} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <Card style={{ padding: '2rem' }}>
                                <CardHeader style={{ padding: 0, marginBottom: '1.5rem' }}>
                                    <CardTitle>Global Categories (Tags)</CardTitle>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>These tags are available for volunteers to attach to their work entries.</p>
                                </CardHeader>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                                    {settings.tags.map((tag, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', background: 'var(--color-bg-secondary)', padding: '0.25rem 0.25rem 0.25rem 0.75rem', borderRadius: '1rem', border: '1px solid var(--color-border)' }}>
                                            <input
                                                value={tag}
                                                onChange={(e) => updateTag(i, e.target.value)}
                                                style={{ background: 'transparent', border: 'none', outline: 'none', width: '100px', fontSize: '0.875rem', fontWeight: 500 }}
                                            />
                                            <button
                                                onClick={() => removeTag(i)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    <Button variant="outline" onClick={addTag} style={{ borderRadius: '1rem', padding: '0.25rem 1rem', height: 'auto', fontSize: '0.875rem' }}>
                                        <Plus size={14} style={{ marginRight: '0.25rem' }} /> Add Tag
                                    </Button>
                                </div>
                            </Card>

                            <Card style={{ padding: '2rem' }}>
                                <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
                                    <div>
                                        <CardTitle>Dynamic Form Sections</CardTitle>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Configure the sections volunteers fill out weekly.</p>
                                    </div>
                                    <Button variant="outline" onClick={addSection}>
                                        <Plus size={16} style={{ marginRight: '0.5rem' }} /> Add Section
                                    </Button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {settings.form_sections.map((section, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '1rem', background: '#FAFAFA', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', position: 'relative' }}>
                                            <div style={{ marginTop: '0.5rem', color: 'var(--color-text-muted)' }}>
                                                <GripVertical size={20} />
                                            </div>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div className="flex flex-col md:flex-row" style={{ gap: '1rem' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Section Title</label>
                                                        <Input value={section.title} onChange={(e) => updateSection(i, 'title', e.target.value)} />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Subtitle</label>
                                                        <Input value={section.subtitle} onChange={(e) => updateSection(i, 'subtitle', e.target.value)} />
                                                    </div>
                                                    <div style={{ width: '80px' }}>
                                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Icon</label>
                                                        <Input value={section.icon} onChange={(e) => updateSection(i, 'icon', e.target.value)} style={{ textAlign: 'center' }} />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center" style={{ gap: '1.5rem', marginTop: '0.5rem' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                                                        <input type="checkbox" checked={section.showHours} onChange={(e) => updateSection(i, 'showHours', e.target.checked)} />
                                                        Show Hours Field
                                                    </label>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                                                        <input type="checkbox" checked={section.required} onChange={(e) => updateSection(i, 'required', e.target.checked)} />
                                                        Required
                                                    </label>
                                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                                                        ID: {section.id}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeSection(i)}
                                                style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'var(--color-error-bg)', color: 'var(--color-error)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                title="Remove Section"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </Card>
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
                    background: toastMessage.includes('Error') ? 'var(--color-error)' : 'var(--color-primary-gold)',
                    color: toastMessage.includes('Error') ? '#fff' : 'var(--color-text-primary)',
                    padding: '1rem 1.5rem',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    fontWeight: 600,
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    animation: '0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0s 1 normal forwards slideUp'
                }}>
                    <CheckCircle size={20} />
                    {toastMessage}
                </div>
            )}
        </div>
    );
}
