import { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import type { AdminAccessScope, User } from './api';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    isAdmin: boolean;
    isTeamLead: boolean;
    canManageOperations: boolean;
    canAccessAdminPortal: boolean;
    isDelegatedAdmin: boolean;
    adminScopes: AdminAccessScope[];
    hasAdminScope: (scope: AdminAccessScope) => boolean;
    needsName: boolean;
    login: (googleAccessToken: string) => Promise<void>;
    logout: () => void;
    refreshUser: () => Promise<void>;
    setName: (fullName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const adminScopes = user?.admin_access?.scopes ?? [];
    const isAdmin = user?.role === 'admin';
    const canAccessAdminPortal = isAdmin || Boolean(user?.admin_access?.can_access_portal);
    const hasAdminScope = useCallback(
        (scope: AdminAccessScope) => isAdmin || adminScopes.includes(scope),
        [adminScopes, isAdmin],
    );

    const refreshUser = useCallback(async () => {
        try {
            const userData = await api.getCurrentUser();
            setUser(userData);
        } catch {
            setUser(null);
            api.logout();
        }
    }, []);

    const login = async (googleAccessToken: string) => {
        setIsLoading(true);
        try {
            const response = await api.loginWithGoogle(googleAccessToken);
            setUser(response.user);
        } catch (err) {
            setUser(null);
            api.clearToken();
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = () => {
        api.logout();
        setUser(null);
    };

    const setName = async (fullName: string) => {
        const updatedUser = await api.setName(fullName);
        setUser(updatedUser);
    };

    useEffect(() => {
        const token = api.getToken();
        if (token) {
            refreshUser().finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, [refreshUser]);

    const value: AuthContextType = {
        user,
        isLoading,
        isAuthenticated: !!user,
        isAdmin,
        isTeamLead: user?.role === 'team_lead',
        canManageOperations: user?.role === 'admin' || user?.role === 'team_lead',
        canAccessAdminPortal,
        isDelegatedAdmin: Boolean(user?.admin_access?.is_delegated),
        adminScopes,
        hasAdminScope,
        needsName: !!user && !user.profile_complete,
        login,
        logout,
        refreshUser,
        setName,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };
