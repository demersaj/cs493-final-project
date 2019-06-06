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
const USER = 'User';
const PROGRAM = 'Program';

router.use(bodyParser.json());

/* ------------- Begin client Model Functions ------------- */

// counts number of items in datastore
function count_clients() {
	const q = datastore.createQuery(CLIENT);
	return datastore.runQuery(q)
		.then( (count) => {
			return count[0].length;
		});
}

// returns a list of clients
async function get_clients(req) {
	var q = datastore.createQuery(CLIENT).limit(5);
	var results = {};
	if(Object.keys(req.query).includes('cursor')){
		q = q.start(req.query.cursor);
	}
	const itemCount = await count_clients();

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

// returns a single client
async function get_client(id) {
	const key = datastore.key([CLIENT, parseInt(id, 10)]);
	const entity = await datastore.get(key);
	return entity;
}

function post_client(name, diagnosis, age, owner) {
	var key = datastore.key(CLIENT);
	const newClient = {'name': name, 'diagnosis': diagnosis, 'age': age,'owner': owner};
	return datastore.save( {"key":key, "data": newClient }).then(() => {return key});
}

function put_client(id, name, diagnosis, age, medicalConditions, owner) {
	const key = datastore.key([CLIENT, parseInt(id, 10)]);
	const user = {'name': name, 'diagnosis': diagnosis, 'age': age, 'owner': owner};
	return datastore.save( {'key':key, 'data': user} );
}

function delete_client(id) {
	const key = datastore.key([CLIENT, parseInt(id, 10)]);
	return datastore.delete(key);
}


// assign new program to client
function put_client_program(clientId, programId, req) {
	const key = datastore.key([CLIENT, parseInt(clientId,10)]);
	const entity = datastore.get(key)
		.then( (client) => {
			if (typeof(client[0].programs) === 'undefined' || client[0].programs == null) {
				client[0].programs = [];
			}
			const newProgram = {'id': clientId, 'self': req.protocol + '://' + req.get('host') + req.baseUrl + '/' + clientId};
			client[0].programs.push(newProgram);
			return datastore.save({'key': key, 'data':client[0]});
		});
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

// used to remove a client from a user when the client has been deleted
function remove_user_client(clientId, userId) {
	var clientList = [];
	const key = datastore.key([USER, parseInt(userId, 10)]);
	const entity = datastore.get(key)
		.then( (user) => {
			for (var i = 0; i < user[0].clients.length; i++) {    // loop through client IDs
				if (parseInt(user[0].clients[i].id, 10) != clientId) {     // if ID is NOT the one we are looking for                               
					clientList.push(user[0].clients[i]);  // add it to new array
				}
			}
			user[0].clients = clientList;
			return datastore.save( {'key':key, 'data':user[0]} );
		});
}

async function find_user(req){
	const query = datastore
		.createQuery(USER)
		.filter('email', '=', req.user.name);

	return user = await datastore.runQuery(query)
		.then( (entities) => {
			return entities[0].map(ds.fromDatastore);
		});
}

// returns a single program
async function get_program(id) {
	const key = datastore.key([PROGRAM, parseInt(id, 10)]);
	const entity = await datastore.get(key);
	return entity;
}

// TODO: handle deletion of programs for clients


/* -------------- End client Model Functions -------------- */


/* -------------- Begin Controller Functions -------------- */

router.get('/', function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts) {res.status(406).send(JSON.stringify('Not acceptable'));}

	const clients = get_clients(req)
		.then( (clients) => {
			res.status(200).json(clients);
		});
});

router.get('/:id', checkJWT, function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts) {res.status(406).send(JSON.stringify('Not acceptable'));}

	const client = get_client(req.params.id)
		.then( (client) => {
			if(client[0] === undefined || client.length == 0) {
				res.status(404).send('Error: invalid client id');
			} else if (client[0].owner != req.user.name){
				res.status(403).send('Error: user does not have permission to view this client');
			} else {
				client[0].self = req.protocol + '://' + req.get('host') + req.baseUrl + '/' + req.params.id;
				client[0].id = req.params.id;
				res.status(200).json(client[0]);
			}
		});
});

