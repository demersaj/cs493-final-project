const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const request = require('request');
const router = express.Router();
const cl = require('./clients');
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

const USER = 'User';
const CLIENT = 'Client';

router.use(bodyParser.json());


/* ------------- Begin user Model Functions ------------- */

function get_users(req, owner) {
	var q = datastore.createQuery(USER).limit(5);
	var results = {};
	if(Object.keys(req.query).includes('cursor')) {
		q = q.start(req.query.cursor);
	}

	return datastore.runQuery(q).then( (entities) => {
		results.items = entities[0].map(ds.fromDatastore).filter(item => item.email === owner);
		if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
			results.next = req.protocol + '://' + req.get('host') + req.baseUrl + '?cursor=' + entities[1].endCursor;
		}
		for (var i = 0; i < results.items.length; i++){
			results.items[i].self = req.protocol + '://' + req.get('host') + req.baseUrl + '/' + results.items[i].id;
		}
		return results;
	});
}

async function get_user(id) {
	const key = datastore.key([USER, parseInt(id, 10)]);
	const entity = await datastore.get(key);
	return entity;
}

async function get_client(id) {
	const key = datastore.key([CLIENT, parseInt(id, 10)]);
	const entity = await datastore.get(key);
	return entity;
}

function post_user(name, email, clientAge) {
	var key = datastore.key(USER);
	const newUser = {'name': name, 'email': email, 'clientAge': clientAge};
	return datastore.save( {'key':key, 'data': newUser }).then(() => {return key});
}

function put_user(id, name, email, clientAge) {
	const key = datastore.key([USER, parseInt(id, 10)]);
	const user = {'name': name, 'email': email, 'clientAge': clientAge};
	return datastore.save( {'key':key, 'data': user} );
}

function delete_user(id) {
	const key = datastore.key([USER, parseInt(id, 10)]);
	return datastore.delete(key);
}

// assign new client to user
function put_user_client(clientId, userId, req) {
	const key = datastore.key([USER, parseInt(userId,10)]);
	const entity = datastore.get(key)
		.then( (user) => {
			if (typeof(user[0].clients) === 'undefined' || user[0].clients == null) {
				user[0].clients = [];
			}
			const newClient = {'id': clientId, 'self': req.protocol + '://' + req.get('host') + req.baseUrl + '/' + clientId};
			user[0].clients.push(newClient);
			return datastore.save({'key': key, 'data':user[0]});
		});
}

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

/* -------------- End user Model Functions -------------- */


/* -------------- Begin Controller Functions -------------- */

router.get('/', function(req, res) {
	const users = get_users(req, req.user.name)
		.then( (users) => {
			res.status(200).json(users);
		});
});

router.get('/:id', checkJWT, function(req, res) {
	const user = get_user(req.params.id)
		.then( (user) => {
			if(user[0] === undefined || user.length == 0) {
				res.status(404).send('Error: invalid user id');
			} else if (user[0].email != req.user.name){
				res.status(403).send('Error: user does not have permission to view this user')
			} else {
				user[0].self = req.protocol + '://' + req.get('host') + req.baseUrl + '/' + req.params.id;
				user[0].id = req.params.id;
				res.status(200).json(user[0]);
			}
		});
});

// sign up new user
router.post('/', function(req, res) {
	const username = req.body.username;
	const password = req.body.password;

	var options = { method: 'POST',
		url: 'https://demersa-auth0.auth0.com/dbconnections/signup',
		headers: { 'content-type': 'application/json' },
		body: 
			{ 
				client_id: 'bp9gjSxP4sBSNFuaKg8S5pqciFr0caG2',
				email: username,
				password: password,
				connection: 'Username-Password-Authentication'
			},
		json: true
	};

	post_user(req.body.name, req.body.username, req.body.clientAge);

	request(options, (error, response, body) => {
		if (error) {
			res.status(500).send(error);
		} else {
			res.send(body);
		}
	});
});

// log an existing user in
router.post('/login', function(req, res){
	const username = req.body.username;
	const password = req.body.password;

	var options = { method: 'POST',
		url: 'https://demersa-auth0.auth0.com/oauth/token',
		headers: { 'content-type': 'application/json' },
		body:
			{ 
				grant_type: 'password', 
				scope: 'openid profile',
				username: username,
				password: password,
				client_id: 'bp9gjSxP4sBSNFuaKg8S5pqciFr0caG2',
				client_secret: 'bMA2Yz775yA7oVfzM_xEOUgOMe6klXXuKrbVwISdjVJj8xvuBkKOKk5aFLhKpnSG' },
		json: true};
	request(options, (error, response, body) => {
		if (error) {
			res.status(500).send(error);
		} else {
			res.send(body);
		}
	});
});

router.put('/:id', checkJWT, function(req, res) {
	// check if user id is valid
	const user = get_user(req.params.id)
		.then( (user) => {
			if(user[0] === undefined || user.length == 0) {
				res.status(404).send('Error: inavlid user id');
			} else {
				put_user(req.params.id, req.body.name, req.body.email, req.body.clientAge)
					.then(res.location(req.protocol + '://' + req.get('host') + req.baseUrl + '/' + req.params.id))
					.then(res.status(303).end());
			}
		});
});

router.delete('/:id', checkJWT, function(req, res) {
	// check if user id is valid
	const user = get_user(req.params.id)
		.then( (user) => {
			if(user[0] === undefined || user.length == 0) {
				res.status(404).send('Error: inavlid user id');
			} else {
				delete_user(req.params.id).then(res.status(204).end());
			}
		});
});

router.put('/:userID/clients/:clientID', checkJWT, function(req, res) {
	const client = get_client(req.params.clientID)
		.then ( (client) => {
			if(client[0] === undefined || client.length == 0) {
				res.status(400).end();
			} else {
				if (client[0].owner != req.user.name || client[0].owner == null) {
					res.staus(403).send('Error: current user does not have permission to edit this client');
				} else {
					const user = get_user(req.params.userID)
						.then( (user) => {
							if(user[0] === undefined || user.length == 0) {
								res.status(400).end();
							} else {
								// update user
								put_user_client(req.params.clientID, req.params.userID, req);
								res.status(200).send('Client added to user');
							}
						});
				}
			}
		});
});

router.delete('/:userID/clients/:clientID', checkJWT, function(req, res) {
	const client = get_client(req.params.clientID)
		.then( (client) => {
			if(client[0] === undefined || client.length == 0) {
				res.status(400).end();
			} else {
				if (client[0].owner != req.user.name) {
					res.staus(403).send('Error: current user does not have permission to edit this client');
				} else {
					const user = get_user(req.params.userID)
						.then( (user) => {
							if(user[0] === undefined || user.length == 0) {
								res.status(400).end();
							} else {
								remove_user_client(req.params.clientID, req.params.userID);
								res.status(200).send('Client removed from user');
							}
						});
				}
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