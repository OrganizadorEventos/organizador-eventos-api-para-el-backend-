const app = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Organizador de Eventos API escuchando en http://localhost:${PORT}`);
  if (process.argv.includes('--seed-demo')) {
    const demo = db.getUserByEmail('demo@organizador.app');
    if (demo) {
      const { createDemoData } = require('./seed');
      createDemoData(demo.id, db.db);
      console.log('Datos demo sembrados.');
    }
  }
});