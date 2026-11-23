// Profile picture shown in the top bar. Click it to choose a new picture.
const AVATAR_BUCKET = "avatars";
const AVATAR_MAX = 2 * 1024 * 1024; // 2 MB
const AVATAR_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function avatarInitials(name) {
  const parts = (name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0].toUpperCase()).join("");
}

function paintAvatar(btn, profile) {
  btn.innerHTML = "";
  if (profile.avatar_path) {
    const { data } = supabaseClient.storage.from(AVATAR_BUCKET).getPublicUrl(profile.avatar_path);
    const img = document.createElement("img");
    img.alt = "Profile picture";
    img.onerror = () => { btn.textContent = avatarInitials(profile.full_name || profile.email); };
    img.src = data.publicUrl;
    btn.append(img);
  } else {
    btn.textContent = avatarInitials(profile.full_name || profile.email);
  }
}

function avatarMessage(text, type) {
  if (document.getElementById("msg")) showMessage("msg", text, type || "danger");
  else alert(text);
}

function setupAvatar(profile) {
  const btn = document.getElementById("avatarBtn");
  if (!btn) return;
  paintAvatar(btn, profile);

  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/jpeg,image/png,image/webp"; input.hidden = true;
  document.body.append(input);
  btn.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const ext = AVATAR_TYPES[file.type];
    if (!ext) return avatarMessage("Choose a JPG, PNG or WEBP picture.");
    if (file.size > AVATAR_MAX) return avatarMessage("The picture is too large. Maximum size is 2 MB.");

    const path = profile.id + "/avatar_" + Date.now() + "." + ext;
    const up = await supabaseClient.storage.from(AVATAR_BUCKET).upload(path, file);
    if (up.error) return avatarMessage("Upload failed: " + up.error.message);

    const upd = await supabaseClient.from("profiles").update({ avatar_path: path }).eq("id", profile.id);
    if (upd.error) {
      await supabaseClient.storage.from(AVATAR_BUCKET).remove([path]);
      return avatarMessage("Could not save the picture: " + upd.error.message);
    }
    if (profile.avatar_path) await supabaseClient.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
    profile.avatar_path = path;
    paintAvatar(btn, profile);
    avatarMessage("Profile picture updated.", "success");
  });
}
