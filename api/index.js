const router = module.exports = require('express').Router();

router.use('/clients', require('./clients'));
router.use('/users', require('./users'));
router.use('/programs', require('./programs'));