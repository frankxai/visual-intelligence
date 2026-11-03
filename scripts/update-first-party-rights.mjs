import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/vis.sqlite');
db.exec('PRAGMA busy_timeout = 10000');
db.exec('PRAGMA journal_mode = WAL');

const update = db.prepare(`
  UPDATE asset 
  SET rights_status = 'generated-owned'
  WHERE rights_status = 'unknown' 
    AND (
      primary_path LIKE '%remotion%' 
      OR primary_path LIKE '%animelegends%'
      OR primary_path LIKE '%queen%'
      OR primary_path LIKE '%field-notes%'
      OR primary_path LIKE '%cinematic%'
      OR primary_path LIKE '%starlight-intelligence%'
      OR primary_path LIKE '%sis%'
    )
`);

const result = update.run();
console.log(`Updated ${result.changes} additional first-party assets to generated-owned!`);
