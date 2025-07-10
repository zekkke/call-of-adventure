import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBChOBuQueBIdV3IxH1Klvge4pl4zwfx4Y",
  authDomain: "call-of-adventure.firebaseapp.com",
  projectId: "call-of-adventure",
  storageBucket: "call-of-adventure.firebasestorage.app",
  messagingSenderId: "19275718184",
  appId: "1:19275718184:web:471b84d4d092276c169f1d",
  measurementId: "G-JEC37N9H7W"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut };