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
import ChatPage from "./pages/chat/Chat";
import DiscoverPage from "./pages/discover/DiscoverPage";
import MatchRequestsPage from "./pages/match/MatchRequestsPage";
import SettingsProfile from "./pages/dashboard/settings/Profile";
import SettingsSubjects from "./pages/dashboard/settings/Subjects";
import SettingsSecurity from "./pages/dashboard/settings/Security";
import SettingsNotifications from "./pages/dashboard/settings/Notifications";
import SettingsMobile from "./pages/dashboard/settings/SettingsMobile";

// ── Video Learn pages ──
import LearnLayout from "./pages/learn/LearnLayout";
import LearnHome from "./pages/learn/LearnHome";
import TutorialsPage from "./pages/learn/TutorialsPage";
import TutorialDetailPage from "./pages/learn/TutorialDetailPage";
import CreateTutorialPage from "./pages/learn/CreateTutorialPage";
import MyTutorialsPage from "./pages/learn/MyTutorialsPage";

// ── AI Learning pages ──
import AILearnHome from "./pages/learn/AILearnHome";
import AISubjectPage from "./pages/learn/AISubjectPage";
import AITopicPage from "./pages/learn/AITopicPage";
import AISessionSetup from "./pages/learn/AISessionSetup";
import AILearningRoom from "./pages/learn/AILearningRoom";

// On mobile shows the settings card list; on desktop redirects to /profile
function SettingsIndex() {
  const isMobile = window.innerWidth <= 820;
  if (isMobile) return <SettingsMobile />;
  return <Navigate to="/app/settings/profile" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* ── Public / Auth ── */}
      <Route path="/"               element={<Navigate to="/welcome" replace />} />
      <Route path="/welcome"        element={<GuestRoute><MobileWelcome /></GuestRoute>} />
      <Route path="/login"          element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/signup"         element={<GuestRoute><Signup /></GuestRoute>} />
      <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
      <Route path="/verify-email"   element={<VerifyEmail />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/onboarding"     element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/agreement"      element={<Navigate to="/onboarding" replace />} />
      <Route path="/profile-setup"  element={<Navigate to="/onboarding" replace />} />

      {/* ── Student app ── */}
      <Route path="/app" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Home />} />
        <Route path="discover"       element={<DiscoverPage />} />
        <Route path="chat"           element={<ChatPage />} />
        <Route path="chat/:convId"   element={<ChatPage />} />
        <Route path="match-requests" element={<MatchRequestsPage />} />

        {/* ── Video Learn ── */}
        <Route path="learn" element={<LearnLayout />}>
          <Route index element={<LearnHome />} />
          <Route path="tutorials"             element={<TutorialsPage />} />
          <Route path="tutorials/:tutorialId" element={<TutorialDetailPage />} />
          <Route path="create"                element={<CreateTutorialPage />} />
          <Route path="my-tutorials"          element={<MyTutorialsPage />} />
        </Route>

        {/* ── AI Learning ── */}
        <Route path="learn/ai">
          <Route index element={<AILearnHome />} />
          <Route path="subject/:subjectId" element={<AISubjectPage />} />
          <Route path="subject/:subjectId/topic/:topicId" element={<AITopicPage />} />
          <Route path="subject/:subjectId/topic/:topicId/concept/:conceptId" element={<AISessionSetup />} />
          <Route path="session/:sessionId" element={<AILearningRoom />} />
        </Route>

        {/* ── Progress & Settings ── */}
        <Route path="progress" element={<Progress />} />
        <Route path="settings">
          <Route index element={<SettingsIndex />} />
          <Route path="profile"       element={<SettingsProfile />} />
          <Route path="subjects"      element={<SettingsSubjects />} />
          <Route path="security"      element={<SettingsSecurity />} />
          <Route path="notifications" element={<SettingsNotifications />} />
        </Route>
      </Route>

      {/* ── Admin ── */}
      <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="curriculum/subjects"        element={<SubjectsPage />} />
        <Route path="curriculum/topics"          element={<TopicsPage />} />
        <Route path="curriculum/topics/:topicId" element={<TopicDetailPage />} />
        <Route path="curriculum/concepts"        element={<CurriculumPlaceholder section="concepts" />} />
        <Route path="curriculum/objectives"      element={<CurriculumPlaceholder section="objectives" />} />
        <Route path="curriculum/misconceptions"  element={<CurriculumPlaceholder section="misconceptions" />} />
        <Route path="curriculum/activities"      element={<CurriculumPlaceholder section="activities" />} />
        <Route path="curriculum/questions"       element={<CurriculumPlaceholder section="questions" />} />
        <Route path="curriculum/resources"       element={<CurriculumPlaceholder section="resources" />} />
        <Route path="users"  element={<AdminPlaceholder title="Users"  icon="👤" description="Manage student accounts and roles." />} />
        <Route path="system" element={<AdminPlaceholder title="System" icon="⚙️"  description="System configuration." />} />
      </Route>
      <Route path="/admin/curriculum" element={<AdminRoute><Navigate to="/admin/curriculum/subjects" replace /></AdminRoute>} />
    </Routes>
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
