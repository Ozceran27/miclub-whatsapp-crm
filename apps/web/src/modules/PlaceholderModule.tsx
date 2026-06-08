type PlaceholderModuleProps = {
  title: string;
  description: string;
  futureItems: string[];
};

export default function PlaceholderModule({ title, description, futureItems }: PlaceholderModuleProps) {
  return (
    <main className="module-content">
      <section className="module-hero">
        <div>
          <p className="eyebrow">Módulo en preparación</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="module-status-pill">Estamos trabajando en esta sección</span>
      </section>

      <section className="placeholder-panel">
        <div>
          <h3>Próximas métricas y funcionalidades</h3>
          <p>Esta pantalla queda preparada para conectar datos reales de las hojas correspondientes en futuras iteraciones.</p>
        </div>
        <ul className="feature-list">
          {futureItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
