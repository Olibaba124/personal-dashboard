const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutButton = document.getElementById("logout-button");

let dashboardInitialized = false;

function showDashboard() {
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  if (!dashboardInitialized && typeof window.initDashboard === "function") {
    window.initDashboard();
    dashboardInitialized = true;
  }
}

function showLogin(message) {
  appShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginError.textContent = message || "";
  document.getElementById("login-password").value = "";
  document.getElementById("login-email").focus();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  loginError.textContent = "";
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.textContent = "Login failed — check your email and password.";
  }
});

logoutButton.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showDashboard();
  } else {
    showLogin();
  }
});

supabaseClient.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    showDashboard();
  } else {
    showLogin();
  }
});
