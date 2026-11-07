import { firebaseConfig } from './firebase-config.js';
import { MEMBERS, displayName, initialState, normalizedState, buyerFor, purchaseTransition, undoTransition } from './rotation.js';

const $ = (id) => document.getElementById(id);
const storageKey = 'coffee-turn-demo-v1';
const loginMarkerKey = 'coffee-turn-last-successful-login-v1';
const buildLabel = '2026-11-07 Safari 인증 개선';
function safeStorageGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeStorageSet(key, value) {
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}
function safeStorageRemove(key) {
  try { window.localStorage.removeItem(key); } catch {}
}
function storageWritable() {
  const key = 'coffee-turn-storage-test';
  try {
    window.localStorage.setItem(key, 'ok');
    const success = window.localStorage.getItem(key) === 'ok';
    window.localStorage.removeItem(key);
    return success;
  } catch { return false; }
}
let mode = safeStorageGet('coffee-turn-mode') === 'AB' ? 'AB' : 'ABC';
let current = initialState();
let history = [];
let demo = false;
let ready = false;
let busy = false;
let signedUser = null;
let api = null;
let auth = null;
let stateRef = null;
let eventsCollection = null;
let unsubscribeState = null;
let unsubscribeEvents = null;
let toastTimer;
let persistentLoginAvailable = true;

// Diagnostics contain no credentials, tokens or personal identifiers.
function renderLoginDiagnostics(status) {
  const writable = storageWritable();
  persistentLoginAvailable = writable;
  const previouslyLoggedIn = !!safeStorageGet(loginMarkerKey);
  const parts = [
    '앱 버전: ' + buildLabel,
    'Safari 사이트 데이터 저장: ' + (writable ? '정상' : '차단 또는 비활성'),
    '이전에 이 브라우저로 로그인한 기록: ' + (previouslyLoggedIn ? '있음' : '없음'),
    '현재 Firebase 인증 상태: ' + status
  ];
  $('auth-diagnostics-text').textContent = parts.join('\n');
  if (!writable) {
    reportError('Safari의 사이트 데이터 저장 기능을 사용할 수 없습니다. Safari 일반 탭을 이용하고 설정 → 앱 → Safari → 고급에서 모든 쿠키 차단을 해제해 주세요.');
  } else if (previouslyLoggedIn && status === '로그인 정보 없음') {
    $('login-note').textContent = '이 기기에 이전 로그인 흔적이 있지만 Firebase 세션을 복원하지 못했습니다. 아래 “로그인 유지 진단”에서 상태를 확인해 주세요.';
    show($('login-note'), true);
  } else {
    show($('login-note'), false);
  }
}

