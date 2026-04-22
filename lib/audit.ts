/**
 * Helper client pour enregistrer des événements dans le journal d'audit.
 * Appelle /api/audit en fire-and-forget (n'interrompt pas le flux si ça échoue).
 */
export async function logAudit(
  action: string,
  resource?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, resource, details }),
    });
  } catch {
    // Silencieux — le journal d'audit ne doit jamais bloquer l'UX
  }
}

// ── Actions standardisées ────────────────────────────────────────────────────
export const AUDIT_ACTIONS = {
  // Auth
  LOGIN:                'login',
  LOGOUT:               'logout',
  SESSION_TIMEOUT:      'session_timeout',

  // Consignes
  CONSIGNES_SAVE:       'consignes_save',
  CONSIGNES_LOCK:       'consignes_lock',
  CONSIGNES_EMAIL_SENT: 'consignes_email_sent',
  CONSIGNES_DELETE:     'consignes_delete',

  // Utilisateurs (admin)
  USER_CREATE:          'user_create',
  USER_UPDATE:          'user_update',
  USER_DELETE:          'user_delete',

  // Permissions (admin)
  PERMISSIONS_SAVE:     'permissions_save',
  PERMISSIONS_RESET:    'permissions_reset',

  // Pages sensibles
  PAGE_ADMIN_USERS:     'page_admin_users',
  PAGE_ADMIN_PERMS:     'page_admin_permissions',
  PAGE_AUDIT_LOG:       'page_audit_log',
} as const;
