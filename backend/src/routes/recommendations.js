const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database/init');

const router = express.Router();

router.use(authenticateToken);

// Получить рекомендации на основе истории покупок
router.get('/', async (req, res) => {
  try {
    const clientId = req.user.id;

    // Получаем услуги, которые клиент уже покупал
    const purchasedServices = await pool.query(
      `SELECT DISTINCT s.id as service_id, s.name, s.code, MAX(t.created_at) as last_purchase
       FROM transactions t
       JOIN services s ON t.service_id = s.id
       WHERE t.client_id = $1 AND t.type = 'charge' AND t.status = 'completed'
       GROUP BY s.id, s.name, s.code
       ORDER BY last_purchase DESC
       LIMIT 10`,
      [clientId]
    );

    const purchasedServiceIds = purchasedServices.rows.map(r => r.service_id);
    
    // Определяем категории на основе кодов услуг
    const getCategoryFromCode = (code) => {
      if (!code) return 'other';
      if (code.includes('support')) return 'support';
      if (code.includes('license')) return 'license';
      if (code.includes('cloud')) return 'cloud';
      if (code.includes('service')) return 'service';
      if (code.includes('reporting')) return 'reporting';
      return 'other';
    };
    
    const purchasedCategories = [...new Set(purchasedServices.rows.map(r => getCategoryFromCode(r.code)))];

    // Получаем услуги, которые клиент уже имеет
    const activeServices = await pool.query(
      'SELECT service_id FROM client_services WHERE client_id = $1 AND is_active = true',
      [clientId]
    );
    const activeServiceIds = activeServices.rows.map(r => r.service_id);

    // Рекомендации на основе категорий
    let recommendations = [];

    if (purchasedCategories.length > 0) {
      // Находим услуги из тех же категорий, которые клиент еще не покупал
      // Используем code для определения категории
      const categoryCodes = purchasedCategories.map(cat => `service_${cat}%`);
      const categoryRecommendations = await pool.query(
        `SELECT s.*
         FROM services s
         WHERE s.is_active = true
           AND s.id != ALL($1::int[])
           AND (
             ${purchasedCategories.map((_, i) => `s.code LIKE $${i + 2}`).join(' OR ')}
           )
         ORDER BY s.price ASC
         LIMIT 5`,
        [activeServiceIds.length > 0 ? activeServiceIds : [0], ...categoryCodes]
      );

      recommendations = categoryRecommendations.rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        price: parseFloat(r.price),
        billing_period: r.billing_period,
        category: getCategoryFromCode(r.code),
        reason: 'Похожие на ваши покупки'
      }));
    }

    // Если рекомендаций мало, добавляем популярные услуги
    if (recommendations.length < 3) {
      const popularServices = await pool.query(
        `SELECT s.*, COUNT(cs.id) as subscribers_count
         FROM services s
         LEFT JOIN client_services cs ON s.id = cs.service_id AND cs.is_active = true
         WHERE s.is_active = true
           AND s.id != ALL($1::int[])
         GROUP BY s.id
         ORDER BY subscribers_count DESC, s.price ASC
         LIMIT ${5 - recommendations.length}`,
        [activeServiceIds.length > 0 ? activeServiceIds : [0]]
      );

      popularServices.rows.forEach(r => {
        if (!recommendations.find(rec => rec.id === r.id)) {
          recommendations.push({
            id: r.id,
            name: r.name,
            description: r.description,
            price: parseFloat(r.price),
            billing_period: r.billing_period,
            category: getCategoryFromCode(r.code),
            reason: 'Популярные услуги'
          });
        }
      });
    }

    // Если все еще мало, добавляем услуги из связанных категорий
    const categoryMapping = {
      'support': ['service', 'cloud'],
      'license': ['cloud', 'service'],
      'cloud': ['license', 'support'],
      'service': ['support', 'license'],
      'reporting': ['cloud', 'license']
    };

    if (recommendations.length < 3 && purchasedCategories.length > 0) {
      const relatedCategories = [];
      purchasedCategories.forEach(cat => {
        if (categoryMapping[cat]) {
          relatedCategories.push(...categoryMapping[cat]);
        }
      });

      if (relatedCategories.length > 0) {
        const relatedCodes = relatedCategories.map(cat => `service_${cat}%`);
        const relatedServices = await pool.query(
          `SELECT s.*
           FROM services s
           WHERE s.is_active = true
             AND s.id != ALL($1::int[])
             AND (
               ${relatedCategories.map((_, i) => `s.code LIKE $${i + 2}`).join(' OR ')}
             )
           ORDER BY s.price ASC
           LIMIT ${3 - recommendations.length}`,
          [activeServiceIds.length > 0 ? activeServiceIds : [0], ...relatedCodes]
        );

        relatedServices.rows.forEach(r => {
          if (!recommendations.find(rec => rec.id === r.id)) {
            recommendations.push({
              id: r.id,
              name: r.name,
              description: r.description,
              price: parseFloat(r.price),
              billing_period: r.billing_period,
              category: getCategoryFromCode(r.code),
              reason: 'Дополнительные услуги'
            });
          }
        });
      }
    }

    res.json({
      recommendations: recommendations.slice(0, 5),
      count: recommendations.length
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
