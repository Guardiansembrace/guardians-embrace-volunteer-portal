import { api } from './api';
import { API_BASE_URL, API_PREFIX } from './config';

const FILE_DOWNLOAD_PREFIX = `${API_PREFIX}/files/download/`;

export function extractPortalFileId(link: string): string | null {
    try {
        const url = new URL(link, `${API_BASE_URL}/`);
        if (!url.pathname.startsWith(FILE_DOWNLOAD_PREFIX)) {
            return null;
        }
        return decodeURIComponent(url.pathname.slice(FILE_DOWNLOAD_PREFIX.length));
    } catch {
        return null;
    }
}

export function isPortalFileLink(link?: string | null): boolean {
    return Boolean(link && extractPortalFileId(link));
}

export async function openPortalAwareLink(link: string): Promise<void> {
    const fileId = extractPortalFileId(link);
    if (!fileId) {
        window.open(link, '_blank', 'noopener,noreferrer');
        return;
    }

    const { url } = await api.getFileDownloadLink(fileId);
    window.open(url, '_blank', 'noopener,noreferrer');
}
