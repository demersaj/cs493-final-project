const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('../lib/datastore');

const datastore = ds.datastore;

const user = 'USER';

router.use(bodyParser.json());

/* ------------- Begin user Model Functions ------------- */

function get_users(req) {
	var q = datastore.createQuery(user).limit(5);
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

function post_user(name, username, password, email) {
	var key = datastore.key(user);
	const newUser = {'name': name, 'username': username, 'password': password, 'email': email};
	return datastore.save( {"key":key, "data": newUser }).then(() => {return key});
}

/* -------------- End user Model Functions -------------- */


/* -------------- Begin Controller Functions -------------- */

router.get('/', function(req, res) {
	const users = get_users(req)
		.then( (users) => {
			res.status(200).json(users);
		});
});

router.post('/', function(req, res) {
	post_user(req.body.name, req.body.username, req.body.password, req.body.email)
		.then( key => {	res.status(201).send('{ "id": ' + key.id + ' }')});
});

/* --------------- End Controller Functions --------------- */




module.exports = router;