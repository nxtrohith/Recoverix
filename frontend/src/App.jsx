import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import LandingPage from './pages/LandingPage';
import OverviewPage from './pages/OverviewPage';
import RecoveryPage from './pages/RecoveryPage';
import SearchPage from './pages/SearchPage';
import ShipmentsPage from './pages/ShipmentsPage';
import VehiclesPage from './pages/VehiclesPage';
import './App.css';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="shipments" element={<ShipmentsPage />} />
        <Route path="vehicles" element={<VehiclesPage />} />
        <Route path="recovery" element={<RecoveryPage />} />
        <Route path="search" element={<SearchPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
