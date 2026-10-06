import ClaimsList from '../../components/ClaimsList';
import { useAuth } from '../../context/AuthContext';

// "Mis reclamos": histórico de reclamaciones sobre los pedidos del cliente.
export default function ClientClaims() {
  const { currentUser } = useAuth();
  const showClient = currentUser?.clientRole !== 'creador_pedidos';
  return (
    <ClaimsList
      title="Mis reclamos"
      subtitle="Consulta el estado y la trazabilidad de las reclamaciones sobre tus pedidos."
      showClient={showClient}
    />
  );
}
