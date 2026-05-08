export default function CreditsFooter() {
  return (
    <div
      className="bhrcredits"
      style={{
        textAlign: 'right',
        background: '#1d4ed8',
        padding: '10px 0',
        width: '100%',
        gridColumn: '1 / -1',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          color: '#FFF',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          padding: '2px 20px',
          justifyContent: 'flex-end',
        }}
      >
        Creado junto a{' '}
        <a
          href="https://www.web.oblicua.co/?ref=PapeleriaCartagena"
          style={{ color: '#428bca' }}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://lab.oblicua.co/credits/logo.svg"
            width="60"
            style={{ marginLeft: '10px' }}
            alt="Sitio diseñado por Oblicua"
          />
        </a>
      </div>
    </div>
  );
}
