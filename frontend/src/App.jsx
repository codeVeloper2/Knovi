import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import GuestRoute from "./components/GuestRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

// ── Admin pages ──
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminPlaceholder from "./pages/admin/AdminPlaceholder";
import SubjectsPage from "./pages/admin/curriculum/SubjectsPage";
import TopicsPage from "./pages/admin/curriculum/TopicsPage";
import TopicDetailPage from "./pages/admin/curriculum/TopicDetailPage";
import CurriculumPlaceholder from "./pages/admin/curriculum/CurriculumPlaceholder";

// ── Legacy admin page (still reachable for backwards compat) ──
import CurriculumAdmin from "./pages/admin/CurriculumAdmin";

// ── Auth pages ──
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import VerifyEmail from "./pages/auth/VerifyEmail";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import MobileWelcome from "./pages/auth/MobileWelcome";
import Onboarding from "./pages/onboarding/Onboarding";

// ── Student app pages ──
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/dashboard/Home";
import Progress from "./pages/dashboard/Progress";
import Placeholder from "./pages/dashboard/Placeholder";
import ChatPage from "./pages/chat/Chat";
import DiscoverPage from "./pages/discover/DiscoverPage";
import MatchRequestsPage from "./pages/match/MatchRequestsPage";
import SettingsProfile from "./pages/dashboard/settings/Profile";
import SettingsSubjects from "./pages/dashboard/settings/Subjects";
import SettingsSecurity from "./pages/dashboard/settings/Security";
import SettingsNotifications from "./pages/dashboard/settings/Notifications";
import StudyRoomPage from "./pages/study/StudyRoom";
import LearnLayout from "./pages/learn/LearnLayout";
import LearnHome from "./pages/learn/LearnHome";
import TutorialsPage from "./pages/learn/TutorialsPage";
import TutorialDetailPage from "./pages/learn/TutorialDetailPage";
import CreateTutorialPage from "./pages/learn/CreateTutorialPage";
import MyTutorialsPage from "./pages/learn/MyTutorialsPage";

function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/welcome" replace />} />
        <Route path="/welcome" element={<GuestRoute><MobileWelcome /></GuestRoute>} />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestRoute>
              <Signup />
            </GuestRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestRoute>
              <ForgotPassword />
            </GuestRoute>
          }
        />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        {/* Legacy routes now point to the unified onboarding wizard. */}
        <Route path="/agreement" element={<Navigate to="/onboarding" replace />} />
        <Route path="/profile-setup" element={<Navigate to="/onboarding" replace />} />

        {/* ── Student app ── */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Home />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:convId" element={<ChatPage />} />
          <Route path="match-requests" element={<MatchRequestsPage />} />
          <Route path="rooms" element={<StudyRoomPage />} />
          <Route path="learn" element={<LearnLayout />}>
            <Route index element={<LearnHome />} />
            <Route path="tutorials" element={<TutorialsPage />} />
            <Route path="tutorials/:tutorialId" element={<TutorialDetailPage />} />
            <Route path="create" element={<CreateTutorialPage />} />
            <Route path="my-tutorials" element={<MyTutorialsPage />} />
          </Route>
          <Route path="progress" element={<Progress />} />
          <Route path="settings">
            <Route index element={<SettingsProfile />} />
            <Route path="subjects" element={<SettingsSubjects />} />
            <Route path="security" element={<SettingsSecurity />} />
            <Route path="notifications" element={<SettingsNotifications />} />
          </Route>
        </Route>

        {/* ── Admin — full dashboard layout ── */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          {/* Dashboard */}
          <Route index element={<AdminDashboard />} />

          {/* Curriculum sub-routes */}
          <Route path="curriculum/subjects" element={<SubjectsPage />} />
          <Route path="curriculum/topics" element={<TopicsPage />} />
          <Route path="curriculum/topics/:topicId" element={<TopicDetailPage />} />
          <Route path="curriculum/concepts"       element={<CurriculumPlaceholder section="concepts" />} />
          <Route path="curriculum/objectives"     element={<CurriculumPlaceholder section="objectives" />} />
          <Route path="curriculum/misconceptions" element={<CurriculumPlaceholder section="misconceptions" />} />
          <Route path="curriculum/activities"     element={<CurriculumPlaceholder section="activities" />} />
          <Route path="curriculum/questions"      element={<CurriculumPlaceholder section="questions" />} />
          <Route path="curriculum/resources"      element={<CurriculumPlaceholder section="resources" />} />

          {/* Other admin sections */}
          <Route path="users"  element={<AdminPlaceholder title="Users"  icon="👤" description="Manage student accounts and roles." />} />
          <Route path="system" element={<AdminPlaceholder title="System" icon="⚙️"  description="System configuration and settings." />} />
        </Route>

        {/* Legacy /admin/curriculum URL — redirect into new layout */}
        <Route
          path="/admin/curriculum"
          element={
            <AdminRoute>
              <Navigate to="/admin/curriculum/subjects" replace />
            </AdminRoute>
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
