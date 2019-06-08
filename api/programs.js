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
const CLIENT = 'Client';

router.use(bodyParser.json());

/* ------------- Begin program Model Functions ------------- */

function count_programs() {
	const q = datastore.createQuery(PROGRAM);
	return datastore.runQuery(q)
		.then( (count) => {
			return count[0].length;
		});
}

// returns a list of programs
async function get_programs(req) {
	var q = datastore.createQuery(PROGRAM).limit(5);
	var results = {};
	if(Object.keys(req.query).includes('cursor')){
		q = q.start(req.query.cursor);
	}

	const itemCount = await count_programs();

	return datastore.runQuery(q).then( (entities) => {
		results.items = entities[0].map(ds.fromDatastore);
		if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
			results.next = req.protocol + '://' + req.get('host') + req.baseUrl + '?cursor=' + entities[1].endCursor;
		}
		for (var i = 0; i < results.items.length; i++){
			results.items[i].self = req.protocol + '://' + req.get('host') + req.baseUrl + '/' + results.items[i].id;
		}

		results.totalCount = itemCount;
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

function remove_client_program(clientId, programId) {
	var programList = [];
	const key = datastore.key([CLIENT, parseInt(clientId, 10)]);
	const entity = datastore.get(key)
		.then( (client) => {
			for (var i = 0; i < client[0].programs.length; i++) {    // loop through client IDs
				if (parseInt(client[0].programs[i].id, 10) != programId) {     // if ID is NOT the one we are looking for                               
					programList.push(client[0].programs[i]);  // add it to new array
				}
			}
			client[0].programs = programList;
			return datastore.save( {'key':key, 'data':client[0]} );
		});
}

// used when deleting a program
async function get_client(id) {
	const key = datastore.key([CLIENT, parseInt(id, 10)]);
	const entity = await datastore.get(key);
	console.log(entity[0]);
	return entity;
}

async function find_client(programId) {
	const key = datastore.key([PROGRAM, parseInt(programId, 10)]);
	const entity = datastore.get(key)
		.then( (entity) => {
			const query = datastore
				.createQuery(CLIENT)
				.filter('program', '=', entity);

			return user = datastore.runQuery(query)
				.then( (entities) => {
					console.log(entities);
					return entities[0].map(ds.fromDatastore);
				});

		});
}

/* -------------- End program Model Functions -------------- */


/* -------------- Begin Controller Functions -------------- */

router.get('/', function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts) {res.status(406).send(JSON.stringify('Not acceptable'));}
	const programs = get_programs(req)
		.then( (programs) => {
			res.status(200).json(programs);
		});
});

router.get('/:id', checkJWT, function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts) {res.status(406).send(JSON.stringify('Not acceptable'));}

	const program = get_program(req.params.id)
		.then( (program) => {
			if(program[0] === undefined || program.length == 0) {
				res.status(404).send('Error: invalid user id');
			} else {
				program[0].self = req.protocol + '://' + req.get('host') + req.baseUrl + '/' + req.params.id;
				program[0].id = req.params.id;
				res.status(200).json(program[0]);
			}
		});
});

router.post('/', checkJWT, function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts || !req.body.name) {res.status(406).send(JSON.stringify('Not acceptable'));}

	post_program(req.body.name, req.body.desc, req.body.suppliesNeeded)
		.then( key => {	res.status(201).send('{ "id": ' + key.id + ' }')});
});


router.put('/:id', checkJWT, function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts ) {res.status(406).send(JSON.stringify('Not acceptable'));}

	// check if program id is valid
	const program = get_program(req.params.id)
		.then( (program) => {
			if(program[0] === undefined || program.length == 0) {
				res.status(404).send('Error: invalid program id');
			} else {
				put_program(req.body.name, req.body.desc, req.body.suppliesNeeded)
					.then(res.location(req.protocol + '://' + req.get('host') + req.baseUrl + '/' + req.params.id))
					.then(res.status(204).end());
			}
		});
});

router.delete('/:id', checkJWT, function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts) {res.status(406).send(JSON.stringify('Not acceptable'));}

	// check if program id is valid
	const program = get_program(req.params.id)
		.then( (program) => {
			if(program[0] === undefined || program.length == 0) {
				res.status(404).send('Error: invalid program id');
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