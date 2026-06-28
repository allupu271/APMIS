import { createContext, useContext, useState, useEffect } from 'react';
import { onIdTokenChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';

const PumpContext = createContext();

export function PumpProvider({ children }) {
  const [user, setUser] = useState(null);
  const [idToken, setIdToken] = useState(null);
  // True until Firebase has restored (or confirmed the absence of) a persisted
  // session, so the navigator can avoid flashing the Login screen on launch.
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Fires on launch with the persisted user (if any) and again whenever the
    // ID token is auto-refreshed, keeping `idToken` valid for the whole session.
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          setUser(firebaseUser);
          setIdToken(token);
        } catch (err) {
          console.error('Failed to refresh ID token:', err);
          setUser(null);
          setIdToken(null);
        }
      } else {
        setUser(null);
        setIdToken(null);
      }
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  async function signOut() {
    await firebaseSignOut(auth);
    // onIdTokenChanged clears user/idToken once sign-out completes.
  }

  return (
    <PumpContext.Provider value={{
      user, setUser,
      idToken, setIdToken,
      authLoading,
      signOut,
    }}>
      {children}
    </PumpContext.Provider>
  );
}

export function usePump() {
  return useContext(PumpContext);
}
