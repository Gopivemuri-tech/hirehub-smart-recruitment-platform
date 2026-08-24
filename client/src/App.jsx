import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import JobseekerDashboard from "./pages/JobseekerDashboard";
import EmployerDashboard from "./pages/EmployerDashboard";
import JobForm from "./pages/JobForm";
import EmployerJobDetail from "./pages/EmployerJobDetail";
import Profile from "./pages/Profile";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />

            <Route element={<ProtectedRoute roles={["jobseeker"]} />}>
              <Route path="/jobseeker" element={<JobseekerDashboard />} />
            </Route>

            <Route element={<ProtectedRoute roles={["employer"]} />}>
              <Route path="/employer" element={<EmployerDashboard />} />
              <Route path="/employer/jobs/new" element={<JobForm />} />
              <Route path="/employer/jobs/:id" element={<EmployerJobDetail />} />
              <Route path="/employer/jobs/:id/edit" element={<JobForm />} />
            </Route>

            <Route element={<ProtectedRoute roles={["admin"]} />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route path="/profile" element={<Profile />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
