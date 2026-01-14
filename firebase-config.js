// 소유자(최고관리자) 이메일 설정
const OWNER_EMAILS = ['lcjun37@gmail.com'];

// 등급 정의
const ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  DEALER: 'dealer',
  MEMBER: 'member'
};

// 등급 계층 (숫자가 클수록 높은 권한)
const ROLE_LEVELS = {
  owner: 4,
  manager: 3,
  dealer: 2,
  member: 1
};

// 등급별 한국어 표시
const ROLE_LABELS = {
  owner: '소유자',
  manager: '매니저',
  dealer: '딜러',
  member: '일반회원'
};

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
