const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const ds = require('../lib/datastore');

const datastore = ds.datastore;

const checkJWT = jwt({
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

const CLIENT = 'Client';

router.use(bodyParser.json());

/* ------------- Begin client Model Functions ------------- */

// returns a list of clients
function get_clients(req) {
	var q = datastore.createQuery(CLIENT).limit(5);
	var results = {};
	if(Object.keys(req.query).includes('cursor')){
		q = q.start(req.query.cursor);
	}

	return datastore.runQuery(q).then( (entities) => {
		results.items = entities[0].map(ds.fromDatastore);
		if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
			results.next = req.protocol + '://' + req.get('host') + req.baseUrl + '?cursor=' + entities[1].endCursor;
		}
		for (var i = 0; i < results.items.length; i++){
			results.items[i].self = req.protocol + '://' + req.get('host') + req.baseUrl + '/' + results.items[i].id;
		}
		return results;
	});
}

// returns a single client
async function get_client(id) {
	const key = datastore.key([CLIENT, parseInt(id, 10)]);
	const entity = await datastore.get(key);
	return entity;
}

function post_client(name, diagnosis, age, medicalConditions, owner) {
	var key = datastore.key(CLIENT);
	const newClient = {"name": name, "diagnosis": diagnosis, "age": age, "medicalConditions": medicalConditions};
	return datastore.save( {"key":key, "data": newClient }).then(() => {return key});
}

// assign owner to client
function put_client() {

}


/* -------------- End client Model Functions -------------- */


/* -------------- Begin Controller Functions -------------- */

router.get('/', function(req, res) {
	const clients = get_clients(req)
		.then( (clients) => {
			res.status(200).json(clients);
		});
});

router.post('/', checkJWT, function(req, res) {
	post_client(req.body.name, req.body.diagnosis, req.body.age, req.body.medicalConditions, req.user.name)
		.then( key => {	res.status(201).send('{ "id": ' + key.id + ' }')});
});

/* --------------- End Controller Functions --------------- */

module.exports = router;