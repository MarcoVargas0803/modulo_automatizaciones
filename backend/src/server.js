const app = require('./app');
const env = require('./shared/config/env');

app.listen(env.port, () => {
    console.log(`ModuloAutomatizaciones API escuchando en el puerto ${env.port}`);
});
