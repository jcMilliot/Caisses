import { call } from "./client";

export const documentationApi = {
  // Textes modifiés par un administrateur, { clé: texte } (cf. domain/documentation.ts).
  getTextes: async (): Promise<Record<string, string>> => JSON.parse(await call<string>("get_documentation_textes")),
  setTextes: (textes: Record<string, string>) => call<void>("set_documentation_textes", { textes: JSON.stringify(textes) }),
};
