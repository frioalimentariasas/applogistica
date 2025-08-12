import admin from 'firebase-admin';

function initializeAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error('Firebase Admin initialization skipped: FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string
    );
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization error:', error.stack);
    return null;
  }
}

const app = initializeAdmin();

const firestore = app ? admin.firestore() : null;
const storage = app ? admin.storage() : null;
const auth = app ? admin.auth() : null;

export { firestore, storage, auth };
