/** Installation compatibility for the frozen financial migration. No data is deleted.
 * Existing columns/constraints are compared with PostgreSQL's own canonical definitions.
 */
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function splitFinancialSql(sql: string, separator = ';'): string[] {
  const parts: string[] = []; let start = 0; let depth = 0; let quoted = false; let dollar = '';
  for (let i = 0; i < sql.length; i++) {
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = ''; } continue; }
    if (quoted) { if (sql[i] === "'") { if (sql[i + 1] === "'") i++; else quoted = false; } continue; }
    if (sql.startsWith('--', i)) { const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end; continue; }
    if (sql[i] === "'") { quoted = true; continue; }
    const tag = sql.slice(i).match(/^\$[a-zA-Z_0-9]*\$/)?.[0];
    if (tag) { dollar = tag; i += tag.length - 1; continue; }
    if (sql[i] === '(') depth++;
    if (sql[i] === ')') depth--;
    if (sql[i] === separator && depth === 0) { parts.push(sql.slice(start, i).trim()); start = i + 1; }
  }
  if (sql.slice(start).trim()) parts.push(sql.slice(start).trim());
  return parts;
}

const guardColumn = (table: string, definition: string) => {
  const column = definition.match(/^\w+/)![0];
  return `DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='${table}'::regclass AND attname='${column}' AND NOT attisdropped) THEN
  ALTER TABLE ${table} ADD COLUMN ${definition};
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE ${table});
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN ${column};
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN ${definition};
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='${table}'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: ${table}.${column}. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;`;
};

const guardConstraint = (table: string, definition: string) => {
  const name = definition.match(/^CONSTRAINT\s+(\w+)/i)![1];
  return `DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE ${table});
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD ${definition};
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='${name}';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='${table}'::regclass AND conname='${name}';
 IF actual IS NULL THEN ALTER TABLE ${table} ADD ${definition};
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: ${table}.${name}'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;`;
};

export function recoverFinancialMigration(sql: string): string {
  return splitFinancialSql(sql).map(raw => {
    const statement = raw.replace(/^\s*--[^\n]*(?:\n|$)/gm, '').trim();
    const alter = statement.match(/^ALTER TABLE (miclub\.\w+)\s+([\s\S]+)$/i);
    if (alter) return splitFinancialSql(alter[2], ',').map(action => {
      if (/^ADD COLUMN /i.test(action)) return guardColumn(alter[1], action.replace(/^ADD COLUMN /i, ''));
      if (/^ADD CONSTRAINT /i.test(action)) return guardConstraint(alter[1], action.replace(/^ADD /i, ''));
      return `ALTER TABLE ${alter[1]} ${action.replace(/^DROP CONSTRAINT (?!IF EXISTS)/i, 'DROP CONSTRAINT IF EXISTS ')};`;
    }).join('\n');
    const table = statement.match(/^CREATE TABLE (miclub\.\w+)\s*\(([\s\S]*)\)$/i);
    if (table) return `CREATE TABLE IF NOT EXISTS ${table[1]} (${table[2]});
DO $recover$ BEGIN
 CREATE TABLE financial_install_probe.finance_table_probe (${table[2]});
 IF EXISTS(SELECT 1 FROM pg_attribute e LEFT JOIN pg_attribute a ON a.attrelid='${table[1]}'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='financial_install_probe.finance_table_probe'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR (e.attnotnull AND NOT a.attnotnull AND NOT ('${table[1]}'='miclub.settlement_compensations' AND e.attname IN ('debt_settlement_id','credit_settlement_id'))))) THEN
 RAISE EXCEPTION 'Tabla incompatible: ${table[1]}'; END IF;
 IF EXISTS(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='financial_install_probe.finance_table_probe'::regclass
 EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='${table[1]}'::regclass) THEN RAISE EXCEPTION 'Restricciones incompletas: ${table[1]}'; END IF;
 DROP TABLE financial_install_probe.finance_table_probe;
END $recover$;`;
    const trigger = statement.match(/^CREATE TRIGGER (\w+)[\s\S]*? ON (miclub\.\w+)/i);
    if (trigger) return `DROP TRIGGER IF EXISTS ${trigger[1]} ON ${trigger[2]};\n${statement};`;
    const policy = statement.match(/^CREATE POLICY (\w+) ON (miclub\.\w+)/i);
    if (policy) return `DROP POLICY IF EXISTS ${policy[1]} ON ${policy[2]};\n${statement};`;
    // The frozen migration creates the same tenant policy inside its table loop.
    return statement.replace(/CREATE FUNCTION /g, 'CREATE OR REPLACE FUNCTION ')
      .replace(/CREATE (UNIQUE )?INDEX /g, 'CREATE $1INDEX IF NOT EXISTS ')
      .replace("EXECUTE format('CREATE POLICY tenant_scope", "EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON miclub.%I',t);\n  EXECUTE format('CREATE POLICY tenant_scope") + ';';
  }).join('\n');
}

export const financialRecoveryLiteral = (sql: string) => quote(recoverFinancialMigration(sql));
