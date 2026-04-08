const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'NewSubmissionPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const marker = "function ReadOnlyEntries({ entries, showHours }: { entries: FormEntry[]; showHours: boolean }) {";
const index = content.indexOf(marker);

if (index === -1) {
    console.error("Marker not found!");
    process.exit(1);
}

const beforeMarker = content.substring(0, index);

const restOfFile = `function ReadOnlyEntries({ entries, showHours }: { entries: FormEntry[]; showHours: boolean }) {
    const filledEntries = entries.filter(e => e.description.trim());

    if (filledEntries.length === 0) {
        return (
            <div style={{ padding: '1rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>No entries.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '0 1rem 1rem' }}>
            {filledEntries.map((entry) => (
                <div
                    key={entry.id}
                    style={{
                        padding: '0.75rem 1rem',
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '1rem',
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>{entry.description}</p>
                        {entry.tags && entry.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                                {entry.tags.map((tag) => (
                                    <span key={tag} style={{
                                        fontSize: '0.65rem',
                                        padding: '0.1rem 0.45rem',
                                        borderRadius: '1rem',
                                        background: 'var(--color-primary-gold-light, #F5E6B8)',
                                        color: 'var(--color-text-secondary)',
                                        fontWeight: 500,
                                    }}>{tag}</span>
                                ))}
                            </div>
                        )}
                        {entry.drive_link && (
                            <a
                                href={entry.drive_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: '0.75rem', color: 'var(--color-primary-gold)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}
                            >
                                <LinkIcon size={12} /> Drive Link <ExternalLink size={10} />
                            </a>
                        )}
                    </div>
                    {showHours && entry.hours > 0 && (
                        <span style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--color-text-secondary)',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                        }}>
                            <Clock size={14} /> {entry.hours}h
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── Editable Work Entry List ────────────────────────────────────────────

function WorkEntryList({
    entries,
    setEntries,
    showHours,
    onChange,
    categories = [],
}: {
    entries: FormEntry[];
    setEntries: React.Dispatch<React.SetStateAction<FormEntry[]>>;
    showHours: boolean;
    onChange: (id: string, field: keyof FormEntry, value: string | number, setter: React.Dispatch<React.SetStateAction<FormEntry[]>>) => void;
    categories?: string[];
}) {
    const toggleTag = (entryId: string, tag: string) => {
        setEntries(prev => prev.map(e => {
            if (e.id !== entryId) return e;
            const has = e.tags.includes(tag);
            return { ...e, tags: has ? e.tags.filter(t => t !== tag) : [...e.tags, tag] };
        }));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {entries.map((entry, index) => (
                <div key={entry.id} style={{ paddingBottom: index < entries.length - 1 ? '1.25rem' : '0', borderBottom: index < entries.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <div className="flex items-start" style={{ gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        <div style={{ flex: '1 1 250px' }}>
                            <Input
                                placeholder="Describe what you worked on..."
                                value={entry.description}
                                onChange={(e) => onChange(entry.id, 'description', e.target.value, setEntries)}
                            />
                        </div>
                        {showHours && (
                            <div style={{ width: '100px', flexShrink: 0 }}>
                                <div style={{ position: 'relative' }}>
                                    <Clock size={16} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        placeholder="Hours"
                                        value={entry.hours || ''}
                                        onChange={(e) => onChange(entry.id, 'hours', parseFloat(e.target.value) || 0, setEntries)}
                                        className="form-input"
                                        style={{ padding: '0.5rem 0.5rem 0.5rem 2.25rem', fontWeight: 600, width: '100%' }}
                                    />
                                </div>
                            </div>
                        )}
                        {entries.length > 1 && (
                            <Button variant="ghost" onClick={() => setEntries(prev => prev.filter(e => e.id !== entry.id))} style={{ padding: '0.5rem', color: 'var(--color-error)' }}>
                                <Trash2 size={18} />
                            </Button>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <LinkIcon size={16} style={{ color: 'var(--color-text-muted)' }} />
                        <input
                            type="url"
                            placeholder="Link to Drive file, Docs, or external resource (optional)"
                            value={entry.drive_link}
                            onChange={(e) => onChange(entry.id, 'drive_link', e.target.value, setEntries)}
                            className="form-input"
                            style={{ padding: '0.4rem 0.5rem', fontSize: '0.85rem', flex: 1 }}
                        />
                    </div>
                    {/* Category Tags */}
                    {categories.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {categories.map((cat) => {
                                const isSelected = entry.tags.includes(cat);
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => toggleTag(entry.id, cat)}
                                        style={{
                                            fontSize: '0.72rem',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '999px',
                                            border: isSelected ? '1px solid var(--color-primary-gold)' : '1px solid var(--color-border)',
                                            background: isSelected ? 'var(--color-primary-gold-light, #FDF4D9)' : 'white',
                                            color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                            fontWeight: isSelected ? 600 : 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        <Tag size={10} style={{ display: 'inline', marginRight: '0.2rem' }} />
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
                <Button variant="outline" onClick={() => setEntries(prev => [...prev, createEntry()])} style={{ borderRadius: '999px', padding: '0.4rem 1.2rem', fontSize: '0.8rem' }}>
                    <Plus size={16} style={{ marginRight: '0.4rem' }} /> Add Another Entry
                </Button>
            </div>
        </div>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return \`\${bytes} B\`;
    if (bytes < 1024 * 1024) return \`\${(bytes / 1024).toFixed(1)} KB\`;
    return \`\${(bytes / (1024 * 1024)).toFixed(1)} MB\`;
}
`;

fs.writeFileSync(filePath, beforeMarker + restOfFile, 'utf8');
console.log("Fixed!");
