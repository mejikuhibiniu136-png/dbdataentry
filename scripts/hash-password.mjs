// Membuat hash bcrypt untuk DASHBOARD_PASS_HASH.
// Pemakaian:  npm run hash -- "password-anda"
//        atau: node scripts/hash-password.mjs "password-anda"
import bcrypt from 'bcryptjs';

const COST = 12;
const password = process.argv[2];

if (!password) {
  console.error('Pemakaian: npm run hash -- "password-anda"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, COST);
console.log('\nSalin nilai berikut ke env DASHBOARD_PASS_HASH:\n');
console.log(hash);
console.log('\nCatatan: di file .env / .env.local, escape setiap karakter $ menjadi \\$');
console.log('(di dashboard Vercel tidak perlu di-escape).\n');
