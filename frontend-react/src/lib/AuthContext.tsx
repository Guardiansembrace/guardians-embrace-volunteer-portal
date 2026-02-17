import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from './api';
import type { User } from './api';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    isAdmin: boolean;
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
        isAdmin: user?.role === 'admin',
        needsName: !!user && !user.profile_complete,
        login,
        logout,
        refreshUser,
        setName,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
