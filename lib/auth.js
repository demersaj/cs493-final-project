const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
module.exports.checkJWT = jwt({
	secret: jwksRsa.expressJwtSecret({
		cache: true,
		rateLimit: true,
		jwksRequestsPerMinute: 5,
		jwksUri: 'https://demersa-auth0.auth0.com/.well-known/jwks.json'
	}), 

	// validate the audience and the issuer
	issuer: 'https://demersa-auth0.auth0.com/',
	algorithms: ['RS256']
});