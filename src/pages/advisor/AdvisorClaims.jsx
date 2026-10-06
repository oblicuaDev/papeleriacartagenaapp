import ClaimsList from '../../components/ClaimsList';

export default function AdvisorClaims() {
  return (
    <ClaimsList
      title="Reclamos"
      subtitle="Reclamaciones sobre los pedidos que gestionas."
      showClient
      canManage
    />
  );
}
