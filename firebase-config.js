// 관리자 이메일 설정
const ADMIN_EMAILS = ['lcjun37@gmail.com'];

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyBunJyCChJ4GdpJwjVDrfeS9UTdyTqwssk",
  authDomain: "rolex-reserve.firebaseapp.com",
  projectId: "rolex-reserve",
  storageBucket: "rolex-reserve.firebasestorage.app",
  messagingSenderId: "176619354732",
  appId: "1:176619354732:web:115c50a63584d36353b649",
  measurementId: "G-PRR3Z5HSYH"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);

// 서비스 인스턴스
const auth = firebase.auth();
const db = firebase.firestore();

// Google 로그인 프로바이더
const googleProvider = new firebase.auth.GoogleAuthProvider();
