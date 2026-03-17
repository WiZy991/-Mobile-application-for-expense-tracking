const { dbQuery } = require('../database/init');

/**
 * Middleware для проверки роли пользователя
 * @param {string[]} allowedRoles - Массив разрешенных ролей ('director', 'employee')
 */
const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await dbQuery(
        'SELECT role, parent_client_id FROM clients WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const client = result.rows[0];
      const userRole = client.role;

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'Access denied', 
          message: `This endpoint requires one of the following roles: ${allowedRoles.join(', ')}` 
        });
      }

      // Добавляем информацию о роли в req.user
      req.user.role = userRole;
      req.user.parentClientId = client.parent_client_id;

      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

module.exports = { requireRole };
