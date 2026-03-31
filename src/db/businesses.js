'use strict';

const { getDb } = require('./database');

function getBusinessBySlug(slug) {
  const db = getDb();
  return db.prepare('SELECT * FROM businesses WHERE slug = ?').get(slug);
}

function getBusinessById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
}

function getServicesByBusiness(businessId) {
  const db = getDb();
  return db.prepare('SELECT * FROM services WHERE business_id = ?').all(businessId);
}

function getServiceById(serviceId) {
  const db = getDb();
  return db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
}

function listBusinesses() {
  const db = getDb();
  return db.prepare('SELECT * FROM businesses ORDER BY name').all();
}

module.exports = {
  getBusinessBySlug,
  getBusinessById,
  getServicesByBusiness,
  getServiceById,
  listBusinesses,
};
