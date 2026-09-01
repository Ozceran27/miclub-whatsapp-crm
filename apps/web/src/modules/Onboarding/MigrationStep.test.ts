import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CommercialPlan, CommercialPlanCode } from '@miclub/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommercialPlanCards } from './MigrationStep';

const codes:CommercialPlanCode[]=['FREE','SOCIAL','COMPLEX','CLUB'];
const plans:CommercialPlan[]=codes.map((code,index)=>({code,name:code[0]+code.slice(1).toLowerCase(),description:`Propuesta ${code}`,targetAudience:`Público ${code}`,highlightedFeatures:[`Prestación ${code}`],displayOrder:index+1,recommended:code==='COMPLEX',ctaText:`Elegir ${code}`,priceLabel:'Precio próximamente',commercialClass:code==='FREE'?'free':'paid',capabilities:code==='FREE'?[]:['DATA_MIGRATION'],migrationAvailable:code!=='FREE'}));
const render=(selected:CommercialPlanCode)=>renderToStaticMarkup(createElement(CommercialPlanCards,{plans,selected,onSelect:()=>undefined}));

test('renderiza las cuatro alternativas cargadas con prestaciones y precio no definitivo',()=>{
 const markup=render('FREE');
 for(const code of codes){assert.match(markup,new RegExp(`Propuesta ${code}`));assert.match(markup,new RegExp(`Prestación ${code}`));}
 assert.equal((markup.match(/Precio próximamente/g)??[]).length,4);
});

test('refleja la selección de cada plan como un único radio seleccionado',()=>{
 for(const code of codes){const markup=render(code);assert.equal((markup.match(/checked=""/g)??[]).length,1);assert.match(markup,new RegExp(`checked="" value="${code}"`));}
});

test('expone recomendación, radiogroup, etiquetas y disponibilidad de migración',()=>{
 const markup=render('COMPLEX');
 assert.match(markup,/role="radiogroup"/);assert.equal((markup.match(/type="radio"/g)??[]).length,4);
 assert.equal((markup.match(/Recomendado/g)??[]).length,1);assert.match(markup,/Plan Complex/);
 assert.match(markup,/Migración no disponible/);assert.equal((markup.match(/Migración disponible/g)??[]).length,3);
 assert.match(markup,/aria-describedby="commercial-plan-complex-description"/);
});

test('contempla carga, error de red, reintento, foco y una columna responsive',()=>{
 const component=readFileSync(new URL('./MigrationStep.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../../styles.css',import.meta.url),'utf8');
 assert.match(component,/Cargando planes/);assert.match(component,/role="alert"/);assert.match(component,/No pudimos cargar los planes/);assert.match(component,/Reintentar/);
 assert.match(css,/\.migration-plan-card:focus-within/);assert.match(css,/@media \(max-width: 680px\)[\s\S]*\.migration-plan-grid[\s\S]*grid-template-columns: 1fr/);
});
