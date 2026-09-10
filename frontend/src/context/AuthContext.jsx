import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { auth as fbAuth, firebaseReady, googleProvider } from "../firebase";
import * as api from "../api";
import { readableAuthError } from "../authErrors";

/** Thrown when a user signs in but hasn't verified their email yet. */
export class EmailNotVerifiedError extends Error {
  constructor(email) {
    super("Please verify your email before signing in.");
    this.code = "auth/email-not-verified";
    this.email = email;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // our backend user (serialized)
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  // On load, if we have a stored JWT, fetch the current user.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!api.getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.fetchMe();
        if (!active) return;
        setUser(me);
        setProfile(me);
        // Mark online now that we have a valid session.
        api.setOnline();
      } catch (err) {
        api.clearToken();
        if (active) setProfileError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Mark offline when the tab/window is closed.
  useEffect(() => {
    function handleUnload() {
      api.setOffline();
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  function applySession({ accessToken, user: me }, remember = true) {
    api.setToken(accessToken, remember);
    setUser(me);
    setProfile(me);
    // Mark user as online immediately after login.
    api.setOnline();
  }

  async function refreshProfile() {
    if (!api.getToken()) return null;
    const me = await api.fetchMe();
    setUser(me);
    setProfile(me);
    return me;
  }

  const value = useMemo(
    () => ({
      firebaseReady,
      user,
      profile,
      loading,
      profileError,
      refreshProfile,

      // Email/password sign-in via our backend.
      async signIn(email, password, rememberMe) {
        try {
          const data = await api.login(email, password);
          applySession(data, rememberMe);
        } catch (err) {
          if (err.status === 403) {
            throw new EmailNotVerifiedError(email);
          }
          throw err;
        }
      },

      // Email/password signup via our backend (sends a verification code).
      async signUp(email, password, rememberMe, displayName) {
        // Returns { ok, message, email, devCode? }. Do NOT log in yet —
        // user must verify their email with the code first.
        return api.signup(email, password, displayName || "");
      },

      // Google: popup with Firebase, then exchange the Firebase token for our JWT.
      async signInWithGoogle(rememberMe) {
        if (!fbAuth) throw new Error("Google sign-in isn't configured.");
        const result = await signInWithPopup(fbAuth, googleProvider);
        const idToken = await result.user.getIdToken();
        const data = await api.googleLogin(idToken);
        applySession(data, rememberMe);
        // We don't need the Firebase session afterward for password-style use,
        // but keep it so Storage uploads remain authenticated for this user.
        return data;
      },

      // Verify an email with the 6-digit code, then log the user in.
      async verifyEmail(email, code) {
        const data = await api.verifyEmailCode(email, code);
        applySession(data, true);
        return data;
      },

      async resetPassword(email) {
        return api.requestPasswordReset(email);
      },
      async verifyResetCode(email, code) {
        return api.verifyResetCode(email, code);
      },
      async confirmReset(email, code, password) {
        return api.resetPassword(email, code, password);
      },
      async resendVerification(email) {
        return api.resendVerification(email);
      },

      async agreeToLearning() {
        const me = await api.acceptAgreement();
        setUser(me);
        setProfile(me);
        return me;
      },

      async changePassword(currentPassword, newPassword) {
        return api.changePassword(currentPassword, newPassword);
      },

      // Permanently delete the account, then clear the local session.
      async deleteAccount(password) {
        api.setOffline();
        await api.deleteAccount(password);
        api.clearToken();
        setUser(null);
        setProfile(null);
        if (fbAuth?.currentUser) {
          try {
            await fbSignOut(fbAuth);
          } catch {
            /* ignore */
          }
        }
      },

      async completeProfile(data, photoFile) {
        let photoURL = data.photoURL || profile?.photoURL || "";
        if (photoFile) {
          // Upload through our backend (server-side Firebase Storage). If this
          // fails, surface the error so the user knows the photo didn't save.
          const res = await api.uploadAvatar(photoFile);
          if (res?.photoURL) photoURL = res.photoURL;
        }
        const me = await api.saveProfile({ ...data, photoURL });
        setUser(me);
        setProfile(me);
        return me;
      },

      async logout() {
        api.setOffline();
        api.clearToken();
        setUser(null);
        setProfile(null);
        if (fbAuth?.currentUser) {
          try {
            await fbSignOut(fbAuth);
          } catch {
            /* ignore */
          }
        }
      },

      mapError: readableAuthError,
    }),
    [user, profile, loading, profileError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
