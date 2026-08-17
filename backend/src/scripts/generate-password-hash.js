const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Debes proporcionar una contraseña.');
  console.error('Ejemplo: node src/scripts/generate-password-hash.js MiPassword123');
  process.exit(1);
}

async function generateHash() {
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);

  console.log('Password hash generado:');
  console.log(hash);
}

generateHash();