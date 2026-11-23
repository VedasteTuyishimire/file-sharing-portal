// ---------- settings ----------
const BUCKET = "files";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED = ["pdf", "docx", "xlsx", "pptx", "jpg", "jpeg", "png", "zip"];

// ---------- helpers ----------
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function safeName(name) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}
async function logAction(userId, fileId, action) {
  await supabaseClient.from("activity_log").insert({ user_id: userId, file_id: fileId, action });
}

// ---------- upload ----------
async function uploadFile(file, userId) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!ALLOWED.includes(ext)) return { error: "File type not allowed. Use: " + ALLOWED.join(", ").toUpperCase() + "." };
  if (file.size > MAX_SIZE) return { error: "File is too large. Maximum size is 10 MB." };
  if (file.size === 0) return { error: "The file is empty." };

  const path = userId + "/" + Date.now() + "_" + safeName(file.name);
  const up = await supabaseClient.storage.from(BUCKET).upload(path, file);
  if (up.error) return { error: "Upload failed: " + up.error.message };

  const ins = await supabaseClient.from("files")
    .insert({ owner_id: userId, original_name: file.name, storage_path: path, file_type: ext, file_size: file.size })
    .select().single();
  if (ins.error) {
    await supabaseClient.storage.from(BUCKET).remove([path]); // undo the upload
    return { error: "Could not save file details: " + ins.error.message };
  }
  await logAction(userId, ins.data.id, "upload");
  return { file: ins.data };
}

// ---------- list ----------
async function listMyFiles(userId) {
  const { data, error } = await supabaseClient.from("files")
    .select("*").eq("owner_id", userId).order("uploaded_at", { ascending: false });
  return { data: data || [], error };
}

// ---------- download ----------
async function downloadFile(file, userId) {
  const { data, error } = await supabaseClient.storage.from(BUCKET)
    .createSignedUrl(file.storage_path, 60, { download: file.original_name });
  if (error) return { error: error.message };
  await logAction(userId, file.id, "download");
  window.location.href = data.signedUrl;
  return {};
}

// ---------- rename ----------
async function renameFile(file, newName) {
  newName = newName.trim();
  if (!newName) return { error: "Name cannot be empty." };
  const { error } = await supabaseClient.from("files").update({ original_name: newName }).eq("id", file.id);
  return { error: error ? error.message : null };
}

// ---------- delete ----------
async function deleteFile(file, userId) {
  await logAction(userId, file.id, "delete");
  const rm = await supabaseClient.storage.from(BUCKET).remove([file.storage_path]);
  if (rm.error) return { error: rm.error.message };
  const { error } = await supabaseClient.from("files").delete().eq("id", file.id);
  return { error: error ? error.message : null };
}

// ---------- download counts (owner) ----------
async function getDownloadCounts(fileIds) {
  if (!fileIds.length) return {};
  const { data } = await supabaseClient.from("activity_log")
    .select("file_id").eq("action", "download").in("file_id", fileIds);
  const counts = {};
  (data || []).forEach(r => { counts[r.file_id] = (counts[r.file_id] || 0) + 1; });
  return counts;
}
