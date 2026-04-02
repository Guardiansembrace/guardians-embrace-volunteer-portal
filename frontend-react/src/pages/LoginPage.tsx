import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../lib/useAuth';
import { Button, LoadingSpinner } from '../components/ui';
import { Logo } from '../components/Logo';
import { Shield, Users, Clock, FileText } from 'lucide-react';

function formatGoogleLoginError(error?: string, description?: string) {
    if (error === 'redirect_uri_mismatch') {
        return 'Google OAuth is not configured for this site URL yet. Add this frontend URL in Google Cloud Console and try again.';
    }

    if (description) {
        return `Google login failed: ${description}`;
    }

    if (error) {
        return `Google login failed: ${error}`;
    }

    return 'Google login failed. Please try again.';
}

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, isAuthenticated, isLoading, needsName } = useAuth();
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    useEffect(() => {
        if (isAuthenticated && !isLoading) {
            navigate(needsName ? '/set-name' : '/dashboard');
        }
    }, [isAuthenticated, isLoading, needsName, navigate]);

    const googleLogin = useGoogleLogin({
        flow: 'implicit',
        onSuccess: async (tokenResponse) => {
            setIsLoggingIn(true);
            setLoginError(null);
            try {
                await login(tokenResponse.access_token);
                // Navigation will be handled by the useEffect above
            } catch (error) {
                setLoginError(error instanceof Error ? error.message : 'Login failed');
            } finally {
                setIsLoggingIn(false);
            }
        },
        onError: (errorResponse) => {
            setLoginError(formatGoogleLoginError(errorResponse.error, errorResponse.error_description));
        },
        onNonOAuthError: (errorResponse) => {
            if (errorResponse.type === 'popup_closed') {
                setLoginError('Google login was canceled before it completed.');
                return;
            }
            if (errorResponse.type === 'popup_failed_to_open') {
                setLoginError('Google login popup could not open. Check popup blocking and try again.');
                return;
            }
            setLoginError('Google login failed before authorization completed. Please try again.');
        },
        // Request Drive scope for file uploads to user's personal Drive
        scope: 'https://www.googleapis.com/auth/drive.file',
    });

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

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Hero Section */}
            <div style={{
                background: 'linear-gradient(rgba(0,0,0,0.75), rgba(0,0,0,0.75)), url("https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=1920") center/cover',
                color: 'white',
                padding: '4rem 1rem',
                textAlign: 'center',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
            }}>
                <div style={{ marginBottom: '1rem' }}>
                    <Logo size={100} style={{ filter: 'drop-shadow(0 4px 8px rgba(212, 175, 55, 0.3))' }} />
                </div>

                <h1 style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                    fontWeight: 800,
                    marginBottom: '0.5rem',
                    color: 'white',
                }}>
                    Guardian's Embrace
                </h1>

                <p style={{
                    fontSize: '1.25rem',
                    color: 'var(--color-primary-gold)',
                    fontWeight: 600,
                    marginBottom: '2rem',
                }}>
                    Volunteer Portal
                </p>

                <p style={{
                    maxWidth: '600px',
                    fontSize: '1.1rem',
                    lineHeight: 1.7,
                    marginBottom: '2.5rem',
                    color: 'rgba(255,255,255,0.9)',
                }}>
                    Welcome, volunteer! Sign in to submit your weekly updates,
                    track your contributions, and stay connected with our mission.
                </p>

                <Button
                    variant="primary"
                    size="lg"
                    onClick={() => googleLogin()}
                    disabled={isLoggingIn}
                    isLoading={isLoggingIn}
                    style={{ padding: '1rem 2.5rem', fontSize: '1rem' }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: '0.5rem' }}>
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign in with Google
                </Button>

                {loginError && (
                    <p style={{
                        marginTop: '1rem',
                        color: 'var(--color-error)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        padding: '0.75rem 1.5rem',
                        borderRadius: 'var(--radius-md)',
                    }}>
                        {loginError}
                    </p>
                )}
            </div>

            {/* Features Section */}
            <div style={{ background: 'var(--color-bg-secondary)', padding: '4rem 1rem' }}>
                <div className="container">
                    <h2 style={{ textAlign: 'center', marginBottom: '3rem', fontFamily: 'var(--font-heading)', fontSize: '1.75rem' }}>
                        What You Can Do
                    </h2>

                    <div className="grid grid-cols-4" style={{ maxWidth: '1000px', margin: '0 auto' }}>
                        <FeatureCard icon={<FileText size={32} />} title="Submit Updates" description="Log your weekly work, hours, and progress" />
                        <FeatureCard icon={<Clock size={32} />} title="Track Hours" description="Monitor your volunteer hours over time" />
                        <FeatureCard icon={<Users size={32} />} title="Stay Connected" description="Communicate with leadership" />
                        <FeatureCard icon={<Shield size={32} />} title="Make Impact" description="See how your work contributes" />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer style={{
                background: 'var(--color-dark-bg)',
                color: 'var(--color-text-on-dark)',
                padding: '2rem',
                textAlign: 'center',
            }}>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    © 2026 Guardian's Embrace •
                    <a href="https://guardiansembrace.org" target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--color-primary-gold)', marginLeft: '0.5rem' }}>
                        guardiansembrace.org
                    </a>
                </p>
            </footer>
        </div>
    );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
    return (
        <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--color-border)',
        }}>
            <div style={{ color: 'var(--color-primary-gold)', marginBottom: '1rem' }}>{icon}</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>{title}</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>{description}</p>
        </div>
    );
}
