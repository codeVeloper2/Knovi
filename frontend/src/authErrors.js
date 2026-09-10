const MESSAGES = {
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/user-disabled": "This account has been disabled. Contact PeerUP support if that seems wrong.",
  "auth/user-not-found": "No account found with that email. Try signing up instead.",
  "auth/wrong-password": "That password doesn’t match. Try again or reset it.",
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
  "auth/weak-password": "Choose a stronger password — at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a minute, then try again.",
  "auth/popup-closed-by-user": "Google sign-in was cancelled.",
  "auth/cancelled-popup-request": "Google sign-in was cancelled.",
  "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups and try again.",
  "auth/network-request-failed": "Check your internet connection and try again.",
  "auth/operation-not-allowed": "This sign-in method isn’t enabled yet. Check Firebase Auth settings.",
  "auth/email-not-verified": "Please verify your email before signing in. Check your inbox for the verification link.",
  "auth/invalid-action-code": "This reset link is invalid or has expired. Request a new one.",
  "auth/expired-action-code": "This reset link has expired. Request a new one.",
  "auth/missing-password": "Please enter your password.",
};

export function readableAuthError(error) {
  const code = error?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (typeof error?.message === "string" && !error.message.startsWith("Firebase:")) {
    return error.message;
  }
  return "We couldn’t complete that. Please try again.";
}
