import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = readFile(new URL('./ActivityDraftList.tsx', import.meta.url), 'utf8');
const numberInputSource = readFile(new URL('../MoneyInput.tsx', import.meta.url), 'utf8');
const styles = readFile(new URL('../../../styles.css', import.meta.url), 'utf8');
const catalog = readFile(new URL('../../../../../../packages/shared/src/activityVisualCatalog.ts', import.meta.url), 'utf8');

test('la selección principal de color no muestra el código hexadecimal', async () => {
  const activityEditor = await source;

  assert.match(activityEditor, /SECTOR_COLOR_PALETTE\.map/);
  assert.match(activityEditor, /className="sr-only">\{color\.name\}<\/span>/);
  assert.doesNotMatch(activityEditor, /<code>|\{value\.toUpperCase\(\)\}<\/code>/);
  assert.doesNotMatch(activityEditor, /<span className="sr-only">[^<]*\{color\.hex\}/);
  assert.match(activityEditor, />Elegir color personalizado<input/);
});

test('el color elegido continúa formando parte del borrador guardado', async () => {
  const activityEditor = await source;

  assert.match(activityEditor, /onChange=\{\(\)=>onChange\(color\.hex\)\}/);
  assert.match(activityEditor, /onChange=\{event=>onChange\(event\.target\.value\)\}/);
  assert.match(activityEditor, /const common=\{[^}]*iconKey:icon,color,status:/);
});

test('usa el control numérico compartido y conserva los afijos de cada modalidad', async () => {
  const [activityEditor, numberInput] = await Promise.all([source, numberInputSource]);

  assert.match(activityEditor, /<NumberInput suffix="%" name="clubSharePercentage" min="0" max="100"/);
  assert.match(activityEditor, /<NumberInput prefix=\{money\} name="fixedClubFee" min="0"/);
  assert.match(activityEditor, /const money=currencySymbol\(currency\)/);
  assert.match(numberInput, /prefix\?: string/);
  assert.match(numberInput, /suffix\?: string/);
});

test('cada rama guardada limpia los valores incompatibles de la unión', async () => {
  const activityEditor = await source;

  assert.match(activityEditor, /settlementMode:mode,fixedClubFee:Number[^}]*currencyCode:currency,clubSharePercentage:null/);
  assert.match(activityEditor, /settlementMode:mode,fixedClubFee:null,fixedFeeFrequency:null,currencyCode:null,clubSharePercentage:Number/);
  assert.match(activityEditor, /name="fixedFeeFrequency" required/);
});

test('muestra el catálogo completo en una única grilla, sin buscador ni categorías visibles', async () => {
  const activityEditor = await source;

  assert.equal((activityEditor.match(/draft-icon-grid draft-icon-grid--catalog/g) ?? []).length, 1);
  assert.match(activityEditor, /ACTIVITY_VISUAL_CATALOG\.map/);
  assert.doesNotMatch(activityEditor, /type="search"|const \[query|categories\.map|<section key=\{category\}/);
});

test('ofrece al menos 50 iconos y controles visuales de ancho y tamaño accesibles', async () => {
  const [catalogSource, css] = await Promise.all([catalog, styles]);
  const keys = [...catalogSource.matchAll(/\{key:"[^"]+",glyph:/g)];

  assert.ok(keys.length >= 50, `se esperaban al menos 50 iconos, se encontraron ${keys.length}`);
  assert.match(css, /\.draft-color-control--activity \{ grid-column:1 \/ -1; width:100%; \}/);
  assert.match(css, /\.draft-palette--activity \{ flex-wrap:nowrap;[^}]*overflow-x:auto/);
  assert.match(css, /\.draft-palette--activity label \{ flex:0 0 44px; height:44px; width:44px; \}/);
  assert.match(css, /draft-icon-grid--catalog \{ grid-template-columns:repeat\(10/);
});
