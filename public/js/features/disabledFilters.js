// Filtra a lista de usuários desativados por nome ou username
export function filterDisabled(list, query) {
  // Normaliza o termo de busca (minúsculo e sem espaços extremos)
  const q = (query || "").toLowerCase().trim();

  // Se não houver termo, retorna a lista inteira
  if (!q) return list;

  // Filtra por exibição ou username contendo o termo
  return (list || []).filter(u => {
    const name = (u.display_name || "").toLowerCase();
    const user = (u.username || "").toLowerCase();
    return name.includes(q) || user.includes(q);
  });
}