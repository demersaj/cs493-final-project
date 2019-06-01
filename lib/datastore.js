const { Datastore } = require('@google-cloud/datastore');

const projectId = 'demersa-final';

module.exports.Datastore = Datastore;
module.exports.datastore = new Datastore( {projectId:projectId, keyFilename: './keys/demersa-final-af1bd3becc46.json'} );
module.exports.fromDatastore = function fromDatastore(item) {
	item.id = item[Datastore.KEY].id;
	return item;
};