import React from 'react';
import { ActivitySetupForm, SectorSetupForm, WorkerSetupForm } from '../Administration/SetupForms';

export const ONBOARDING_STEPS = [
  { title: 'Te damos la bienvenida a miClub', body: <><p>Vamos a preparar tu espacio de gestión. Tus avances se guardan automáticamente.</p><div className="onboarding-hero" aria-hidden="true">🏟️</div></> },
  { title: 'Conocé tu espacio', body: <><p>Desde miClub vas a centralizar la administración, la economía y la relación con tus socios.</p><ul><li>Información separada y segura para tu club.</li><li>Indicadores operativos siempre disponibles.</li><li>Configuración que podés ajustar luego.</li></ul><aside className="onboarding-warning" role="note"><strong>Saldos iniciales y capital histórico</strong><p>Los importes de caja, banco y dólares representan capital acumulado anterior a miClub, no ingresos del período. El lote quedará identificado para su futura conciliación desde Economía.</p><a href="/app/economia?conciliacion=apertura">Ver futura conciliación del lote importado</a></aside></> },
  { title: 'Creá tus sectores', body: <><p>Organizá las áreas de trabajo. También podés hacerlo luego desde Administración.</p><SectorSetupForm /></> },
  { title: 'Sumá trabajadores', body: <><p>Registrá al equipo que participa en la operación del club.</p><WorkerSetupForm /></> },
  { title: 'Configurá actividades', body: <><p>Relacioná propuestas, cuotas y sectores.</p><ActivitySetupForm /></> },
  { title: 'Revisá la configuración', body: <><p>Ya tenés la base para comenzar. Todo lo que no hayas cargado podrá completarse desde Administración.</p><div className="onboarding-checklist"><span>✓ Sectores</span><span>✓ Equipo</span><span>✓ Actividades</span></div></> },
  { title: 'Tu club está listo', body: <><p>Ingresá al panel principal y empezá a gestionar tu club.</p><div className="onboarding-hero" aria-hidden="true">✨</div></> }
] as const;

export const isSkippableStep = (step: number) => step > 2 && step < 7;
