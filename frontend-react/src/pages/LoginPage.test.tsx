import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoginPage from './LoginPage';

const mocks = vi.hoisted(() => ({
    login: vi.fn(),
    navigate: vi.fn(),
    googleLoginImpl: vi.fn(),
    authState: {
        isAuthenticated: false,
        isLoading: false,
        needsName: false,
    },
}));

vi.mock('../lib/useAuth', () => ({
    useAuth: () => ({
        login: mocks.login,
        ...mocks.authState,
    }),
}));

vi.mock('@react-oauth/google', () => ({
    useGoogleLogin: (config: unknown) => () => mocks.googleLoginImpl(config),
}));

vi.mock('../components/Logo', () => ({
    Logo: () => <div>Logo</div>,
}));

vi.mock('../components/ui', () => ({
    Button: ({ children, onClick, disabled, isLoading }: { children: ReactNode; onClick?: () => void; disabled?: boolean; isLoading?: boolean }) => (
        <button onClick={onClick} disabled={disabled}>
            {isLoading ? 'Loading' : children}
        </button>
    ),
    LoadingSpinner: ({ size }: { size?: number }) => <div>Spinner {size}</div>,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mocks.navigate,
    };
});

function renderLoginPage() {
    return render(
        <MemoryRouter>
            <LoginPage />
        </MemoryRouter>,
    );
}

describe('LoginPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.authState = {
            isAuthenticated: false,
            isLoading: false,
            needsName: false,
        };
        mocks.login.mockResolvedValue(undefined);
        mocks.googleLoginImpl.mockImplementation((config: {
            onSuccess: (tokenResponse: { access_token: string }) => Promise<void>;
        }) => config.onSuccess({ access_token: 'google-token' }));
    });

    it('shows a helpful oauth configuration message for redirect uri mismatches', async () => {
        mocks.googleLoginImpl.mockImplementation((config: {
            onError: (errorResponse: { error: string; error_description?: string }) => void;
        }) => config.onError({ error: 'redirect_uri_mismatch' }));

        renderLoginPage();

        await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

        expect(await screen.findByText(/Google OAuth is not configured for this site URL yet/i)).toBeInTheDocument();
        expect(mocks.login).not.toHaveBeenCalled();
    });

    it('passes the google access token to the auth layer when sign-in succeeds', async () => {
        renderLoginPage();

        await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

        await waitFor(() => {
            expect(mocks.login).toHaveBeenCalledWith('google-token');
        });
    });

    it('shows backend login errors after a successful google oauth response', async () => {
        mocks.login.mockRejectedValue(new Error('Access denied. You must be invited to join this portal.'));

        renderLoginPage();

        await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

        expect(await screen.findByText('Access denied. You must be invited to join this portal.')).toBeInTheDocument();
    });
});
