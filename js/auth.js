// ---------- helpers ----------
function showMessage(id, text, type = "danger") {
  const box = document.getElementById(id);
  box.className = "alert alert-" + type;
  box.textContent = text;
  box.classList.remove("d-none");
}

async function getProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles").select("*").eq("id", userId).single();
  return error ? null : data;
}

function goToDashboard(role) {
  window.location.href = role === "owner" ? "owner-dashboard.html" : "shared-with-me.html";
}

// ---------- register ----------
async function registerUser(fullName, email, password, role) {
  const { data, error } = await supabaseClient.auth.signUp({
    email, password,
    options: { data: { full_name: fullName, role: role } }
  });
  if (error) return { error };
  // If email confirmation is OFF, a session exists and the user is signed in.
  return { needsConfirmation: !data.session };
}

// ---------- login ----------
async function loginUser(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { error };
  const profile = await getProfile(data.user.id);
  return { profile };
}

// ---------- logout ----------
async function logoutUser() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

// ---------- protect a page (call at top of dashboards) ----------
async function requireRole(expectedRole) {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return null; }
  const profile = await getProfile(data.session.user.id);
  if (!profile) { await logoutUser(); return null; }
  if (profile.role !== expectedRole) { goToDashboard(profile.role); return null; }
  return profile;
}
