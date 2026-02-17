import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { UploadedFile } from '../lib/api';
import { Upload, X, FileText, Check, AlertCircle, ExternalLink } from 'lucide-react';

interface FileUploadProps {
    weekId?: string;
    onFileUploaded?: (file: UploadedFile) => void;
    maxFiles?: number;
}

interface UploadingFile {
    file: File;
    status: 'pending' | 'uploading' | 'success' | 'error';
    result?: UploadedFile;
    error?: string;
}

export function FileUpload({ weekId, onFileUploaded, maxFiles = 10 }: FileUploadProps) {
    const [files, setFiles] = useState<UploadingFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null);

    const [storageType, setStorageType] = useState<'drive_org' | 'drive_personal' | 'local' | null>(null);
    const [folderName, setFolderName] = useState<string | null>(null);

    // Check Drive status on first interaction
    const checkDriveStatus = useCallback(async () => {
        if (driveConfigured === null) {
            try {
                const status = await api.getDriveStatus();
                setDriveConfigured(status.configured);
                setStorageType(status.storage_type);
                setFolderName(status.folder_name || null);
            } catch {
                setDriveConfigured(false);
                setStorageType('local');
            }
        }
    }, [driveConfigured]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
        checkDriveStatus();
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const droppedFiles = Array.from(e.dataTransfer.files);
        await uploadFiles(droppedFiles);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files);
            await uploadFiles(selectedFiles);
            e.target.value = ''; // Reset input
        }
    };

    const uploadFiles = async (newFiles: File[]) => {
        await checkDriveStatus();

        // Limit number of files
        const remainingSlots = maxFiles - files.filter(f => f.status === 'success').length;
        const filesToUpload = newFiles.slice(0, remainingSlots);

        // Add files to state with pending status
        const uploadingFiles: UploadingFile[] = filesToUpload.map(file => ({
            file,
            status: 'pending' as const,
        }));

        setFiles(prev => [...prev, ...uploadingFiles]);

        // Upload each file
        for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];
            const fileIndex = files.length + i;

            setFiles(prev => prev.map((f, idx) =>
                idx === fileIndex ? { ...f, status: 'uploading' as const } : f
            ));

            try {
                const result = await api.uploadFile(file, weekId);

                setFiles(prev => prev.map((f, idx) =>
                    idx === fileIndex ? { ...f, status: 'success' as const, result } : f
                ));

                if (onFileUploaded) {
                    onFileUploaded(result);
                }
            } catch (error) {
                setFiles(prev => prev.map((f, idx) =>
                    idx === fileIndex ? {
                        ...f,
                        status: 'error' as const,
                        error: error instanceof Error ? error.message : 'Upload failed'
                    } : f
                ));
            }
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const successfulUploads = files.filter(f => f.status === 'success');

    const getStorageText = () => {
        if (storageType === 'drive_org') return `Files uploaded to Organization Drive${folderName ? ` → ${folderName}` : ''}`;
        if (storageType === 'drive_personal') return `Files uploaded to your Personal Drive${folderName ? ` → ${folderName}` : ''}`;
        return 'Files will be stored securely on the server';
    };

    return (
        <div style={{ marginBottom: '1rem' }}>
            {/* Drop Zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={checkDriveStatus}
                style={{
                    border: `2px dashed ${isDragging ? 'var(--color-primary-gold)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '2rem',
                    textAlign: 'center',
                    background: isDragging ? 'var(--color-primary-gold-light)' : 'var(--color-bg-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="file-upload-input"
                />
                <label htmlFor="file-upload-input" style={{ cursor: 'pointer', display: 'block' }}>
                    <Upload
                        size={40}
                        style={{
                            color: isDragging ? 'var(--color-primary-gold)' : 'var(--color-text-muted)',
                            marginBottom: '0.5rem'
                        }}
                    />
                    <p style={{ margin: 0, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        Drag & drop files here, or click to select
                    </p>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        {getStorageText()}
                    </p>
                </label>
            </div>

            {/* Storage Info/Warning */}
            <div style={{
                marginTop: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
            }}>
                {storageType === 'local' && (
                    <div style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={16} />
                        <span>Storage: Local Server</span>
                    </div>
                )}
                {(storageType === 'drive_org' || storageType === 'drive_personal') && (
                    <div style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Check size={16} />
                        <span>Storage: {storageType === 'drive_org' ? 'Guardian\'s Drive' : 'Personal Drive'}</span>
                    </div>
                )}
            </div>

            {/* File List */}
            {files.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Uploaded Files ({successfulUploads.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {files.map((uploadingFile, index) => (
                            <div
                                key={index}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem',
                                    background: 'var(--color-bg-secondary)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--color-border)',
                                }}
                            >
                                <FileText size={20} style={{ color: 'var(--color-text-muted)' }} />

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{
                                        margin: 0,
                                        fontSize: '0.875rem',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {uploadingFile.file.name}
                                    </p>

                                    {uploadingFile.status === 'uploading' && (
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-primary-gold)' }}>
                                            Uploading...
                                        </p>
                                    )}

                                    {uploadingFile.status === 'error' && (
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-error)' }}>
                                            {uploadingFile.error}
                                        </p>
                                    )}

                                    {uploadingFile.status === 'success' && uploadingFile.result && (
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <a
                                                href={uploadingFile.result.drive_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    fontSize: '0.75rem',
                                                    color: 'var(--color-primary-gold)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                }}
                                            >
                                                {uploadingFile.result.storage_type?.includes('drive') ? 'View in Drive' : 'Download File'} <ExternalLink size={12} />
                                            </a>

                                            {/* Location Badge */}
                                            <span style={{
                                                fontSize: '0.65rem',
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: '1rem',
                                                background: uploadingFile.result.storage_type?.includes('drive')
                                                    ? 'rgba(var(--color-success-rgb), 0.1)'
                                                    : 'rgba(var(--color-text-muted-rgb), 0.1)',
                                                color: uploadingFile.result.storage_type?.includes('drive')
                                                    ? 'var(--color-success)'
                                                    : 'var(--color-text-muted)',
                                                border: '1px solid currentColor'
                                            }}>
                                                {uploadingFile.result.storage_type === 'drive_org' && 'Org Drive'}
                                                {uploadingFile.result.storage_type === 'drive_personal' && 'Personal Drive'}
                                                {uploadingFile.result.storage_type === 'local' && 'Local Server'}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Status Icon */}
                                {uploadingFile.status === 'uploading' && (
                                    <div className="spinner" style={{ width: 20, height: 20 }} />
                                )}

                                {uploadingFile.status === 'success' && (
                                    <Check size={20} style={{ color: 'var(--color-success)' }} />
                                )}

                                {uploadingFile.status === 'error' && (
                                    <AlertCircle size={20} style={{ color: 'var(--color-error)' }} />
                                )}

                                {/* Remove Button */}
                                <button
                                    onClick={() => removeFile(index)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '0.25rem',
                                        color: 'var(--color-text-muted)',
                                    }}
                                    title="Remove"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default FileUpload;
