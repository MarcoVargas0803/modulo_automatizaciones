`npm run lint` (oxlint) **no detecta rutas de `require` rotas** — sus reglas de imports
apuntan a `import` de ESM. La comprobación real aprovecha que CommonJS carga de forma
ansiosa: requerir `app.js` resuelve todo el grafo y revienta con `MODULE_NOT_FOUND`
señalando el archivo culpable.

```bash
cd backend
DB_HOST=x DB_PORT=5432 DB_NAME=x DB_USER=x DB_PASSWORD=x JWT_SECRET=x \
FRONTEND_ORIGINS=http://localhost:5173 \
node -e "require('./src/app.js'); console.log('OK: grafo resuelto')"
```

No abre conexión a la base — `new Pool()` de `pg` es perezoso.

Si además se tocaron los `index.js` de módulos, volcar la tabla real de rutas montadas
recorriendo `app.router.stack`: detecta un router olvidado o un middleware perdido, y es
**la única cuenta de endpoints que no se desactualiza**. Al cierre de la extracción daba
**53 endpoints**; si el número cambia sin que se haya añadido una ruta a propósito, algo
se montó de más o de menos.

```bash
cd backend
DB_HOST=x DB_PORT=5432 DB_NAME=x DB_USER=x DB_PASSWORD=x JWT_SECRET=x \
FRONTEND_ORIGINS=http://localhost:5173 \
node -e "
const app = require('./src/app.js');
const rutas = [];
(function walk(stack, base) {
  for (const layer of stack) {
    if (layer.route) {
      rutas.push(Object.keys(layer.route.methods).join(',').toUpperCase().padEnd(6) + base + layer.route.path);
    } else if (layer.name === 'router' && layer.handle?.stack) {
      walk(layer.handle.stack, base);
    }
  }
})(app.router.stack, '/api');
console.log('TOTAL: ' + rutas.length);
console.log(rutas.sort().join('\n'));
"
```

---
