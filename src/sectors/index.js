'use strict';

const salon = require('./salon');
const clinic = require('./clinic');
const restaurant = require('./restaurant');
const retail = require('./retail');

const sectors = { salon, clinic, restaurant, retail };

/**
 * Returns the sector config for a given sector key.
 * Falls back to salon config if unknown.
 */
function getSectorConfig(sector) {
  return sectors[sector] || salon;
}

module.exports = { getSectorConfig };
