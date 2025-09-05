const bcrypt = require('bcryptjs');

async function generateHash() {
  const password = 'admin123';
  const saltRounds = 12;
  
  console.log('🔐 Generating hash for password:', password);
  
  try {
    const hash = await bcrypt.hash(password, saltRounds);
    console.log('✅ New hash generated:');
    console.log('📋 COPY THIS HASH:');
    console.log(hash);
    
    // Verify the hash works
    const isValid = await bcrypt.compare(password, hash);
    console.log('🧪 Hash verification:', isValid ? '✅ VALID' : '❌ INVALID');
    
    return hash;
  } catch (error) {
    console.error('❌ Error generating hash:', error);
  }
}

generateHash();
