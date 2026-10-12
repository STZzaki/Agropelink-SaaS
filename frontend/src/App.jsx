import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.jsx'
import RequireAuth, { FullScreenLoader, RoleHome } from './auth/RequireAuth.jsx'
import { ROLES } from './auth/roles.js'
import ScrollManager from './components/ScrollManager.jsx'
import AnalyticsTracker from './consent/AnalyticsTracker.jsx'
import { ConsentProvider } from './consent/ConsentContext.jsx'
import CookieBanner from './consent/CookieBanner.jsx'
import WarningGate from './components/moderation/WarningGate.jsx'
import Landing from './pages/Landing.jsx'

// La landing va en el bundle inicial; el resto de rutas se cargan bajo demanda (code splitting).
const Layout = lazy(() => import('./components/layout/Layout.jsx'))
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const AccountSettings = lazy(() => import('./pages/AccountSettings.jsx'))
const FarmNewPage = lazy(() => import('./pages/FarmNewPage.jsx'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.jsx'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'))
const ForumLayout = lazy(() => import('./components/layout/ForumLayout.jsx'))
const PortalPage = lazy(() => import('./pages/PortalPage.jsx'))
const PublicLayout = lazy(() => import('./components/layout/PublicLayout.jsx'))
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'))
const EconomyPage = lazy(() => import('./pages/EconomyPage.jsx'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.jsx'))
const ForumPage = lazy(() => import('./pages/ForumPage.jsx'))
const ForumThreadPage = lazy(() => import('./pages/ForumThreadPage.jsx'))
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.jsx'))
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'))
const TasksPage = lazy(() => import('./pages/TasksPage.jsx'))
const TermsPage = lazy(() => import('./pages/TermsPage.jsx'))

export default function App() {
  return (
    <BrowserRouter>
      <ConsentProvider>
        <AuthProvider>
          <ScrollManager />
          <AnalyticsTracker />
          <Suspense fallback={<FullScreenLoader />}>
            <Routes>
              {/* Públicas */}
              <Route index element={<Landing />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="reset-password" element={<ResetPasswordPage />} />
              {/* Foro: público; con sesión se integra en el panel (vista por defecto del rol `user`). */}
              <Route element={<ForumLayout />}>
                <Route path="foro" element={<ForumPage />} />
                <Route path="foro/:id" element={<ForumThreadPage />} />
              </Route>
              <Route element={<PublicLayout />}>
                <Route path="privacidad" element={<PrivacyPage />} />
                <Route path="terminos" element={<TermsPage />} />
              </Route>
              <Route path="aviso-legal" element={<Navigate to="/terminos" replace />} />
  
              {/* Paneles privados por rol (RBAC). La API aplica los mismos permisos en cada petición. */}
              <Route path="panel" element={<RoleHome />} />
              <Route element={<RequireAuth />}>
                <Route element={<Layout />}>
                  <Route path="cuenta" element={<AccountSettings />} />
                  <Route element={<RequireAuth roles={[ROLES.USER]} />}>
                    <Route path="portal" element={<PortalPage />} />
                  </Route>
                  <Route element={<RequireAuth roles={[ROLES.FARMER, ROLES.ADMIN]} />}>
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="farms/nueva" element={<FarmNewPage />} />
                    <Route path="economia" element={<EconomyPage />} />
                    <Route path="tasks" element={<TasksPage />} />
                    <Route path="documents" element={<DocumentsPage />} />
                  </Route>
                  <Route element={<RequireAuth roles={[ROLES.ADMIN]} />}>
                    <Route path="admin" element={<AdminPage />} />
                  </Route>
                </Route>
              </Route>
  
              <Route element={<PublicLayout />}>
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
          <CookieBanner />
          <WarningGate />
        </AuthProvider>
      </ConsentProvider>
    </BrowserRouter>
  )
}
