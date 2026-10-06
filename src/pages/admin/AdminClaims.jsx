import ClaimsList from '../../components/ClaimsList';

export default function AdminClaims() {
  return (
    <ClaimsList
      title="Reclamos"
      subtitle="Reclamaciones generadas por los clientes sobre sus pedidos."
      showClient
      canManage
    />
  );
}
