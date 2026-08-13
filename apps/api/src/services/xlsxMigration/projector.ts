export const projectWrites = (rowCounts: Record<string, number>) => ({
  movements: { insert: rowCounts["ADMINISTRACIÓN"] ?? 0, update: 0 },
  enrollments: { insert: rowCounts["INSCRIPCIONES"] ?? 0, update: 0 },
  total: Object.values(rowCounts).reduce((sum, value) => sum + value, 0),
});
