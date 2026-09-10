import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import GuestRoute from "./components/GuestRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import VerifyEmail from "./pages/auth/VerifyEmail";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import Onboarding from "./pages/onboarding/Onboarding";
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
import LearnPage from "./pages/learn/LearnPage";
import LearnLayout from "./pages/learn/LearnLayout";
import LearnHome from "./pages/learn/LearnHome";
import CoursesPage from "./pages/learn/CoursesPage";
import CourseDetailPage from "./pages/learn/CourseDetailPage";
import LessonPage from "./pages/learn/LessonPage";
import TutorialsPage from "./pages/learn/TutorialsPage";
import TutorialDetailPage from "./pages/learn/TutorialDetailPage";
import CreateTutorialPage from "./pages/learn/CreateTutorialPage";
import SavedPage from "./pages/learn/SavedPage";
import MyLearningPage from "./pages/learn/MyLearningPage";

function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
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
          <Route path="match-requests" element={<MatchRequestsPage />} />
          <Route path="rooms" element={<StudyRoomPage />} />
          <Route path="learn" element={<LearnLayout />}>
            <Route index element={<LearnHome />} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="courses/:courseId" element={<CourseDetailPage />} />
            <Route path="courses/:courseId/lessons/:lessonId" element={<LessonPage />} />
            <Route path="tutorials" element={<TutorialsPage />} />
            <Route path="tutorials/:tutorialId" element={<TutorialDetailPage />} />
            <Route path="create" element={<CreateTutorialPage />} />
            <Route path="saved" element={<SavedPage />} />
            <Route path="my-learning" element={<MyLearningPage />} />
          </Route>
          <Route path="progress" element={<Progress />} />
          <Route path="settings">
            <Route index element={<SettingsProfile />} />
            <Route path="subjects" element={<SettingsSubjects />} />
            <Route path="security" element={<SettingsSecurity />} />
            <Route path="notifications" element={<SettingsNotifications />} />
          </Route>
        </Route>
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
