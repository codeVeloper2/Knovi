import { useMemo, useState, useRef } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { GRADES } from "../../../subjects";
import * as api from "../../../api";

export default function SettingsProfile() {
  const { user, profile, completeProfile, mapError } = useAuth();
  const toast = useToast();
  const email = profile?.email || user?.email || "";
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || "");
  const [grade, setGrade] = useState(profile?.grade || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [photoFile, setPhotoFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [isPublic, setIsPublic] = useState(profile?.isPublic ?? true);
  const [allowDM, setAllowDM] = useState(profile?.allowDirectMessage ?? true);
  const [privacySaved, setPrivacySaved] = useState(false);
  const privacyTimer = useRef(null);

  const preview = useMemo(() => {
    if (photoFile) return URL.createObjectURL(photoFile);
    return profile?.photoURL || user?.photoURL || "";
  }, [photoFile, profile?.photoURL, user?.photoURL]);

  // Saved baseline. The Save button stays disabled until the form actually
  // differs from this — so editing a field and changing it back re-disables it.
  const baseName = profile?.displayName || user?.displayName || "";
  const baseGrade = profile?.grade || "";
  const baseBio = profile?.bio || "";
  const dirty =
    displayName.trim() !== baseName.trim() ||
    grade !== baseGrade ||
    bio.trim() !== baseBio.trim() ||
    photoFile !== null;

  async function save(e) {
    e.preventDefault();
    if (!displayName.trim()) return toast.error("Please enter your name.");
    setBusy(true);
    try {
      await completeProfile(
        {
          displayName: displayName.trim(),
          grade,
          subjectsGoodAt: profile?.subjectsGoodAt || [],
          subjectsNeedHelp: profile?.subjectsNeedHelp || [],
          skillLevel: profile?.skillLevel || "Intermediate",
          language: profile?.language || "",
          bio: bio.trim(),
          photoURL: profile?.photoURL || "",
        },
        photoFile
      );
      toast.success("Profile updated successfully!");
      setPhotoFile(null);
    } catch (err) {
      toast.error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePrivacy(nextPublic, nextDM) {
    try {
      await api.updatePrivacy(nextPublic, nextDM);
      clearTimeout(privacyTimer.current);
      setPrivacySaved(true);
      privacyTimer.current = setTimeout(() => setPrivacySaved(false), 2000);
    } catch {
      toast.error("Couldn't save privacy settings.");
    }
  }

  function togglePublic() {
    const next = !isPublic;
    setIsPublic(next);
    savePrivacy(next, allowDM);
  }

  function toggleDM() {
    const next = !allowDM;
    setAllowDM(next);
    savePrivacy(isPublic, next);
  }

  return (
    <div className="settings-page">
      <h1>Profile</h1>
      <p className="settings-sub">Update your name, photo, and details.</p>

      <form onSubmit={save} className="settings-card">
        <div className="photo-row">
          {preview ? <img className="avatar" src={preview} alt="Profile" referrerPolicy="no-referrer" />
            : <div className="avatar">{(displayName || "P").slice(0, 1).toUpperCase()}</div>}
          <div>
            <label htmlFor="pf-photo" className="btn-social" style={{ width: "auto", display: "inline-flex" }}>
              Change photo
            </label>
            <input id="pf-photo" type="file" accept="image/*" hidden
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            <p className="hint" style={{ marginTop: 8 }}>JPG, PNG or WEBP. Max 5MB.</p>
          </div>
        </div>

        <div className="settings-grid">
          <div className="field">
            <label htmlFor="pf-name">Display name</label>
            <input id="pf-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pf-email">Email address</label>
            <input id="pf-email" type="email" value={email} readOnly disabled title="Email can't be changed" />
          </div>
          <div className="field">
            <label htmlFor="pf-grade">Grade / Year</label>
            <select id="pf-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Select your grade</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="field field-full">
            <label htmlFor="pf-bio">Bio</label>
            <textarea id="pf-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)}
              placeholder="Tell classmates a bit about you." />
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy || !dirty} style={{ width: "auto", minWidth: 160 }}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
      {/* Privacy Settings */}
      <div className="settings-card" style={{ marginTop: 24 }}>
        <div className="settings-section-header">
          <div>
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Privacy</h2>
            <p className="settings-sub" style={{ margin: "4px 0 0" }}>Control how others can find and interact with you.</p>
          </div>
          {privacySaved && (
            <span className="privacy-saved-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
              Saved
            </span>
          )}
        </div>

        <div className="privacy-toggle-card">
          <div className="privacy-toggle-info">
            <span className="privacy-toggle-icon">👁️</span>
            <div>
              <div className="privacy-toggle-title">Show my profile publicly</div>
              <div className="privacy-toggle-desc">Let other students find and view your profile in the Discover tab</div>
            </div>
          </div>
          <button
            type="button"
            className={`privacy-toggle ${isPublic ? "on" : ""}`}
            onClick={togglePublic}
            aria-pressed={isPublic}
          >
            <span className="privacy-toggle-knob" />
          </button>
        </div>

        <div className="privacy-toggle-card">
          <div className="privacy-toggle-info">
            <span className="privacy-toggle-icon">💬</span>
            <div>
              <div className="privacy-toggle-title">Allow direct messages</div>
              <div className="privacy-toggle-desc">Let anyone message you directly without sending a friend request first. Turning this off means they must send a friend request before chatting.</div>
            </div>
          </div>
          <button
            type="button"
            className={`privacy-toggle ${allowDM ? "on" : ""}`}
            onClick={toggleDM}
            aria-pressed={allowDM}
          >
            <span className="privacy-toggle-knob" />
          </button>
        </div>
      </div>
    </div>
  );
}