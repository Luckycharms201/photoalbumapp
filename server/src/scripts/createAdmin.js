// Helper: generate a bcrypt hash for the admin password so you can store
// ADMIN_PASSWORD_HASH in .env instead of a plaintext password.
//
//   npm run create-admin -- "your-strong-password"
//
import bcrypt from 'bcryptjs';

const password = process.argv[2] ?? process.env.ADMIN_PASSWORD;

if (!password) {
  console.error('Usage: npm run create-admin -- "your-password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\nAdd this line to server/.env:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
