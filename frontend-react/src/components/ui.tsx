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
    info?: ReactNode;
}

export function StatCard({ value, label, icon, info }: StatCardProps) {
    return (
        <div className="stat-card">
            {icon && <div style={{ marginBottom: '0.5rem', color: 'var(--color-primary-gold)' }}>{icon}</div>}
            <div className="stat-value">{value}</div>
            <div className="stat-label">
                {label}
                {info && <InfoTooltip content={info} />}
            </div>
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

interface GuidancePanelProps extends Omit<HTMLAttributes<HTMLDetailsElement>, 'title'> {
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
            iconColor: '#b45309',
            text: '#78350f',
            muted: '#92400e',
        },
        slate: {
            background: '#f8fafc',
            border: '#cbd5e1',
            iconColor: '#475569',
            text: '#0f172a',
            muted: '#475569',
        },
        warning: {
            background: '#fef2f2',
            border: '#fecaca',
            iconColor: '#b91c1c',
            text: '#7f1d1d',
            muted: '#991b1b',
        },
    } as const;

    const currentTone = toneStyles[tone];

    return (
        <details
            className={`guidance-panel ${className}`}
            style={{
                background: currentTone.background,
                border: `1px solid ${currentTone.border}`,
                borderRadius: '8px',
                padding: '0.5rem 0.75rem',
                ...style,
            }}
            {...props}
        >
            <summary style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: currentTone.text,
                cursor: 'pointer',
                listStyle: 'none'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {icon && <span style={{ color: currentTone.iconColor, display: 'flex' }}>{icon}</span>}
                    <span>{title}</span>
                </div>
            </summary>
            
            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: `1px solid ${currentTone.border}` }}>
                {description && (
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', lineHeight: 1.5, color: currentTone.muted }}>
                        {description}
                    </p>
                )}
                {items.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', color: currentTone.muted, fontSize: '0.8rem' }}>
                        {items.map((item, index) => (
                            <li key={index} style={{ lineHeight: 1.4 }}>
                                {item}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <style>{`
                .guidance-panel summary::-webkit-details-marker { display: none; }
                .guidance-panel[open] { padding-bottom: 0.75rem; }
            `}</style>
        </details>
    );
}

export function InfoTooltip({ content }: { content: ReactNode }) {
    return (
        <span className="tooltip-container" aria-label={typeof content === 'string' ? content : undefined}>
            <svg 
                className="tooltip-icon"
                xmlns="http://www.w3.org/2000/svg" 
                width="14" 
                height="14" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
            >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span className="tooltip-content" role="tooltip">{content}</span>
        </span>
    );
}
