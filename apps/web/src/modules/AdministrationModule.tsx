export default function AdministrationModule() {
  return (
    <main className="module-content">
      <section className="module-hero">
        <div>
          <p className="eyebrow">Administración</p>
          <h2>Panel inicial de Administración</h2>
          <p>Shell de lectura preparado para centralizar saldos, pendientes y movimientos administrativos.</p>
        </div>
        <span className="module-status-pill">Solo lectura · sin acciones de guardado</span>
      </section>

      <section className="placeholder-panel">
        <div>
          <h3>Read model inicial</h3>
          <p>Esta base queda lista para conectar el agregador de Administración sin incorporar CRUD masivo ni acciones que modifiquen datos.</p>
        </div>
        <ul className="feature-list">
          <li>Saldos operativos de Administración.</li>
          <li>Movimientos pendientes administrativos.</li>
          <li>Últimos movimientos en modo consulta.</li>
        </ul>
      </section>
    </main>
  );
}
