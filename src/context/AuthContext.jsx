// src/context/AuthContext.jsx — Firebase Auth (replaces Supabase Auth)
import React, { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut as fbSignOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile
} from 'firebase/auth';

const firebaseConfig = {
    apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId:      import.meta.env.VITE_FIREBASE_APP_ID,
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(undefined); // undefined = loading

    useEffect(() => {
        return onAuthStateChanged(auth, (u) => setUser(u ?? null));
    }, []);

    const signUp = async (email, password, displayName) => {
        const c = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) await updateProfile(c.user, { displayName });
        return c.user;
    };

    const signIn = (email, password) =>
        signInWithEmailAndPassword(auth, email, password).then(c => c.user);

    const signOut    = () => fbSignOut(auth);
    const resetPwd   = (email) => sendPasswordResetEmail(auth, email);

    return (
        <AuthContext.Provider value={{ user, loading: user === undefined, signUp, signIn, signOut, resetPwd }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);