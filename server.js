const express = require('express');
const app = express();

app.use('/', require('./api/index'));

// Listen to Compute Engine specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
	console.log(`Sever listening on port ${PORT}...`);
});