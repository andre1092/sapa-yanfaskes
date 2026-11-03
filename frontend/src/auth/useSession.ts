import { createContext, useContext } from 'react';
type SessionContext = { ready: boolean; authenticated: boolean; configured: boolean; error: string | null; login: () => Promise<void> };
export const Context = createContext<SessionContext>({ ready: false, authenticated: false, configured: false, error: null, login: async () => {} });
export const useSession = () => useContext(Context);

