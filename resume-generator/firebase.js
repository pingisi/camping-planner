import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA9IO3HQXO144Hr5P1l1zQMEwBJXlK3_o4",
  authDomain: "camping-planner-db061.firebaseapp.com",
  projectId: "camping-planner-db061",
  storageBucket: "camping-planner-db061.firebasestorage.app",
  messagingSenderId: "672097465308",
  appId: "1:672097465308:web:07603a4bfdd82344cf1519",
  measurementId: "G-LZ1Z8MBXJ9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
