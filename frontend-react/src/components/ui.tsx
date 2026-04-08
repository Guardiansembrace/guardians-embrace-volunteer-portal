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
