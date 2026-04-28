import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '../lib/api';
import type { AppNotification } from '../lib/api';

const POLL_INTERVAL_MS = 60_000;

function timeAgo(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const fetchNotifications = useCallback(async () => {
        try {
            const data = await api.getNotifications(20);
            setNotifications(data.notifications);
            setUnreadCount(data.unread_count);
        } catch {
            // silently ignore — bell should never break the page
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function handleEsc(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, []);

    const handleOpen = async () => {
        setOpen(prev => !prev);
        if (!open && unreadCount > 0) {
            try {
                await api.markAllNotificationsRead();
                setUnreadCount(0);
                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            } catch {
                // ignore
            }
        }
    };

    const handleClick = (n: AppNotification) => {
        setOpen(false);
        if (n.link) navigate(n.link);
    };

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
                type="button"
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                aria-haspopup="true"
                aria-expanded={open}
                onClick={handleOpen}
                style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    color: 'var(--color-text-on-dark)',
                    transition: 'background 0.15s',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        minWidth: 16,
                        height: 16,
                        background: '#ef4444',
                        color: 'white',
                        borderRadius: '999px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 3px',
                        lineHeight: 1,
                    }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.5rem)',
                    right: 0,
                    width: 340,
                    background: 'var(--color-bg-primary)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1)',
                    border: '1px solid var(--color-border)',
                    zIndex: 50,
                    overflow: 'hidden',
                    animation: 'slideUp 0.15s ease-out',
                }}>
                    <div style={{
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid var(--color-border)',
                        background: 'var(--color-bg-secondary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                            Notifications
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread`}
                        </span>
                    </div>

                    <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                        {notifications.length === 0 ? (
                            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                                No notifications yet
                            </div>
                        ) : (
                            notifications.map(n => (
                                <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => handleClick(n)}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '0.875rem 1rem',
                                        background: n.read ? 'transparent' : 'rgba(212,175,55,0.07)',
                                        border: 'none',
                                        borderBottom: '1px solid var(--color-border)',
                                        cursor: n.link ? 'pointer' : 'default',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseOver={e => { if (n.link) e.currentTarget.style.background = 'var(--color-bg-secondary)'; }}
                                    onMouseOut={e => { e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(212,175,55,0.07)'; }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-text-primary)' }}>
                                            {n.title}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                                            {timeAgo(n.created_at)}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                                        {n.body}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