function show(element, visible) { element.classList.toggle('hidden', !visible); }
function toast(message) {
  $('toast').textContent = message;
  show($('toast'), true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => show($('toast'), false), 3000);
}
function reportError(message) {
  $('error-banner').textContent = message;
  show($('error-banner'), true);
}
function formatDate(value) {
  let date = null;
  if (typeof value === 'number') date = new Date(value);
  else if (value?.toDate) date = value.toDate();
  else if (value instanceof Date) date = value;
  if (!date || Number.isNaN(date.getTime())) return '방금 전';
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
function setBusy(value) {
  busy = value;
  $('purchase').disabled = !ready || busy;
  $('undo').disabled = !ready || busy || !current.lastEventId;
  $('purchase').textContent = busy ? '처리 중…' : '✓  커피 구매 완료';
}
function render() {
  const next = buyerFor(current, mode);
  $('next-buyer').textContent = displayName(next);
  $('avatar').textContent = displayName(next);
  $('count-note').textContent = (mode === 'ABC' ? '3인' : '2인') + ' 모드 · 완료 ' + current.counts[mode] + '회';
  $('abc-count').textContent = '3인 구매 ' + current.counts.ABC + '회';
  $('ab-count').textContent = '2인 구매 ' + current.counts.AB + '회';
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const row = $('member-row');
  row.replaceChildren();
  const members = MEMBERS[mode];
  const firstIndex = members.indexOf(next);
  const upcoming = [...members.slice(firstIndex), ...members.slice(0, firstIndex)];
  row.style.gridTemplateColumns = 'repeat(' + members.length + ', minmax(0, 1fr))';
  upcoming.forEach((name, index) => {
    const card = document.createElement('div');
    card.className = 'member-card' + (index === 0 ? ' is-next' : '');
    const letter = document.createElement('div');
    letter.className = 'member-letter';
    letter.textContent = displayName(name);
    const status = document.createElement('div');
    status.className = 'member-status';
    status.textContent = index === 0 ? '다음 구매' : (index + 1) + '번째 구매';
    card.append(letter, status);
    row.append(card);
  });
  $('rotation-order').textContent = upcoming.map(displayName).join(' → ') + ' → ' + displayName(upcoming[0]);
  const list = $('history');
  list.replaceChildren();
  if (history.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '아직 커피 구매 기록이 없어요.';
    list.append(empty);
  } else {
    history.slice(0, 20).forEach((event) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const ico = document.createElement('div');
      ico.className = 'history-icon';
      ico.textContent = '✓';
      const main = document.createElement('div');
      main.className = 'history-main';
      const title = document.createElement('div');
      title.className = 'history-title';
      title.textContent = displayName(event.buyer) + ' · 커피 구매 완료';
      const sub = document.createElement('div');
      sub.className = 'history-sub';
      sub.textContent = formatDate(event.createdAt) + ' · ' + (event.actor ?? '사용자');
      const tag = document.createElement('span');
      tag.className = 'history-mode';
      tag.textContent = event.mode === 'ABC' ? '3인' : '2인';
      main.append(title, sub);
      item.append(ico, main, tag);
      list.append(item);
    });
  }
  $('undo').disabled = !ready || busy || !current.lastEventId;
  $('purchase').disabled = !ready || busy;
  $('signed-user').textContent = demo ? '이 기기 체험 데이터' : (signedUser?.email ?? '연결 중');
}
function loadDemo() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    current = normalizedState(saved.state);
    history = Array.isArray(saved.history) ? saved.history : [];
  } catch { current = initialState(); history = []; }
}
function saveDemo() { localStorage.setItem(storageKey, JSON.stringify({ state: current, history })); }
function randomId() { return crypto?.randomUUID?.() ?? (Date.now() + '-' + Math.random().toString(36).slice(2)); }
function viewApp() {
  show($('login-panel'), false);
  show($('main-panel'), true);
  ready = true;
  render();
}
function clearListeners() {
  if (unsubscribeState) unsubscribeState();
  if (unsubscribeEvents) unsubscribeEvents();
  unsubscribeState = null;
  unsubscribeEvents = null;
}
function friendlyError(error) {
  const code = error?.code || '';
  if (code === 'permission-denied') return '이 계정은 접근이 허용되지 않았습니다. Firebase 보안 규칙에 사용자 UID를 등록했는지 확인하세요.';
  if (['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].includes(code)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (code === 'auth/too-many-requests') return '로그인 시도가 많습니다. 잠시 후 다시 시도하세요.';
  if (code === 'unavailable') return '네트워크 연결을 확인해 주세요.';
  return error?.message || String(error);
}
async function buyCoffee() {
  if (busy || !ready) return;
  setBusy(true);
  try {
    const eventId = randomId();
    if (demo) {
      const result = purchaseTransition(current, mode, eventId, '체험 사용자', Date.now());
      current = result.next;
      history.unshift(result.event);
      saveDemo();
      render();
    } else {
      await api.runTransaction(api.db, async (transaction) => {
        const stateDoc = await transaction.get(stateRef);
        const result = purchaseTransition(stateDoc.exists() ? stateDoc.data() : initialState(), mode, eventId, signedUser.email || signedUser.uid, api.serverTimestamp());
        transaction.set(stateRef, result.next);
        transaction.set(api.doc(eventsCollection, eventId), result.event);
      });
    }
    toast('구매 완료! 다음 순번으로 넘어갔어요.');
  } catch (error) {
    reportError('구매 기록 저장 실패: ' + friendlyError(error));
  } finally { setBusy(false); }
}
async function undoCoffee() {
  if (busy || !ready || !current.lastEventId) return;
  if (!window.confirm('전체 모드에서 가장 마지막 구매 기록 1건을 취소할까요?')) return;
  setBusy(true);
  try {
    if (demo) {
      const last = history.find((event) => event.id === current.lastEventId);
      current = undoTransition(current, last);
      history = history.filter((event) => event.id !== last.id);
      saveDemo();
      render();
    } else {
      await api.runTransaction(api.db, async (transaction) => {
        const currentSnapshot = await transaction.get(stateRef);
        const state = normalizedState(currentSnapshot.exists() ? currentSnapshot.data() : null);
        if (!state.lastEventId) throw new Error('취소할 구매 기록이 없습니다.');
        const eventRef = api.doc(eventsCollection, state.lastEventId);
        const eventSnapshot = await transaction.get(eventRef);
        if (!eventSnapshot.exists()) throw new Error('최근 구매 기록을 찾을 수 없습니다.');
        transaction.set(stateRef, undoTransition(state, eventSnapshot.data()));
        transaction.delete(eventRef);
      });
    }
    toast('마지막 구매를 취소했어요.');
  } catch (error) {
    reportError('취소 실패: ' + friendlyError(error));
  } finally { setBusy(false); }
}
async function startFirebase() {
  const version = '12.6.0';
  const [{ initializeApp }, firebaseAuth, firestore] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/' + version + '/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/' + version + '/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/' + version + '/firebase-firestore.js')
  ]);
  const app = initializeApp(firebaseConfig);
  // Safari: consistently use durable localStorage first, with IndexedDB
  // as a fallback and migration source for previously saved auth sessions.
  // Do not switch persistence on each login or reload.
  auth = firebaseAuth.initializeAuth(app, {
    persistence: [
      firebaseAuth.browserLocalPersistence,
      firebaseAuth.indexedDBLocalPersistence
    ]
  });
  $('connection').textContent = '로그인 복원 중';
  const db = firestore.getFirestore(app);
  api = { ...firestore, db, firebaseAuth };
  stateRef = firestore.doc(db, 'teams', 'coffee-turn', 'state', 'current');
  eventsCollection = firestore.collection(db, 'teams', 'coffee-turn', 'events');
  $('connection').textContent = '보안 연결';
  show($('logout'), true);
  firebaseAuth.onAuthStateChanged(auth, (user) => {
    clearListeners();
    signedUser = user;
    if (!user) {
      ready = false;
      show($('main-panel'), false);
      show($('login-panel'), true);
      $('connection').textContent = '로그인 필요';
      renderLoginDiagnostics('로그인 정보 없음');
      return;
    }
    renderLoginDiagnostics('로그인 확인됨');
    safeStorageSet(loginMarkerKey, 'yes');
    $('connection').textContent = '동기화 중';
    ready = false;
    viewApp();
    unsubscribeState = firestore.onSnapshot(stateRef, (snapshot) => {
      current = normalizedState(snapshot.exists() ? snapshot.data() : null);
      $('connection').textContent = snapshot.metadata.fromCache ? '오프라인 캐시' : '실시간 연결';
      if (persistentLoginAvailable) show($('error-banner'), false);
      render();
    }, (error) => { ready = false; $('connection').textContent = '연결 오류'; reportError(friendlyError(error)); render(); });
    unsubscribeEvents = firestore.onSnapshot(firestore.query(eventsCollection, firestore.orderBy('createdAt', 'desc'), firestore.limit(30)), (snapshot) => {
      history = snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }));
      render();
    }, (error) => reportError('기록 조회 실패: ' + friendlyError(error)));
  }, (error) => reportError('인증 연결 실패: ' + friendlyError(error)));
}
$('purchase').addEventListener('click', buyCoffee);
$('undo').addEventListener('click', undoCoffee);
document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    safeStorageSet('coffee-turn-mode', mode);
    render();
  });
});
$('share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); toast('웹앱 주소를 복사했어요.'); }
  catch { toast('주소창의 URL을 복사해서 공유해 주세요.'); }
});
$('logout').addEventListener('click', async () => {
  if (!auth) return;
  try {
    await api.firebaseAuth.signOut(auth);
    safeStorageRemove(loginMarkerKey);
    renderLoginDiagnostics('로그아웃됨');
  } catch (error) { reportError('로그아웃 실패: ' + friendlyError(error)); }
});
$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!auth) return;
  const button = $('login-submit');
  button.disabled = true;
  show($('login-error'), false);
  try {
    // Persistence was configured once at initializeAuth(). Never save a
    // password or Firebase token in app-managed localStorage.
    await api.firebaseAuth.signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
    safeStorageSet(loginMarkerKey, 'yes');
    $('password').value = '';
  } catch (error) {
    $('login-error').textContent = friendlyError(error);
    show($('login-error'), true);
  } finally { button.disabled = false; }
});
const configIsReady = ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) => typeof firebaseConfig[key] === 'string' && firebaseConfig[key].trim().length > 0);
if (!configIsReady) {
  demo = true;
  loadDemo();
  $('connection').textContent = '체험 모드';
  show($('demo-banner'), true);
  viewApp();
} else {
  startFirebase().catch((error) => {
    $('connection').textContent = '설정 오류';
    reportError('Firebase 연결에 실패했습니다: ' + friendlyError(error) + '. firebase-config.js 설정을 확인해 주세요.');
  });
}