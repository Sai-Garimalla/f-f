const { pool } = require('./server/db/connection.js');
async function test() {
  const [rows] = await pool.query({sql: 'SELECT NOW() as db_time, @@system_time_zone, @@time_zone, @@global.time_zone', dateStrings: true});
  console.log(rows[0]);
  process.exit(0);
}
test();
