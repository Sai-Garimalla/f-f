const { pool } = require('./server/db/connection.js');
async function test() {
  const [rows] = await pool.execute('SELECT NOW() as db_time');
  console.log('DB Time:', rows[0].db_time);
  console.log('JS Time on Vercel/Local:', new Date());
  process.exit(0);
}
test();
