import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged,
  signOut,
  reload,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  applyActionCode,
} from "firebase/auth";
import {
  getFirestore,
  enableIndexedDbPersistence,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyBIGOe8cbA7Njar4ehENbIxUFS30Sy2TjE",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "ledgerbook-1db5d.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "ledgerbook-1db5d",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "ledgerbook-1db5d.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "465884400783",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:465884400783:web:891ad5dfccf0c9b49334fa",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Enable offline persistence — queues writes locally when offline
// and syncs automatically when connection is restored.
// Fails silently if already enabled (e.g. multiple tabs) or unsupported.
enableIndexedDbPersistence(db).catch((e) => {
  if (e.code === "failed-precondition") {
    // Multiple tabs open — persistence only works in one tab at a time
    console.warn("Offline persistence unavailable: multiple tabs open");
  } else if (e.code === "unimplemented") {
    // Browser doesn't support IndexedDB (very rare)
    console.warn("Offline persistence not supported in this browser");
  } else {
    // Catches UnknownError (Firefox private mode, full storage, extensions blocking IndexedDB)
    // App continues to work normally without offline persistence — data loads from server
    console.warn("Offline persistence unavailable:", e.message || e.code);
  }
});

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export {
  auth, db,
  googleProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged,
  signOut,
  reload,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  applyActionCode,
  // Firestore
  doc, getDoc, getDocs, setDoc, updateDoc,
  collection, addDoc, deleteDoc,
  onSnapshot, query, orderBy, where, limit, serverTimestamp, runTransaction,
};
