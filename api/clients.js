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


router.put('/:id', checkJWT, function(req, res) {
	// check if client id is valid
	const client = get_client(req.params.id)
		.then( (client) => {
			if(client[0] === undefined || client.length == 0) {
				res.status(404).send('Error: inavlid client id');
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
	// check if client id is valid
	const client = get_client(req.params.id)
		.then( (client) => {
			if(client[0] === undefined || client.length == 0) {
				res.status(404).send('Error: inavlid client id');
			} else if (client[0].email != req.user.name){
				res.status(403).send('Error: user does not have permission to delete this client');
			} else {
				delete_client(req.params.id).then(res.status(204).end());
				// update user's client list

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