# Backup do build publicado (sac-presenca.web.app)

Cópia exata dos arquivos que estavam no ar em https://sac-presenca.web.app/
baixada em 30/09/2026. Corresponde ao deploy de 22/09/2026, cujo código-fonte
se perdeu (nunca foi enviado ao GitHub).

- São arquivos COMPILADOS (minificados), não o código-fonte.
- Para republicar exatamente esta versão em uma emergência:
  1. copie o conteúdo desta pasta para `dist/sac/browser/`
  2. rode `firebase deploy --only hosting`
