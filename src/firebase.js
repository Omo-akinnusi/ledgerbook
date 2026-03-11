import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBIGOe8cbA7Njar4ehENbIxUFS30Sy2TjE",
  authDomain: "ledgerbook-1db5d.firebaseapp.com",
  projectId: "ledgerbook-1db5d",
  storageBucket: "ledgerbook-1db5d.firebasestorage.app",
  messagingSenderId: "465884400783",
  appId: "1:465884400783:web:891ad5dfccf0c9b49334fa",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

export {
  auth, db,
  googleProvider, appleProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
  // Firestore
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
};
