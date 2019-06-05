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

const PROGRAM = 'Program';

router.use(bodyParser.json());

/* ------------- Begin program Model Functions ------------- */

// returns a list of programs
function get_programs(req) {
	var q = datastore.createQuery(PROGRAM).limit(5);
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

// returns a single program
async function get_program(id) {
	const key = datastore.key([PROGRAM, parseInt(id, 10)]);
	const entity = await datastore.get(key);
	return entity;
}

function post_program(name, desc, suppliesNeeded) {
	var key = datastore.key(PROGRAM);
	const newprogram = { 'name': name, 'desc': desc, 'suppliesNeeded': suppliesNeeded };
	return datastore.save( {"key":key, "data": newprogram }).then(() => {return key});
}

function put_program(id, name, desc, suppliesNeeded) {
	const key = datastore.key([PROGRAM, parseInt(id, 10)]);
	const user = {'name': name, 'desc': desc, 'suppliesNeeded': suppliesNeeded};
	return datastore.save( {'key':key, 'data': user} );
}

function delete_program(id) {
	const key = datastore.key([PROGRAM, parseInt(id, 10)]);
	return datastore.delete(key);
}


/* -------------- End program Model Functions -------------- */


/* -------------- Begin Controller Functions -------------- */

router.get('/', function(req, res) {
	const programs = get_programs(req)
		.then( (programs) => {
			res.status(200).json(programs);
		});
});

router.post('/', checkJWT, function(req, res) {
	post_program(req.body.name, req.body.desc, req.body.suppliesNeeded)
		.then( key => {	res.status(201).send('{ "id": ' + key.id + ' }')});
});


router.put('/:id', checkJWT, function(req, res) {
	// check if program id is valid
	const program = get_program(req.params.id)
		.then( (program) => {
			if(program[0] === undefined || program.length == 0) {
				res.status(404).send('Error: invalid program id');
			} else {
				put_program(req.body.name, req.body.desc, req.body.suppliesNeeded)
					.then(res.location(req.protocol + '://' + req.get('host') + req.baseUrl + '/' + req.params.id))
					.then(res.status(303).end());
			}
		});
});

router.delete('/:id', checkJWT, function(req, res) {
	// check if program id is valid
	const program = get_program(req.params.id)
		.then( (program) => {
			if(program[0] === undefined || program.length == 0) {
				res.status(404).send('Error: inavlid program id');
			} else {
				delete_program(req.params.id).then(res.status(204).end());
			}
		});
});

// handle any invalid PUTS or DELETES
router.put('/', function(req, res) {
	res.set('Accept', 'GET, POST');
	res.status(405).end();
});

router.delete('/', function(req, res) {
	res.set('Accept', 'GET, POST');
	res.status(405).end();
});


/* --------------- End Controller Functions --------------- */

module.exports = router;