import { useId } from 'react';
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, HTMLAttributes } from 'react';

// Button Component
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    children: ReactNode;
}

export function Button({
    variant = 'primary',
    size = 'md',
    isLoading = false,
    children,
    className = '',
    disabled,
    ...props
}: ButtonProps) {
    const variantClasses: Record<string, string> = {
        primary: 'btn-primary',
        secondary: 'btn-secondary',
        dark: 'btn-dark',
        ghost: 'btn-ghost',
        danger: 'btn-primary',
        outline: 'btn-outline',
    };

    const sizeClasses: Record<string, string> = {
        sm: 'btn-sm',
        md: '',
        lg: 'btn-lg',
    };

    const dangerStyle = variant === 'danger' ? {
        background: 'var(--color-error)',
        boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)'
    } : {};

    return (
        <button
            className={`btn ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
            disabled={disabled || isLoading}
            style={dangerStyle}
            aria-busy={isLoading || undefined}
            {...props}
        >
            {isLoading ? (
                <>
                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Loading...
                </>
            ) : children}
        </button>
    );
}

// Card Components
interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export function Card({ children, className = '', style, ...props }: CardProps) {
    return <div className={`card ${className}`} style={style} {...props}>{children}</div>;
}

export function CardHeader({ children, className = '' }: CardProps) {
    return <div className={`card-header ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: CardProps) {
    return <h3 className={`card-title ${className}`}>{children}</h3>;
}

// Badge Component
interface BadgeProps {
    children: ReactNode;
    variant?: 'draft' | 'submitted' | 'reviewed' | 'admin' | 'default';
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
    const variantClasses: Record<string, string> = {
        draft: 'badge-draft',
        submitted: 'badge-submitted',
        reviewed: 'badge-reviewed',
        admin: 'badge-admin',
        default: '',
    };

    return <span className={`badge ${variantClasses[variant]}`}>{children}</span>;
}

// StatCard Component
interface StatCardProps {
    value: string | number;
    label: string;
    icon?: ReactNode;
}

export function StatCard({ value, label, icon }: StatCardProps) {
    return (
        <div className="stat-card">
            {icon && <div style={{ marginBottom: '0.5rem', color: 'var(--color-primary-gold)' }}>{icon}</div>}
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
        </div>
    );
}

// Input Component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
    const generatedId = useId();
    const inputId = props.id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
        <div className="form-group">
            {label && <label className="form-label" htmlFor={inputId}>{label}</label>}
            <input
                id={inputId}
                className={`form-input ${className}`}
                aria-invalid={error ? true : undefined}
                aria-describedby={errorId}
                {...props}
            />
            {error && <p id={errorId} className="form-error">{error}</p>}
        </div>
    );
}

// Textarea Component
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
    const generatedId = useId();
    const textareaId = props.id ?? generatedId;
    const errorId = error ? `${textareaId}-error` : undefined;

    return (
        <div className="form-group">
            {label && <label className="form-label" htmlFor={textareaId}>{label}</label>}
            <textarea
                id={textareaId}
                className={`form-textarea ${className}`}
                aria-invalid={error ? true : undefined}
                aria-describedby={errorId}
                {...props}
            />
            {error && <p id={errorId} className="form-error">{error}</p>}
        </div>
    );
}

// Loading Spinner
export function LoadingSpinner({ size = 40 }: { size?: number }) {
    return (
        <div className="loading-container">
            <div className="spinner" style={{ width: size, height: size }} />
        </div>
    );
}

// Empty State
interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="empty-state">
            {icon && <div className="empty-state-icon">{icon}</div>}
            <h3 className="empty-state-title">{title}</h3>
            {description && <p>{description}</p>}
            {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
        </div>
    );
}

interface GuidancePanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    title: ReactNode;
    description?: ReactNode;
    items?: ReactNode[];
    icon?: ReactNode;
    tone?: 'gold' | 'slate' | 'warning';
}

export function GuidancePanel({
    title,
    description,
    items = [],
    icon,
    tone = 'gold',
    className = '',
    style,
    ...props
}: GuidancePanelProps) {
    const toneStyles = {
        gold: {
            background: '#fffbeb',
            border: '#fde68a',
            iconBackground: '#fef3c7',
            iconColor: '#b45309',
            text: '#78350f',
            muted: '#92400e',
        },
        slate: {
            background: '#f8fafc',
            border: '#cbd5e1',
            iconBackground: '#ffffff',
            iconColor: '#475569',
            text: '#0f172a',
            muted: '#475569',
        },
        warning: {
            background: '#fef2f2',
            border: '#fecaca',
            iconBackground: '#fee2e2',
            iconColor: '#b91c1c',
            text: '#7f1d1d',
            muted: '#991b1b',
        },
    } as const;

    const currentTone = toneStyles[tone];

    return (
        <div
            className={className}
            style={{
                background: currentTone.background,
                border: `1px solid ${currentTone.border}`,
                borderRadius: '16px',
                padding: '1rem 1.25rem',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                ...style,
            }}
            {...props}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                {icon && (
                    <div
                        aria-hidden="true"
                        style={{
                            width: '2.25rem',
                            height: '2.25rem',
                            borderRadius: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: currentTone.iconBackground,
                            color: currentTone.iconColor,
                            flexShrink: 0,
                        }}
                    >
                        {icon}
                    </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: currentTone.text }}>
                        {title}
                    </div>
                    {description && (
                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', lineHeight: 1.55, color: currentTone.muted }}>
                            {description}
                        </p>
                    )}
                    {items.length > 0 && (
                        <ul className="hidden-mobile" style={{ margin: description ? '0.75rem 0 0 1.15rem' : '0.6rem 0 0 1.15rem', padding: 0, display: 'grid', gap: '0.4rem', color: currentTone.muted }}>
                            {items.map((item, index) => (
                                <li key={index} style={{ lineHeight: 1.5 }}>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
