import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    // Ensure the environment variable is set
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      console.error('Firebase Admin initialization skipped: FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    } else {
        const serviceAccount = JSON.parse(
          process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string
        );

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

const firestore = admin.apps.length ? admin.firestore('frioalimentaria') : null;

export { firestore };
