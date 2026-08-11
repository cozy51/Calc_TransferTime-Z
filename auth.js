// 簡易ログイン画面。固定のユーザー名・パスワードで認証し、ログイン状態を
// localStorage に保存します。サーバーもデータベースも使わないブラウザ内だけの
// 画面ロックのため、機密情報を保護する仕組みではありません。
const AUTH_STORAGE_KEY = 'transfertime-z.auth';
const AUTH_CREDENTIALS = { username: 'muratec', password: 'muratec' };

function readStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session && session.username === AUTH_CREDENTIALS.username ? session : null;
  } catch (error) {
    // localStorage が使えない環境（プライベートモード等）や壊れた値は未ログイン扱い。
    return null;
  }
}

function storeSession(session) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch (error) {
    return false;
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    // 削除できない場合もこのタブのロックは実行する。
  }
}

// スクリプトは <head> で同期実行し、ログイン済みなら描画前にログイン画面を
// 隠す（ログイン済みユーザーにログイン画面が一瞬見えるのを防ぐ）。
document.documentElement.classList.toggle('is-authenticated', Boolean(readStoredSession()));

function initialiseAuth() {
  const form = document.getElementById('loginForm');
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const errorMessage = document.getElementById('loginError');
  const logoutButton = document.getElementById('logoutButton');
  const userLabel = document.getElementById('headerUserName');
  // ログイン画面表示中は背後のアプリをキーボード操作できないようにする。
  const appRegions = [...document.querySelectorAll('.app-header, .layout, body > footer')];

  const setAppInert = (locked) => {
    appRegions.forEach((region) => { region.inert = locked; });
  };

  const unlock = (session, moveFocus) => {
    document.documentElement.classList.add('is-authenticated');
    setAppInert(false);
    if (userLabel) userLabel.textContent = session.username;
    errorMessage.hidden = true;
    form.reset();
    if (moveFocus) logoutButton.focus();
  };

  const lock = (moveFocus) => {
    document.documentElement.classList.remove('is-authenticated');
    setAppInert(true);
    errorMessage.hidden = true;
    form.reset();
    if (moveFocus) usernameInput.focus();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (username !== AUTH_CREDENTIALS.username || password !== AUTH_CREDENTIALS.password) {
      errorMessage.textContent = 'ユーザー名またはパスワードが違います。';
      errorMessage.hidden = false;
      passwordInput.value = '';
      passwordInput.focus();
      return;
    }
    const session = { username: AUTH_CREDENTIALS.username, loggedInAt: new Date().toISOString() };
    const saved = storeSession(session);
    unlock(session, true);
    if (!saved) {
      errorMessage.textContent = 'ログイン状態を保存できないため、次回もログインが必要です。';
      errorMessage.hidden = false;
    }
  });

  logoutButton.addEventListener('click', () => {
    clearStoredSession();
    lock(true);
  });

  const session = readStoredSession();
  if (session) unlock(session, false);
  else lock(true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiseAuth);
else initialiseAuth();
