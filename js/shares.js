// ---------- OWNER: share a file ----------
async function shareFile(file, email, expiresDate, ownerId) {
  email = email.trim().toLowerCase();
  if (!email) return { error: "Enter the recipient's email." };

  const { data: person } = await supabaseClient.from("profiles")
    .select("id, email, role").eq("email", email).maybeSingle();
  if (!person) return { error: "No registered user has that email. Ask them to create an account first." };
  if (person.id === ownerId) return { error: "You cannot share a file with yourself." };
  if (person.role !== "recipient") return { error: "That account is an owner account. Files can only be shared with recipient accounts." };

  let expires_at = null;
  if (expiresDate) {
    const end = new Date(expiresDate + "T23:59:59");
    if (end <= new Date()) return { error: "The expiry date must be in the future." };
    expires_at = end.toISOString();
  }

  const { error } = await supabaseClient.from("shares").upsert(
    { file_id: file.id, recipient_id: person.id, expires_at, status: "active", shared_at: new Date().toISOString() },
    { onConflict: "file_id,recipient_id" }
  );
  if (error) return { error: error.message };
  await logAction(ownerId, file.id, "share");
  return {};
}

async function listSharesForFile(fileId) {
  const { data, error } = await supabaseClient.from("shares")
    .select("id, status, expires_at, shared_at, recipient:profiles!recipient_id(email, full_name)")
    .eq("file_id", fileId).order("shared_at", { ascending: false });
  return { data: data || [], error };
}

async function revokeShare(share, fileId, ownerId) {
  const { error } = await supabaseClient.from("shares").update({ status: "revoked" }).eq("id", share.id);
  if (error) return { error: error.message };
  await logAction(ownerId, fileId, "revoke");
  return {};
}

// ---------- RECIPIENT: files shared with me ----------
async function listSharedWithMe(userId) {
  const { data, error } = await supabaseClient.from("shares")
    .select("id, shared_at, expires_at, status, file:files(id, original_name, file_type, file_size, storage_path, owner:profiles!owner_id(full_name, email))")
    .eq("recipient_id", userId).eq("status", "active").order("shared_at", { ascending: false });
  if (error) return { data: [], error };
  const now = new Date();
  const usable = data.filter(s => s.file && (!s.expires_at || new Date(s.expires_at) > now));
  return { data: usable, error: null };
}
