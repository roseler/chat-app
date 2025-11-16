import CryptoJS from 'crypto-js';

// Generate a random key for AES encryption
export const generateKey = () => {
  return CryptoJS.lib.WordArray.random(256/8).toString();
};

// Encrypt message using AES
export const encryptMessage = (message, key) => {
  try {
    // Ensure key is in the right format (WordArray or string)
    // If key is a hex string from SHA256, convert it properly
    let keyWordArray;
    if (typeof key === 'string' && key.length === 64) {
      // It's a hex string (SHA256 produces 64 char hex)
      keyWordArray = CryptoJS.enc.Hex.parse(key);
    } else {
      // Use as-is (CryptoJS will handle it)
      keyWordArray = key;
    }
    
    const iv = CryptoJS.lib.WordArray.random(128/8);
    const encrypted = CryptoJS.AES.encrypt(message, keyWordArray, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    return {
      encryptedContent: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
      iv: iv.toString(CryptoJS.enc.Base64)
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Encryption error:', error);
    }
    throw error;
  }
};

// Decrypt message using AES
export const decryptMessage = (encryptedContent, iv, key) => {
  try {
    // Ensure key is in the right format
    let keyWordArray;
    if (typeof key === 'string' && key.length === 64) {
      // It's a hex string (SHA256 produces 64 char hex)
      keyWordArray = CryptoJS.enc.Hex.parse(key);
    } else {
      // Use as-is
      keyWordArray = key;
    }
    
    const encrypted = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(encryptedContent)
    });
    
    const decrypted = CryptoJS.AES.decrypt(encrypted, keyWordArray, {
      iv: CryptoJS.enc.Base64.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
    
    // Check if decryption was successful (empty string usually means wrong key)
    if (!decryptedText || decryptedText.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Decryption failed - wrong key or corrupted data');
      }
      return null;
    }
    
    return decryptedText;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Decryption error:', error);
    }
    return null;
  }
};

// Derive shared key from two keys (simple XOR for demo, use proper key exchange in production)
export const deriveSharedKey = (key1, key2) => {
  // In production, use proper key exchange like Diffie-Hellman
  // For simplicity, we'll use a combination approach
  const combined = key1 + key2;
  return CryptoJS.SHA256(combined).toString();
};

// Store encryption keys in localStorage (in production, use more secure storage)
export const storeUserKey = (userId, key) => {
  localStorage.setItem(`encryption_key_${userId}`, key);
};

export const getUserKey = (userId) => {
  return localStorage.getItem(`encryption_key_${userId}`);
};

// Key exchange: Store shared keys between users
export const storeSharedKey = (userId1, userId2, key) => {
  const keyId = userId1 < userId2 ? `${userId1}_${userId2}` : `${userId2}_${userId1}`;
  localStorage.setItem(`shared_key_${keyId}`, key);
};

export const getSharedKey = (userId1, userId2) => {
  // Normalize IDs to numbers to ensure consistent key generation
  const id1 = parseInt(userId1);
  const id2 = parseInt(userId2);
  
  // Sort IDs to ensure consistent key generation regardless of parameter order
  const sortedIds = [id1, id2].sort((a, b) => a - b);
  
  // Create consistent key ID (always smaller ID first)
  const keyId = `${sortedIds[0]}_${sortedIds[1]}`;
  let key = localStorage.getItem(`shared_key_${keyId}`);
  
  // Always regenerate the key deterministically to ensure both users have the same key
  // This fixes the issue where old keys might be stored with different formats
  const keySeed = `${sortedIds[0]}_${sortedIds[1]}_chat_key`;
  
  // Generate SHA256 hash and convert to hex string (64 characters)
  const hash = CryptoJS.SHA256(keySeed);
  const generatedKey = hash.toString(CryptoJS.enc.Hex);
  
  // If stored key exists but is different, replace it
  if (key && key !== generatedKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Stored key differs from generated key. Replacing with correct key.');
    }
  }
  
  // Always use the deterministically generated key (not the stored one)
  // This ensures both users always have the same key
  key = generatedKey;
  storeSharedKey(sortedIds[0], sortedIds[1], key);
  
  return key;
};

