// 소유자 확인은 Firestore의 role 필드 사용 (이메일 노출 방지)
const OWNER_EMAILS = [];

// 등급 정의
const ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  SUB_MANAGER: 'sub_manager',  // 소속매니저 (매니저와 데이터 공유)
  DEALER: 'dealer',
  MEMBER: 'member'
};

// 등급 계층 (숫자가 클수록 높은 권한)
const ROLE_LEVELS = {
  owner: 5,
  manager: 4,
  sub_manager: 3,  // 소속매니저
  dealer: 2,
  member: 1
};

// 등급별 한국어 표시
const ROLE_LABELS = {
  owner: '소유자',
  manager: '매니저',
  sub_manager: '소속매니저',
  dealer: '딜러',
  member: '일반회원'
};

// 초대코드 생성 함수 (6자리, 혼동 문자 제외)
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // O, 0, I, 1 제외
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 초대코드 유효성 검증
async function validateInviteCode(code) {
  if (!code || code.length !== 6) return null;

  try {
    const codeDoc = await db.collection('inviteCodes').doc(code.toUpperCase()).get();
    if (!codeDoc.exists || !codeDoc.data().active) return null;
    return codeDoc.data();
  } catch (error) {
    console.error('초대코드 검증 실패:', error);
    return null;
  }
}

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
