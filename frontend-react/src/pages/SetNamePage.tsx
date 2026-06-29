import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { Button, LoadingSpinner } from '../components/ui';
import { Logo } from '../components/Logo';

export default function SetNamePage() {
    const navigate = useNavigate();
    const { user, setName, isLoading } = useAuth();
    const [fullName, setFullName] = useState(user?.name || '');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (isLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-bg-secondary)',
            }}>
                <LoadingSpinner size={50} />
            </div>
        );
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmed = fullName.trim();

        if (trimmed.length < 2) {
            setError('Name must be at least 2 characters.');
            return;
        }
        if (trimmed.length > 100) {
            setError('Name must be 100 characters or less.');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            await setName(trimmed);
            navigate('/dashboard');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save name.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg-secondary)',
            padding: '1rem',
        }}>
            <div style={{
                background: 'var(--color-bg-primary)',
                borderRadius: '16px',
                padding: '3rem 2.5rem',
                maxWidth: '480px',
                width: '100%',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                textAlign: 'center',
            }}>
                {/* Icon */}
                <div style={{ marginBottom: '1rem' }}>
                    <Logo size={80} style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))' }} />
                </div>

                {/* Heading */}
                <h1 style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                    marginBottom: '0.5rem',
                }}>
                    Welcome to Guardian's Embrace
                </h1>

                <p style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: '0.95rem',
                    marginBottom: '1.5rem',
                }}>
                    Please enter your full name to get started.
                </p>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                        <label
                            htmlFor="fullName"
                            style={{
                                display: 'block',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: 'var(--color-text-primary)',
                                marginBottom: '0.5rem',
                            }}
                        >
                            Full Name
                        </label>
                        <input
                            id="fullName"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Jane Doe"
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                fontSize: '1rem',
                                outline: 'none',
                                background: 'var(--color-bg-secondary)',
                                color: 'var(--color-text-primary)',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    {error && (
                        <p style={{
                            color: '#ef4444',
                            fontSize: '0.875rem',
                            marginBottom: '1rem',
                            textAlign: 'left',
                        }}>
                            {error}
                        </p>
                    )}

                    <Button
                        type="submit"
                        disabled={isSubmitting || fullName.trim().length < 2}
                        style={{ width: '100%', padding: '0.75rem 1.5rem', fontSize: '1rem' }}
                    >
                        {isSubmitting ? 'Saving…' : 'Continue →'}
                    </Button>
                </form>

                <p style={{
                    color: 'var(--color-text-muted)',
                    fontSize: '0.8rem',
                    marginTop: '1.5rem',
                }}>
                    Logged in as {user?.email}
                </p>
            </div>
        </div>
    );
}
