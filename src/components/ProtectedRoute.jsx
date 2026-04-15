import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRole }) {
  const { currentUser, loading } = useAuth();

  // Esperar a que se hidrate el token antes de redirigir
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-900">
        <span className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/login" replace />;
  if (allowedRole && currentUser.role !== allowedRole) return <Navigate to="/login" replace />;
  return children;
}
