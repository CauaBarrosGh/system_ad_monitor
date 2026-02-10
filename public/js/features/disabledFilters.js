export function filterDisabled(list, query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return list;

  return (list || []).filter(u => {
    const name = (u.display_name || "").toLowerCase();
    const user = (u.username || "").toLowerCase();
    return name.includes(q) || user.includes(q);
  });
}