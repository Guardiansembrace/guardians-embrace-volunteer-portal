
interface LogoProps {
    className?: string;
    style?: React.CSSProperties;
    size?: number | string;
}

export function Logo({ className = '', style, size = 50 }: LogoProps) {
    return (
        <img
            src="/logo.png"
            alt="Guardian's Embrace Logo"
            className={className}
            style={{
                width: size,
                height: 'auto',
                objectFit: 'contain',
                ...style
            }}
        />
    );
}
