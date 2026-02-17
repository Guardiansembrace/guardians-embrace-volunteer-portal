import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Comment } from '../lib/api';
import { Button } from './ui';
import { Send, MessageCircle, Reply, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface CommentSectionProps {
    submissionId: string;
}

export default function CommentSection({ submissionId }: CommentSectionProps) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [replyTo, setReplyTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        loadComments();
    }, [submissionId]);

    const loadComments = async () => {
        try {
            const data = await api.getComments(submissionId);
            setComments(data);
        } catch {
            // silently fail
        } finally {
            setIsLoading(false);
        }
    };

    const handlePost = async () => {
        if (!newComment.trim()) return;
        setIsSending(true);
        try {
            await api.createComment(submissionId, newComment.trim());
            setNewComment('');
            await loadComments();
        } catch {
            // silently fail
        } finally {
            setIsSending(false);
        }
    };

    const handleReply = async (parentId: string) => {
        if (!replyText.trim()) return;
        setIsSending(true);
        try {
            await api.createComment(submissionId, replyText.trim(), parentId);
            setReplyText('');
            setReplyTo(null);
            await loadComments();
        } catch {
            // silently fail
        } finally {
            setIsSending(false);
        }
    };

    const totalComments = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <MessageCircle size={16} style={{ color: 'var(--color-text-muted)' }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {totalComments} comment{totalComments !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Comment Input */}
            <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                        <textarea
                            placeholder="Add a comment..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            rows={2}
                            className="form-input"
                            style={{
                                width: '100%',
                                padding: '0.6rem 0.75rem',
                                fontSize: '0.85rem',
                                resize: 'vertical',
                                minHeight: '60px',
                            }}
                        />
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handlePost}
                        disabled={!newComment.trim() || isSending}
                        style={{ alignSelf: 'flex-end' }}
                    >
                        <Send size={14} />
                    </Button>
                </div>
            </div>

            {/* Comments List */}
            {isLoading ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading comments...</p>
            ) : comments.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
                    No comments yet. Start the conversation!
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {comments.map((comment) => (
                        <div key={comment.id}>
                            {/* Root Comment */}
                            <CommentBubble
                                comment={comment}
                                onReply={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                            />

                            {/* Replies */}
                            {comment.replies && comment.replies.length > 0 && (
                                <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {comment.replies.map((reply) => (
                                        <CommentBubble
                                            key={reply.id}
                                            comment={reply}
                                            isReply
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Reply Input */}
                            {replyTo === comment.id && (
                                <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Write a reply..."
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        className="form-input"
                                        style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleReply(comment.id)}
                                        autoFocus
                                    />
                                    <Button variant="primary" size="sm" onClick={() => handleReply(comment.id)} disabled={!replyText.trim() || isSending}>
                                        <Send size={12} />
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function CommentBubble({
    comment,
    isReply = false,
    onReply,
}: {
    comment: Comment;
    isReply?: boolean;
    onReply?: () => void;
}) {

    return (
        <div style={{
            padding: '0.6rem 0.85rem',
            background: comment.is_admin ? 'var(--color-primary-gold-light, #F5E6B8)' : 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-md)',
            borderLeft: comment.is_admin ? '3px solid var(--color-primary-gold)' : 'none',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {comment.user_name}
                    </span>
                    {comment.is_admin && (
                        <span style={{
                            fontSize: '0.6rem',
                            padding: '0.05rem 0.35rem',
                            borderRadius: '1rem',
                            background: 'var(--color-primary-gold)',
                            color: 'white',
                            fontWeight: 600,
                        }}>Admin</span>
                    )}
                    {comment.is_edited && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>(edited)</span>
                    )}
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Clock size={10} />
                    {format(parseISO(comment.created_at), 'MMM d, h:mm a')}
                </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.4 }}>{comment.content}</p>
            {onReply && !isReply && (
                <button
                    onClick={onReply}
                    style={{
                        marginTop: '0.35rem',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        color: 'var(--color-primary-gold)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                        padding: 0,
                    }}
                >
                    <Reply size={12} /> Reply
                </button>
            )}
        </div>
    );
}
