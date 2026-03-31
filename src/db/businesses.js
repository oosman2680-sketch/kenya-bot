'use strict';

const { pool } = require('./database');

async function getBusinessBySlug(slug) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE slug = $1', [slug]);
  return rows[0] || null;
}

async function getBusinessById(id) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getServicesByBusiness(businessId) {
  const { rows } = await pool.query(
    'SELECT * FROM services WHERE business_id = $1 ORDER BY id',
    [businessId]
  );
  return rows;
}

async function getServiceById(serviceId) {
  const { rows } = await pool.query('SELECT * FROM services WHERE id = $1', [serviceId]);
  return rows[0] || null;
}

async function listBusinesses() {
  const { rows } = await pool.query('SELECT * FROM businesses ORDER BY name');
  return rows;
}

module.exports = {
  getBusinessBySlug,
  getBusinessById,
  getServicesByBusiness,
  getServiceById,
  listBusinesses,
};
