const { pool } = require('./server/db/connection.js');
async function flush() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('Flushing bill_items...');
    await conn.query('TRUNCATE TABLE bill_items');
    console.log('Flushing bills...');
    await conn.query('TRUNCATE TABLE bills');
    console.log('Flushing token_counter...');
    await conn.query('TRUNCATE TABLE token_counter');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Database flushed successfully!');
  } catch(e) {
    console.error(e);
  } finally {
    conn.release();
    process.exit(0);
  }
}
flush();
