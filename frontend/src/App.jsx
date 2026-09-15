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
import LearnLayout from "./pages/learn/LearnLayout";
import LearnHome from "./pages/learn/LearnHome";
import TutorialsPage from "./pages/learn/TutorialsPage";
import TutorialDetailPage from "./pages/learn/TutorialDetailPage";
import CreateTutorialPage from "./pages/learn/CreateTutorialPage";
import MyTutorialsPage from "./pages/learn/MyTutorialsPage";

// ── Peer Teaching / Study Rooms pages ──
import StartSessionPage    from "./pages/study/StartSessionPage";
import JoinSessionPage     from "./pages/study/JoinSessionPage";
import SessionLobbyPage    from "./pages/study/SessionLobbyPage";
import SetupPhasePage      from "./pages/study/SetupPhasePage";
import SessionRoomPage     from "./pages/study/SessionRoomPage";
import SessionSummaryPage  from "./pages/study/SessionSummaryPage";

// ── Solo Learning pages ──
import SoloHomePage        from "./pages/solo/SoloHomePage";
import SoloTopicsPage      from "./pages/solo/SoloTopicsPage";
import SoloConceptsPage    from "./pages/solo/SoloConceptsPage";
import SoloLessonPage      from "./pages/solo/SoloLessonPage";
import SoloCheckpointPage  from "./pages/solo/SoloCheckpointPage";
import SoloNotesPage       from "./pages/solo/SoloNotesPage";
import SoloAskPage         from "./pages/solo/SoloAskPage";
import SoloPassedPage      from "./pages/solo/SoloPassedPage";

// ── Sync pages ──
import SyncWelcomePage     from "./pages/sync/SyncWelcomePage";
import SyncFindPartnerPage from "./pages/sync/SyncFindPartnerPage";
import SyncLobbyPage       from "./pages/sync/SyncLobbyPage";
import SyncSessionPage     from "./pages/sync/SyncSessionPage";
import SyncGapCheckPage    from "./pages/sync/SyncGapCheckPage";
import SyncCompletePage    from "./pages/sync/SyncCompletePage";
import SyncHistoryPage     from "./pages/sync/SyncHistoryPage";

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

        {/* ── Study Rooms = Peer Teaching Learning Sessions ── */}
        <Route path="rooms"                              element={<StartSessionPage />} />
        <Route path="rooms/join"                         element={<JoinSessionPage />} />
        <Route path="rooms/lobby/:sessionId"             element={<SessionLobbyPage />} />
        <Route path="rooms/setup/:sessionId"             element={<SetupPhasePage />} />
        <Route path="rooms/session/:sessionId"           element={<SessionRoomPage />} />
        <Route path="rooms/summary/:sessionId"           element={<SessionSummaryPage />} />

        {/* Redirect any old stage-based URLs to the room page */}
        <Route path="rooms/session/:sessionId/*"         element={<Navigate to="/app/rooms" replace />} />
        <Route path="study-rooms/*"                      element={<Navigate to="/app/rooms" replace />} />

        {/* ── Solo Learning ── */}
        <Route path="solo"                                    element={<SoloHomePage />} />
        <Route path="solo/subjects/:subjectId"                element={<SoloTopicsPage />} />
        <Route path="solo/topics/:topicId"                    element={<SoloConceptsPage />} />
        <Route path="solo/concepts/:conceptId/lesson"         element={<SoloLessonPage />} />
        <Route path="solo/concepts/:conceptId/checkpoint"     element={<SoloCheckpointPage />} />
        <Route path="solo/concepts/:conceptId/notes"          element={<SoloNotesPage />} />
        <Route path="solo/concepts/:conceptId/ask"            element={<SoloAskPage />} />
        <Route path="solo/concepts/:conceptId/passed"         element={<SoloPassedPage />} />

        {/* ── Sync ── */}
        <Route path="sync"                                    element={<SyncWelcomePage />} />
        <Route path="sync/find/:conceptId"                    element={<SyncFindPartnerPage />} />
        <Route path="sync/lobby/:sessionId"                   element={<SyncLobbyPage />} />
        <Route path="sync/session/:sessionId"                 element={<SyncSessionPage />} />
        <Route path="sync/gap/:sessionId"                     element={<SyncGapCheckPage />} />
        <Route path="sync/complete/:sessionId"                element={<SyncCompletePage />} />
        <Route path="sync/history"                            element={<SyncHistoryPage />} />

        {/* ── Learn ── */}
        <Route path="learn" element={<LearnLayout />}>
          <Route index element={<LearnHome />} />
          <Route path="tutorials"             element={<TutorialsPage />} />
          <Route path="tutorials/:tutorialId" element={<TutorialDetailPage />} />
          <Route path="create"                element={<CreateTutorialPage />} />
          <Route path="my-tutorials"          element={<MyTutorialsPage />} />
        </Route>

        <Route path="progress" element={<Progress />} />
        <Route path="settings">
          <Route index element={<SettingsProfile />} />
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
