import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import { AdminLayout } from './components/admin/AdminLayout';
import { LoadingScreen } from './components/shared/LoadingScreen/LoadingScreen';

const SchedulerPage = lazy(() => import('./pages/SchedulerPage/SchedulerPage'));
const BigBoardPage = lazy(() => import('./pages/BigBoardPage/BigBoardPage'));
const SortieBuilderPage = lazy(() => import('./pages/SortieBuilderPage/SortieBuilderPage'));
const AdminAircraftPage = lazy(() => import('./pages/AdminAircraftPage/AdminAircraftPage'));
const AdminPersonnelPage = lazy(() => import('./pages/AdminPersonnelPage/AdminPersonnelPage'));
const AdminCurriculumPage = lazy(() => import('./pages/AdminCurriculumPage/AdminCurriculumPage'));

export default function App() {
  return (
    <ThemeProvider>
      <Suspense fallback={<LoadingScreen progress="Loading..." />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/scheduler" element={<SchedulerPage />} />
            <Route path="/bigboard" element={<BigBoardPage />} />
            <Route path="/sortie-builder" element={<SortieBuilderPage />} />
            <Route path="/" element={<Navigate to="/scheduler" replace />} />
          </Route>
          <Route element={<AdminLayout />}>
            <Route path="/admin/aircraft" element={<AdminAircraftPage />} />
            <Route path="/admin/personnel" element={<AdminPersonnelPage />} />
            <Route path="/admin/curriculum" element={<AdminCurriculumPage />} />
            <Route path="/admin" element={<Navigate to="/admin/aircraft" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ThemeProvider>
  );
}
