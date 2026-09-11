import { PERMISSIONS } from '@miclub/shared';
import { Router, type RequestHandler } from 'express';
import { requirePermission } from '../middleware/authorization.js';

const router = Router();
// Compatibility endpoints cannot bypass the coordinated cash/payment transaction.
const retired: RequestHandler = (_req, res) => {
  res.status(409).json({ code: 'FINANCIAL_WORKFLOW_REQUIRED', message: 'Use el circuito financiero de Economía para registrar, corregir o anular movimientos con cuenta, motivo y versión.' });
};
router.post('/movements', requirePermission(PERMISSIONS.MOVEMENTS_CREATE), retired);
router.patch('/movements/:id', requirePermission(PERMISSIONS.FINANCE_CORRECT), retired);
router.post('/movements/:id/void', requirePermission(PERMISSIONS.FINANCE_CORRECT), retired);
export default router;