router.post('/', checkJWT, function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts) {res.status(406).send(JSON.stringify('Not acceptable'));}

	post_client(req.body.name, req.body.diagnosis, req.body.age, req.user.name)
		.then( key => {	res.status(201).send('{ "id": ' + key.id + ' }')});
});


router.put('/:id', checkJWT, function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts) {res.status(406).send(JSON.stringify('Not acceptable'));}

	// check if client id is valid
	const client = get_client(req.params.id)
		.then( (client) => {
			if(client[0] === undefined || client.length == 0) {
				res.status(404).send('Error: invalid client id');
			}
			else if (client[0].owner != req.user.name){
				res.status(403).send('Error: user does not have permission to edit this client');
			} else {
				put_client(req.params.id, req.body.name, req.body.diganosis, req.body.medicalConditions, req.body.owner)
					.then(res.location(req.protocol + '://' + req.get('host') + req.baseUrl + '/' + req.params.id))
					.then(res.status(303).end());
			}
		});
});

router.delete('/:id', checkJWT, function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts) {res.status(406).send(JSON.stringify('Not acceptable'));}

	// check if client id is valid
	const client = get_client(req.params.id)
		.then( (client) => {
			if(client[0] === undefined || client.length == 0) {
				res.status(404).send('Error: invalid client id');
			} else if (client[0].owner != req.user.name){
				res.status(403).send('Error: user does not have permission to delete this client');
			} else {
				delete_client(req.params.id).then(res.status(204).end());
				// update user's client list
				const user = find_user(req)
					.then( ( user ) => {
						remove_user_client(req.params.id, user[0].id);
					});
			}
		});
});


router.put('/:clientID/programs/:programID', checkJWT, function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts) {res.status(406).send(JSON.stringify('Not acceptable'));}

	const client = get_client(req.params.clientID)
		.then ( (client) => {
			if(client[0] === undefined || client.length == 0) {
				res.status(404).send('Error: invalid client id');
			} else {
				if (client[0].owner != req.user.name || client[0].owner == null) {
					res.staus(403).send('Error: current user does not have permission to edit this client');
				} else {
					const program = get_program(req.params.programID)
						.then( (program) => {
							if(program[0] === undefined || program.length == 0) {
								res.status(404).send('Error: invalid program id');
							} else {
								// update client
								put_client_program(req.params.clientID, req.params.programID, req);
								res.status(200).send('Program added to client');
							}
						});
				}
			}
		});
});

router.delete('/:clientID/programs/:programID', checkJWT, function(req, res) {
	const accepts = req.accepts('application/json');
	if (!accepts) {res.status(406).send(JSON.stringify('Not acceptable'));}

	const client = get_client(req.params.clientID)
		.then ( (client) => {
			if(client[0] === undefined || client.length == 0) {
				res.status(404).send('Error: invalid client id');
			} else {
				if (client[0].owner != req.user.name || client[0].owner == null) {
					res.staus(403).send('Error: current user does not have permission to edit this client');
				} else {
					const program = get_program(req.params.programID)
						.then( (program) => {
							if(program[0] === undefined || program.length == 0) {
								res.status(404).send('Error: invalid program id');
							} else {
								// update client
								remove_client_program(req.params.clientID, req.params.programID, req);
								res.status(200).send('Program added to client');
							}
						});
				}
			}
		});
});

// handle any invalid GETs, PUTs, or DELETEs
router.put('/', function(req, res) {
	res.set('Accept', 'GET, POST');
	res.status(405).end();
});

router.delete('/', function(req, res) {
	res.set('Accept', 'GET, POST');
	res.status(405).end();
});

router.get('/:clientID/programs/:programID', function(req, res) {
	res.set('Accept', 'PUT, DELETE');
	res.status(405).end();
});



/* --------------- End Controller Functions --------------- */

module.exports = router;