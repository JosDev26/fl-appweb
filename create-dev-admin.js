// Script para crear un administrador para el panel /dev
// Ejecutar con: node create-dev-admin.js

const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createAdmin() {
  console.log('\n🔐 Crear Administrador para Panel /dev\n');
  console.log('Este script te ayudará a generar el hash de contraseña para insertar en Supabase.\n');

  try {
    const name = await question('Nombre del administrador: ');
    const email = await question('Correo electrónico: ');
    const password = await question('Contraseña (mínimo 8 caracteres): ');

    if (!name || !email || !password) {
      console.log('\n❌ Error: Todos los campos son requeridos\n');
      rl.close();
      return;
    }

    if (password.length < 8) {
      console.log('\n❌ Error: La contraseña debe tener al menos 8 caracteres\n');
      rl.close();
      return;
    }

    console.log('\n⏳ Generando hash seguro...\n');

    const passwordHash = bcrypt.hashSync(password, 10);

    console.log('✅ Hash generado exitosamente!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 Copia y ejecuta este SQL en Supabase SQL Editor:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`INSERT INTO public.dev_admins (email, password_hash, name, is_active)`);
    console.log(`VALUES (`);
    console.log(`  '${email}',`);
    console.log(`  '${passwordHash}',`);
    console.log(`  '${name}',`);
    console.log(`  true`);
    console.log(`);\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📝 Credenciales para login:\n');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}\n`);
    console.log('⚠️  IMPORTANTE: Guarda estas credenciales en un lugar seguro!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

createAdmin();
