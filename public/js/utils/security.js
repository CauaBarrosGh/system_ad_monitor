// Escapa caracteres potencialmente perigosos para evitar XSS em conteúdo HTML
export const escapeHtml = (unsafe) => {
  if (unsafe === null || unsafe === undefined) return '';

  // Converte para string e substitui caracteres que podem gerar HTML injetado
  return String(unsafe)
    .replace(/&/g, "&amp;")      // Escapa &
    .replace(/</g, "&lt;")       // Escapa <
    .replace(/>/g, "&gt;")       // Escapa >
    .replace(/"/g, "&quot;")     // Escapa "
    .replace(/'/g, "&#039;");    // Escapa '
};